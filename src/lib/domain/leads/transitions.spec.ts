import { describe, expect, it } from 'vitest';
import { assertLegalLeadTransition } from './transitions';

describe('lead transition contract', () => {
	it('allows the tracer-bullet qualification path', () => {
		expect(() => assertLegalLeadTransition('NEW', 'QUALIFICATION')).not.toThrow();
		expect(() => assertLegalLeadTransition('QUALIFICATION', 'PROPOSAL')).not.toThrow();
		expect(() => assertLegalLeadTransition('PROPOSAL', 'DECISION')).not.toThrow();
	});

	it('rejects skipped stages and lost leads without a reason', () => {
		expect(() => assertLegalLeadTransition('NEW', 'DECISION')).toThrow(/legal transition/i);
		expect(() => assertLegalLeadTransition('PROPOSAL', 'LOST')).toThrow(/lost reason/i);
	});

	it('does not expose a generic path from Decision to Won', () => {
		expect(() => assertLegalLeadTransition('DECISION', 'WON')).toThrow(/legal transition/i);
	});
});
