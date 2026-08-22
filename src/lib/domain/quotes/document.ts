export type QuoteDocumentSnapshot = Record<string, unknown>;

export type QuoteDocumentQuote = {
	quote_number: string;
	subject: string;
	introduction: string | null;
	terms: string | null;
	tax_label: string | null;
	tax_rate: string | number;
	document_template_version?: string | null;
	document_generator_version?: string | null;
	currency: string;
	valid_until: string | null;
	subtotal: string | number;
	tax_amount: string | number;
	total: string | number;
	quote_snapshot: QuoteDocumentSnapshot;
};

export type QuoteDocumentItem = {
	position: number;
	name: string;
	description: string | null;
	quantity: string | number;
	unit_price: string | number;
	taxable: boolean;
	line_subtotal: string | number;
};

export type QuoteDocumentInput = {
	quote: QuoteDocumentQuote;
	items: QuoteDocumentItem[];
};

export type GeneratedQuoteDocument = {
	bytes: Uint8Array;
	hash: string;
	content: string;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function decimal(value: string | number, scale: number): string {
	const raw = text(value);
	const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
	if (!match) return '0.' + '0'.repeat(scale);
	const fraction = (match[3] ?? '').slice(0, scale).padEnd(scale, '0');
	return `${match[1]}${match[2]}.${fraction}`;
}

function ascii(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\x20-\x7e]/g, '?');
}

function escapePdfLiteral(value: string): string {
	return ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function wrap(value: string, width = 92): string[] {
	const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines: string[] = [];
	for (const paragraph of normalized.split('\n')) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push('');
			continue;
		}
		let line = '';
		for (const word of words) {
			if (line && line.length + word.length + 1 > width) {
				lines.push(line);
				line = word;
			} else {
				line = line ? `${line} ${word}` : word;
			}
		}
		if (line) lines.push(line);
	}
	return lines;
}

function identityLines(label: string, value: unknown): string[] {
	const identity = record(value);
	const fields = [
		['Name', identity.name ?? identity.company_name ?? identity.display_name],
		['Email', identity.email],
		['Phone', identity.phone],
		['Address', identity.address ?? identity.billing_address]
	] as const;
	return [
		label,
		...fields.filter(([, field]) => text(field)).map(([key, field]) => `${key}: ${text(field)}`)
	];
}

function money(currency: string, value: string | number): string {
	return `${currency} ${decimal(value, 2)}`;
}

function renderContent(input: QuoteDocumentInput): string {
	const { quote } = input;
	const snapshot = record(quote.quote_snapshot);
	const seller = snapshot.seller ?? snapshot.company_identity;
	const recipient = snapshot.recipient;
	const lines: string[] = [
		'ZEPHYR CRM',
		`QUOTE ${text(quote.quote_number)}`,
		`Subject: ${text(quote.subject)}`,
		''
	];
	lines.push(...identityLines('SELLER', seller), '');
	lines.push(...identityLines('RECIPIENT', recipient), '');
	lines.push(`Valid until: ${text(quote.valid_until) || 'Not specified'}`);
	lines.push(`Currency: ${text(quote.currency)}`, '');
	if (text(quote.document_template_version) || text(quote.document_generator_version)) {
		lines.push(
			`Document template: ${text(quote.document_template_version) || 'unspecified'}`,
			`Document generator: ${text(quote.document_generator_version) || 'unspecified'}`,
			''
		);
	}
	if (text(quote.introduction)) lines.push('INTRODUCTION', ...wrap(text(quote.introduction)), '');
	lines.push('ITEMS');
	for (const item of [...input.items].sort((a, b) => a.position - b.position)) {
		lines.push(
			`${item.position}. ${text(item.name)} | Qty ${decimal(item.quantity, 4)} | Unit ${money(text(quote.currency), item.unit_price)} | Line ${money(text(quote.currency), item.line_subtotal)}`
		);
		if (text(item.description)) lines.push(...wrap(`   ${text(item.description)}`));
	}
	lines.push(
		'',
		`Subtotal: ${money(text(quote.currency), quote.subtotal)}`,
		`${text(quote.tax_label) || 'Tax'} (${decimal(quote.tax_rate, 6)}%): ${money(text(quote.currency), quote.tax_amount)}`,
		`TOTAL: ${money(text(quote.currency), quote.total)}`,
		''
	);
	if (text(quote.terms)) lines.push('TERMS', ...wrap(text(quote.terms)));
	return lines.join('\n');
}

function buildPdf(content: string): Uint8Array {
	const lines = wrap(content, 96);
	const drawing = [
		'BT',
		'/F1 10 Tf',
		'50 760 Td',
		...lines.map(
			(line, index) => `${index === 0 ? '' : '0 -14 Td\n'}(${escapePdfLiteral(line)}) Tj`
		),
		'ET'
	].join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
		`<< /Length ${new TextEncoder().encode(drawing).byteLength} >>\nstream\n${drawing}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let pdf = '%PDF-1.4\n';
	const offsets = [0];
	for (let index = 0; index < objects.length; index += 1) {
		offsets.push(new TextEncoder().encode(pdf).byteLength);
		pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xrefOffset = new TextEncoder().encode(pdf).byteLength;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	return new TextEncoder().encode(pdf);
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const safeBytes = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest('SHA-256', safeBytes.buffer as ArrayBuffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateQuoteDocument(
	input: QuoteDocumentInput
): Promise<GeneratedQuoteDocument> {
	const content = renderContent(input);
	const bytes = buildPdf(content);
	return { bytes, hash: await sha256(bytes), content };
}
