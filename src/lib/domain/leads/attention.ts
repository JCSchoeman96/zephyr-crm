export const leadAttentionStates = [
	'none',
	'waiting_on_client',
	'waiting_on_us',
	'follow_up_scheduled',
	'paused'
] as const;
export type LeadAttentionState = (typeof leadAttentionStates)[number];

export function assertLeadAttention(
	_pipelineStage: string,
	attentionState: LeadAttentionState,
	reason?: string
): void {
	if (!leadAttentionStates.includes(attentionState))
		throw new Error('Invalid lead attention state');
	if (attentionState === 'paused' && !reason?.trim()) throw new Error('A pause reason is required');
}
