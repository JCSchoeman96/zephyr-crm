export type QuoteDefaults = {
	prefix: string;
	tax_label: string;
	tax_rate: number;
	validity_days: number;
	terms: string;
	bank_details: string;
};

export const defaultQuoteDefaults: QuoteDefaults = {
	prefix: 'Q-',
	tax_label: 'VAT',
	tax_rate: 0,
	validity_days: 30,
	terms: '',
	bank_details: ''
};

const PREFIX_PATTERN = /^[A-Z0-9-]{1,12}$/;
const MAX_TAX_RATE = 100;
const MAX_VALIDITY_DAYS = 365;
const MAX_TAX_DECIMAL_PLACES = 6;
const MAX_TAX_LABEL_LENGTH = 40;
const MAX_TERMS_LENGTH = 10_000;
const MAX_BANK_DETAILS_LENGTH = 5_000;

function trimmedString(value: unknown): string | null {
	return typeof value === 'string' ? value.trim() : null;
}

function normalizePrefix(value: unknown): string | null {
	const prefix = trimmedString(value)?.toUpperCase();
	return prefix && PREFIX_PATTERN.test(prefix) ? prefix : null;
}

function normalizeText(value: unknown, maxLength: number): string | null {
	const text = trimmedString(value);
	return text !== null && text.length <= maxLength ? text : null;
}

function decimalPlaces(value: string): number {
	const decimal = value.indexOf('.');
	return decimal === -1 ? 0 : value.length - decimal - 1;
}

function numericText(value: unknown): string | null {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? String(value) : null;
	}
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized.length > 0 ? normalized : null;
	}
	return null;
}

function normalizeTaxRate(value: unknown): number | null {
	const text = numericText(value);
	if (!text || !/^\d+(?:\.\d+)?$/.test(text) || decimalPlaces(text) > MAX_TAX_DECIMAL_PLACES) {
		return null;
	}

	const rate = Number(text);
	return Number.isFinite(rate) && rate >= 0 && rate <= MAX_TAX_RATE ? rate : null;
}

function normalizeValidityDays(value: unknown): number | null {
	const text = numericText(value);
	if (!text || !/^\d+$/.test(text)) return null;

	const days = Number(text);
	return Number.isSafeInteger(days) && days >= 1 && days <= MAX_VALIDITY_DAYS ? days : null;
}

function formText(form: FormData, field: string, maxLength: number, issues: string[]): string {
	const value = form.get(field);
	const text = trimmedString(value);
	const label = field.replaceAll('_', ' ');
	if (text === null) {
		issues.push(`${label} must be a text value`);
		return '';
	}
	if (text.length > maxLength) issues.push(`${label} must be at most ${maxLength} characters`);
	return text;
}

function formPrefix(form: FormData, issues: string[]): string {
	const prefix = formText(form, 'prefix', 12, issues).toUpperCase();
	if (!PREFIX_PATTERN.test(prefix)) issues.push('prefix must be 1-12 letters, numbers, or hyphens');
	return prefix;
}

function formTaxRate(form: FormData, issues: string[]): number {
	const raw = form.get('tax_rate');
	const text = trimmedString(raw) ?? '';
	const rate = normalizeTaxRate(text);
	if (rate === null) {
		issues.push('tax rate must be a number from 0 to 100 with at most 6 decimal places');
		return defaultQuoteDefaults.tax_rate;
	}
	return rate;
}

function formValidityDays(form: FormData, issues: string[]): number {
	const raw = form.get('validity_days');
	const text = trimmedString(raw) ?? '';
	const days = normalizeValidityDays(text);
	if (days === null) {
		issues.push('validity days must be an integer from 1 to 365');
		return defaultQuoteDefaults.validity_days;
	}
	return days;
}

export function parseQuoteDefaultsForm(form: FormData): QuoteDefaults {
	const issues: string[] = [];
	const parsed: QuoteDefaults = {
		prefix: formPrefix(form, issues),
		tax_label: formText(form, 'tax_label', MAX_TAX_LABEL_LENGTH, issues),
		tax_rate: formTaxRate(form, issues),
		validity_days: formValidityDays(form, issues),
		terms: formText(form, 'terms', MAX_TERMS_LENGTH, issues),
		bank_details: formText(form, 'bank_details', MAX_BANK_DETAILS_LENGTH, issues)
	};

	if (issues.length > 0) throw new Error(issues.join('; '));
	return parsed;
}

export function normalizeQuoteDefaults(value: unknown): QuoteDefaults {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return { ...defaultQuoteDefaults };

	const stored = value as Record<string, unknown>;
	return {
		prefix: normalizePrefix(stored.prefix) ?? defaultQuoteDefaults.prefix,
		tax_label:
			normalizeText(stored.tax_label, MAX_TAX_LABEL_LENGTH) ?? defaultQuoteDefaults.tax_label,
		tax_rate: normalizeTaxRate(stored.tax_rate) ?? defaultQuoteDefaults.tax_rate,
		validity_days:
			normalizeValidityDays(stored.validity_days) ?? defaultQuoteDefaults.validity_days,
		terms: normalizeText(stored.terms, MAX_TERMS_LENGTH) ?? defaultQuoteDefaults.terms,
		bank_details:
			normalizeText(stored.bank_details, MAX_BANK_DETAILS_LENGTH) ??
			defaultQuoteDefaults.bank_details
	};
}
