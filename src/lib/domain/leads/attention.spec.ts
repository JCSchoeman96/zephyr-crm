import { describe, expect, it } from 'vitest';
import { assertLeadAttention } from './attention';

describe('lead attention contract', () => {
	it('keeps attention values independent from pipeline stage', () => {
		expect(() => assertLeadAttention('PROPOSAL', 'waiting_on_client')).not.toThrow();
		expect(() => assertLeadAttention('DECISION', 'waiting_on_us')).not.toThrow();
	});

	it('does not model pause or follow-up as attention', () => {
		expect(() => assertLeadAttention('DECISION', 'follow_up_scheduled' as never)).toThrow(
			/invalid/i
		);
		expect(() => assertLeadAttention('DECISION', 'paused' as never)).toThrow(/invalid/i);
	});
});
