import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { normalizeQuoteDefaults } from '$lib/domain/quotes/defaults';
import {
	extractLeadMeasurements,
	parseLeadRequestMessage
} from '$lib/domain/leads/request-details';
import { quoteFormFailureValues, quoteFormValues } from '$lib/server/quote-form';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { requireActiveStaff } from '$lib/server/require-auth';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown) {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function actionFailure(cause: unknown, fallback: string, values?: Record<string, string>) {
	const details = actionFailureDetails(cause, fallback);
	logActionFailure(cause, details.code);
	return fail(details.status, { message: details.message, code: details.code, values });
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const [leadResponse, clientResponse, quoteDefaultsResponse] = await Promise.all([
		supabase
			.from('leads')
			.select('id,lead_number,first_name,last_name,company,pipeline_stage,message')
			.in('pipeline_stage', ['PROPOSAL', 'DECISION'])
			.order('updated_at', { ascending: false })
			.limit(100),
		supabase
			.from('clients')
			.select('id,display_name,company_name')
			.eq('status', 'active')
			.order('display_name')
			.limit(100),
		supabase
			.from('app_settings')
			.select('setting_value')
			.eq('setting_key', 'quote_defaults')
			.maybeSingle()
	]);
	if (leadResponse.error || clientResponse.error || quoteDefaultsResponse.error)
		throw redirect(303, '/quotes');
	const leads = leadResponse.data ?? [];
	const requestedLeadId = event.url.searchParams.get('lead_id')?.trim() ?? '';
	const selectedLeadId =
		uuidPattern.test(requestedLeadId) && leads.some((lead) => lead.id === requestedLeadId)
			? requestedLeadId
			: '';
	return {
		leads: leads.map((lead) => ({
			id: lead.id,
			label: `#${lead.lead_number} · ${lead.first_name} ${lead.last_name}${lead.company ? ` · ${lead.company}` : ''}`,
			measurements: extractLeadMeasurements(parseLeadRequestMessage(lead.message))
		})),
		clients: (clientResponse.data ?? []).map((client) => ({
			id: client.id,
			label: client.display_name || client.company_name || 'Unnamed client'
		})),
		quoteDefaults: normalizeQuoteDefaults(quoteDefaultsResponse.data?.setting_value),
		selectedLeadId,
		profile
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		const leadId = String(form.get('lead_id') ?? '').trim();
		const values = quoteFormFailureValues(form);
		if (!leadId) return fail(422, { message: 'Select a Lead before saving the quote.', values });
		try {
			const response = await supabase.rpc(
				'save_quote_draft',
				quoteFormValues(form, leadId) as never
			);
			if (response.error) return actionFailure(response.error, 'Could not save quote', values);
			const quoteId = String(record(response.data).quote_id ?? '');
			if (!quoteId) return fail(500, { message: 'Quote was saved without an identifier.' });
			throw redirect(303, `/quotes/${quoteId}`);
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return actionFailure(actionError, 'Could not save quote', values);
		}
	}
};
