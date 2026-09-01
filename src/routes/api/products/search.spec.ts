import { describe, expect, it } from 'vitest';
import { GET } from './search/+server';

const categoryId = '11111111-1111-4111-8111-111111111111';
const dimensionalProduct = {
	id: '22222222-2222-4222-8222-222222222222',
	product_code: 'BLIND-001',
	name: 'Blockout blind',
	customer_description: 'Made to measure',
	kind: 'product',
	category_id: categoryId,
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
const serviceProduct = {
	id: '33333333-3333-4333-8333-333333333333',
	product_code: 'INSTALL-001',
	name: 'Installation',
	customer_description: 'Installation service',
	kind: 'service',
	category_id: categoryId,
	unit_label: 'job',
	currency: 'ZAR',
	unit_price: '500.0000',
	taxable: true,
	lock_version: 1,
	dimensions_enabled: false,
	dimension_definitions: []
};

type SearchResponse = {
	products: Array<Record<string, unknown>>;
	pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

function fakeSearchQuery() {
	const state = {
		selected: '',
		filters: [] as Array<[string, string]>,
		orders: [] as Array<[string, boolean | undefined]>,
		range: null as [number, number] | null,
		or: ''
	};
	const query = {
		select(fields: string) {
			state.selected = fields;
			return query;
		},
		eq(field: string, value: string) {
			state.filters.push([field, value]);
			return query;
		},
		order(field: string, options?: { ascending?: boolean }) {
			state.orders.push([field, options?.ascending]);
			return query;
		},
		range(from: number, to: number) {
			state.range = [from, to];
			return query;
		},
		or(value: string) {
			state.or = value;
			return query;
		},
		then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
			return Promise.resolve({
				data: [dimensionalProduct, serviceProduct],
				count: 2,
				error: null
			}).then(onFulfilled, onRejected);
		}
	};
	return { query, state };
}

describe('Product search API', () => {
	it('returns ordered dimensions for Products and empty disabled dimensions for Services', async () => {
		const { query, state } = fakeSearchQuery();
		const response = await GET({
			locals: {
				supabase: { from: () => query },
				getAuthState: async () => ({
					user: { id: '44444444-4444-4444-8444-444444444444' },
					profile: { status: 'active' }
				})
			},
			url: new URL(
				`http://localhost/api/products/search?currency=zar&q=blind&category_id=${categoryId}&page=2&page_size=4`
			)
		} as never);

		expect(response.status).toBe(200);
		expect(state.selected).toContain('dimensions_enabled,dimension_definitions');
		expect(state.filters).toEqual([
			['status', 'active'],
			['currency', 'ZAR'],
			['category_id', categoryId]
		]);
		expect(state.range).toEqual([4, 7]);
		expect(state.or).toContain('product_code.ilike.*blind*');

		const body = (await response.json()) as SearchResponse;
		expect(body.products).toHaveLength(2);
		expect(body.products[0]).toMatchObject({
			dimensions_enabled: true,
			dimension_definitions: [
				{ key: 'width', label: 'Width', unit: 'mm', required: true },
				{ key: 'height', label: 'Height', unit: 'mm', required: true }
			]
		});
		expect(body.products[1]).toMatchObject({
			kind: 'service',
			dimensions_enabled: false,
			dimension_definitions: []
		});
	});
});
