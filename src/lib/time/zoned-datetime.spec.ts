import { describe, expect, it } from 'vitest';
import {
	localCalendarDayBounds,
	localDateTimeToIso,
	utcIsoToLocalDateTime,
	utcIsoToLocalLabel
} from './zoned-datetime';

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

	it('uses Africa/Johannesburg local midnight bounds, not UTC calendar midnight', () => {
		const bounds = localCalendarDayBounds(
			'Africa/Johannesburg',
			new Date('2026-08-27T22:30:00.000Z')
		);
		expect(bounds.localDate).toBe('2026-08-28');
		expect(bounds.startIso).toBe('2026-08-27T22:00:00.000Z');
		expect(bounds.endIso).toBe('2026-08-28T22:00:00.000Z');
	});

	it('uses next local midnight across a spring-forward day instead of +24h', () => {
		const bounds = localCalendarDayBounds('America/New_York', new Date('2026-03-08T15:00:00.000Z'));
		expect(bounds.localDate).toBe('2026-03-08');
		expect(bounds.startIso).toBe('2026-03-08T05:00:00.000Z');
		expect(bounds.endIso).toBe('2026-03-09T04:00:00.000Z');
		expect(Date.parse(bounds.endIso) - Date.parse(bounds.startIso)).toBe(23 * 60 * 60 * 1000);
	});

	it('uses next local midnight across a fall-back day instead of +24h', () => {
		const bounds = localCalendarDayBounds('America/New_York', new Date('2026-11-01T15:00:00.000Z'));
		expect(bounds.localDate).toBe('2026-11-01');
		expect(bounds.startIso).toBe('2026-11-01T04:00:00.000Z');
		expect(bounds.endIso).toBe('2026-11-02T05:00:00.000Z');
		expect(Date.parse(bounds.endIso) - Date.parse(bounds.startIso)).toBe(25 * 60 * 60 * 1000);
	});
});
