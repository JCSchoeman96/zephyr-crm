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
					category: { key: 'other', label: 'Other' },
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
					product_category_id_snapshot: '22222222-2222-4222-8222-222222222222',
					product_category_code_snapshot: 'SHUTTERS',
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
					product_category_id_snapshot: '11111111-1111-4111-8111-111111111111',
					product_category_code_snapshot: 'BLINDS',
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
					product_category_id_snapshot: '11111111-1111-4111-8111-111111111111',
					product_category_code_snapshot: 'BLINDS',
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
		expect(model.items[0]?.category).toEqual({
			key: 'id:11111111-1111-4111-8111-111111111111',
			label: 'Blinds'
		});
		expect(model.items[0]?.dimensions).toEqual([
			{ key: 'width', label: 'Width', unit: 'mm', value: '1500' },
			{ key: 'height', label: 'Height', unit: 'mm', value: '1500' }
		]);
		expect(model.items[0]?.amount).toBe('1500.00');
		expect(groups.every((group) => !('amount' in group))).toBe(true);
		expect(JSON.stringify(model)).not.toContain('internal_notes');
	});

	it('separates same-label and real-Other categories by snapshot identity', () => {
		const item = (position: number, name: string, category: Record<string, string> = {}) => ({
			position,
			name,
			description: null,
			quantity: '1.0000',
			unit_price: '100.00',
			line_subtotal: '100.00',
			taxable: true,
			...category
		});
		const model = buildQuotePresentationModel({
			quote: {
				quote_number: 'Q-2026-000044',
				base_quote_number: 44,
				revision_number: 1,
				status: 'ready',
				created_at: '2026-08-28T10:00:00.000Z',
				valid_until: null,
				currency: 'ZAR',
				subject: 'Stable category identity',
				introduction: null,
				terms: null,
				tax_label: 'VAT',
				tax_rate: '15',
				subtotal: '600.00',
				tax_amount: '90.00',
				total: '690.00',
				quote_snapshot: {}
			},
			items: [
				item(1, 'First shared label', {
					product_category_id_snapshot: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
					product_category_code_snapshot: 'SHARED-A',
					product_category_label_snapshot: 'Shared label'
				}),
				item(2, 'Uncategorized line'),
				item(3, 'Second shared label', {
					product_category_id_snapshot: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
					product_category_code_snapshot: 'SHARED-B',
					product_category_label_snapshot: 'Shared label'
				}),
				item(4, 'Real Other category', {
					product_category_id_snapshot: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
					product_category_code_snapshot: 'OTHER',
					product_category_label_snapshot: 'Other'
				}),
				item(5, 'Code-only category line', {
					product_category_code_snapshot: 'CODE-ONLY',
					product_category_label_snapshot: 'Code-only category'
				}),
				item(6, 'Second code-only category line', {
					product_category_code_snapshot: 'CODE-ONLY',
					product_category_label_snapshot: 'Code-only category'
				})
			]
		});

		const groups = groupQuotePresentationItems(model.items);

		expect(groups.map((group) => [group.key, group.label])).toEqual([
			['id:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Shared label'],
			['other', 'Other'],
			['id:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Shared label'],
			['id:cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Other'],
			['code:CODE-ONLY', 'Code-only category']
		]);
		expect(groups[1]?.items.map((line) => line.name)).toEqual(['Uncategorized line']);
		expect(groups[3]?.items.map((line) => line.name)).toEqual(['Real Other category']);
		expect(groups[4]?.items.map((line) => line.name)).toEqual([
			'Code-only category line',
			'Second code-only category line'
		]);
	});
});
