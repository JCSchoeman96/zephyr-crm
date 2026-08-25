import { describe, expect, it } from 'vitest';
import { buildQuoteEmail } from './quote-email';

describe('quote email contract', () => {
	it('renders the configured customer identity and frozen commercial context', () => {
		const email = buildQuoteEmail({
			companyName: 'Example <Client>',
			recipientName: 'Ada Lovelace',
			recipientEmail: 'ada@example.test',
			quoteNumber: 'Q-2099-000001',
			subject: 'Website maintenance',
			currency: 'ZAR',
			total: '115.00',
			validUntil: '2099-12-31',
			hasFrozenPdf: true
		});

		expect(email.subject).toBe('Quote Q-2099-000001: Website maintenance');
		expect(email.html).toContain('Ada Lovelace');
		expect(email.html).toContain('Q-2099-000001');
		expect(email.html).toContain('Website maintenance');
		expect(email.html).toContain('ZAR 115.00');
		expect(email.html).toContain('2099-12-31');
		expect(email.html).toContain('frozen PDF');
		expect(email.html).toContain('Example &lt;Client&gt;');
		expect(email.html).not.toContain('Example <Client>');
	});

	it('requires a frozen PDF and complete identity before creating a message', () => {
		expect(() =>
			buildQuoteEmail({
				companyName: '',
				recipientEmail: 'ada@example.test',
				quoteNumber: 'Q-1',
				subject: 'Subject',
				currency: 'ZAR',
				total: '1.00',
				validUntil: '2099-12-31',
				hasFrozenPdf: true
			})
		).toThrow(/company identity/i);

		expect(() =>
			buildQuoteEmail({
				companyName: 'Example Client',
				recipientEmail: 'ada@example.test',
				quoteNumber: 'Q-1',
				subject: 'Subject',
				currency: 'ZAR',
				total: '1.00',
				validUntil: '2099-12-31',
				hasFrozenPdf: false
			})
		).toThrow(/frozen PDF/i);
	});
});
