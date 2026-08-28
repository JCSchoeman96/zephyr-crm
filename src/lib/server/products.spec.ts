import { describe, expect, it } from 'vitest';
import { canManageProducts, normalizeProductInput, normalizeProductPrice } from './products';

describe('Product server action boundary', () => {
	it('permits catalogue mutations only to Owner and Admin roles', () => {
		expect(canManageProducts('owner')).toBe(true);
		expect(canManageProducts('admin')).toBe(true);
		expect(canManageProducts('sales')).toBe(false);
		expect(canManageProducts('viewer')).toBe(false);
	});

	it('trims customer-facing values and canonicalizes currency at the boundary', () => {
		expect(
			normalizeProductInput({
				productCode: '  SCR-001  ',
				name: '  Standard screen  ',
				customerDescription: '  Customer copy  ',
				internalNotes: '  Staff only  ',
				kind: 'product',
				categoryId: 'category-1',
				unitLabel: ' each ',
				currency: ' zar ',
				unitPrice: '125.5000',
				taxable: true
			})
		).toEqual({
			productCode: 'SCR-001',
			name: 'Standard screen',
			customerDescription: 'Customer copy',
			internalNotes: 'Staff only',
			kind: 'product',
			categoryId: 'category-1',
			unitLabel: 'each',
			currency: 'ZAR',
			unitPrice: '125.5000',
			taxable: true
		});
	});

	it('rejects blank or malformed commercial input before calling the database', () => {
		expect(() =>
			normalizeProductInput({
				productCode: ' ',
				name: 'Name',
				customerDescription: '',
				internalNotes: '',
				kind: 'product',
				categoryId: null,
				unitLabel: 'each',
				currency: 'ZAR',
				unitPrice: '10.0000',
				taxable: true
			})
		).toThrow(/product code/i);
		expect(() =>
			normalizeProductInput({
				productCode: 'SCR-002',
				name: 'Name',
				customerDescription: '',
				internalNotes: '',
				kind: 'product',
				categoryId: null,
				unitLabel: 'each',
				currency: 'EURO',
				unitPrice: '10.0000',
				taxable: true
			})
		).toThrow(/currency/i);
		expect(normalizeProductPrice('125.5000')).toBe('125.5000');
		expect(() => normalizeProductPrice('125.12345')).toThrow(/price/i);
		expect(() => normalizeProductPrice('-1')).toThrow(/price/i);
	});
});
