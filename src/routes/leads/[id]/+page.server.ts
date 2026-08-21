import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendQuote } from '$lib/server/quote-actions';
import { requireActiveStaff } from '$lib/server/require-auth';

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
			.order('created_at', { ascending: false }),
		supabase
			.from('tasks')
			.select('*')
			.eq('lead_id', event.params.id)
			.order('created_at', { ascending: false }),
		supabase
			.from('activities')
			.select('*')
			.eq('lead_id', event.params.id)
			.order('occurred_at', { ascending: false }),
		supabase.from('lost_reasons').select('*').eq('active', true).order('sort_order'),
		supabase
			.from('profiles')
			.select('id,full_name,email,role,status')
			.eq('status', 'active')
			.in('role', ['owner', 'admin', 'sales'])
			.order('full_name')
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not qualify lead'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not move lead'
			});
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	createQuote: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		const quantity = Number(form.get('quantity'));
		const unitPrice = Number(form.get('unit_price'));
		const taxRate = Number(form.get('tax_rate') || 0);
		try {
			const response = await supabase.rpc('create_minimal_quote', {
				p_lead_id: event.params.id,
				p_subject: String(form.get('subject') ?? ''),
				p_item_name: String(form.get('item_name') ?? ''),
				p_quantity: quantity,
				p_unit_price: unitPrice,
				p_tax_rate: taxRate
			});
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not create quote'
			});
		}
		throw redirect(303, `/leads/${event.params.id}`);
	},
	sendQuote: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			await sendQuote(supabase, String(form.get('quote_id') ?? ''), lockVersion(form));
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not send quote'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not win lead'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not mark lead lost'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not update attention'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not assign lead'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not reopen lead'
			});
		}
		throw redirect(303, `/leads/${event.params.id}`);
	}
};
