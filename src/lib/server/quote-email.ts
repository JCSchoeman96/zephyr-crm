type QuoteEmailInput = {
	companyName: string;
	recipientName?: string | null;
	recipientEmail: string;
	quoteNumber: string;
	subject: string;
	currency: string;
	total: string | number;
	validUntil: string;
	hasFrozenPdf: boolean;
};

export type QuoteEmail = {
	subject: string;
	html: string;
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function value(input: unknown): string {
	return typeof input === 'string' ? input.trim() : String(input ?? '').trim();
}

export function buildQuoteEmail(input: QuoteEmailInput): QuoteEmail {
	const companyName = value(input.companyName);
	const recipientEmail = value(input.recipientEmail);
	const quoteNumber = value(input.quoteNumber);
	const quoteSubject = value(input.subject);
	const validUntil = value(input.validUntil);
	if (!companyName || !recipientEmail || !quoteNumber || !quoteSubject || !validUntil) {
		throw new Error(
			'A configured company identity and complete Quote snapshot are required for email.'
		);
	}
	if (!input.hasFrozenPdf) throw new Error('A frozen PDF quote is required before sending email.');

	const recipientName = value(input.recipientName) || recipientEmail;
	const total = `${value(input.currency)} ${value(input.total)}`.trim();
	const subject = `Quote ${quoteNumber}: ${quoteSubject}`;
	const html = [
		`<div><p>${escapeHtml(companyName)}</p>`,
		`<p>Hello ${escapeHtml(recipientName)},</p>`,
		`<p>Please find your frozen Quote <strong>${escapeHtml(quoteNumber)}</strong> attached.</p>`,
		'<table role="presentation">',
		`<tr><td>Subject</td><td>${escapeHtml(quoteSubject)}</td></tr>`,
		`<tr><td>Total</td><td>${escapeHtml(total)}</td></tr>`,
		`<tr><td>Valid until</td><td>${escapeHtml(validUntil)}</td></tr>`,
		'</table>',
		'<p>The attached frozen PDF is the immutable commercial snapshot used for this Quote.</p>',
		`<p>Regards,<br>${escapeHtml(companyName)}</p></div>`
	].join('');
	return { subject, html };
}
