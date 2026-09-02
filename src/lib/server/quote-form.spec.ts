import { describe, expect, it } from 'vitest';
import { parseQuoteItems } from './quote-form';

const productDimensions = [
	{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1500' },
	{ key: 'height', label: 'Height', unit: 'mm', required: true, value: null }
] as const;

function formWithItems(items: unknown[]) {
	const form = new FormData();
	form.set('items', JSON.stringify(items));
	return form;
}

describe('quote form item parsing', () => {
	it('preserves pending catalogue identity and excludes server-owned fields', () => {
		const [item] = parseQuoteItems(
			formWithItems([
				{
					id: '550e8400-e29b-41d4-a716-446655440000',
					name: 'Blockout Blinds',
					description: 'Bedroom window',
					quantity: '1',
					unit_price: '1500',
					taxable: true,
					dimensions: productDimensions,
					source_type: 'catalogue',
					product_id: '650e8400-e29b-41d4-a716-446655440000',
					product_lock_version: '7',
					product_code_snapshot: 'BLK-001',
					catalogue_unit_price: '1200',
					product_category_label_snapshot: 'Blinds',
					source_product_version: 6,
					line_subtotal: '999999',
					total: '999999'
				}
			])
		);

		expect(item).toEqual({
			id: '550e8400-e29b-41d4-a716-446655440000',
			name: 'Blockout Blinds',
			description: 'Bedroom window',
			quantity: '1',
			unit_price: '1500',
			taxable: true,
			dimensions: productDimensions,
			source_type: 'catalogue',
			product_id: '650e8400-e29b-41d4-a716-446655440000',
			product_lock_version: 7
		});
		expect(item).not.toHaveProperty('product_code_snapshot');
		expect(item).not.toHaveProperty('catalogue_unit_price');
		expect(item).not.toHaveProperty('line_subtotal');
		expect(item).not.toHaveProperty('total');
	});

	it.each([
		['without a Product UUID', { product_id: 'not-a-uuid', product_lock_version: '7' }],
		['without a Product UUID', { product_lock_version: '7' }],
		[
			'without a positive integer Product lock version',
			{ product_id: '650e8400-e29b-41d4-a716-446655440000' }
		],
		[
			'with a non-positive Product lock version',
			{ product_id: '650e8400-e29b-41d4-a716-446655440000', product_lock_version: '0' }
		],
		[
			'with a non-integer Product lock version',
			{ product_id: '650e8400-e29b-41d4-a716-446655440000', product_lock_version: '1.5' }
		]
	])('rejects catalogue rows %s', (_label, identity) => {
		expect(() =>
			parseQuoteItems(
				formWithItems([
					{
						name: 'Screen',
						quantity: '1',
						unit_price: '100',
						taxable: true,
						source_type: 'catalogue',
						...identity
					}
				])
			)
		).toThrow();
	});

	it.each([
		['Product ID', { product_id: '650e8400-e29b-41d4-a716-446655440000' }],
		['Product lock version', { product_lock_version: 7 }]
	])('rejects custom rows carrying %s', (_label, identity) => {
		expect(() =>
			parseQuoteItems(
				formWithItems([
					{
						name: 'One-off item',
						quantity: '1',
						unit_price: '500',
						taxable: true,
						source_type: 'custom',
						...identity
					}
				])
			)
		).toThrow(/custom|Product/i);
	});

	it('accepts an empty item array', () => {
		expect(parseQuoteItems(formWithItems([]))).toEqual([]);
	});

	it('canonicalizes decimal dimension values without filling incomplete drafts', () => {
		const [item] = parseQuoteItems(
			formWithItems([
				{
					name: 'Screen',
					quantity: '1',
					unit_price: '0',
					taxable: false,
					dimensions: [
						{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '001500.00' }
					]
				}
			])
		);

		expect(item.dimensions).toEqual([
			{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1500' }
		]);
	});

	it.each([
		[
			'unknown keys',
			[{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '100', extra: 'x' }]
		],
		[
			'duplicate keys',
			[
				{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '100' },
				{ key: 'width', label: 'Width again', unit: 'mm', required: true, value: '200' }
			]
		],
		[
			'malformed values',
			[{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '100mm' }]
		],
		[
			'nonpositive values',
			[{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '0' }]
		]
	])('rejects %s', (_label, dimensions) => {
		expect(() =>
			parseQuoteItems(
				formWithItems([
					{ name: 'Screen', quantity: '1', unit_price: '0', taxable: true, dimensions }
				])
			)
		).toThrow();
	});

	it('rejects dimensions on a custom item when the source is representable', () => {
		expect(() =>
			parseQuoteItems(
				formWithItems([
					{
						name: 'One-off item',
						quantity: '1',
						unit_price: '500',
						taxable: true,
						source_type: 'custom',
						dimensions: productDimensions
					}
				])
			)
		).toThrow(/custom/i);
	});

	it('keeps ordinary item fields and does not calculate totals', () => {
		const [item] = parseQuoteItems(
			formWithItems([
				{
					name: 'Installation',
					description: 'Manual price',
					quantity: '2',
					unit_price: '1250.50',
					taxable: true
				}
			])
		);

		expect(item).toEqual({
			name: 'Installation',
			description: 'Manual price',
			quantity: '2',
			unit_price: '1250.50',
			taxable: true
		});
		expect(item).not.toHaveProperty('line_subtotal');
		expect(item).not.toHaveProperty('total');
	});
});
