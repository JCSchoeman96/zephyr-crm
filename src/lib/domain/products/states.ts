export const productStatuses = ['draft', 'active', 'inactive', 'archived'] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const productKinds = ['product', 'service'] as const;
export type ProductKind = (typeof productKinds)[number];

export type ProductTransitionResult =
	{ ok: true } | { ok: false; code: 'same_state' | 'illegal_transition'; message: string };

const transitions: Record<ProductStatus, readonly ProductStatus[]> = {
	draft: ['active', 'archived'],
	active: ['inactive'],
	inactive: ['active', 'archived'],
	archived: ['inactive']
};

const statusLabels: Record<ProductStatus, string> = {
	draft: 'Draft',
	active: 'Active',
	inactive: 'Inactive',
	archived: 'Archived'
};

export function transitionProductStatus(
	from: ProductStatus,
	to: ProductStatus
): ProductTransitionResult {
	if (from === to) {
		return { ok: false, code: 'same_state', message: `Product is already ${statusLabels[from]}` };
	}
	if (transitions[from].includes(to)) return { ok: true };
	return {
		ok: false,
		code: 'illegal_transition',
		message: `Product cannot move from ${statusLabels[from]} to ${statusLabels[to]}`
	};
}

export function productStatusLabel(status: ProductStatus): string {
	return statusLabels[status];
}

export type ProductFilters = {
	q?: string | null;
	status?: string | null;
	kind?: string | null;
	categoryId?: string | null;
	page?: string | null;
	pageSize?: string | null;
};

export type NormalizedProductFilters = {
	q: string;
	status: ProductStatus | '';
	kind: ProductKind | '';
	categoryId: string;
	page: number;
	pageSize: number;
};

export function normalizeProductFilters(input: ProductFilters): NormalizedProductFilters {
	const parsedPage = Number(input.page ?? 1);
	const parsedPageSize = Number(input.pageSize ?? 25);
	return {
		q: (input.q ?? '').trim().slice(0, 80),
		status: productStatuses.includes(input.status as ProductStatus)
			? (input.status as ProductStatus)
			: '',
		kind: productKinds.includes(input.kind as ProductKind) ? (input.kind as ProductKind) : '',
		categoryId: (input.categoryId ?? '').trim().slice(0, 80),
		page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
		pageSize:
			Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 50) : 25
	};
}
