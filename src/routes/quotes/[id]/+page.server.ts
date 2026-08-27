import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { quoteFormValues } from '$lib/server/quote-form';
import { sendQuote } from '$lib/server/quote-actions';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { requireActiveStaff } from '$lib/server/require-auth';

function actionFailure(errorValue: unknown, fallback = 'Could not complete Quote action') {
	const details = actionFailureDetails(errorValue, fallback);
	logActionFailure(errorValue, details.code);
	return fail(details.status, { message: details.message, code: details.code });
}

function lockVersion(form: FormData) {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid quote lock version is required');
	return value;
}

function record(value: unknown) {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const quoteResponse = await supabase
		.from('quotes')
		.select('*')
		.eq('id', event.params.id)
		.maybeSingle();
	if (quoteResponse.error) throw error(500, 'Could not load the quote');
	if (!quoteResponse.data) throw error(404, 'Quote not found');
	const [
		itemsResponse,
		leadResponse,
		clientResponse,
		activityResponse,
		outboundResponse,
		reasonsResponse
	] = await Promise.all([
		supabase
			.from('quote_items')
			.select('*')
			.eq('quote_id', event.params.id)
			.order('position')
			.limit(100),
		supabase.from('leads').select('*').eq('id', quoteResponse.data.lead_id).maybeSingle(),
		quoteResponse.data.client_id
			? supabase.from('clients').select('*').eq('id', quoteResponse.data.client_id).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		supabase
			.from('activities')
			.select('*')
			.eq('quote_id', event.params.id)
			.order('occurred_at', { ascending: false })
			.limit(50),
		supabase
			.from('outbound_messages')
			.select('*')
			.eq('quote_id', event.params.id)
			.order('created_at', { ascending: false })
			.limit(10),
		supabase
			.from('lost_reasons')
			.select('id,code,label')
			.eq('active', true)
			.order('sort_order')
			.limit(100)
	]);
	if (
		itemsResponse.error ||
		leadResponse.error ||
		clientResponse.error ||
		activityResponse.error ||
		outboundResponse.error ||
		reasonsResponse.error
	)
		throw error(500, 'Could not load quote details');
	if (!leadResponse.data) throw error(500, 'Quote lead could not be loaded');
	return {
		quote: quoteResponse.data,
		items: itemsResponse.data ?? [],
		lead: leadResponse.data,
		client: clientResponse.data,
		activities: activityResponse.data ?? [],
		outboundMessages: outboundResponse.data ?? [],
		lostReasons: reasonsResponse.data ?? [],
		profile
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc(
				'save_quote_draft',
				quoteFormValues(form, String(form.get('lead_id') ?? ''), event.params.id) as never
			);
			if (response.error) return actionFailure(response.error, 'Could not save Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not save Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	markReady: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('mark_quote_ready', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not mark Quote ready');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not mark Quote ready');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	send: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			await sendQuote(supabase, event.params.id, lockVersion(await event.request.formData()));
		} catch (actionError) {
			return actionFailure(actionError, 'Could not send Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	revise: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('revise_quote', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not create Quote revision');
			const newQuoteId = String(record(response.data).quote_id ?? '');
			if (!newQuoteId) return fail(500, { message: 'Revision was created without an identifier.' });
			throw redirect(303, `/quotes/${newQuoteId}`);
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return actionFailure(actionError, 'Could not revise Quote');
		}
	},
	accept: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('accept_quote', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_acceptance_source: String(form.get('acceptance_source') ?? ''),
				p_acceptance_evidence: String(form.get('acceptance_evidence') ?? '') || null
			});
			if (response.error) return actionFailure(response.error, 'Could not accept Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not accept Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	decline: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('decline_quote', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_lost_reason_id: String(form.get('lost_reason_id') ?? ''),
				p_lost_notes: String(form.get('lost_notes') ?? '') || null
			});
			if (response.error) return actionFailure(response.error, 'Could not decline Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not decline Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	cancel: async (event) => transition(event, 'cancel_quote'),
	expire: async (event) => transition(event, 'expire_quote')
};

async function transition(
	event: Parameters<NonNullable<Actions['accept']>>[0],
	functionName: 'cancel_quote' | 'expire_quote'
) {
	const { supabase } = await requireActiveStaff(event);
	try {
		const response = await supabase.rpc(functionName, {
			p_quote_id: event.params.id,
			p_lock_version: lockVersion(await event.request.formData())
		});
		if (response.error) return actionFailure(response.error, 'Could not update Quote state');
	} catch (actionError) {
		return actionFailure(actionError, 'Could not update Quote state');
	}
	throw redirect(303, `/quotes/${event.params.id}`);
}
