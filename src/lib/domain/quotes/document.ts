import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

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

type JsonRecord = Record<string, unknown>;
type TextStyle = 'body' | 'small' | 'heading' | 'title' | 'total';
type FlowLine = { text: string; style: TextStyle; indent?: number };

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const FOOTER_HEIGHT = 28;
const HEADER_HEIGHT = 82;
const BODY_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BODY_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
const BODY_BOTTOM = PAGE_MARGIN + FOOTER_HEIGHT;

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
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

function wrapByCharacters(value: string, width: number, font: PDFFont, size: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const character of Array.from(value)) {
		const candidate = line + character;
		if (line && font.widthOfTextAtSize(candidate, size) > width) {
			lines.push(line);
			line = character;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function wrapByFont(value: string, width: number, font: PDFFont, size: number): string[] {
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
			if (font.widthOfTextAtSize(word, size) > width) {
				if (line) lines.push(line);
				const wordLines = wrapByCharacters(word, width, font, size);
				if (wordLines.length > 1) {
					lines.push(...wordLines.slice(0, -1));
					line = wordLines.at(-1) ?? '';
				} else {
					line = wordLines[0] ?? '';
				}
				continue;
			}
			const candidate = line ? `${line} ${word}` : word;
			if (line && font.widthOfTextAtSize(candidate, size) > width) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		}
		if (line) lines.push(line);
	}
	return lines;
}

