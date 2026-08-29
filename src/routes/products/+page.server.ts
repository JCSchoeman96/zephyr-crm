import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { normalizeProductFilters } from '$lib/domain/products/states';
import { requireActiveStaff } from '$lib/server/require-auth';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeIlike(value: string) {
	return value.replace(/[\\*%_]/g, '\\$&');
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const filters = normalizeProductFilters({
		q: event.url.searchParams.get('q'),
		status: event.url.searchParams.get('status'),
		kind: event.url.searchParams.get('kind'),
		categoryId: event.url.searchParams.get('category_id'),
		page: event.url.searchParams.get('page'),
		pageSize: event.url.searchParams.get('page_size')
	});
	const categoryId = uuidPattern.test(filters.categoryId) ? filters.categoryId : '';
	const from = (filters.page - 1) * filters.pageSize;
	const to = from + filters.pageSize - 1;

	let productsQuery = supabase
		.from('products')
		.select('*', { count: 'exact' })
		.range(from, to)
		.order('updated_at', { ascending: false })
		.order('name', { ascending: true })
		.order('id', { ascending: true });
	if (filters.q) {
		const pattern = `*${escapeIlike(filters.q)}*`;
		productsQuery = productsQuery.or(
			[
				`product_code.ilike.${pattern}`,
				`name.ilike.${pattern}`,
				`customer_description.ilike.${pattern}`
			].join(',')
		);
	}
	if (filters.status) productsQuery = productsQuery.eq('status', filters.status);
	if (filters.kind) productsQuery = productsQuery.eq('kind', filters.kind);
	if (categoryId) productsQuery = productsQuery.eq('category_id', categoryId);

	const [productsResponse, categoriesResponse] = await Promise.all([
		productsQuery,
		supabase
			.from('product_categories')
			.select('*')
			.order('sort_order', { ascending: true })
			.order('label', { ascending: true })
			.limit(100)
	]);
	if (productsResponse.error || categoriesResponse.error) {
		throw error(500, 'Could not load the Product catalogue');
	}

	const total = productsResponse.count ?? 0;
	return {
		products: productsResponse.data ?? [],
		categories: categoriesResponse.data ?? [],
		profile,
		filters: { ...filters, categoryId },
		pagination: {
			page: filters.page,
			pageSize: filters.pageSize,
			total,
			totalPages: Math.max(1, Math.ceil(total / filters.pageSize))
		}
	};
};
