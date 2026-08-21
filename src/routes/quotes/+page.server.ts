import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

const pageSize = 25;
const statuses = [
	'draft',
	'ready',
	'sent',
	'accepted',
	'declined',
	'expired',
	'cancelled',
	'superseded'
] as const;

function escapeIlike(value: string) {
	return value.replace(/[\\*%_]/g, '\\$&');
}

function selectedStatus(value: string | null) {
	return statuses.includes(value as (typeof statuses)[number]) ? (value ?? '') : '';
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const search = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const status = selectedStatus(event.url.searchParams.get('status'));
	const requestedPage = Number(event.url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const from = (page - 1) * pageSize;
	const to = from + pageSize - 1;

	let quotesQuery = supabase
		.from('quotes')
		.select('*', { count: 'exact' })
		.range(from, to)
		.order('updated_at', { ascending: false })
		.order('id', { ascending: true });
	if (search) {
		const pattern = `*${escapeIlike(search)}*`;
		quotesQuery = quotesQuery.or(
			[
				`subject.ilike.${pattern}`,
				`quote_number.ilike.${pattern}`,
				`currency.ilike.${pattern}`
			].join(',')
		);
	}
	if (status) quotesQuery = quotesQuery.eq('status', status);

	const { data: quotes, count, error: quotesError } = await quotesQuery;
	if (quotesError) throw error(500, 'Could not load the quote list');

	const leadIds = (quotes ?? []).map((quote) => quote.lead_id);
	const clientIds = (quotes ?? [])
		.map((quote) => quote.client_id)
		.filter((id): id is string => Boolean(id));
	const [leadResponse, clientResponse] = await Promise.all([
		leadIds.length
			? supabase
					.from('leads')
					.select('id,lead_number,first_name,last_name,company,email')
					.in('id', leadIds)
			: Promise.resolve({ data: [], error: null }),
		clientIds.length
			? supabase
					.from('clients')
					.select('id,client_number,display_name,company_name')
					.in('id', clientIds)
			: Promise.resolve({ data: [], error: null })
	]);
	if (leadResponse.error || clientResponse.error)
		throw error(500, 'Could not load quote relationships');

	const total = count ?? 0;
	return {
		quotes: quotes ?? [],
		leads: leadResponse.data ?? [],
		clients: clientResponse.data ?? [],
		profile,
		filters: { q: search, status },
		pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
	};
};
