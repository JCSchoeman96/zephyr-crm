export type QuoteEmailInput = {
	companyName: string;
	recipientName?: string | null;
	recipientEmail: string;
	quoteNumber: string;
	revision?: number | null;
	subject: string;
	currency: string;
	total: string | number;
	validUntil: string;
	hasFrozenPdf: boolean;
	brand?: {
		primary?: string | null;
		primaryStrong?: string | null;
		accent?: string | null;
	};
};

export type QuoteEmail = {
	subject: string;
	html: string;
	text: string;
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

function color(input: unknown, fallback: string): string {
	const candidate = value(input);
	const match = candidate.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
	if (!match) return fallback;
	const hex = match[1];
	const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
	return `#${expanded.slice(0, 6)}`;
}

function revisionValue(input: number | null | undefined): string | null {
	return Number.isInteger(input) && Number(input) > 0 ? String(input) : null;
}

export function validateQuoteEmailInput(
	input: QuoteEmailInput,
	options: { requireFrozenPdf?: boolean } = {}
): void {
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
	if (options.requireFrozenPdf !== false && !input.hasFrozenPdf) {
		throw new Error('A frozen PDF quote is required before sending email.');
	}
}

export function buildQuoteEmail(input: QuoteEmailInput): QuoteEmail {
	validateQuoteEmailInput(input);
	const companyName = value(input.companyName);
	const recipientEmail = value(input.recipientEmail);
	const quoteNumber = value(input.quoteNumber);
	const quoteSubject = value(input.subject);
	const validUntil = value(input.validUntil);

	const recipientName = value(input.recipientName) || recipientEmail;
	const total = `${value(input.currency)} ${value(input.total)}`.trim();
	const revision = revisionValue(input.revision);
	const revisionLabel = revision ? `Revision ${revision}` : null;
	const primary = color(input.brand?.primary, '#315cce');
	const primaryStrong = color(input.brand?.primaryStrong, '#2649a8');
	const accent = color(input.brand?.accent, '#d9773b');
	const subject = `Quote ${quoteNumber}: ${quoteSubject}`.replace(/[\r\n]+/g, ' ');
	const quoteIdentity = `Quote ${quoteNumber}${revisionLabel ? ` · ${revisionLabel}` : ''}`;
	const text = [
		`Hello ${recipientName},`,
		'',
		`Please find your frozen ${quoteIdentity} attached.`,
		'',
		`Subject: ${quoteSubject}`,
		`Total: ${total}`,
		`Valid until: ${validUntil}`,
		...(revisionLabel ? [revisionLabel] : []),
		'',
		'The attached frozen PDF is the immutable commercial snapshot used for this Quote.',
		'',
		'Regards,',
		companyName
	].join('\n');
	const html = [
		'<!doctype html>',
		'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
		'<style type="text/css">body{margin:0;padding:0;background:#f3f5f9;}table{border-collapse:collapse;}@media only screen and (max-width:600px){.quote-card{width:100% !important;border-radius:0 !important;}.quote-padding{padding:24px 18px !important;}.quote-meta td{display:block !important;width:100% !important;padding-right:0 !important;}}</style>',
		'</head><body style="margin:0;padding:0;background:#f3f5f9;">',
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f5f9;">',
		'<tr><td align="center" style="padding:32px 12px;">',
		`<table role="presentation" class="quote-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e8f0;border-radius:12px;overflow:hidden;">`,
		`<tr><td class="quote-padding" style="padding:28px 32px;background:${primaryStrong};color:#ffffff;">`,
		`<div style="display:inline-block;padding:8px 10px;border-radius:8px;background:${accent};font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.08em;">${escapeHtml(
			companyName.slice(0, 2).toUpperCase()
		)}</div>`,
		`<div style="margin-top:14px;font-family:Arial,sans-serif;font-size:22px;line-height:1.25;font-weight:700;">${escapeHtml(companyName)}</div>`,
		`<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#dfe7ff;">${escapeHtml(quoteIdentity)}</div>`,
		'</td></tr>',
		`<tr><td class="quote-padding" style="padding:32px;font-family:Arial,sans-serif;color:#1f2937;">`,
		`<p style="margin:0 0 18px;font-size:17px;line-height:1.5;">Hello ${escapeHtml(recipientName)},</p>`,
		`<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Please find your frozen <strong>${escapeHtml(quoteIdentity)}</strong> attached.</p>`,
		`<table role="presentation" class="quote-meta" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e3e8f0;border-left:4px solid ${primary};">`,
		`<tr><td style="width:34%;padding:12px 14px;font-size:12px;line-height:1.4;color:#64748b;font-weight:700;text-transform:uppercase;">Subject</td><td style="padding:12px 14px;font-size:14px;line-height:1.5;color:#1f2937;">${escapeHtml(quoteSubject)}</td></tr>`,
		`<tr><td style="width:34%;padding:12px 14px;font-size:12px;line-height:1.4;color:#64748b;font-weight:700;text-transform:uppercase;">Total</td><td style="padding:12px 14px;font-size:14px;line-height:1.5;color:#1f2937;font-weight:700;">${escapeHtml(total)}</td></tr>`,
		`<tr><td style="width:34%;padding:12px 14px;font-size:12px;line-height:1.4;color:#64748b;font-weight:700;text-transform:uppercase;">Valid until</td><td style="padding:12px 14px;font-size:14px;line-height:1.5;color:#1f2937;">${escapeHtml(validUntil)}</td></tr>`,
		...(revisionLabel
			? [
					`<tr><td style="width:34%;padding:12px 14px;font-size:12px;line-height:1.4;color:#64748b;font-weight:700;text-transform:uppercase;">Revision</td><td style="padding:12px 14px;font-size:14px;line-height:1.5;color:#1f2937;">${escapeHtml(revision ?? '')}</td></tr>`
				]
			: []),
		'</table>',
		`<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#475569;">The attached frozen PDF is the immutable commercial snapshot used for this Quote.</p>`,
		`<p style="margin:24px 0 0;font-size:14px;line-height:1.6;">Regards,<br><strong>${escapeHtml(companyName)}</strong></p>`,
		'</td></tr>',
		`<tr><td class="quote-padding" style="padding:18px 32px;background:#f8fafc;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">This message contains the current frozen Quote revision. The attached PDF is the commercial authority.</td></tr>`,
		'</table></td></tr></table></body></html>'
	].join('');
	return { subject, html, text };
}
