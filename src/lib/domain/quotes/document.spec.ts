import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateQuoteDocument, type QuoteDocumentInput } from './document';

const fixture: QuoteDocumentInput = {
	quote: {
		quote_number: 'Q-2099-000001',
		subject: 'Website maintenance — édition €',
		introduction: 'A fixed commercial snapshot for Zoë Müller.',
		terms: 'Payment due within 30 days. Café services are billed monthly.',
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
			company_identity: {
				name: 'Example Client',
				brand_tokens: { primary: '#315cce', primary_strong: '#2649a8', accent: '#d9773b' }
			},
			seller: { name: 'Example Client', email: 'sales@example.test' },
			recipient: { name: 'Ada Lovelace', email: 'ada@example.test' }
		}
	},
	items: [
		{
			position: 1,
			name: 'Maintenance',
			description: 'Monthly service for the client team',
			quantity: '1.0000',
			unit_price: '100.00',
			taxable: true,
			line_subtotal: '100.00'
		}
	]
};

const longFixture: QuoteDocumentInput = {
	...fixture,
	quote: {
		...fixture.quote,
		subject: 'Long deterministic quote — édition €',
		introduction: Array.from(
			{ length: 8 },
			() => 'Introduction paragraph with customer context and clear delivery expectations.'
		).join('\n\n'),
		terms: Array.from(
			{ length: 18 },
			() =>
				'Terms paragraph: payment, delivery, confidentiality, and support responsibilities are retained in the frozen snapshot.'
		).join('\n\n')
	},
	items: Array.from({ length: 100 }, (_, index) => ({
		position: index + 1,
		name:
			index === 0
				? 'First item — Café'
				: index === 99
					? 'Last item — Zoë'
					: `Service item ${index + 1}`,
		description:
			'A deliberately long description that must wrap safely across pages without losing the commercial line item or its customer-facing punctuation.',
		quantity: '1.0000',
		unit_price: '10.00',
		taxable: true,
		line_subtotal: '10.00'
	}))
};

describe('quote document generator', () => {
	it('renders the same immutable commercial snapshot deterministically', async () => {
		const first = await generateQuoteDocument(fixture);
		const second = await generateQuoteDocument(structuredClone(fixture));

		expect(first.hash).toBe(second.hash);
		expect([...first.bytes]).toEqual([...second.bytes]);
		expect(first.bytes.slice(0, 8)).toEqual(new TextEncoder().encode('%PDF-1.7'));
		expect(first.content).toContain('TOTAL: ZAR 115.00');
		expect(first.content).toContain('VAT (15.123456%): ZAR 15.00');
		expect(first.content).toContain('Document template: quote-document-v1.3.1');
	});

	it('renders long branded quotes across deterministic pages without silent character loss', async () => {
		const first = await generateQuoteDocument(longFixture);
		const second = await generateQuoteDocument(structuredClone(longFixture));
		const parsed = await PDFDocument.load(first.bytes);

		expect(parsed.getPageCount()).toBeGreaterThan(1);
		expect(first.hash).toBe(second.hash);
		expect([...first.bytes]).toEqual([...second.bytes]);
		expect(first.content).toContain('Example Client');
		expect(first.content).toContain('First item — Café');
		expect(first.content).toContain('Last item — Zoë');
		expect(first.content).not.toContain('ZEPHYR CRM');
		expect(first.content.match(/TOTAL:/g)?.length).toBe(1);
		expect(first.content).not.toContain('?');
	});

	it('fails clearly instead of corrupting unsupported customer identity characters', async () => {
		await expect(
			generateQuoteDocument({
				...fixture,
				quote: { ...fixture.quote, subject: 'Unsupported identity 💼' }
			})
		).rejects.toThrow(/cannot be represented/i);
	});
});
