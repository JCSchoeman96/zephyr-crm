import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendQuote } from '$lib/server/quote-actions';
import { decimalValue } from '$lib/server/quote-form';
import { actionFailureStatus, userFacingActionMessage } from '$lib/server/action-errors';
import { requireActiveStaff } from '$lib/server/require-auth';

function actionFailure(errorValue: unknown, fallback = 'Could not complete Lead action') {
	return fail(actionFailureStatus(errorValue), {
		message: userFacingActionMessage(errorValue, fallback)
	});
}

function lockVersion(formData: FormData) {
	const value = Number(formData.get('lock_version'));
	if (!Number.isInteger(value) || value < 1) throw new Error('A valid lock version is required');
	return value;
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const [
		leadResponse,
		quoteResponse,
		taskResponse,
		activityResponse,
		reasonResponse,
		staffResponse
	] = await Promise.all([
		supabase.from('leads').select('*').eq('id', event.params.id).maybeSingle(),
		supabase
			.from('quotes')
			.select('*')
			.eq('lead_id', event.params.id)
			.order('created_at', { ascending: false })
			.limit(100),
		supabase
			.from('tasks')
			.select('*')
			.eq('lead_id', event.params.id)
			.order('created_at', { ascending: false })
			.limit(100),
		supabase
			.from('activities')
			.select('*')
			.eq('lead_id', event.params.id)
			.order('occurred_at', { ascending: false })
			.limit(100),
		supabase.from('lost_reasons').select('*').eq('active', true).order('sort_order').limit(100),
		supabase
			.from('profiles')
			.select('id,full_name,email,role,status')
			.eq('status', 'active')
			.in('role', ['owner', 'admin', 'sales'])
			.order('full_name')
			.limit(100)
	]);
	if (leadResponse.error) throw error(500, leadResponse.error.message);
	if (!leadResponse.data) throw error(404, 'Lead not found');
	if (
		quoteResponse.error ||
		taskResponse.error ||
		activityResponse.error ||
		reasonResponse.error ||
		staffResponse.error
	) {
		throw error(500, 'Could not load lead details');
	}
	return {
		lead: leadResponse.data,
		quotes: quoteResponse.data ?? [],
		tasks: taskResponse.data ?? [],
		activities: activityResponse.data ?? [],
		lostReasons: reasonResponse.data ?? [],
		staff: staffResponse.data ?? [],
		profile
	};
};

export const actions: Actions = {
	qualify: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('transition_lead', {
				p_lead_id: event.params.id,
				p_to_stage: 'QUALIFICATION',
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not qualify Lead');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not qualify Lead');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	proposal: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('transition_lead', {
				p_lead_id: event.params.id,
				p_to_stage: 'PROPOSAL',
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not move Lead to proposal');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not move Lead');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	createQuote: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const quantity = decimalValue(form, 'quantity', /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/);
			const unitPrice = decimalValue(form, 'unit_price', /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
			const taxRate = decimalValue(form, 'tax_rate', /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/);
			const response = await supabase.rpc('create_minimal_quote', {
				p_lead_id: event.params.id,
				p_subject: String(form.get('subject') ?? ''),
				p_item_name: String(form.get('item_name') ?? ''),
				p_quantity: quantity,
				p_unit_price: unitPrice,
				p_tax_rate: taxRate
			});
			if (response.error) return actionFailure(response.error, 'Could not create Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not create Quote');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	sendQuote: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			await sendQuote(supabase, String(form.get('quote_id') ?? ''), lockVersion(form));
		} catch (actionError) {
			return actionFailure(actionError, 'Could not send Quote');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	win: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('convert_lead', {
				p_lead_id: event.params.id,
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not win Lead');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not win Lead');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	lost: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('transition_lead', {
				p_lead_id: event.params.id,
				p_to_stage: 'LOST',
				p_lock_version: lockVersion(form),
				p_lost_reason_id: String(form.get('lost_reason_id') ?? ''),
				p_lost_notes: String(form.get('lost_notes') ?? '')
			});
			if (response.error) return actionFailure(response.error, 'Could not mark Lead lost');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not mark Lead lost');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	setAttention: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('set_lead_attention', {
				p_lead_id: event.params.id,
				p_attention_state: String(form.get('attention_state') ?? 'none'),
				p_reason: String(form.get('attention_reason') ?? '') || undefined,
				p_resume_at: String(form.get('attention_resume_at') ?? '') || undefined,
				p_lock_version: lockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not update Lead attention');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not update Lead attention');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	assign: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('assign_lead', {
				p_lead_id: event.params.id,
				p_assigned_to: (String(form.get('assigned_to') ?? '') || null) as string,
				p_lock_version: lockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not assign Lead');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not assign Lead');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	reopen: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('reopen_lead', {
				p_lead_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_reason: String(form.get('reopen_reason') ?? '')
			});
			if (response.error) return actionFailure(response.error, 'Could not reopen Lead');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not reopen Lead');
		}
		throw redirect(303, `/leads/${event.params.id}`);
	}
};
