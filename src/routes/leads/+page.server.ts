import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';
import { leadAttentionStates } from '$lib/domain/leads/attention';
import { leadPipelineStages, normalizeLeadQuery } from '$lib/domain/leads/query';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeIlike(value: string) {
	return value.replace(/[\\*%_]/g, '\\$&');
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const normalizedQuery = normalizeLeadQuery({
		page: event.url.searchParams.get('page'),
		pageSize: event.url.searchParams.get('page_size'),
		sort: event.url.searchParams.get('sort'),
		direction: event.url.searchParams.get('direction')
	});
	const search = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const requestedStage = event.url.searchParams.get('stage');
	const stage = leadPipelineStages.includes(requestedStage as (typeof leadPipelineStages)[number])
		? (requestedStage as (typeof leadPipelineStages)[number])
		: '';
	const requestedAttention = event.url.searchParams.get('attention');
	const attention = leadAttentionStates.includes(
		requestedAttention as (typeof leadAttentionStates)[number]
	)
		? (requestedAttention as (typeof leadAttentionStates)[number])
		: '';
	const requestedAssignee = event.url.searchParams.get('assigned_to') ?? '';
	const assignedTo = uuidPattern.test(requestedAssignee) ? requestedAssignee : '';
	const from = (normalizedQuery.page - 1) * normalizedQuery.pageSize;
	const to = from + normalizedQuery.pageSize - 1;

	let leadsQuery = supabase
		.from('leads')
		.select('*', { count: 'exact' })
		.range(from, to)
		.order(normalizedQuery.sort, { ascending: normalizedQuery.direction === 'asc' })
		.order('id', { ascending: true });
	if (search) {
		const pattern = `*${escapeIlike(search)}*`;
		leadsQuery = leadsQuery.or(
			[
				`first_name.ilike.${pattern}`,
				`last_name.ilike.${pattern}`,
				`email.ilike.${pattern}`,
				`company.ilike.${pattern}`
			].join(',')
		);
	}
	if (stage) leadsQuery = leadsQuery.eq('pipeline_stage', stage);
	if (attention) leadsQuery = leadsQuery.eq('attention_state', attention);
	if (assignedTo) leadsQuery = leadsQuery.eq('assigned_to', assignedTo);

	const { data: leads, count, error: queryError } = await leadsQuery;
	if (queryError) throw error(500, 'Could not load the lead list');
	const total = count ?? 0;
	return {
		leads: leads ?? [],
		profile,
		filters: {
			q: search,
			stage,
			attention,
			assignedTo,
			sort: normalizedQuery.sort,
			direction: normalizedQuery.direction
		},
		pagination: {
			page: normalizedQuery.page,
			pageSize: normalizedQuery.pageSize,
			total,
			totalPages: Math.max(1, Math.ceil(total / normalizedQuery.pageSize))
		}
	};
};
