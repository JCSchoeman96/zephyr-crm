import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const clientResponse = await supabase
		.from('clients')
		.select('*')
		.eq('id', event.params.id)
		.maybeSingle();
	if (clientResponse.error) throw error(500, 'Could not load client details');
	if (!clientResponse.data) throw error(404, 'Client not found');

	const [contactsResponse, activityResponse, sourceLeadResponse, sourceLeadActivitiesResponse] =
		await Promise.all([
			supabase
				.from('client_contacts')
				.select('*')
				.eq('client_id', event.params.id)
				.order('is_primary', { ascending: false })
				.order('created_at', { ascending: true }),
			supabase
				.from('activities')
				.select('*')
				.eq('client_id', event.params.id)
				.order('occurred_at', { ascending: false }),
			clientResponse.data.source_lead_id
				? supabase
						.from('leads')
						.select('id,lead_number,first_name,last_name,email,company,pipeline_stage')
						.eq('id', clientResponse.data.source_lead_id)
						.maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			clientResponse.data.source_lead_id
				? supabase
						.from('activities')
						.select('*')
						.eq('lead_id', clientResponse.data.source_lead_id)
						.order('occurred_at', { ascending: false })
				: Promise.resolve({ data: [], error: null })
		]);

	if (
		contactsResponse.error ||
		activityResponse.error ||
		sourceLeadResponse.error ||
		sourceLeadActivitiesResponse.error
	) {
		throw error(500, 'Could not load client history');
	}

	return {
		client: clientResponse.data,
		contacts: contactsResponse.data ?? [],
		activities: activityResponse.data ?? [],
		sourceLeadActivities: sourceLeadActivitiesResponse.data ?? [],
		sourceLead: sourceLeadResponse.data,
		profile
	};
};
