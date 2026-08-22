export const leadAttentionStates = ['none', 'waiting_on_client', 'waiting_on_us'] as const;
export type LeadAttentionState = (typeof leadAttentionStates)[number];

export function assertLeadAttention(
	_pipelineStage: string,
	attentionState: LeadAttentionState,
	reason?: string
): void {
	void reason;
	if (!leadAttentionStates.includes(attentionState))
		throw new Error('Invalid lead attention state');
}
