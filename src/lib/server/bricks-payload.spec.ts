import { describe, expect, it } from 'vitest';
import { collectFormEncodedPayload, normalizeBricksPayload } from './bricks-payload';

const expectedFormId = 'aaa03e';
const externalId = 'ceac5545-70c8-421e-b0a5-634be68bbf85';

describe('Bricks payload adapter', () => {
	it('keeps the canonical JSON contract compatible', () => {
		const result = normalizeBricksPayload(
			{
				form_id: expectedFormId,
				external_submission_id: externalId,
				first_name: 'Canonical',
				last_name: 'Lead',
				email: 'canonical@example.test',
				phone: '+27110000000',
				message: 'Canonical message',
				source: 'bricks'
			},
			expectedFormId
		);

		expect(result.rawMode).toBe(false);
		expect(result.formId).toBe(expectedFormId);
		expect(result.externalId).toBe(externalId);
		expect(result.payload).toMatchObject({
			first_name: 'Canonical',
			last_name: 'Lead',
			email: 'canonical@example.test',
			phone: '+27110000000',
			message: 'Canonical message',
			source: 'bricks'
		});
	});

	it('maps raw Bricks fields and infers the configured form ID', () => {
		const result = normalizeBricksPayload(
			{
				'form-field-bkkmsp': externalId,
				'form-field-dan_name': 'Raw',
				'form-field-dan_surname': 'Lead',
				'form-field-dan_email': 'raw@example.test',
				'form-field-dan_phone': '+27112223333',
				'form-field-dan_message': 'Raw notes',
				'form-field-dan_town': 'Test Area',
				'form-field-dan_product': 'screens',
				'form-field-dan_product_type': 'insect-screen-single-sided',
				'form-field-dan_area_type': 'window',
				'form-field-dan_width_mm': '1000',
				'form-field-dan_height_mm': '1500',
				'form-field-dan_openings_count': '1',
				'form-field-dan_installation[]': 'install',
				'form-field-dan_timing[]': 'asap',
				'form-field-dan_contact_method[]': 'email',
				'form-field-amyrxq': 'https://danoptics.co.za/contact-us/',
				'form-field-ctlhqn': 'google',
				'form-field-rcbtvz': 'affiliate-123',
				'form-field-hjpjbt': '2026-08-25',
				'form-field-bigere': 'PROMO10',
				'form-field-dan_photo': 'ignored-file-metadata'
			},
			expectedFormId
		);

		expect(result.rawMode).toBe(true);
		expect(result.formId).toBe(expectedFormId);
		expect(result.externalId).toBe(externalId);
		expect(result.payload).toMatchObject({
			first_name: 'Raw',
			last_name: 'Lead',
			email: 'raw@example.test',
			phone: '+27112223333',
			landing_page: 'https://danoptics.co.za/contact-us/',
			utm_source: 'google',
			source: 'bricks'
		});
		expect(result.payload.message).toContain('Notes: Raw notes');
		expect(result.payload.message).toContain('Town/area: Test Area');
		expect(result.payload.message).toContain('Product: screens');
		expect(result.payload.message).toContain('Width (mm): 1000');
		expect(result.payload.message).toContain('Installation: install');
		expect(result.payload.message).toContain('Promo code: PROMO10');
		expect(result.payload.message).not.toContain('ignored-file-metadata');
	});

	it('omits empty optional raw fields instead of adding empty labels', () => {
		const result = normalizeBricksPayload(
			{
				'form-field-bkkmsp': externalId,
				'form-field-dan_name': 'Minimal',
				'form-field-dan_email': 'minimal@example.test',
				'form-field-dan_town': '',
				'form-field-dan_photo': ''
			},
			expectedFormId
		);

		expect(result.payload.message).toBe('');
	});

	it('collects repeated URL-encoded radio values', () => {
		const payload = collectFormEncodedPayload(
			new URLSearchParams([
				['form-field-dan_installation[]', 'install'],
				['form-field-dan_installation[]', 'unsure'],
				['form-field-dan_name', 'Array'],
				['form-field-dan_email', 'array@example.test']
			])
		);

		expect(payload['form-field-dan_installation[]']).toEqual(['install', 'unsure']);
	});

	it('reports unknown raw fields for the request parser to reject', () => {
		const result = normalizeBricksPayload(
			{
				'form-field-bkkmsp': externalId,
				'form-field-dan_name': 'Unknown',
				'form-field-dan_email': 'unknown@example.test',
				'form-field-not-on-the-form': 'reject-me'
			},
			expectedFormId
		);

		expect(result.unknownFields).toEqual(['form-field-not-on-the-form']);
	});
});
