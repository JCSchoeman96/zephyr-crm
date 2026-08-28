export const PROFESSIONAL_QUOTE_TEMPLATE_VERSION = 'professional-v2';
export const PROFESSIONAL_QUOTE_GENERATOR_VERSION = 'quote-pdf-v2.1.0';

export const A4_PAGE = {
	width: 595.28,
	height: 841.89
} as const;

export const DOCUMENT_MARGINS = {
	left: 42,
	right: 42,
	top: 38,
	bottom: 42,
	header: 96,
	footer: 30
} as const;

export const DOCUMENT_CONTENT = {
	left: DOCUMENT_MARGINS.left,
	right: A4_PAGE.width - DOCUMENT_MARGINS.right,
	top: A4_PAGE.height - DOCUMENT_MARGINS.top - DOCUMENT_MARGINS.header,
	bottom: DOCUMENT_MARGINS.bottom + DOCUMENT_MARGINS.footer
} as const;

export function hexToRgb(value: string, fallback = '#315cce') {
	const match = value.trim().match(/^#([0-9a-f]{6})$/i);
	const hex = match?.[1] ?? fallback.slice(1);
	const parsed = Number.parseInt(hex, 16);
	return {
		red: ((parsed >> 16) & 0xff) / 255,
		green: ((parsed >> 8) & 0xff) / 255,
		blue: (parsed & 0xff) / 255
	};
}

export function companyMonogram(value: string): string {
	const words = value
		.trim()
		.split(/\s+/)
		.map((word) => Array.from(word)[0] ?? '')
		.filter(Boolean);
	if (words.length >= 2) return words.slice(0, 2).join('').toUpperCase();
	return Array.from(value.trim()).slice(0, 2).join('').toUpperCase() || 'Z';
}
