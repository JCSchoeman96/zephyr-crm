export function enquiryNextStep(stage: string, paused: boolean, currentQuoteId: string | null) {
	if (paused && !['WON', 'LOST'].includes(stage)) return 'resume';
	if (stage === 'NEW') return 'review';
	if (stage === 'QUALIFICATION') return 'qualify';
	if (stage === 'PROPOSAL') return currentQuoteId ? 'open_quote' : 'create_quote';
	if (stage === 'DECISION') return currentQuoteId ? 'respond' : 'missing_quote';
	if (stage === 'WON') return 'handoff';
	return 'closed';
}
