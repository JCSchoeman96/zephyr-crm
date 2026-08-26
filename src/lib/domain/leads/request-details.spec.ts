import { describe, expect, it } from 'vitest';
import {
	formatLeadRequestValue,
	parseLeadRequestMessage,
	shouldExpandLeadRequestDetails
} from './request-details';

const fullMessage =
	'Notes: Big | Town/area: Vanderbijlpark | Product: screens | Product type: Select a product type | Area type: window | Width (mm): 100 | Height (mm): 100 | Openings: 1 | Installation: diy | Timing: asap | Contact method: phone | Promo code: Hallo';

describe('lead request details', () => {
	it('maps the captured qualification message into concern-based groups', () => {
		const result = parseLeadRequestMessage(fullMessage);

		expect(result.hasStructuredFields).toBe(true);
		expect(result.notes).toBe('Big');
		expect(result.groups.map((group) => group.key)).toEqual([
			'location-product',
			'measurements',
			'follow-up',
			'source-promotion',
			'notes'
		]);
		expect(result.groups[0].fields).toEqual([
			{ key: 'town', label: 'Town / area', value: 'Vanderbijlpark' },
			{ key: 'product', label: 'Product', value: 'screens' },
			{ key: 'product-type', label: 'Product type', value: 'Select a product type' },
			{ key: 'area-type', label: 'Area type', value: 'window' }
		]);
		expect(result.groups[1].summary).toBe('100 mm × 100 mm · 1 opening');
		expect(result.groups[2].summary).toBe('DIY · ASAP · Phone');
		expect(result.groups[3].fields).toEqual([
			{ key: 'promo-code', label: 'Promo code', value: 'Hallo' }
		]);
		expect(result.groups[4].fields).toEqual([
			{ key: 'notes', label: 'Notes', value: 'Big' }
		]);
	});

	it('omits blank optional fields and creates a source group only when populated', () => {
		const result = parseLeadRequestMessage(
			'Town/area: Vanderbijlpark | Product: screens | Width (mm): 100 | Promo code: Hallo'
		);

		expect(result.groups.map((group) => group.key)).toEqual([
			'location-product',
			'measurements',
			'source-promotion'
		]);
		expect(result.groups[0].fields.map((field) => field.label)).toEqual([
			'Town / area',
			'Product'
		]);
		expect(result.groups[1].fields).toEqual([
			{ key: 'width', label: 'Width', value: '100' }
		]);
		expect(result.groups[2].fields).toEqual([
			{ key: 'promo-code', label: 'Promo code', value: 'Hallo' }
		]);
	});

	it('preserves unlabelled and unknown labelled text in Notes', () => {
		const result = parseLeadRequestMessage(
			'Town/area: Vanderbijlpark | Internal note: call after 5pm | Please check access'
		);

		expect(result.notes).toBe('Internal note: call after 5pm | Please check access');
	});

	it('falls back to the complete message when no known fields are present', () => {
		const result = parseLeadRequestMessage('Customer asked for a site visit');

		expect(result.hasStructuredFields).toBe(false);
		expect(result.groups).toEqual([]);
		expect(result.fallbackMessage).toBe('Customer asked for a site visit');
	});

	it('formats known captured slugs without changing the stored values', () => {
		expect(formatLeadRequestValue('installation', 'diy')).toBe('DIY');
		expect(formatLeadRequestValue('timing', '2-4-weeks')).toBe('Within 2–4 weeks');
		expect(formatLeadRequestValue('product-type', 'insect-screen-single-sided')).toBe(
			'Insect screen single sided'
		);
		expect(formatLeadRequestValue('product-type', 'Select a product type')).toBe(
			'Select a product type'
		);
	});

	it('opens all non-empty groups for recent active leads', () => {
		const now = Date.parse('2026-08-26T10:00:00.000Z');

		expect(
			shouldExpandLeadRequestDetails({
				createdAt: '2026-08-20T10:00:00.000Z',
				lastActivityAt: '2026-08-26T09:00:00.000Z',
				pipelineStage: 'QUALIFICATION',
				now
			})
		).toBe(true);
	});

	it('collapses older or terminal leads to the first available group', () => {
		const now = Date.parse('2026-08-26T10:00:00.000Z');

		expect(
			shouldExpandLeadRequestDetails({
				createdAt: '2026-07-01T10:00:00.000Z',
				lastActivityAt: '2026-07-01T10:00:00.000Z',
				pipelineStage: 'PROPOSAL',
				now
			})
		).toBe(false);
		expect(
			shouldExpandLeadRequestDetails({
				createdAt: '2026-08-20T10:00:00.000Z',
				lastActivityAt: '2026-08-20T10:00:00.000Z',
				pipelineStage: 'LOST',
				now
			})
		).toBe(false);
	});
});
