import { buildDimensionSnapshot, type DimensionValue } from '$lib/domain/products/dimensions';

export type QuoteFormItem = {
	id?: string;
	name: string;
	description?: string;
	quantity: string;
	unit_price: string;
	taxable: boolean;
	dimensions?: DimensionValue[];
	source_type?: 'catalogue';
	product_id?: string;
	product_lock_version?: number;
};

const quantityPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const pricePattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const taxPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textValue(form: FormData, name: string) {
	return String(form.get(name) ?? '').trim();
}

export function decimalValue(form: FormData, name: string, pattern: RegExp, fallback = '0') {
	const value = textValue(form, name) || fallback;
	if (!pattern.test(value)) throw new Error(`${name.replaceAll('_', ' ')} must be a valid decimal`);
	return value;
}

export function nullableDate(form: FormData, name: string) {
	const value = textValue(form, name);
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Validity date must be a valid date');
	return value;
}

function nullableLockVersion(form: FormData, quoteId: string | null) {
	if (!quoteId) return null;
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid quote lock version is required');
	return value;
}

const dimensionFields = new Set(['key', 'label', 'unit', 'required', 'value']);

function parseDimensionValues(value: unknown, index: number): DimensionValue[] {
	if (!Array.isArray(value)) throw new Error(`Quote line ${index + 1} dimensions are invalid`);
	const definitions = value.map((dimension, dimensionIndex) => {
		if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)) {
			throw new Error(`Quote line ${index + 1} dimension ${dimensionIndex + 1} is invalid`);
		}
		const record = dimension as Record<string, unknown>;
		for (const field of Object.keys(record)) {
			if (!dimensionFields.has(field)) {
				throw new Error(`Quote line ${index + 1} has an unknown dimension field`);
			}
		}
		if (!Object.prototype.hasOwnProperty.call(record, 'value')) {
			throw new Error(`Quote line ${index + 1} dimension value is required`);
		}
		return {
			key: record.key,
			label: record.label,
			unit: record.unit,
			required: record.required
		};
	});
	return buildDimensionSnapshot(
		definitions as Parameters<typeof buildDimensionSnapshot>[0],
		Object.fromEntries(
			value.map((dimension) => {
				const record = dimension as Record<string, unknown>;
				return [String(record.key), record.value];
			})
		)
	);
}

export function parseQuoteItems(form: FormData): QuoteFormItem[] {
	const raw = textValue(form, 'items');
	let value: unknown;
	try {
		value = JSON.parse(raw || '[]');
	} catch {
		throw new Error('Quote line items are not valid JSON');
	}
	if (!Array.isArray(value) || value.length > 100)
		throw new Error('Add up to 100 quote line items');
	return value.map((item, index) => {
		if (!item || typeof item !== 'object') throw new Error(`Quote line ${index + 1} is invalid`);
		const record = item as Record<string, unknown>;
		const id = record.id === undefined || record.id === null ? undefined : String(record.id).trim();
		if (id && !uuidPattern.test(id))
			throw new Error(`Quote line ${index + 1} identifier is invalid`);
		const name = String(record.name ?? '').trim();
		const quantity = String(record.quantity ?? '');
		const unitPrice = String(record.unit_price ?? '');
		if (!name) throw new Error(`Quote line ${index + 1} requires a name`);
		if (!quantityPattern.test(quantity) || /^0(?:\.0{1,4})?$/.test(quantity))
			throw new Error(`Quote line ${index + 1} quantity is invalid`);
		if (!pricePattern.test(unitPrice))
			throw new Error(`Quote line ${index + 1} unit price is invalid`);
		if (typeof record.taxable !== 'boolean')
			throw new Error(`Quote line ${index + 1} tax flag is invalid`);
		const dimensions =
			record.dimensions === undefined ? undefined : parseDimensionValues(record.dimensions, index);
		const parsedItem = {
			...(id ? { id } : {}),
			name,
			description: String(record.description ?? '').trim(),
			quantity,
			unit_price: unitPrice,
			taxable: record.taxable,
			...(dimensions ? { dimensions } : {})
		};
		if (record.source_type === 'catalogue') {
			const productId = String(record.product_id ?? '').trim();
			if (!uuidPattern.test(productId))
				throw new Error(`Quote line ${index + 1} Product identifier is invalid`);
			const rawProductLockVersion = record.product_lock_version;
			const productLockVersion =
				typeof rawProductLockVersion === 'number'
					? rawProductLockVersion
					: typeof rawProductLockVersion === 'string' && /^\d+$/.test(rawProductLockVersion.trim())
						? Number(rawProductLockVersion.trim())
						: Number.NaN;
			if (!Number.isInteger(productLockVersion) || productLockVersion < 1)
				throw new Error(`Quote line ${index + 1} Product lock version is invalid`);
			return {
				...parsedItem,
				source_type: 'catalogue' as const,
				product_id: productId,
				product_lock_version: productLockVersion
			};
		}
		if (
			Object.prototype.hasOwnProperty.call(record, 'product_id') ||
			Object.prototype.hasOwnProperty.call(record, 'product_lock_version')
		)
			throw new Error(`Quote line ${index + 1} custom items cannot use Product identity`);
		if (record.source_type === 'custom' && dimensions && dimensions.length > 0)
			throw new Error(`Quote line ${index + 1} custom items cannot have dimensions`);
		return parsedItem;
	});
}

export function quoteFormFailureValues(form: FormData): Record<string, string> {
	const names = [
		'lead_id',
		'client_id',
		'subject',
		'introduction',
		'terms',
		'tax_label',
		'tax_rate',
		'valid_until',
		'currency',
		'lock_version',
		'items',
		'quote_failure_rehydration_catalogue_display'
	];
	return Object.fromEntries(
		names.filter((name) => form.has(name)).map((name) => [name, String(form.get(name) ?? '')])
	);
}

export function quoteFormValues(form: FormData, leadId: string, quoteId: string | null = null) {
	const subject = textValue(form, 'subject');
	if (!subject) throw new Error('Quote subject is required');
	const currency = (textValue(form, 'currency') || 'ZAR').toUpperCase();
	if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code');
	const taxRate = decimalValue(form, 'tax_rate', taxPattern);
	return {
		p_quote_id: quoteId,
		p_lock_version: nullableLockVersion(form, quoteId),
		p_lead_id: leadId,
		p_client_id: textValue(form, 'client_id') || null,
		p_subject: subject,
		p_introduction: textValue(form, 'introduction') || null,
		p_terms: textValue(form, 'terms') || null,
		p_tax_label: textValue(form, 'tax_label') || null,
		p_tax_rate: taxRate,
		p_valid_until: nullableDate(form, 'valid_until'),
		p_currency: currency,
		p_items: parseQuoteItems(form)
	};
}
