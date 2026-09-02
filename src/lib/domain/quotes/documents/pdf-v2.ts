import {
	PDFDocument,
	StandardFonts,
	rgb,
	type PDFImage,
	type PDFFont,
	type PDFPage
} from 'pdf-lib';
import {
	formatQuotePresentationDimensions,
	groupQuotePresentationItems,
	type QuotePresentationItem,
	type QuotePresentationModel
} from './presentation-model';
import {
	A4_PAGE,
	companyMonogram,
	DOCUMENT_CONTENT,
	DOCUMENT_MARGINS,
	hexToRgb,
	PROFESSIONAL_QUOTE_GENERATOR_VERSION,
	PROFESSIONAL_QUOTE_TEMPLATE_VERSION
} from './template-v2';

type PdfColor = ReturnType<typeof rgb>;
type ColorName = 'ink' | 'muted' | 'primary' | 'white';
type FontName = 'regular' | 'bold';

type StyledLine = {
	text: string;
	size: number;
	lineHeight: number;
	font: FontName;
	color: ColorName;
};

type TextBlock = {
	kind: 'text';
	top: number;
	x: number;
	width: number;
	lines: StyledLine[];
};

type PartyBlock = {
	kind: 'parties';
	top: number;
	left: StyledLine[];
	right: StyledLine[];
};

type TableHeaderBlock = {
	kind: 'table-header';
	top: number;
};

type ItemRowBlock = {
	kind: 'item-row';
	top: number;
	height: number;
	codeLines: string[];
	descriptionLines: StyledLine[];
	quantity: string;
	unit: string;
	unitPrice: string;
	amount: string;
	showCommercialValues: boolean;
};

type CategoryHeadingBlock = {
	kind: 'category-heading';
	top: number;
	lines: StyledLine[];
	height: number;
};

type TotalsBlock = {
	kind: 'totals';
	top: number;
	subtotal: string;
	taxLabel: string;
	taxRate: string;
	taxAmount: string;
	total: string;
};

type DocumentBlock =
	TextBlock | PartyBlock | TableHeaderBlock | CategoryHeadingBlock | ItemRowBlock | TotalsBlock;
type DocumentBlockInput =
	| Omit<TextBlock, 'top'>
	| Omit<PartyBlock, 'top'>
	| Omit<TableHeaderBlock, 'top'>
	| Omit<CategoryHeadingBlock, 'top'>
	| Omit<ItemRowBlock, 'top'>
	| Omit<TotalsBlock, 'top'>;

type LayoutPage = {
	blocks: DocumentBlock[];
	cursor: number;
	tableHeaderCount: number;
};

type LayoutResult = {
	pages: LayoutPage[];
	totalsPage: number;
	overflowCount: number;
};

export type QuoteDocumentFitness = {
	overflowCount: number;
	repeatedTableHeaders: number;
	pagesWithRepeatedTableHeaders: number;
	totalsPage: number;
	pageCount: number;
};

export type GeneratedProfessionalQuoteDocument = {
	bytes: Uint8Array;
	hash: string;
	content: string;
	pageCount: number;
	templateVersion: typeof PROFESSIONAL_QUOTE_TEMPLATE_VERSION;
	generatorVersion: typeof PROFESSIONAL_QUOTE_GENERATOR_VERSION;
	fitness: QuoteDocumentFitness;
};

const TABLE_HEADER_HEIGHT = 26;
const PARTY_COLUMN_GAP = 18;
const PARTY_COLUMN_WIDTH = (DOCUMENT_CONTENT.right - DOCUMENT_CONTENT.left - PARTY_COLUMN_GAP) / 2;
const TABLE_COLUMNS = {
	code: { x: DOCUMENT_CONTENT.left, width: 98 },
	description: { x: DOCUMENT_CONTENT.left + 98, width: 180 },
	quantity: { x: DOCUMENT_CONTENT.left + 278, width: 44 },
	unit: { x: DOCUMENT_CONTENT.left + 322, width: 48 },
	unitPrice: { x: DOCUMENT_CONTENT.left + 370, width: 70 },
	amount: {
		x: DOCUMENT_CONTENT.left + 440,
		width: DOCUMENT_CONTENT.right - (DOCUMENT_CONTENT.left + 440)
	}
} as const;
const ITEM_LINE_HEIGHT = 10.5;
const ITEM_TOP_PADDING = 8;
const ITEM_BOTTOM_PADDING = 7;
const ITEM_DESCRIPTION_INDENT = 8;
const CATEGORY_HEADING_LINE_HEIGHT = 16;
const CATEGORY_HEADING_TOP_PADDING = 4;
const CATEGORY_HEADING_BOTTOM_PADDING = 4;
const TOTALS_HEIGHT = 92;
const MAX_INLINE_LOGO_BYTES = 1024 * 1024;

