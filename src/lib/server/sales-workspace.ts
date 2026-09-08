import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

export const salesViews = {
	attention: 'Needs attention',
	new: 'New',
	reviewing: 'Reviewing',
	quote: 'Quote needed',
	waiting: 'Waiting',
	all: 'All'
} as const;
export type SalesView = keyof typeof salesViews;
const stages = {
	new: 'NEW',
	reviewing: 'QUALIFICATION',
	quote: 'PROPOSAL',
	waiting: 'DECISION'
} as const;
const activeStages = ['NEW', 'QUALIFICATION', 'PROPOSAL', 'DECISION'];
const pageSize = 50;

export async function loadSalesWorkspace(
	supabase: SupabaseClient<Database>,
	params: URLSearchParams
) {
	const requested = params.get('view') ?? 'attention';
	const view: SalesView = Object.hasOwn(salesViews, requested)
		? (requested as SalesView)
		: 'attention';
	const requestedPage = Number(params.get('page') ?? 1);
	const page =
		Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000
			? requestedPage
			: 1;
	const closed = view === 'all' && params.get('closed') === 'true';
	const search = (params.get('q') ?? '')
		.trim()
		.slice(0, 80)
		.replace(/[%,().]/g, '');
	const attention =
		params.get('attention') === 'waiting_on_client'
			? 'waiting_on_client'
			: params.get('attention') === 'waiting_on_us'
				? 'waiting_on_us'
				: null;
	let query = supabase
		.from('leads')
		.select(
			'id,lead_number,first_name,last_name,company,pipeline_stage,attention_state,attention_reason,paused_at,pause_reason,created_at,last_activity_at'
		);
	if (view in stages) query = query.eq('pipeline_stage', stages[view as keyof typeof stages]);
	else if (!closed) query = query.in('pipeline_stage', activeStages);
	if (view === 'attention')
		query = query.eq('attention_state', attention ?? 'waiting_on_us').is('paused_at', null);
	else if (attention) query = query.eq('attention_state', attention);
	if (search)
		query = query.or(
			`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`
		);
	const from = (page - 1) * pageSize;
	const response = await query
		.order('last_activity_at', { ascending: true, nullsFirst: true })
		.order('id')
		.range(from, from + pageSize);
	if (response.error) throw error(503, 'Sales work could not be loaded. Please reload the page.');
	return {
		view,
		page,
		closed,
		search,
		attention,
		rows: (response.data ?? []).slice(0, pageSize),
		hasMore: (response.data?.length ?? 0) > pageSize,
		pageSize
	};
}
