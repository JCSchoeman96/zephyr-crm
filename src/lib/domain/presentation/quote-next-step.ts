export function quoteNextStep(status: string) {
	if (status === 'draft') return 'review';
	if (status === 'ready') return 'send';
	if (status === 'sent') return 'respond';
	return 'closed';
}
