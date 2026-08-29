import { describe, expect, it } from 'vitest';
import { buildQuotePresentationModel } from './presentation-model';

describe('QuotePresentationModel', () => {
	it('projects server-owned Quote facts and excludes staff-only source data', () => {
		const model = buildQuotePresentationModel({
			quote: {
				quote_number: 'Q-2026-000042',
				base_quote_number: 42,
				revision_number: 1,
				status: 'draft',
				created_at: '2026-08-28T10:00:00.000Z',
				valid_until: '2026-09-30',
				currency: 'ZAR',
				subject: 'Server-owned quote',
				introduction: 'A customer introduction',
				terms: 'Payment terms',
				tax_label: 'VAT',
				tax_rate: '15',
				subtotal: '12.34',
				tax_amount: '1.85',
				total: '14.19',
				quote_snapshot: {
					company_identity: {
						name: 'Frozen Seller',
						internal_notes: 'DO NOT PROJECT',
						private_path: 'quotes/private.pdf'
					}
				}
			},
			items: [
				{
					position: 1,
					name: 'Quoted item',
					description: 'Customer description',
					quantity: '2.0000',
					unit_price: '6.1700',
					line_subtotal: '999.99',
					taxable: true,
					product_code_snapshot: 'CAT-001',
					unit_label_snapshot: 'each',
					catalogue_unit_price: '5.0000',
					source_product_reviewed_version: 2,
					internal_notes: 'DO NOT PROJECT'
				}
			],
			recipient: {
				name: 'José Customer',
				company: 'Customer Company',
				address: '1 Market Street\nCape Town',
				email: 'jose@example.test',
				phone: '+27 21 555 0100',
				registration_details: 'private registration data'
			},
			quoteDefaults: { bank_details: 'Bank: Example Bank' },
			brand: {
				companyName: 'Zephyr CRM',
				logoAsset: '/favicon.svg',
				primary: '#315cce',
				primaryStrong: '#2649a8',
				accent: '#d9773b'
			}
		});

		expect(model.quoteIdentity).toEqual({
			number: 'Q-2026-000042',
			revision: 1,
			status: 'draft',
			issueDate: '2026-08-28T10:00:00.000Z',
			validUntil: '2026-09-30',
			currency: 'ZAR'
		});
		expect(model.seller.companyName).toBe('Frozen Seller');
		expect(model.recipient).toMatchObject({
			name: 'José Customer',
			company: 'Customer Company',
			addressLines: ['1 Market Street', 'Cape Town'],
			email: 'jose@example.test'
		});
		expect(model.items).toEqual([
			{
				code: 'CAT-001',
				name: 'Quoted item',
				description: 'Customer description',
				quantity: '2.0000',
				unit: 'each',
				unitPrice: '6.1700',
				amount: '999.99',
				taxable: true
			}
		]);
		expect(model.subtotal).toBe('12.34');
		expect(model.tax).toEqual({ label: 'VAT', rate: '15', amount: '1.85' });
		expect(model.total).toBe('14.19');
		expect(model.bankDetails).toBe('Bank: Example Bank');

		const serialized = JSON.stringify(model);
		expect(serialized).not.toContain('DO NOT PROJECT');
		expect(serialized).not.toContain('private.pdf');
		expect(serialized).not.toContain('private registration data');
		expect(serialized).not.toContain('source_product_reviewed_version');
	});
});
