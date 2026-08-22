import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('phone normalization', () => {
	it('normalizes an explicitly international number while preserving no display value', () => {
		expect(normalizePhone('+27 82 123 4567')).toBe('+27821234567');
	});

	it('rejects ambiguous local numbers instead of inventing a country code', () => {
		expect(normalizePhone('082 123 4567')).toBeNull();
	});

	it('rejects invalid and empty values', () => {
		expect(normalizePhone('')).toBeNull();
		expect(normalizePhone('+000 1234567')).toBeNull();
		expect(normalizePhone('+27 ABC 1234567')).toBeNull();
	});
});
