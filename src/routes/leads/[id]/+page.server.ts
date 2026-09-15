import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendQuote } from '$lib/server/quote-actions';
import { decimalValue } from '$lib/server/quote-form';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';
import { localDateTimeToIso } from '$lib/time/zoned-datetime';
import { requireActiveStaff } from '$lib/server/require-auth';
import { parseDetailTab, type DetailTab } from '$lib/domain/leads/detail-tabs';

function actionFailure(errorValue: unknown, fallback = 'Could not complete Lead action') {
	const details = actionFailureDetails(errorValue, fallback);
	logActionFailure(errorValue, details.code);
	return fail(details.status, { message: details.message, code: details.code });
}

function lockVersion(formData: FormData) {
	const value = Number(formData.get('lock_version'));
	if (!Number.isInteger(value) || value < 1) throw new Error('A valid lock version is required');
	return value;
}

function formText(formData: FormData, name: string) {
	return String(formData.get(name) ?? '').trim();
}

function formDateTime(formData: FormData, name: string) {
	const value = formText(formData, name);
	if (!value) return undefined;
	const { configuration } = loadTrustedClientConfiguration();
	return localDateTimeToIso(value, configuration.locale.timezone);
}

function taskId(formData: FormData) {
	const value = formText(formData, 'task_id');
	if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('A valid Task ID is required');
	return value;
}

function tabRedirect(leadId: string, tab: DetailTab) {
	return `/leads/${leadId}?tab=${encodeURIComponent(tab)}`;
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const activeTab = parseDetailTab(event.url.searchParams.get('tab'));
	const [
		leadResponse,
		quoteResponse,
		taskResponse,
		activityResponse,
		reasonResponse,
		staffResponse,
		currentQuoteResponse,
		fulfilmentResponse
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
			.limit(100),
		supabase
			.from('quotes')
			.select('id,status,subject,quote_number')
			.eq('lead_id', event.params.id)
			.in('status', ['draft', 'ready', 'sent', 'accepted'])
			.order('created_at', { ascending: false })
			.order('revision_number', { ascending: false })
			.order('id')
			.limit(1)
			.maybeSingle(),
		supabase
			.from('fulfilment_cases')
			.select('id,status')
			.eq('lead_id', event.params.id)
			.order('created_at', { ascending: false })
			.order('id')
			.limit(20)
	]);
	if (leadResponse.error) throw error(500, 'Could not load Lead details');
	if (!leadResponse.data) throw error(404, 'Lead not found');
	if (
		quoteResponse.error ||
		taskResponse.error ||
		activityResponse.error ||
		reasonResponse.error ||
		staffResponse.error ||
		currentQuoteResponse.error ||
		fulfilmentResponse.error
	) {
		throw error(500, 'Could not load lead details');
	}
	return {
		lead: leadResponse.data,
		currentQuote: currentQuoteResponse.data,
		fulfilments: fulfilmentResponse.data ?? [],
		quotes: quoteResponse.data ?? [],
		tasks: taskResponse.data ?? [],
		activities: activityResponse.data ?? [],
		lostReasons: reasonResponse.data ?? [],
		staff: staffResponse.data ?? [],
		activeTab,
		profile
	};
};

