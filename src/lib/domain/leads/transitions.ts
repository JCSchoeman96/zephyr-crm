export const leadStages = ['NEW', 'QUALIFICATION', 'PROPOSAL', 'DECISION', 'WON', 'LOST'] as const;
export type LeadStage = (typeof leadStages)[number];

const legalTransitions: Record<LeadStage, readonly LeadStage[]> = {
	NEW: ['QUALIFICATION', 'LOST'],
	QUALIFICATION: ['PROPOSAL', 'LOST'],
	PROPOSAL: ['DECISION', 'LOST'],
	DECISION: ['PROPOSAL', 'LOST'],
	WON: [],
	LOST: []
};

export function assertLegalLeadTransition(
	from: LeadStage,
	to: LeadStage,
	hasLostReason = false
): void {
	if (!legalTransitions[from].includes(to)) {
		throw new Error(`No legal transition from ${from} to ${to}`);
	}
	if (to === 'LOST' && !hasLostReason) {
		throw new Error('A Lost transition requires a lost reason');
	}
}

export function canTransitionLead(from: LeadStage, to: LeadStage): boolean {
	return legalTransitions[from].includes(to);
}
