import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { QuotePresentationModel } from './presentation-model';
import { generateProfessionalQuoteDocument } from './pdf-v2';

const onePixelPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function fixture(itemCount = 1): QuotePresentationModel {
	return {
		quoteIdentity: {
			number: 'Q-2099-000001',
			revision: 2,
			status: 'ready',
			issueDate: '2099-01-02T08:30:00.000Z',
			validUntil: '2099-01-31',
			currency: 'ZAR'
		},
		seller: {
			name: 'Zephyr South Africa',
			companyName: 'Zephyr South Africa',
			company: 'Zephyr South Africa',
			addressLines: ['12 Long Street', 'Cape Town', '8001'],
			email: 'sales@example.test',
			phone: '+27 21 555 0100',
			registrationDetails: 'Reg 2099/123456/07'
		},
		recipient: {
			name: 'José Müller',
			company: 'Café & Co',
			addressLines: ['1 Customer Avenue', 'Johannesburg', '2000'],
			email: 'jose@example.test',
			phone: '+27 11 555 0100'
		},
		subject: 'Professional website maintenance — édition €',
		introduction: 'A fixed customer-facing introduction for José and Chloë.',
		items: Array.from({ length: itemCount }, (_, index) => ({
			code: index === 0 ? 'WEB-MAINT-2026-VERY-LONG-CODE' : `SERVICE-${index + 1}`,
			name: index === 0 ? 'Monthly maintenance — Café' : `Service item ${index + 1}`,
			description:
				'Customer-facing description that wraps across the item table without exposing staff-only notes.',
			quantity: '1.0000',
			unit: 'month',
			unitPrice: '100.00',
			amount: '100.00',
			taxable: true
		})),
		subtotal: String(itemCount * 100) + '.00',
		tax: { label: 'VAT', rate: '15.000000', amount: String(itemCount * 15) + '.00' },
		total: String(itemCount * 115) + '.00',
		terms:
			'Payment is due within 30 days. These terms remain part of the frozen customer snapshot.',
		bankDetails: 'Example Bank · Account 123456789 · Branch 0001',
		brand: {
			companyName: 'Zephyr South Africa',
			logoAsset: '/brand/logo.svg',
			primary: '#315cce',
			primaryStrong: '#2649a8',
			accent: '#d9773b'
		},
		documentMetadata: {
			templateVersion: 'professional-v2',
			generatorVersion: 'quote-pdf-v2.1.0',
			quoteRevision: 2
		}
	};
}

describe('professional Quote PDF Template v2', () => {
	it('renders the canonical model as deterministic branded A4 PDF bytes', async () => {
		const first = await generateProfessionalQuoteDocument(fixture());
		const second = await generateProfessionalQuoteDocument(structuredClone(fixture()));
		const pdf = await PDFDocument.load(first.bytes);
		const page = pdf.getPages()[0];

		expect(first.templateVersion).toBe('professional-v2');
		expect(first.generatorVersion).toBe('quote-pdf-v2.1.0');
		expect(first.pageCount).toBe(1);
		expect(first.pageCount).toBe(pdf.getPageCount());
		expect(page.getWidth()).toBeCloseTo(595.28, 2);
		expect(page.getHeight()).toBeCloseTo(841.89, 2);
		expect(first.bytes.slice(0, 8)).toEqual(new TextEncoder().encode('%PDF-1.7'));
		expect(first.hash).toBe(second.hash);
		expect([...first.bytes]).toEqual([...second.bytes]);
		expect(first.content).toContain('Zephyr South Africa');
		expect(first.content).toContain('José Müller');
		expect(first.content).toContain('Café & Co');
		expect(first.content).toContain('Bank details');
		expect(first.content).toContain('Page 1 of 1');
		expect(first.content).not.toContain('internal_notes');
		expect(first.content).not.toContain('private/');
		expect(first.fitness.overflowCount).toBe(0);
		expect(first.fitness.repeatedTableHeaders).toBe(0);
	});

	it('wraps and paginates a 100-item customer document without clipping', async () => {
		const first = await generateProfessionalQuoteDocument(fixture(100));
		const second = await generateProfessionalQuoteDocument(structuredClone(fixture(100)));
		const pdf = await PDFDocument.load(first.bytes);

		expect(pdf.getPageCount()).toBeGreaterThan(1);
		expect(first.pageCount).toBe(pdf.getPageCount());
		expect(first.pageCount).toBe(second.pageCount);
		expect(first.hash).toBe(second.hash);
		expect(first.fitness.overflowCount).toBe(0);
		expect(first.fitness.pagesWithRepeatedTableHeaders).toBeGreaterThan(0);
		expect(first.fitness.totalsPage).toBeGreaterThanOrEqual(1);
		expect(first.content).toContain(`Page ${first.pageCount} of ${first.pageCount}`);
		expect(first.content.match(/TABLE HEADER/g)?.length).toBe(
			first.fitness.pagesWithRepeatedTableHeaders + 1
		);
	});

	it('fits long addresses and terms while preserving a no-tax model', async () => {
		const longText = Array.from(
			{ length: 24 },
			(_, index) =>
				`Long customer-facing term ${index + 1}: delivery, support, confidentiality, and payment responsibilities remain readable.`
		).join('\n');
		const model = structuredClone(fixture(10));
		model.recipient.addressLines = Array.from(
			{ length: 10 },
			(_, index) => `Address line ${index + 1} for the Johannesburg customer office`
		);
		model.terms = longText;
		model.tax = { label: 'VAT', rate: '0.000000', amount: '0.00' };
		model.items = model.items.map((item) => ({ ...item, taxable: false }));

		const generated = await generateProfessionalQuoteDocument(model);
		const pdf = await PDFDocument.load(generated.bytes);

		expect(pdf.getPageCount()).toBeGreaterThan(1);
		expect(generated.fitness.overflowCount).toBe(0);
		expect(generated.content).toContain('0.000000');
		expect(generated.content).toContain('Long customer-facing term 24');
		expect(generated.content).toContain('Address line 10');
	});

	it('fails closed when the approved standard font cannot encode customer text', async () => {
		await expect(
			generateProfessionalQuoteDocument({
				...fixture(),
				subject: 'Unsupported customer identity 💼'
			})
		).rejects.toThrow(/cannot be represented/i);
	});

	it('embeds a trusted PNG logo and falls back for unsupported logo assets', async () => {
		const withLogo = structuredClone(fixture());
		withLogo.brand.logoAsset = onePixelPng;
		const embedded = await generateProfessionalQuoteDocument(withLogo);
		const embeddedPdf = Buffer.from(embedded.bytes).toString('latin1');

		expect(embeddedPdf).toContain('/Subtype /Image');

		const fallback = await generateProfessionalQuoteDocument(fixture());
		const fallbackPdf = Buffer.from(fallback.bytes).toString('latin1');
		expect(fallbackPdf).not.toContain('/Subtype /Image');
	});
});
