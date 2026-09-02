import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchProducts, type ProductOption } from './products';

const dimensionalProduct: ProductOption = {
	id: '22222222-2222-4222-8222-222222222222',
	product_code: 'BLIND-001',
	name: 'Blockout blind',
	customer_description: 'Made to measure',
	kind: 'product',
	category_id: '11111111-1111-4111-8111-111111111111',
	unit_label: 'each',
	currency: 'ZAR',
	unit_price: '1500.0000',
	taxable: true,
	lock_version: 3,
	dimensions_enabled: true,
	dimension_definitions: [
		{ key: 'width', label: 'Width', unit: 'mm', required: true },
		{ key: 'height', label: 'Height', unit: 'mm', required: true }
	]
};

const serviceProduct: ProductOption = {
	id: '33333333-3333-4333-8333-333333333333',
	product_code: 'INSTALL-001',
	name: 'Installation',
	customer_description: 'Installation service',
	kind: 'service',
	category_id: '11111111-1111-4111-8111-111111111111',
	unit_label: 'job',
	currency: 'ZAR',
	unit_price: '500.0000',
	taxable: true,
	lock_version: 1,
	dimensions_enabled: false,
	dimension_definitions: []
};

describe('Product search service', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('preserves ordered Product dimensions and disabled Service dimensions', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					products: [dimensionalProduct, serviceProduct],
					pagination: { page: 1, pageSize: 12, total: 2, totalPages: 1 }
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await searchProducts({ currency: ' zar ', page: 1, query: 'blind' });

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/products/search?currency=ZAR&page=1&page_size=12&q=blind',
			expect.objectContaining({ headers: { accept: 'application/json' } })
		);
		expect(result.products[0]).toMatchObject({
			dimensions_enabled: true,
			dimension_definitions: [
				{ key: 'width', label: 'Width', unit: 'mm', required: true },
				{ key: 'height', label: 'Height', unit: 'mm', required: true }
			]
		});
		expect(result.products[1]).toMatchObject({
			kind: 'service',
			dimensions_enabled: false,
			dimension_definitions: []
		});
	});
});
