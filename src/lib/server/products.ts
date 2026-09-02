import { productKinds, type ProductKind } from '$lib/domain/products/states';
import {
	normalizeDimensionDefinitions,
	type DimensionDefinition
} from '$lib/domain/products/dimensions';

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
	dimensionsEnabled?: boolean;
	dimensionDefinitions?: unknown;
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
	dimensionsEnabled: boolean;
	dimensionDefinitions: DimensionDefinition[];
};

export function normalizeProductPrice(value: string | number): string {
	const unitPrice = String(value).trim();
	if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(unitPrice)) {
		throw new Error('Product unit price is invalid');
	}
	return unitPrice;
}

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
	const unitPrice = normalizeProductPrice(input.unitPrice);
	const dimensionsEnabled = input.dimensionsEnabled ?? false;
	const dimensionDefinitions = normalizeDimensionDefinitions({
		kind,
		dimensionsEnabled,
		dimensionDefinitions: input.dimensionDefinitions ?? []
	});
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
		taxable: input.taxable,
		dimensionsEnabled,
		dimensionDefinitions
	};
}
