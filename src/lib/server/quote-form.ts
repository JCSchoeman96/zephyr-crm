export type QuoteFormItem = {
	id?: string;
	name: string;
	description?: string;
	quantity: string;
	unit_price: string;
	taxable: boolean;
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
		return {
			...(id ? { id } : {}),
			name,
			description: String(record.description ?? '').trim(),
			quantity,
			unit_price: unitPrice,
			taxable: record.taxable
		};
	});
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
