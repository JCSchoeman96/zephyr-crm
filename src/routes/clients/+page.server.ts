import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

const clientTypes = ['individual', 'company'] as const;
const clientStatuses = ['active', 'inactive', 'archived'] as const;
const pageSize = 25;

function escapeIlike(value: string) {
	return value.replace(/[\\*%_]/g, '\\$&');
}

function selectedValue<T extends readonly string[]>(value: string | null, allowed: T) {
	return allowed.includes(value as T[number]) ? (value as T[number]) : '';
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const search = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const type = selectedValue(event.url.searchParams.get('type'), clientTypes);
	const status = selectedValue(event.url.searchParams.get('status'), clientStatuses);
	const requestedPage = Number(event.url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const from = (page - 1) * pageSize;
	const to = from + pageSize - 1;

	let clientsQuery = supabase
		.from('clients')
		.select('*', { count: 'exact' })
		.range(from, to)
		.order('updated_at', { ascending: false })
		.order('id', { ascending: true });
	if (search) {
		const pattern = `*${escapeIlike(search)}*`;
		clientsQuery = clientsQuery.or(
			[
				`display_name.ilike.${pattern}`,
				`company_name.ilike.${pattern}`,
				`email.ilike.${pattern}`,
				`phone.ilike.${pattern}`
			].join(',')
		);
	}
	if (type) clientsQuery = clientsQuery.eq('type', type);
	if (status) clientsQuery = clientsQuery.eq('status', status);

	const { data: clients, count, error: clientsError } = await clientsQuery;
	if (clientsError) throw error(500, 'Could not load the client list');

	const sourceLeadIds = (clients ?? [])
		.map((client) => client.source_lead_id)
		.filter((id): id is string => Boolean(id));
	const sourceResponse = sourceLeadIds.length
		? await supabase
				.from('leads')
				.select('id,lead_number,first_name,last_name')
				.in('id', sourceLeadIds)
		: { data: [], error: null };
	if (sourceResponse.error) throw error(500, 'Could not load source lead links');

	const total = count ?? 0;
	return {
		clients: clients ?? [],
		sourceLeads: sourceResponse.data ?? [],
		profile,
		filters: { q: search, type, status },
		pagination: {
			page,
			pageSize,
			total,
			totalPages: Math.max(1, Math.ceil(total / pageSize))
		}
	};
};
