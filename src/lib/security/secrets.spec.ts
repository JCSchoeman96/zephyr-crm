import { describe, expect, it } from 'vitest';
import { constantTimeEqual, verifyBearerSecret } from './secrets';

describe('secret boundary helpers', () => {
	it('compares equal and unequal values without exposing the secret', async () => {
		expect(await constantTimeEqual('same-value', 'same-value')).toBe(true);
		expect(await constantTimeEqual('same-value', 'different-value')).toBe(false);
	});

	it('verifies the complete bearer header', async () => {
		expect(await verifyBearerSecret('Bearer test-secret', 'test-secret')).toBe(true);
		expect(await verifyBearerSecret('Bearer wrong-secret', 'test-secret')).toBe(false);
		expect(await verifyBearerSecret('test-secret', 'test-secret')).toBe(false);
	});
});
