import type { DimensionDefinition } from '$lib/domain/products/dimensions';

export type ProductOption = {
	id: string;
	product_code: string;
	name: string;
	customer_description: string | null;
	kind: string;
	category_id: string | null;
	unit_label: string;
	currency: string;
	unit_price: number | string;
	taxable: boolean;
	lock_version: number;
	dimensions_enabled: boolean;
	dimension_definitions: DimensionDefinition[];
};

export type ProductSearchPagination = {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
};

export type ProductSearchResult = {
	products: ProductOption[];
	pagination: ProductSearchPagination;
};

export async function searchProducts(input: {
	currency: string;
	page: number;
	pageSize?: number;
	query?: string;
	categoryId?: string;
	signal?: AbortSignal;
}): Promise<ProductSearchResult> {
	const params = new URLSearchParams({
		currency: input.currency.trim().toUpperCase(),
		page: String(input.page),
		page_size: String(input.pageSize ?? 12)
	});
	if (input.query?.trim()) params.set('q', input.query.trim());
	if (input.categoryId?.trim()) params.set('category_id', input.categoryId.trim());
	const response = await fetch(`/api/products/search?${params.toString()}`, {
		signal: input.signal,
		headers: { accept: 'application/json' }
	});
	const payload = (await response.json()) as Partial<ProductSearchResult> & { error?: string };
	if (!response.ok) throw new Error(payload.error || 'Could not search the catalogue');
	return {
		products: payload.products ?? [],
		pagination: payload.pagination ?? {
			page: input.page,
			pageSize: input.pageSize ?? 12,
			total: payload.products?.length ?? 0,
			totalPages: 1
		}
	};
}
