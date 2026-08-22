import { describe, expect, it } from 'vitest';
import { generateQuoteDocument, type QuoteDocumentInput } from './document';

const fixture: QuoteDocumentInput = {
	quote: {
		quote_number: 'Q-2099-000001',
		subject: 'Website maintenance',
		introduction: 'A fixed commercial snapshot.',
		terms: 'Payment due within 30 days.',
		tax_label: 'VAT',
		tax_rate: '15.123456',
		document_template_version: 'quote-document-v1.3.1',
		document_generator_version: 'zephyr-crm-v1.3.1',
		currency: 'ZAR',
		valid_until: '2099-12-31',
		subtotal: '100.00',
		tax_amount: '15.00',
		total: '115.00',
		quote_snapshot: {
			seller: { name: 'Zephyr Services', email: 'sales@example.test' },
			recipient: { name: 'Ada Lovelace', email: 'ada@example.test' }
		}
	},
	items: [
		{
			position: 1,
			name: 'Maintenance',
			description: 'Monthly service',
			quantity: '1.0000',
			unit_price: '100.00',
			taxable: true,
			line_subtotal: '100.00'
		}
	]
};

describe('quote document generator', () => {
	it('renders the same immutable commercial snapshot deterministically', async () => {
		const first = await generateQuoteDocument(fixture);
		const second = await generateQuoteDocument(structuredClone(fixture));

		expect(first.hash).toBe(second.hash);
		expect([...first.bytes]).toEqual([...second.bytes]);
		expect(first.bytes.slice(0, 8)).toEqual(new TextEncoder().encode('%PDF-1.4'));
		expect(first.content).toContain('TOTAL: ZAR 115.00');
		expect(first.content).toContain('VAT (15.123456%): ZAR 15.00');
		expect(first.content).toContain('Document template: quote-document-v1.3.1');
	});
});