function wrapByCharactersForContent(value: string, width = 96): string[] {
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
		['Company', identity.company],
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

function companyIdentity(snapshot: JsonRecord): JsonRecord {
	return record(snapshot.company_identity);
}

function companyName(snapshot: JsonRecord): string {
	const identity = companyIdentity(snapshot);
	const seller = record(snapshot.seller);
	const value = text(identity.name ?? identity.company_name ?? seller.name ?? seller.company_name);
	if (!value)
		throw new Error('Quote snapshot company identity is required for customer-facing documents.');
	return value;
}

function renderContent(input: QuoteDocumentInput): string {
	const { quote } = input;
	const snapshot = record(quote.quote_snapshot);
	const seller = snapshot.seller ?? snapshot.company_identity;
	const recipient = snapshot.recipient;
	const lines: string[] = [
		companyName(snapshot),
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
	if (text(quote.introduction))
		lines.push('INTRODUCTION', ...wrapByCharactersForContent(text(quote.introduction)), '');
	lines.push('ITEMS');
	for (const item of [...input.items].sort((a, b) => a.position - b.position)) {
		lines.push(
			`${item.position}. ${text(item.name)} | Qty ${decimal(item.quantity, 4)} | Unit ${money(text(quote.currency), item.unit_price)} | Line ${money(text(quote.currency), item.line_subtotal)}`
		);
		if (text(item.description))
			lines.push(...wrapByCharactersForContent(`   ${text(item.description)}`));
	}
	lines.push(
		'',
		`Subtotal: ${money(text(quote.currency), quote.subtotal)}`,
		`${text(quote.tax_label) || 'Tax'} (${decimal(quote.tax_rate, 6)}%): ${money(text(quote.currency), quote.tax_amount)}`,
		`TOTAL: ${money(text(quote.currency), quote.total)}`,
		''
	);
	if (text(quote.terms)) lines.push('TERMS', ...wrapByCharactersForContent(text(quote.terms)));
	return lines.join('\n');
}

function buildFlow(input: QuoteDocumentInput): FlowLine[] {
	const quote = input.quote;
	const snapshot = record(quote.quote_snapshot);
	const seller = snapshot.seller ?? snapshot.company_identity;
	const recipient = snapshot.recipient;
	const lines: FlowLine[] = [];
	const add = (value: string, style: TextStyle = 'body', indent = 0) =>
		lines.push({ text: value, style, ...(indent ? { indent } : {}) });
	const addIdentity = (label: string, value: unknown) => {
		add(label, 'heading');
		for (const line of identityLines('', value).slice(1)) add(line, 'body', 8);
		add('', 'small');
	};

	addIdentity('SELLER', seller);
	addIdentity('RECIPIENT', recipient);
	add(`Valid until: ${text(quote.valid_until) || 'Not specified'}`, 'body');
	add(`Currency: ${text(quote.currency)}`, 'body');
	add('', 'small');
	if (text(quote.document_template_version) || text(quote.document_generator_version)) {
		add(`Document template: ${text(quote.document_template_version) || 'unspecified'}`, 'small');
		add(`Document generator: ${text(quote.document_generator_version) || 'unspecified'}`, 'small');
		add('', 'small');
	}
	if (text(quote.introduction)) {
		add('INTRODUCTION', 'heading');
		for (const paragraph of text(quote.introduction).split(/\r?\n/)) add(paragraph, 'body');
		add('', 'small');
	}
	add('ITEMS', 'heading');
	for (const item of [...input.items].sort((a, b) => a.position - b.position)) {
		add(`${item.position}. ${text(item.name)}`, 'body');
		add(
			`Qty ${decimal(item.quantity, 4)}  ·  Unit ${money(text(quote.currency), item.unit_price)}  ·  Line ${money(text(quote.currency), item.line_subtotal)}`,
			'small',
			8
		);
		if (text(item.description)) add(text(item.description), 'small', 8);
	}
	add('', 'small');
	add('TOTALS', 'heading');
	add(`Subtotal: ${money(text(quote.currency), quote.subtotal)}`, 'body', 8);
	add(
		`${text(quote.tax_label) || 'Tax'} (${decimal(quote.tax_rate, 6)}%): ${money(text(quote.currency), quote.tax_amount)}`,
		'body',
		8
	);
	add(`TOTAL: ${money(text(quote.currency), quote.total)}`, 'total', 8);
	if (text(quote.terms)) {
		add('', 'small');
		add('TERMS', 'heading');
		for (const paragraph of text(quote.terms).split(/\r?\n/)) add(paragraph, 'body');
	}
	return lines;
}

function styleFor(style: TextStyle): { size: number; lineHeight: number; bold: boolean } {
	switch (style) {
		case 'title':
			return { size: 18, lineHeight: 22, bold: true };
		case 'heading':
			return { size: 9, lineHeight: 14, bold: true };
		case 'small':
			return { size: 8.5, lineHeight: 12, bold: false };
		case 'total':
			return { size: 10.5, lineHeight: 15, bold: true };
		default:
			return { size: 9.5, lineHeight: 14, bold: false };
	}
}

function parseColor(value: unknown) {
	const raw = text(value);
	const match = raw.match(/^#([0-9a-f]{6})$/i);
	if (!match) return rgb(0.192, 0.361, 0.808);
	const number = Number.parseInt(match[1], 16);
	return rgb(((number >> 16) & 0xff) / 255, ((number >> 8) & 0xff) / 255, (number & 0xff) / 255);
}

function firstUnsupportedCharacter(value: string, font: PDFFont): string | null {
	try {
		font.encodeText(value);
		return null;
	} catch {
		for (const character of Array.from(value)) {
			try {
				font.encodeText(character);
			} catch {
				return character;
			}
		}
		return value.slice(0, 1) || null;
	}
}

function validateRepresentable(content: string, font: PDFFont): void {
	for (const line of content.split('\n')) {
		const unsupported = firstUnsupportedCharacter(line, font);
		if (unsupported) {
			throw new Error(
				`Quote document text cannot be represented by the built-in PDF font: ${unsupported}`
			);
		}
	}
}

function paginate(flow: FlowLine[], regular: PDFFont, bold: PDFFont): FlowLine[][] {
	const pages: FlowLine[][] = [[]];
	let height = 0;
	for (const line of flow) {
		const style = styleFor(line.style);
		const font = style.bold ? bold : regular;
		const maxWidth = BODY_WIDTH - (line.indent ?? 0);
		const wrapped = wrapByFont(line.text, maxWidth, font, style.size);
		for (const textLine of wrapped) {
			if (height + style.lineHeight > BODY_TOP - BODY_BOTTOM && pages.at(-1)?.length) {
				pages.push([]);
				height = 0;
			}
			pages.at(-1)?.push({ ...line, text: textLine });
			height += style.lineHeight;
		}
	}
	return pages.filter((page) => page.length > 0);
}

async function buildPdf(input: QuoteDocumentInput, content: string): Promise<Uint8Array> {
	const pdf = await PDFDocument.create({ updateMetadata: false });
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	validateRepresentable(content, regular);
	const snapshot = record(input.quote.quote_snapshot);
	const identity = companyIdentity(snapshot);
	const name = companyName(snapshot);
	const accent = parseColor(record(identity.brand_tokens).primary);
	const pages = paginate(buildFlow(input), regular, bold);

	for (const [index, flowPage] of pages.entries()) {
		const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		page.drawText(name, {
			x: PAGE_MARGIN,
			y: PAGE_HEIGHT - PAGE_MARGIN - 18,
			size: 18,
			font: bold,
			color: accent
		});
		page.drawText(`QUOTE ${text(input.quote.quote_number)}`, {
			x: PAGE_MARGIN,
			y: PAGE_HEIGHT - PAGE_MARGIN - 39,
			size: 9,
			font: regular,
			color: rgb(0.25, 0.25, 0.28)
		});
		const subject = `Subject: ${text(input.quote.subject)}`;
		const subjectLines = wrapByFont(subject, BODY_WIDTH - 150, regular, 9);
		for (const [subjectIndex, subjectLine] of subjectLines.entries()) {
			page.drawText(subjectLine, {
				x: PAGE_MARGIN + 150,
				y: PAGE_HEIGHT - PAGE_MARGIN - 39 - subjectIndex * 12,
				size: 9,
				font: regular,
				color: rgb(0.25, 0.25, 0.28)
			});
		}
		page.drawLine({
			start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT + 14 },
			end: { x: PAGE_WIDTH - PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT + 14 },
			thickness: 1,
			color: accent
		});

		let y = BODY_TOP;
		for (const line of flowPage) {
			const style = styleFor(line.style);
			if (line.text) {
				page.drawText(line.text, {
					x: PAGE_MARGIN + (line.indent ?? 0),
					y,
					size: style.size,
					font: style.bold ? bold : regular,
					color: line.style === 'heading' || line.style === 'total' ? accent : rgb(0.12, 0.12, 0.14)
				});
			}
			y -= style.lineHeight;
		}
		page.drawLine({
			start: { x: PAGE_MARGIN, y: PAGE_MARGIN + FOOTER_HEIGHT - 8 },
			end: { x: PAGE_WIDTH - PAGE_MARGIN, y: PAGE_MARGIN + FOOTER_HEIGHT - 8 },
			thickness: 0.5,
			color: rgb(0.78, 0.78, 0.8)
		});
		page.drawText(`${text(input.quote.quote_number)} · Page ${index + 1} of ${pages.length}`, {
			x: PAGE_MARGIN,
			y: PAGE_MARGIN,
			size: 8,
			font: regular,
			color: rgb(0.35, 0.35, 0.38)
		});
	}

	return pdf.save({
		addDefaultPage: false,
		useObjectStreams: false,
		updateFieldAppearances: false
	});
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
	const bytes = await buildPdf(input, content);
	return { bytes, hash: await sha256(bytes), content };
}
