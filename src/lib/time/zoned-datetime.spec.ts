import { describe, expect, it } from 'vitest';
import { localDateTimeToIso, utcIsoToLocalDateTime, utcIsoToLocalLabel } from './zoned-datetime';

describe('zoned datetime conversion', () => {
	it('converts a Johannesburg wall time to the matching UTC instant', () => {
		expect(localDateTimeToIso('2026-08-27T10:30', 'Africa/Johannesburg')).toBe(
			'2026-08-27T08:30:00.000Z'
		);
	});

	it('round-trips stored UTC through the configured business timezone', () => {
		const local = utcIsoToLocalDateTime('2026-08-27T08:30:00.000Z', 'Africa/Johannesburg');

		expect(local).toBe('2026-08-27T10:30');
		expect(localDateTimeToIso(local, 'Africa/Johannesburg')).toBe('2026-08-27T08:30:00.000Z');
	});

	it('rejects a nonexistent local time at a daylight-saving transition', () => {
		expect(() => localDateTimeToIso('2026-03-08T02:30', 'America/New_York')).toThrow(
			/does not exist/
		);
	});

	it('labels displayed times with the configured timezone', () => {
		expect(utcIsoToLocalLabel('2026-08-27T08:30:00.000Z', 'Africa/Johannesburg', 'en-ZA')).toBe(
			'27 Aug 2026, 10:30'
		);
	});
});
