import { describe, expect, it } from 'vitest';
import { conversionRate, normalizeDateRange } from './metrics';

describe('dashboard metric helpers', () => {
	it('uses a deterministic 30-day inclusive default window', () => {
		expect(normalizeDateRange(null, null, new Date('2026-08-22T12:00:00Z'))).toEqual({
			from: '2026-07-24',
			to: '2026-08-22'
		});
	});

	it('rejects future, malformed, reversed and overlong ranges to the default', () => {
		const today = new Date('2026-08-22T12:00:00Z');
		expect(normalizeDateRange('2026-08-23', '2026-08-23', today)).toEqual({
			from: '2026-07-24',
			to: '2026-08-22'
		});
		expect(normalizeDateRange('2026-08-23', '2026-08-22', today)).toEqual({
			from: '2026-07-24',
			to: '2026-08-22'
		});
		expect(normalizeDateRange('2025-01-01', '2026-08-22', today)).toEqual({
			from: '2026-07-24',
			to: '2026-08-22'
		});
	});

	it('returns zero for no terminal leads and a rounded percentage otherwise', () => {
		expect(conversionRate(0, 0)).toBe(0);
		expect(conversionRate(1, 2)).toBe(33.33);
		expect(conversionRate(2, 0)).toBe(100);
	});
});
