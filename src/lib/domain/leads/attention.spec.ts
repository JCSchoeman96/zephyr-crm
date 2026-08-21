import { describe, expect, it } from 'vitest';
import { assertLeadAttention } from './attention';

describe('lead attention contract', () => {
	it('keeps attention values independent from pipeline stage', () => {
		expect(() => assertLeadAttention('PROPOSAL', 'waiting_on_client')).not.toThrow();
		expect(() =>
			assertLeadAttention('PROPOSAL', 'paused', 'Waiting for budget approval')
		).not.toThrow();
	});

	it('requires a reason when pausing', () => {
		expect(() => assertLeadAttention('DECISION', 'paused')).toThrow(/pause reason/i);
	});
});
