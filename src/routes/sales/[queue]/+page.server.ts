import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { salesQueueKeys, type SalesQueueKey } from '$lib/domain/sales/queues';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { loadSalesQueue } from '$lib/server/sales-queue';
import { requireActiveStaff } from '$lib/server/require-auth';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function queueKey(value: string): SalesQueueKey {
	if (!salesQueueKeys.includes(value as SalesQueueKey)) throw error(404, 'Sales queue not found');
	return value as SalesQueueKey;
}

function actionFailure(errorValue: unknown, fallback: string) {
	const details = actionFailureDetails(errorValue, fallback);
	logActionFailure(errorValue, details.code);
	return fail(details.status, { message: details.message, code: details.code });
}

function formUuid(form: FormData, name: string, label: string) {
	const value = String(form.get(name) ?? '').trim();
	if (!uuidPattern.test(value)) throw new Error(`A valid ${label} is required`);
	return value;
}

function formLockVersion(form: FormData) {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid record lock version is required');
	return value;
}

function formText(form: FormData, name: string) {
	return String(form.get(name) ?? '').trim();
}

function requireActionQueue(
	event: Parameters<NonNullable<Actions['start']>>[0],
	expected: SalesQueueKey
) {
	if (event.params.queue !== expected)
		return fail(404, { message: 'Sales queue action not found' });
	return null;
}

function record(value: unknown) {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export const load: PageServerLoad = async (event) => {
	const key = queueKey(event.params.queue);
	const { supabase, profile } = await requireActiveStaff(event);
	const [queue, reasonsResponse] = await Promise.all([
		loadSalesQueue(supabase, key),
		key === 'decisions'
			? supabase
					.from('lost_reasons')
					.select('id,code,label')
					.eq('active', true)
					.order('sort_order')
					.limit(100)
					.then((response) => response)
			: Promise.resolve({ data: [], error: null })
	]);
	if (reasonsResponse.error) throw error(500, 'Could not load Sales decision options');
	return {
		queue,
		lostReasons: reasonsResponse.data ?? [],
		profile
	};
};

export const actions: Actions = {
	start: async (event) => {
		const queueError = requireActionQueue(event, 'enquiries');
		if (queueError) return queueError;
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('start_lead_qualification', {
				p_lead_id: formUuid(form, 'lead_id', 'Lead ID'),
				p_lock_version: formLockVersion(form),
				p_qualification_notes: formText(form, 'qualification_notes') || undefined
			});
			if (response.error) return actionFailure(response.error, 'Could not start qualification');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not start qualification');
		}
		throw redirect(303, '/sales/enquiries');
	},
	ready: async (event) => {
		const queueError = requireActionQueue(event, 'qualification');
		if (queueError) return queueError;
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('ready_lead_for_quote', {
				p_lead_id: formUuid(form, 'lead_id', 'Lead ID'),
				p_lock_version: formLockVersion(form),
				p_qualification_notes: formText(form, 'qualification_notes') || undefined
			});
			if (response.error) return actionFailure(response.error, 'Could not ready Lead for a Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not ready Lead for a Quote');
		}
		throw redirect(303, '/sales/qualification');
	},
	accept: async (event) => {
		const queueError = requireActionQueue(event, 'decisions');
		if (queueError) return queueError;
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const acceptanceSource = formText(form, 'acceptance_source');
			if (!acceptanceSource) throw new Error('Acceptance source is required');
			const response = await supabase.rpc('accept_quote', {
				p_quote_id: formUuid(form, 'quote_id', 'Quote ID'),
				p_lock_version: formLockVersion(form),
				p_acceptance_source: acceptanceSource,
				p_acceptance_evidence: formText(form, 'acceptance_evidence') || null
			});
			if (response.error) return actionFailure(response.error, 'Could not accept sale');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not accept sale');
		}
		throw redirect(303, '/sales/decisions');
	},
	revise: async (event) => {
		const queueError = requireActionQueue(event, 'decisions');
		if (queueError) return queueError;
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('revise_quote', {
				p_quote_id: formUuid(form, 'quote_id', 'Quote ID'),
				p_lock_version: formLockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not create Quote revision');
			const quoteId = String(record(response.data).quote_id ?? '');
			if (!uuidPattern.test(quoteId))
				return fail(500, { message: 'Quote revision was created without an identifier.' });
			throw redirect(303, `/quotes/${quoteId}`);
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return actionFailure(actionError, 'Could not create Quote revision');
		}
	},
	decline: async (event) => {
		const queueError = requireActionQueue(event, 'decisions');
		if (queueError) return queueError;
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const lostReasonId = formUuid(form, 'lost_reason_id', 'lost reason');
			const response = await supabase.rpc('decline_quote', {
				p_quote_id: formUuid(form, 'quote_id', 'Quote ID'),
				p_lock_version: formLockVersion(form),
				p_lost_reason_id: lostReasonId,
				p_lost_notes: formText(form, 'lost_notes') || null
			});
			if (response.error) return actionFailure(response.error, 'Could not decline Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not decline Quote');
		}
		throw redirect(303, '/sales/decisions');
	}
};
