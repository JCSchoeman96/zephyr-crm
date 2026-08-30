import { describe, expect, it } from 'vitest';
import { defaultQuoteDefaults, normalizeQuoteDefaults, parseQuoteDefaultsForm } from './defaults';

function validForm(): FormData {
	const form = new FormData();
	form.set('prefix', 'Q-');
	form.set('tax_label', 'VAT');
	form.set('tax_rate', '15');
	form.set('validity_days', '30');
	form.set('terms', 'Payment terms');
	form.set('bank_details', '');
	return form;
}

describe('quote defaults contract', () => {
	it('parses the exact quote-default form shape', () => {
		const form = new FormData();
		form.set('prefix', ' oa- ');
		form.set('tax_label', ' VAT ');
		form.set('tax_rate', '15.000000');
		form.set('validity_days', '45');
		form.set('terms', 'Payment terms');
		form.set('bank_details', 'Disposable Test Bank · Account TEST-001');

		expect(parseQuoteDefaultsForm(form)).toEqual({
			prefix: 'OA-',
			tax_label: 'VAT',
			tax_rate: 15,
			validity_days: 45,
			terms: 'Payment terms',
			bank_details: 'Disposable Test Bank · Account TEST-001'
		});
	});

	it.each([
		['prefix', 'bad prefix!', /prefix/i],
		['tax_rate', '100.0000001', /tax rate/i],
		['validity_days', '0', /validity/i],
		['validity_days', '366', /validity/i]
	] as const)('rejects invalid %s values', (field, value, message) => {
		const form = validForm();
		form.set(field, value);
		expect(() => parseQuoteDefaultsForm(form)).toThrow(message);
	});

	it('rejects missing fields and overlong text', () => {
		const missing = validForm();
		missing.delete('terms');
		expect(() => parseQuoteDefaultsForm(missing)).toThrow(/terms/i);

		const overlong = validForm();
		overlong.set('prefix', 'A'.repeat(13));
		expect(() => parseQuoteDefaultsForm(overlong)).toThrow(/prefix/i);

		overlong.set('prefix', 'Q-');
		overlong.set('tax_label', 'A'.repeat(41));
		expect(() => parseQuoteDefaultsForm(overlong)).toThrow(/tax label/i);

		overlong.set('tax_label', 'VAT');
		overlong.set('terms', 'A'.repeat(10001));
		expect(() => parseQuoteDefaultsForm(overlong)).toThrow(/terms/i);

		overlong.set('terms', 'Terms');
		overlong.set('bank_details', 'A'.repeat(5001));
		expect(() => parseQuoteDefaultsForm(overlong)).toThrow(/bank/i);
	});

	it('normalizes valid stored values and numeric strings', () => {
		expect(
			normalizeQuoteDefaults({
				prefix: ' oa- ',
				tax_label: ' VAT ',
				tax_rate: '15.5',
				validity_days: '45',
				terms: 'Payment terms',
				bank_details: ''
			})
		).toEqual({
			prefix: 'OA-',
			tax_label: 'VAT',
			tax_rate: 15.5,
			validity_days: 45,
			terms: 'Payment terms',
			bank_details: ''
		});
	});

	it('normalizes malformed stored settings without inventing bank details', () => {
		expect(normalizeQuoteDefaults({ prefix: 'bad!', bank_details: 42 })).toEqual({
			...defaultQuoteDefaults,
			bank_details: ''
		});
	});
});