export const actions: Actions = {
	qualify: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('start_lead_qualification', {
				p_lead_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_qualification_notes: formText(form, 'qualification_notes') || undefined
			});
			if (response.error)
				return actionFailure(response.error, 'Could not start Lead qualification');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not start Lead qualification');
		}
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
	},
	proposal: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('ready_lead_for_quote', {
				p_lead_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_qualification_notes: formText(form, 'qualification_notes') || undefined
			});
			if (response.error)
				return actionFailure(response.error, 'Could not make Lead ready for a Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not make Lead ready for a Quote');
		}
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
	},
	createQuote: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const quantity = decimalValue(form, 'quantity', /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/);
			const unitPrice = decimalValue(form, 'unit_price', /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/);
			const taxRate = decimalValue(form, 'tax_rate', /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
			// Keep exact decimal text on the JSON wire; the database owns numeric parsing and rounding.
			const response = await supabase.rpc('create_minimal_quote', {
				p_lead_id: event.params.id,
				p_subject: String(form.get('subject') ?? ''),
				p_item_name: String(form.get('item_name') ?? ''),
				p_quantity: quantity,
				p_unit_price: unitPrice,
				p_tax_rate: taxRate
			} as never);
			if (response.error) return actionFailure(response.error, 'Could not create Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not create Quote');
		}
		throw redirect(303, tabRedirect(event.params.id, 'quotes'));
	},
	sendQuote: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			await sendQuote(
				supabase,
				String(form.get('quote_id') ?? ''),
				lockVersion(form),
				event.platform
			);
		} catch (actionError) {
			return actionFailure(actionError, 'Could not send Quote');
		}
		throw redirect(303, tabRedirect(event.params.id, 'quotes'));
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
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
	},
	setAttention: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('set_lead_attention', {
				p_lead_id: event.params.id,
				p_attention_state: String(form.get('attention_state') ?? 'none'),
				p_lock_version: lockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not update Lead attention');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not update Lead attention');
		}
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
	},
	pause: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('pause_lead', {
				p_lead_id: event.params.id,
				p_reason: String(form.get('pause_reason') ?? ''),
				p_resume_at: String(form.get('resume_at') ?? '') || undefined,
				p_lock_version: lockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not pause Lead');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not pause Lead');
		}
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
	},
	resume: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('resume_lead', {
				p_lead_id: event.params.id,
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not resume Lead');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not resume Lead');
		}
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
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
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
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
		throw redirect(303, tabRedirect(event.params.id, 'overview'));
	},
	followUp: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (profile.role === 'viewer') return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		try {
			const title = formText(form, 'title');
			if (!title) throw new Error('A follow-up title is required');
			const dueAt = formDateTime(form, 'due_at');
			const assignedTo = formText(form, 'assigned_to');
			const response = await supabase.rpc('create_task', {
				p_lead_id: event.params.id,
				p_type: formText(form, 'type') || 'follow_up',
				p_title: title,
				p_description: formText(form, 'description') || undefined,
				...(dueAt ? { p_due_at: dueAt } : {}),
				...(assignedTo ? { p_assigned_to: assignedTo } : {})
			});
			if (response.error) return actionFailure(response.error, 'Could not create follow-up');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not create follow-up');
		}
		throw redirect(303, tabRedirect(event.params.id, 'follow-ups'));
	},
	completeFollowUp: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (profile.role === 'viewer') return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('complete_task', {
				p_task_id: taskId(form),
				p_lock_version: lockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not complete follow-up');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not complete follow-up');
		}
		throw redirect(303, tabRedirect(event.params.id, 'follow-ups'));
	},
	rescheduleFollowUp: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (profile.role === 'viewer') return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const dueAt = formDateTime(form, 'due_at');
			if (!dueAt)
				return actionFailure(new Error('A due date is required'), 'Could not reschedule follow-up');
			const response = await supabase.rpc('reschedule_task', {
				p_task_id: taskId(form),
				p_lock_version: lockVersion(form),
				p_due_at: dueAt
			});
			if (response.error) return actionFailure(response.error, 'Could not reschedule follow-up');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not reschedule follow-up');
		}
		throw redirect(303, tabRedirect(event.params.id, 'follow-ups'));
	},
	cancelFollowUp: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (profile.role === 'viewer') return fail(403, { message: 'Viewer access is read-only.' });
		try {
			const form = await event.request.formData();
			const response = await supabase.rpc('cancel_task', {
				p_task_id: taskId(form),
				p_lock_version: lockVersion(form)
			});
			if (response.error) return actionFailure(response.error, 'Could not cancel follow-up');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not cancel follow-up');
		}
		throw redirect(303, tabRedirect(event.params.id, 'follow-ups'));
	}
};
