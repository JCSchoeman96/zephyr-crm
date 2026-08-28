import { productKinds, type ProductKind } from '$lib/domain/products/states';

export type ProductInput = {
	productCode: string;
	name: string;
	customerDescription: string;
	internalNotes: string;
	kind: ProductKind | string;
	categoryId: string | null;
	unitLabel: string;
	currency: string;
	unitPrice: string | number;
	taxable: boolean;
};

export type NormalizedProductInput = {
	productCode: string;
	name: string;
	customerDescription: string | null;
	internalNotes: string | null;
	kind: ProductKind;
	categoryId: string | null;
	unitLabel: string;
	currency: string;
	unitPrice: string;
	taxable: boolean;
};

export function canManageProducts(role: string): boolean {
	return role === 'owner' || role === 'admin';
}

function requiredText(value: string, label: string, maxLength: number): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${label} is required`);
	if (normalized.length > maxLength) throw new Error(`${label} is too long`);
	return normalized;
}

function optionalText(value: string, label: string, maxLength: number): string | null {
	const normalized = value.trim();
	if (normalized.length > maxLength) throw new Error(`${label} is too long`);
	return normalized || null;
}

export function normalizeProductInput(input: ProductInput): NormalizedProductInput {
	const productCode = requiredText(input.productCode, 'Product code', 80);
	const name = requiredText(input.name, 'Product name', 200);
	const kind = input.kind.trim() as ProductKind;
	if (!productKinds.includes(kind)) throw new Error('Product kind is invalid');
	const unitLabel = requiredText(input.unitLabel, 'Unit label', 80);
	const currency = input.currency.trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Product currency is invalid');
	const unitPrice = String(input.unitPrice).trim();
	if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(unitPrice)) {
		throw new Error('Product unit price is invalid');
	}
	return {
		productCode,
		name,
		customerDescription: optionalText(input.customerDescription, 'Customer description', 10000),
		internalNotes: optionalText(input.internalNotes, 'Internal notes', 10000),
		kind,
		categoryId: input.categoryId?.trim() || null,
		unitLabel,
		currency,
		unitPrice,
		taxable: input.taxable
	};
}