type LogoAsset = { kind: 'png' | 'jpeg'; bytes: Uint8Array };

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function decodeLogoAsset(value: string | null): LogoAsset | null {
	const match = text(value).match(/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
	const payload = match?.[2];
	if (
		!match ||
		!payload ||
		payload.length % 4 !== 0 ||
		payload.length > MAX_INLINE_LOGO_BYTES * 4
	) {
		return null;
	}
	try {
		const binary = atob(payload);
		if (binary.length > MAX_INLINE_LOGO_BYTES) return null;
		return {
			kind: match[1].toLowerCase() === 'image/png' ? 'png' : 'jpeg',
			bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0))
		};
	} catch {
		return null;
	}
}

async function embedLogo(pdf: PDFDocument, value: string | null): Promise<PDFImage | null> {
	const asset = decodeLogoAsset(value);
	if (!asset) return null;
	try {
		return asset.kind === 'png' ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
	} catch {
		return null;
	}
}

function normalizeNewlines(value: string): string {
	return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function wrapWord(word: string, width: number, font: PDFFont, size: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const character of Array.from(word)) {
		const candidate = `${line}${character}`;
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

export function wrapPdfText(value: string, width: number, font: PDFFont, size: number): string[] {
	const lines: string[] = [];
	for (const paragraph of normalizeNewlines(value).split('\n')) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push('');
			continue;
		}
		let line = '';
		for (const word of words) {
			if (font.widthOfTextAtSize(word, size) > width) {
				if (line) lines.push(line);
				const wordLines = wrapWord(word, width, font, size);
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

export function wrapPdfProductCode(
	value: string,
	width: number,
	font: PDFFont,
	size: number
): string[] {
	const lines: string[] = [];
	for (const paragraph of normalizeNewlines(value).split('\n')) {
		const segments = paragraph.match(/[^-]*-|[^-]+$/g) ?? [''];
		let line = '';
		for (const segment of segments) {
			if (font.widthOfTextAtSize(segment, size) > width) {
				if (line) lines.push(line);
				const segmentLines = wrapWord(segment, width, font, size);
				if (segmentLines.length > 1) {
					lines.push(...segmentLines.slice(0, -1));
					line = segmentLines.at(-1) ?? '';
				} else {
					line = segmentLines[0] ?? '';
				}
				continue;
			}

			const candidate = line + segment;
			if (line && font.widthOfTextAtSize(candidate, size) > width) {
				lines.push(line);
				line = segment;
			} else {
				line = candidate;
			}
		}
		if (line) lines.push(line);
		if (!paragraph) lines.push('');
	}
	return lines.length ? lines : [''];
}

function unsupportedCharacter(value: string, font: PDFFont): string | null {
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

function validateGlyphs(model: QuotePresentationModel, regular: PDFFont, bold: PDFFont): void {
	const values = [
		model.quoteIdentity.number,
		model.quoteIdentity.status,
		model.quoteIdentity.issueDate,
		model.quoteIdentity.validUntil,
		model.quoteIdentity.currency,
		model.seller.companyName,
		model.seller.name,
		model.seller.company,
		...model.seller.addressLines,
		model.seller.email,
		model.seller.phone,
		model.seller.registrationDetails,
		model.recipient.name,
		model.recipient.company,
		...model.recipient.addressLines,
		model.recipient.email,
		model.recipient.phone,
		model.subject,
		model.introduction,
		...model.items.flatMap((item) => [
			item.code,
			item.name,
			item.description,
			item.quantity,
			item.unit,
			item.unitPrice,
			item.amount,
			item.category.label,
			...item.dimensions.flatMap((dimension) => [dimension.label, dimension.unit, dimension.value]),
			formatQuotePresentationDimensions(item.dimensions)
		]),
		model.subtotal,
		model.tax.label,
		model.tax.rate,
		model.tax.amount,
		model.total,
		model.terms,
		model.bankDetails,
		model.brand.companyName,
		model.documentMetadata.templateVersion,
		model.documentMetadata.generatorVersion
	];
	for (const value of values) {
		const candidate = text(value);
		if (!candidate) continue;
		for (const line of normalizeNewlines(candidate).split('\n')) {
			const unsupported = unsupportedCharacter(line, regular) ?? unsupportedCharacter(line, bold);
			if (unsupported) {
				throw new Error(
					`Quote document text cannot be represented by the approved PDF font: ${unsupported}`
				);
			}
		}
	}
}

function styleLine(
	value: string,
	options: Omit<StyledLine, 'text'>,
	font: PDFFont,
	width: number
): StyledLine[] {
	return wrapPdfText(value, width, font, options.size).map((line) => ({
		...options,
		text: line
	}));
}

function partyLines(
	label: string,
	party: {
		name: string;
		company: string | null;
		addressLines: string[];
		email: string | null;
		phone: string | null;
	},
	registrationDetails: string | null,
	regular: PDFFont,
	bold: PDFFont
): StyledLine[] {
	const lines: StyledLine[] = [
		{ text: label, size: 8, lineHeight: 12, font: 'bold', color: 'primary' }
	];
	const add = (value: string | null | undefined, font: FontName = 'regular', size = 8.5) => {
		if (!value) return;
		lines.push({ text: value, size, lineHeight: 12, font, color: 'ink' });
	};
	add(party.name, 'bold', 10);
	if (party.company && party.company !== party.name) add(party.company);
	for (const address of party.addressLines) add(address);
	add(party.email);
	add(party.phone);
	add(registrationDetails ? `Registration: ${registrationDetails}` : null, 'regular', 8);
	return lines.flatMap((line) => {
		const font = line.font === 'bold' ? bold : regular;
		return styleLine(line.text, line, font, PARTY_COLUMN_WIDTH);
	});
}

function createPage(withTableHeader = false): LayoutPage {
	const page: LayoutPage = {
		blocks: [],
		cursor: DOCUMENT_CONTENT.top,
		tableHeaderCount: 0
	};
	if (withTableHeader) {
		page.blocks.push({ kind: 'table-header', top: page.cursor });
		page.cursor -= TABLE_HEADER_HEIGHT;
		page.tableHeaderCount = 1;
	}
	return page;
}

function currentPage(pages: LayoutPage[]): LayoutPage {
	const page = pages.at(-1);
	if (page) return page;
	const firstPage = createPage();
	pages.push(firstPage);
	return firstPage;
}

function placeBlock(
	pages: LayoutPage[],
	block: DocumentBlockInput,
	height: number,
	breakWithTableHeader = false
): LayoutPage {
	let page = currentPage(pages);
	if (page.cursor - height < DOCUMENT_CONTENT.bottom) {
		page = createPage(breakWithTableHeader);
		pages.push(page);
	}
	const top = page.cursor;
	page.blocks.push({ ...block, top } as DocumentBlock);
	page.cursor -= height;
	return page;
}

function placeStyledLine(
	pages: LayoutPage[],
	line: StyledLine,
	x: number,
	width: number,
	breakWithTableHeader = false
): void {
	placeBlock(
		pages,
		{ kind: 'text', x, width, lines: [line] },
		line.lineHeight,
		breakWithTableHeader
	);
}

function addHeading(pages: LayoutPage[], value: string, regular: PDFFont, bold: PDFFont): void {
	placeStyledLine(
		pages,
		{
			text: value,
			size: 9,
			lineHeight: 16,
			font: 'bold',
			color: 'primary'
		},
		DOCUMENT_CONTENT.left,
		DOCUMENT_CONTENT.right - DOCUMENT_CONTENT.left
	);
	void regular;
	void bold;
}

function addCategoryHeading(
	pages: LayoutPage[],
	value: string,
	bold: PDFFont,
	keepFirstItemWithHeading = false
): void {
	const lines = styleLine(
		value,
		{
			size: 8.7,
			lineHeight: CATEGORY_HEADING_LINE_HEIGHT,
			font: 'bold',
			color: 'primary'
		},
		bold,
		DOCUMENT_CONTENT.right - TABLE_COLUMNS.description.x - ITEM_DESCRIPTION_INDENT
	);
	const height =
		CATEGORY_HEADING_TOP_PADDING +
		CATEGORY_HEADING_BOTTOM_PADDING +
		lines.length * CATEGORY_HEADING_LINE_HEIGHT;
	if (
		keepFirstItemWithHeading &&
		currentPage(pages).cursor -
			height -
			(ITEM_TOP_PADDING + ITEM_BOTTOM_PADDING + ITEM_LINE_HEIGHT) <
			DOCUMENT_CONTENT.bottom
	) {
		pages.push(createPage(true));
	}
	placeBlock(pages, { kind: 'category-heading', lines, height }, height, true);
}

function addWrappedParagraph(
	pages: LayoutPage[],
	value: string,
	font: PDFFont,
	fontName: FontName,
	size: number,
	lineHeight: number,
	color: ColorName,
	width = DOCUMENT_CONTENT.right - DOCUMENT_CONTENT.left
): void {
	for (const line of wrapPdfText(value, width, font, size)) {
		placeStyledLine(
			pages,
			{ text: line, size, lineHeight, font: fontName, color },
			DOCUMENT_CONTENT.left,
			width
		);
	}
}

function addPartyPair(pages: LayoutPage[], left: StyledLine[], right: StyledLine[]): void {
	let offset = 0;
	const maxLength = Math.max(left.length, right.length);
	while (offset < maxLength) {
		const available = Math.max(
			1,
			Math.floor((currentPage(pages).cursor - DOCUMENT_CONTENT.bottom) / 12)
		);
		const take = Math.min(maxLength - offset, available);
		const page = placeBlock(
			pages,
			{
				kind: 'parties',
				left: left.slice(offset, offset + take),
				right: right.slice(offset, offset + take)
			},
			take * 12
		);
		void page;
		offset += take;
	}
}

function addTableHeader(pages: LayoutPage[]): void {
	placeBlock(pages, { kind: 'table-header' }, TABLE_HEADER_HEIGHT);
}

function money(currency: string, value: string): string {
	return `${currency} ${value || '0.00'}`;
}

function itemSegments(
	item: QuotePresentationItem,
	currency: string,
	regular: PDFFont,
	bold: PDFFont,
	pages: LayoutPage[]
): void {
	const codeLines = wrapPdfProductCode(item.code || '—', TABLE_COLUMNS.code.width - 6, regular, 8);
	const descriptionLines = [
		...styleLine(
			item.name,
			{
				size: 8.7,
				lineHeight: ITEM_LINE_HEIGHT,
				font: 'bold',
				color: 'ink'
			},
			bold,
			TABLE_COLUMNS.description.width - 6 - ITEM_DESCRIPTION_INDENT
		),
		...(item.description
			? styleLine(
					item.description,
					{
						size: 8,
						lineHeight: ITEM_LINE_HEIGHT,
						font: 'regular',
						color: 'muted'
					},
					regular,
					TABLE_COLUMNS.description.width - 6 - ITEM_DESCRIPTION_INDENT
				)
			: []),
		...(item.dimensions.length
			? styleLine(
					formatQuotePresentationDimensions(item.dimensions),
					{
						size: 7.6,
						lineHeight: ITEM_LINE_HEIGHT,
						font: 'regular',
						color: 'primary'
					},
					regular,
					TABLE_COLUMNS.description.width - 6 - ITEM_DESCRIPTION_INDENT
				)
			: [])
	];
	const lineCount = Math.max(codeLines.length, descriptionLines.length, 1);
	let offset = 0;
	while (offset < lineCount) {
		let page = currentPage(pages);
		if (
			page.cursor - (ITEM_TOP_PADDING + ITEM_BOTTOM_PADDING + ITEM_LINE_HEIGHT) <
			DOCUMENT_CONTENT.bottom
		) {
			page = createPage(true);
			pages.push(page);
		}
		const availableLines = Math.max(
			1,
			Math.floor(
				(page.cursor - DOCUMENT_CONTENT.bottom - ITEM_TOP_PADDING - ITEM_BOTTOM_PADDING) /
					ITEM_LINE_HEIGHT
			)
		);
		const take = Math.min(lineCount - offset, availableLines);
		const height = ITEM_TOP_PADDING + ITEM_BOTTOM_PADDING + take * ITEM_LINE_HEIGHT;
		page = placeBlock(
			pages,
			{
				kind: 'item-row',
				height,
				codeLines: codeLines.slice(offset, offset + take),
				descriptionLines: descriptionLines.slice(offset, offset + take),
				quantity: item.quantity,
				unit: item.unit || '—',
				unitPrice: money(currency, item.unitPrice),
				amount: money(currency, item.amount),
				showCommercialValues: offset === 0
			},
			height,
			true
		);
		void page;
		offset += take;
	}
}

function addTotals(pages: LayoutPage[], model: QuotePresentationModel): number {
	const page = placeBlock(
		pages,
		{
			kind: 'totals',
			subtotal: money(model.quoteIdentity.currency, model.subtotal),
			taxLabel: model.tax.label,
			taxRate: model.tax.rate,
			taxAmount: money(model.quoteIdentity.currency, model.tax.amount),
			total: money(model.quoteIdentity.currency, model.total)
		},
		TOTALS_HEIGHT
	);
	return pages.indexOf(page) + 1;
}

function layoutDocument(
	model: QuotePresentationModel,
	regular: PDFFont,
	bold: PDFFont
): LayoutResult {
	const pages = [createPage()];
	addHeading(pages, 'SELLER AND CUSTOMER', regular, bold);
	addPartyPair(
		pages,
		partyLines('FROM', model.seller, model.seller.registrationDetails, regular, bold),
		partyLines('TO', model.recipient, null, regular, bold)
	);

	addHeading(pages, 'QUOTE DETAILS', regular, bold);
	addWrappedParagraph(
		pages,
		`Subject: ${model.subject || 'Untitled quote'}`,
		regular,
		'regular',
		9.2,
		13,
		'ink'
	);
	addWrappedParagraph(
		pages,
		`Issued: ${model.quoteIdentity.issueDate.slice(0, 10)}   Valid until: ${model.quoteIdentity.validUntil || 'Not specified'}   Currency: ${model.quoteIdentity.currency}`,
		regular,
		'regular',
		8.5,
		12,
		'muted'
	);
	if (model.introduction) {
		addHeading(pages, 'INTRODUCTION', regular, bold);
		addWrappedParagraph(pages, model.introduction, regular, 'regular', 8.8, 12, 'ink');
	}

	addHeading(pages, 'LINE ITEMS', regular, bold);
	addTableHeader(pages);
	for (const group of groupQuotePresentationItems(model.items)) {
		addCategoryHeading(pages, group.label, bold, group.items.length > 0);
		for (const item of group.items)
			itemSegments(item, model.quoteIdentity.currency, regular, bold, pages);
	}

	const totalsPage = addTotals(pages, model);
	if (model.terms) {
		addHeading(pages, 'TERMS', regular, bold);
		addWrappedParagraph(pages, model.terms, regular, 'regular', 8.5, 12, 'ink');
	}
	if (model.bankDetails) {
		addHeading(pages, 'BANK DETAILS', regular, bold);
		addWrappedParagraph(pages, model.bankDetails, regular, 'regular', 8.5, 12, 'ink');
	}

	let overflowCount = 0;
	for (const page of pages) {
		for (const block of page.blocks) {
			const height =
				block.kind === 'text'
					? block.lines.reduce((sum, line) => sum + line.lineHeight, 0)
					: block.kind === 'parties'
						? Math.max(block.left.length, block.right.length) * 12
						: block.kind === 'table-header'
							? TABLE_HEADER_HEIGHT
							: block.kind === 'category-heading'
								? block.height
								: block.kind === 'item-row'
									? block.height
									: TOTALS_HEIGHT;
			if (
				block.top > DOCUMENT_CONTENT.top + 0.01 ||
				block.top - height < DOCUMENT_CONTENT.bottom - 0.01
			) {
				overflowCount += 1;
			}
		}
	}
	return { pages, totalsPage, overflowCount };
}

function colors(model: QuotePresentationModel): Record<ColorName, PdfColor> {
	const primary = hexToRgb(model.brand.primary);
	return {
		ink: rgb(0.12, 0.13, 0.16),
		muted: rgb(0.35, 0.37, 0.42),
		primary: rgb(primary.red, primary.green, primary.blue),
		white: rgb(1, 1, 1)
	};
}

function fontsFor(fontName: FontName, fonts: { regular: PDFFont; bold: PDFFont }): PDFFont {
	return fontName === 'bold' ? fonts.bold : fonts.regular;
}

function drawTextBlock(
	page: PDFPage,
	block: TextBlock,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	let y = block.top;
	for (const line of block.lines) {
		if (line.text) {
			page.drawText(line.text, {
				x: block.x,
				y: y - line.size,
				size: line.size,
				font: fontsFor(line.font, fonts),
				color: palette[line.color]
			});
		}
		y -= line.lineHeight;
	}
}

function drawPartyBlock(
	page: PDFPage,
	block: PartyBlock,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	const columns = [block.left, block.right];
	for (const [columnIndex, lines] of columns.entries()) {
		let y = block.top;
		const x =
			columnIndex === 0
				? DOCUMENT_CONTENT.left
				: DOCUMENT_CONTENT.left + PARTY_COLUMN_WIDTH + PARTY_COLUMN_GAP;
		for (const line of lines) {
			if (line.text) {
				page.drawText(line.text, {
					x,
					y: y - line.size,
					size: line.size,
					font: fontsFor(line.font, fonts),
					color: palette[line.color]
				});
			}
			y -= line.lineHeight;
		}
	}
	page.drawLine({
		start: {
			x: DOCUMENT_CONTENT.left,
			y: block.top - Math.max(block.left.length, block.right.length) * 12 - 4
		},
		end: {
			x: DOCUMENT_CONTENT.right,
			y: block.top - Math.max(block.left.length, block.right.length) * 12 - 4
		},
		thickness: 0.5,
		color: palette.muted
	});
}

function rightAlignedX(value: string, font: PDFFont, right: number, size: number): number {
	return right - font.widthOfTextAtSize(value, size);
}

function drawTableHeader(
	page: PDFPage,
	block: TableHeaderBlock,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	page.drawRectangle({
		x: DOCUMENT_CONTENT.left,
		y: block.top - TABLE_HEADER_HEIGHT,
		width: DOCUMENT_CONTENT.right - DOCUMENT_CONTENT.left,
		height: TABLE_HEADER_HEIGHT,
		color: palette.primary,
		opacity: 0.1
	});
	const labels = [
		['Code', TABLE_COLUMNS.code],
		['Description', TABLE_COLUMNS.description],
		['Qty', TABLE_COLUMNS.quantity],
		['Unit', TABLE_COLUMNS.unit],
		['Unit price', TABLE_COLUMNS.unitPrice],
		['Amount', TABLE_COLUMNS.amount]
	] as const;
	for (const [label, column] of labels) {
		const font = fonts.bold;
		const size = 7.3;
		const x =
			column.x +
			(column === TABLE_COLUMNS.amount ? column.width - font.widthOfTextAtSize(label, size) : 0);
		page.drawText(label, {
			x,
			y: block.top - 10,
			size,
			font,
			color: palette.primary
		});
	}
}

function drawFittedRight(
	page: PDFPage,
	value: string,
	font: PDFFont,
	column: { x: number; width: number },
	baseSize: number,
	y: number,
	color: PdfColor
): void {
	let size = baseSize;
	while (size > 6.1 && font.widthOfTextAtSize(value, size) > column.width - 4) size -= 0.25;
	page.drawText(value, {
		x: rightAlignedX(value, font, column.x + column.width - 2, size),
		y,
		size,
		font,
		color
	});
}

function drawCategoryHeading(
	page: PDFPage,
	block: CategoryHeadingBlock,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	let y = block.top - CATEGORY_HEADING_TOP_PADDING;
	for (const line of block.lines) {
		if (line.text) {
			page.drawText(line.text, {
				x: TABLE_COLUMNS.description.x + ITEM_DESCRIPTION_INDENT,
				y: y - line.size,
				size: line.size,
				font: fontsFor(line.font, fonts),
				color: palette[line.color]
			});
		}
		y -= line.lineHeight;
	}
	page.drawLine({
		start: {
			x: TABLE_COLUMNS.description.x + ITEM_DESCRIPTION_INDENT,
			y: block.top - block.height + CATEGORY_HEADING_BOTTOM_PADDING
		},
		end: {
			x: DOCUMENT_CONTENT.right,
			y: block.top - block.height + CATEGORY_HEADING_BOTTOM_PADDING
		},
		thickness: 0.35,
		color: palette.muted
	});
}

function drawItemRow(
	page: PDFPage,
	block: ItemRowBlock,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	let y = block.top - ITEM_TOP_PADDING;
	for (const line of block.codeLines) {
		page.drawText(line, {
			x: TABLE_COLUMNS.code.x,
			y: y - 8,
			size: 8,
			font: fonts.regular,
			color: palette.muted
		});
		y -= ITEM_LINE_HEIGHT;
	}
	y = block.top - ITEM_TOP_PADDING;
	for (const line of block.descriptionLines) {
		if (line.text) {
			page.drawText(line.text, {
				x: TABLE_COLUMNS.description.x + ITEM_DESCRIPTION_INDENT,
				y: y - line.size,
				size: line.size,
				font: fontsFor(line.font, fonts),
				color: palette[line.color]
			});
		}
		y -= ITEM_LINE_HEIGHT;
	}
	if (block.showCommercialValues) {
		const baseline = block.top - ITEM_TOP_PADDING - 8;
		page.drawText(block.quantity, {
			x: rightAlignedX(
				block.quantity,
				fonts.regular,
				TABLE_COLUMNS.quantity.x + TABLE_COLUMNS.quantity.width - 2,
				8
			),
			y: baseline,
			size: 8,
			font: fonts.regular,
			color: palette.ink
		});
		page.drawText(block.unit, {
			x: rightAlignedX(
				block.unit,
				fonts.regular,
				TABLE_COLUMNS.unit.x + TABLE_COLUMNS.unit.width - 2,
				8
			),
			y: baseline,
			size: 8,
			font: fonts.regular,
			color: palette.ink
		});
		drawFittedRight(
			page,
			block.unitPrice,
			fonts.regular,
			TABLE_COLUMNS.unitPrice,
			7.5,
			baseline,
			palette.ink
		);
		const amountFont = fonts.bold;
		let amountSize = 7.5;
		while (
			amountSize > 6.1 &&
			amountFont.widthOfTextAtSize(block.amount, amountSize) > TABLE_COLUMNS.amount.width - 4
		) {
			amountSize -= 0.25;
		}
		page.drawText(block.amount, {
			x: rightAlignedX(
				block.amount,
				amountFont,
				TABLE_COLUMNS.amount.x + TABLE_COLUMNS.amount.width - 2,
				amountSize
			),
			y: baseline,
			size: amountSize,
			font: amountFont,
			color: palette.ink
		});
	}
	page.drawLine({
		start: { x: DOCUMENT_CONTENT.left, y: block.top - block.height + 2 },
		end: { x: DOCUMENT_CONTENT.right, y: block.top - block.height + 2 },
		thickness: 0.35,
		color: palette.muted
	});
}

function drawTotals(
	page: PDFPage,
	block: TotalsBlock,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	const x = DOCUMENT_CONTENT.right - 220;
	const width = 220;
	page.drawRectangle({
		x,
		y: block.top - TOTALS_HEIGHT,
		width,
		height: TOTALS_HEIGHT,
		borderColor: palette.muted,
		borderWidth: 0.5,
		color: palette.white,
		opacity: 0.9
	});
	const rows = [
		['Subtotal', block.subtotal, false],
		[`${block.taxLabel} (${block.taxRate}%)`, block.taxAmount, false],
		['Total', block.total, true]
	] as const;
	let y = block.top - 18;
	for (const [label, value, emphasized] of rows) {
		const size = emphasized ? 11 : 8.8;
		const font = emphasized ? fonts.bold : fonts.regular;
		page.drawText(label, {
			x: x + 12,
			y,
			size,
			font,
			color: emphasized ? palette.primary : palette.muted
		});
		page.drawText(value, {
			x: rightAlignedX(value, font, x + width - 12, size),
			y,
			size,
			font,
			color: emphasized ? palette.primary : palette.ink
		});
		y -= emphasized ? 28 : 20;
	}
}

function drawHeader(
	page: PDFPage,
	model: QuotePresentationModel,
	logo: PDFImage | null,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	const logoX = DOCUMENT_MARGINS.left;
	const logoY = A4_PAGE.height - DOCUMENT_MARGINS.top - 30;
	page.drawRectangle({
		x: logoX,
		y: logoY,
		width: 30,
		height: 30,
		color: palette.primary
	});
	if (logo) {
		const size = logo.size();
		const scale = Math.min(26 / size.width, 26 / size.height);
		const width = size.width * scale;
		const height = size.height * scale;
		page.drawImage(logo, {
			x: logoX + (30 - width) / 2,
			y: logoY + (30 - height) / 2,
			width,
			height
		});
	} else {
		const monogram = companyMonogram(model.brand.companyName);
		page.drawText(monogram, {
			x: logoX + (30 - fonts.bold.widthOfTextAtSize(monogram, 9)) / 2,
			y: logoY + 10,
			size: 9,
			font: fonts.bold,
			color: palette.white
		});
	}
	page.drawText(model.brand.companyName, {
		x: logoX + 40,
		y: A4_PAGE.height - DOCUMENT_MARGINS.top - 14,
		size: 13,
		font: fonts.bold,
		color: palette.primary
	});
	const quoteLabel = `QUOTE ${model.quoteIdentity.number}`;
	page.drawText(quoteLabel, {
		x: rightAlignedX(quoteLabel, fonts.bold, DOCUMENT_CONTENT.right, 10),
		y: A4_PAGE.height - DOCUMENT_MARGINS.top - 13,
		size: 10,
		font: fonts.bold,
		color: palette.primary
	});
	const revision = `Revision ${model.quoteIdentity.revision}`;
	page.drawText(revision, {
		x: rightAlignedX(revision, fonts.regular, DOCUMENT_CONTENT.right, 8),
		y: A4_PAGE.height - DOCUMENT_MARGINS.top - 29,
		size: 8,
		font: fonts.regular,
		color: palette.muted
	});
	page.drawLine({
		start: { x: DOCUMENT_CONTENT.left, y: DOCUMENT_CONTENT.top + 12 },
		end: { x: DOCUMENT_CONTENT.right, y: DOCUMENT_CONTENT.top + 12 },
		thickness: 1,
		color: palette.primary
	});
}

function drawFooter(
	page: PDFPage,
	model: QuotePresentationModel,
	pageNumber: number,
	pageCount: number,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	const y = DOCUMENT_MARGINS.bottom;
	page.drawLine({
		start: { x: DOCUMENT_CONTENT.left, y: y + 14 },
		end: { x: DOCUMENT_CONTENT.right, y: y + 14 },
		thickness: 0.5,
		color: palette.muted
	});
	const contact = [model.brand.companyName, model.seller.email, model.seller.phone]
		.map(text)
		.filter(Boolean)
		.join(' · ');
	page.drawText(contact, {
		x: DOCUMENT_CONTENT.left,
		y,
		size: 7.5,
		font: fonts.regular,
		color: palette.muted
	});
	const pageLabel = `Page ${pageNumber} of ${pageCount}`;
	page.drawText(pageLabel, {
		x: rightAlignedX(pageLabel, fonts.bold, DOCUMENT_CONTENT.right, 7.5),
		y,
		size: 7.5,
		font: fonts.bold,
		color: palette.muted
	});
}

function drawPage(
	page: PDFPage,
	pageLayout: LayoutPage,
	model: QuotePresentationModel,
	logo: PDFImage | null,
	pageNumber: number,
	pageCount: number,
	fonts: { regular: PDFFont; bold: PDFFont },
	palette: Record<ColorName, PdfColor>
): void {
	drawHeader(page, model, logo, fonts, palette);
	for (const block of pageLayout.blocks) {
		switch (block.kind) {
			case 'text':
				drawTextBlock(page, block, fonts, palette);
				break;
			case 'parties':
				drawPartyBlock(page, block, fonts, palette);
				break;
			case 'table-header':
				drawTableHeader(page, block, fonts, palette);
				break;
			case 'category-heading':
				drawCategoryHeading(page, block, fonts, palette);
				break;
			case 'item-row':
				drawItemRow(page, block, fonts, palette);
				break;
			case 'totals':
				drawTotals(page, block, fonts, palette);
				break;
		}
	}
	drawFooter(page, model, pageNumber, pageCount, fonts, palette);
}

function contentFor(model: QuotePresentationModel, layout: LayoutResult): string {
	const lines = [
		`Template: ${PROFESSIONAL_QUOTE_TEMPLATE_VERSION}`,
		`Generator: ${PROFESSIONAL_QUOTE_GENERATOR_VERSION}`,
		`Quote: ${model.quoteIdentity.number}`,
		`Revision: ${model.quoteIdentity.revision}`,
		`Company: ${model.brand.companyName}`,
		`Seller: ${model.seller.companyName}`,
		...model.seller.addressLines.map((line) => `Seller address: ${line}`),
		`Recipient: ${model.recipient.name}${model.recipient.company ? ` (${model.recipient.company})` : ''}`,
		...model.recipient.addressLines.map((line) => `Recipient address: ${line}`),
		`Subject: ${model.subject}`,
		model.introduction ? `Introduction: ${model.introduction}` : '',
		...groupQuotePresentationItems(model.items).flatMap((group) => [
			`Category: ${group.label}`,
			...group.items.map((item) => {
				const dimensions = formatQuotePresentationDimensions(item.dimensions);
				return `Item: ${item.code || 'custom'} ${item.name} ${item.quantity} ${item.unit || ''} ${item.unitPrice} ${item.amount}${dimensions ? ` Dimensions: ${dimensions}` : ''}`;
			})
		]),
		`Subtotal: ${model.subtotal}`,
		`${model.tax.label} (${model.tax.rate}%): ${model.tax.amount}`,
		`Total: ${model.total}`,
		model.terms ? `Terms: ${model.terms}` : '',
		model.bankDetails ? `Bank details: ${model.bankDetails}` : ''
	];
	for (let index = 0; index < layout.pages.length; index += 1) {
		if (layout.pages[index]?.tableHeaderCount) lines.push('TABLE HEADER');
		lines.push(`Page ${index + 1} of ${layout.pages.length}`);
	}
	return lines.filter(Boolean).join('\n');
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const safeBytes = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest('SHA-256', safeBytes.buffer as ArrayBuffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateProfessionalQuoteDocument(
	model: QuotePresentationModel
): Promise<GeneratedProfessionalQuoteDocument> {
	const pdf = await PDFDocument.create({ updateMetadata: false });
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	validateGlyphs(model, regular, bold);
	const logo = await embedLogo(pdf, model.brand.logoAsset);
	const layout = layoutDocument(model, regular, bold);
	const palette = colors(model);
	for (const [index, pageLayout] of layout.pages.entries()) {
		const page = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
		drawPage(
			page,
			pageLayout,
			model,
			logo,
			index + 1,
			layout.pages.length,
			{ regular, bold },
			palette
		);
	}
	const bytes = await pdf.save({
		addDefaultPage: false,
		useObjectStreams: false,
		updateFieldAppearances: false
	});
	const content = contentFor(model, layout);
	const pageCount = layout.pages.length;
	const tableHeaderPages = layout.pages.filter((page) => page.tableHeaderCount > 0).length;
	return {
		bytes,
		hash: await sha256(bytes),
		content,
		pageCount,
		templateVersion: PROFESSIONAL_QUOTE_TEMPLATE_VERSION,
		generatorVersion: PROFESSIONAL_QUOTE_GENERATOR_VERSION,
		fitness: {
			overflowCount: layout.overflowCount,
			repeatedTableHeaders: Math.max(0, tableHeaderPages - 1),
			pagesWithRepeatedTableHeaders: Math.max(0, tableHeaderPages - 1),
			totalsPage: layout.totalsPage,
			pageCount
		}
	};
}

export const generateQuoteDocumentV2 = generateProfessionalQuoteDocument;
export const renderQuoteDocumentV2 = generateProfessionalQuoteDocument;
