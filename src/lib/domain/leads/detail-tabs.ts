export const detailTabs = ['overview', 'quotes', 'follow-ups', 'history'] as const;

export type DetailTab = (typeof detailTabs)[number];

export function parseDetailTab(value: string | null | undefined): DetailTab {
	return detailTabs.includes(value as DetailTab) ? (value as DetailTab) : 'overview';
}

export function detailTabHref(leadId: string, tab: DetailTab): `/leads/${string}?tab=${DetailTab}` {
	return `/leads/${leadId}?tab=${tab}`;
}
