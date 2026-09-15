import { describe, expect, it } from 'vitest';
import { detailTabHref, parseDetailTab } from './detail-tabs';

describe('lead detail tabs', () => {
	it('defaults missing and invalid values to Overview', () => {
		expect(parseDetailTab(null)).toBe('overview');
		expect(parseDetailTab('')).toBe('overview');
		expect(parseDetailTab('activity')).toBe('overview');
	});

	it('accepts each supported tab', () => {
		expect(parseDetailTab('overview')).toBe('overview');
		expect(parseDetailTab('quotes')).toBe('quotes');
		expect(parseDetailTab('follow-ups')).toBe('follow-ups');
		expect(parseDetailTab('history')).toBe('history');
	});

	it('builds a bookmarkable tab URL', () => {
		expect(detailTabHref('lead-1', 'follow-ups')).toBe('/leads/lead-1?tab=follow-ups');
	});
});
