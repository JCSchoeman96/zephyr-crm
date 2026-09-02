import { describe, expect, it } from 'vitest';
import { buildQuotePresentationModel, groupQuotePresentationItems } from './presentation-model';

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
				taxable: true,
				category: { label: 'Other' },
				dimensions: []
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

	it('groups ordered lines by first-seen category and projects dimension snapshots', () => {
		const model = buildQuotePresentationModel({
			quote: {
				quote_number: 'Q-2026-000043',
				base_quote_number: 43,
				revision_number: 1,
				status: 'ready',
				created_at: '2026-08-28T10:00:00.000Z',
				valid_until: null,
				currency: 'ZAR',
				subject: 'Sized products',
				introduction: null,
				terms: null,
				tax_label: 'VAT',
				tax_rate: '15',
				subtotal: '5500.00',
				tax_amount: '825.00',
				total: '6325.00',
				quote_snapshot: {}
			},
			items: [
				{
					position: 3,
					name: 'Custom fitting',
					description: null,
					quantity: '1.0000',
					unit_price: '500.00',
					line_subtotal: '500.00',
					taxable: true
				},
				{
					position: 2,
					name: 'Security Shutters',
					description: 'Powder-coated shutter',
					quantity: '1.0000',
					unit_price: '3000.00',
					line_subtotal: '3000.00',
					taxable: true,
					product_category_label_snapshot: 'Shutters',
					product_code_snapshot: 'SHUT-001',
					dimensions: [
						{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '2500' },
						{ key: 'height', label: 'Height', unit: 'mm', required: true, value: '1500' }
					]
				},
				{
					position: 1,
					name: 'Blockout Blinds 1500 × 1500',
					description: 'Blockout fabric',
					quantity: '1.0000',
					unit_price: '1500.00',
					line_subtotal: '1500.00',
					taxable: true,
					product_category_label_snapshot: 'Blinds',
					product_code_snapshot: 'BLIND-001',
					dimensions: [
						{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1500' },
						{ key: 'height', label: 'Height', unit: 'mm', required: true, value: '1500' }
					]
				},
				{
					position: 4,
					name: 'Blockout Blinds 1000 × 900',
					description: 'Blockout fabric',
					quantity: '1.0000',
					unit_price: '1000.00',
					line_subtotal: '1000.00',
					taxable: true,
					product_category_label_snapshot: 'Blinds',
					product_code_snapshot: 'BLIND-001',
					dimensions: [
						{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1000' },
						{ key: 'height', label: 'Height', unit: 'mm', required: true, value: '900' }
					]
				}
			]
		});

		const groups = groupQuotePresentationItems(model.items);

		expect(groups.map((group) => group.label)).toEqual(['Blinds', 'Shutters', 'Other']);
		expect(groups[0]?.items.map((item) => item.name)).toEqual([
			'Blockout Blinds 1500 × 1500',
			'Blockout Blinds 1000 × 900'
		]);
		expect(groups[1]?.items.map((item) => item.name)).toEqual(['Security Shutters']);
		expect(groups[2]?.items.map((item) => item.name)).toEqual(['Custom fitting']);
		expect(model.items[0]?.category).toEqual({ label: 'Blinds' });
		expect(model.items[0]?.dimensions).toEqual([
			{ key: 'width', label: 'Width', unit: 'mm', value: '1500' },
			{ key: 'height', label: 'Height', unit: 'mm', value: '1500' }
		]);
		expect(model.items[0]?.amount).toBe('1500.00');
		expect(groups.every((group) => !('amount' in group))).toBe(true);
		expect(JSON.stringify(model)).not.toContain('internal_notes');
	});
});
