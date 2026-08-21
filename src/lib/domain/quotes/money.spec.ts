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
});
