export const leadPipelineStages = [
	'NEW',
	'QUALIFICATION',
	'PROPOSAL',
	'DECISION',
	'WON',
	'LOST'
] as const;

export const leadSortFields = [
	'updated_at',
	'created_at',
	'last_activity_at',
	'lead_number'
] as const;
export type LeadSortField = (typeof leadSortFields)[number];
export type LeadQueryDirection = 'asc' | 'desc';

export type NormalizedLeadQuery = {
	page: number;
	pageSize: number;
	sort: LeadSortField;
	direction: LeadQueryDirection;
};

export function normalizeLeadQuery(input: {
	page?: string | null;
	pageSize?: string | null;
	sort?: string | null;
	direction?: string | null;
}): NormalizedLeadQuery {
	const parsedPage = Number(input.page ?? 1);
	const parsedPageSize = Number(input.pageSize ?? 25);
	return {
		page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
		pageSize:
			Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 50) : 25,
		sort: leadSortFields.includes(input.sort as LeadSortField)
			? (input.sort as LeadSortField)
			: 'updated_at',
		direction: input.direction === 'asc' ? 'asc' : 'desc'
	};
}
