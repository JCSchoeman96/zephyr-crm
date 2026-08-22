import { describe, expect, it } from 'vitest';
import { calculateQuoteTotals } from './money';

describe('quote money contract', () => {
	it('calculates decimal line, tax, and total values without binary floating drift', () => {
		expect(
			calculateQuoteTotals(
				[
					{ quantity: '2', unitPrice: '100.10', taxable: true },
					{ quantity: '1.5', unitPrice: '10.00', taxable: true }
				],
				'15'
			)
		).toEqual({
			lineSubtotals: ['200.20', '15.00'],
			subtotal: '215.20',
			taxAmount: '32.28',
			total: '247.48'
		});
	});

	it('rounds each line at cents and taxes only taxable lines', () => {
		expect(
			calculateQuoteTotals(
				[
					{ quantity: '0.3333', unitPrice: '10.01', taxable: true },
					{ quantity: '2', unitPrice: '100.10', taxable: false }
				],
				'15.125'
			)
		).toEqual({
			lineSubtotals: ['3.34', '200.20'],
			subtotal: '203.54',
			taxAmount: '0.51',
			total: '204.05'
		});
	});

	it('accepts the frozen four-decimal price and six-decimal tax scales', () => {
		expect(
			calculateQuoteTotals(
				[{ quantity: '1.2345', unitPrice: '2.3456', taxable: true }],
				'15.125001'
			)
		).toEqual({
			lineSubtotals: ['2.90'],
			subtotal: '2.90',
			taxAmount: '0.44',
			total: '3.34'
		});
	});

	it('rejects empty, negative, zero, and over-precision values', () => {
		expect(() => calculateQuoteTotals([], '15')).toThrow('At least one quote line');
		expect(() =>
			calculateQuoteTotals([{ quantity: '0', unitPrice: '1', taxable: true }], '15')
		).toThrow('greater than zero');
		expect(() =>
			calculateQuoteTotals([{ quantity: '-1', unitPrice: '1', taxable: true }], '15')
		).toThrow('Invalid non-negative decimal');
		expect(() =>
			calculateQuoteTotals([{ quantity: '1.00001', unitPrice: '1', taxable: true }], '15')
		).toThrow('too many fractional places');
		expect(() =>
			calculateQuoteTotals([{ quantity: '1', unitPrice: '1.00001', taxable: true }], '15')
		).toThrow('too many fractional places');
		expect(() =>
			calculateQuoteTotals([{ quantity: '1', unitPrice: '1', taxable: true }], '15.1234567')
		).toThrow('too many fractional places');
	});
});
