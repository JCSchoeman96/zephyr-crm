import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { quoteFormValues } from '$lib/server/quote-form';
import { requireActiveStaff } from '$lib/server/require-auth';

function record(value: unknown) {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const [leadResponse, clientResponse] = await Promise.all([
		supabase
			.from('leads')
			.select('id,lead_number,first_name,last_name,company,pipeline_stage')
			.in('pipeline_stage', ['PROPOSAL', 'DECISION'])
			.order('updated_at', { ascending: false })
			.limit(100),
		supabase
			.from('clients')
			.select('id,display_name,company_name')
			.eq('status', 'active')
			.order('display_name')
			.limit(100)
	]);
	if (leadResponse.error || clientResponse.error) throw redirect(303, '/quotes');
	return {
		leads: (leadResponse.data ?? []).map((lead) => ({
			id: lead.id,
			label: `#${lead.lead_number} · ${lead.first_name} ${lead.last_name}${lead.company ? ` · ${lead.company}` : ''}`
		})),
		clients: (clientResponse.data ?? []).map((client) => ({
			id: client.id,
			label: client.display_name || client.company_name || 'Unnamed client'
		})),
		profile
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		const leadId = String(form.get('lead_id') ?? '').trim();
		if (!leadId) return fail(422, { message: 'Select a Lead before saving the quote.' });
		try {
			const response = await supabase.rpc(
				'save_quote_draft',
				quoteFormValues(form, leadId) as never
			);
			if (response.error) return fail(422, { message: response.error.message });
			const quoteId = String(record(response.data).quote_id ?? '');
			if (!quoteId) return fail(500, { message: 'Quote was saved without an identifier.' });
			throw redirect(303, `/quotes/${quoteId}`);
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not save quote'
			});
		}
	}
};
