import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const currencyPattern = /^[A-Z]{3}$/;
const defaultPageSize = 12;

function positiveInteger(value: string | null, fallback: number) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeIlike(value: string) {
	return value.replace(/[\\*%_(),]/g, '\\$&');
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user, profile } = await locals.getAuthState();
	if (!locals.supabase || !user || !profile || profile.status !== 'active') {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const categoryValue = (url.searchParams.get('category_id') ?? '').trim();
	const categoryId = uuidPattern.test(categoryValue) ? categoryValue : '';
	const currencyValue = (url.searchParams.get('currency') ?? '').trim().toUpperCase();
	const currency = currencyPattern.test(currencyValue) ? currencyValue : '';
	const page = positiveInteger(url.searchParams.get('page'), 1);
	const pageSize = Math.min(
		defaultPageSize,
		positiveInteger(url.searchParams.get('page_size'), defaultPageSize)
	);
	const from = (page - 1) * pageSize;
	const to = from + pageSize - 1;

	let productsQuery = locals.supabase
		.from('products')
		.select(
			'id,product_code,name,customer_description,kind,category_id,unit_label,currency,unit_price,taxable,lock_version,dimensions_enabled,dimension_definitions',
			{ count: 'exact' }
		)
		.eq('status', 'active')
		.order('name', { ascending: true })
		.order('product_code', { ascending: true })
		.order('id', { ascending: true })
		.range(from, to);
	if (currency) productsQuery = productsQuery.eq('currency', currency);
	if (categoryId) productsQuery = productsQuery.eq('category_id', categoryId);
	if (query) {
		const pattern = `*${escapeIlike(query)}*`;
		productsQuery = productsQuery.or(
			[
				`product_code.ilike.${pattern}`,
				`name.ilike.${pattern}`,
				`customer_description.ilike.${pattern}`
			].join(',')
		);
	}

	const response = await productsQuery;
	if (response.error)
		return json({ error: 'Could not search the Product catalogue' }, { status: 500 });

	const total = response.count ?? 0;
	return json(
		{
			products: response.data ?? [],
			pagination: {
				page,
				pageSize,
				total,
				totalPages: Math.max(1, Math.ceil(total / pageSize))
			}
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
