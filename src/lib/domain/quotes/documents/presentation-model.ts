type JsonRecord = Record<string, unknown>;

export type QuotePresentationBrand = {
	companyName: string;
	logoAsset: string | null;
	primary: string;
	primaryStrong: string;
	accent: string;
};

export type QuotePresentationParty = {
	name: string;
	company: string | null;
	addressLines: string[];
	email: string | null;
	phone: string | null;
};

export type QuotePresentationSeller = QuotePresentationParty & {
	companyName: string;
	registrationDetails: string | null;
};

export type QuotePresentationDimension = {
	key: string;
	label: string;
	unit: string;
	value: string | null;
};

export type QuotePresentationCategory = {
	label: string;
};

export type QuotePresentationItem = {
	code: string | null;
	name: string;
	description: string | null;
	quantity: string;
	unit: string | null;
	unitPrice: string;
	amount: string;
	taxable: boolean;
	category: QuotePresentationCategory;
	dimensions: QuotePresentationDimension[];
};

export type QuotePresentationItemGroup = {
	label: string;
	items: QuotePresentationItem[];
};

export type QuotePresentationModel = {
	quoteIdentity: {
		number: string;
		revision: number;
		status: string;
		issueDate: string;
		validUntil: string | null;
		currency: string;
	};
	seller: QuotePresentationSeller;
	recipient: QuotePresentationParty;
	subject: string;
	introduction: string | null;
	items: QuotePresentationItem[];
	subtotal: string;
	tax: { label: string; rate: string; amount: string };
	total: string;
	terms: string | null;
	bankDetails: string | null;
	brand: QuotePresentationBrand;
	documentMetadata: {
		templateVersion: string | null;
		generatorVersion: string | null;
		quoteRevision: number;
	};
};

export type QuotePresentationQuote = {
	quote_number: string | null;
	base_quote_number: number;
	revision_number: number;
	status: string;
	created_at: string;
	valid_until: string | null;
	currency: string;
	subject: string;
	introduction: string | null;
	terms: string | null;
	tax_label: string | null;
	tax_rate: string | number;
	subtotal: string | number;
	tax_amount: string | number;
	total: string | number;
	quote_snapshot: unknown;
	document_template_version?: string | null;
	document_generator_version?: string | null;
};

export type QuotePresentationItemInput = {
	[key: string]: unknown;
	position: number;
	name: string;
	description: string | null;
	quantity: string | number;
	unit_price: string | number;
	line_subtotal: string | number;
	taxable: boolean;
	product_code_snapshot?: string | null;
	unit_label_snapshot?: string | null;
	catalogue_unit_price?: string | number | null;
	source_product_reviewed_version?: number | null;
	dimensions?: unknown;
	product_category_id_snapshot?: string | null;
	product_category_code_snapshot?: string | null;
	product_category_label_snapshot?: string | null;
};

export type QuotePresentationInput = {
	quote: QuotePresentationQuote;
	items: QuotePresentationItemInput[];
	recipient?: unknown;
	companyIdentity?: unknown;
	quoteDefaults?: unknown;
	brand?: Partial<QuotePresentationBrand>;
};

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
	const normalized = text(value);
	return normalized || null;
}

function decimal(value: unknown): string {
	return text(value);
}

const supportedDimensionKeys = new Set(['width', 'height', 'length', 'depth']);

function customerFacingDimensions(value: unknown): QuotePresentationDimension[] {
	if (!Array.isArray(value)) return [];
	const seenKeys = new Set<string>();
	return value.flatMap((candidate) => {
		const source = record(candidate);
		const key = typeof source.key === 'string' ? source.key.trim() : '';
		const label = typeof source.label === 'string' ? source.label.trim() : '';
		const unit = typeof source.unit === 'string' ? source.unit.trim() : '';
		if (!key || !supportedDimensionKeys.has(key) || !label || unit !== 'mm') return [];
		if (seenKeys.has(key)) return [];

		const rawValue = source.value;
		if (rawValue !== null && typeof rawValue !== 'string') return [];
		const normalizedValue = rawValue === null ? null : rawValue.trim();
		if (rawValue !== null && !normalizedValue) return [];

		seenKeys.add(key);
		return [{ key, label, unit, value: normalizedValue }];
	});
}

function category(value: unknown): QuotePresentationCategory {
	return { label: nullableText(value) ?? 'Other' };
}

function addressLines(value: JsonRecord): string[] {
	const listed = value.address_lines;
	if (Array.isArray(listed)) return listed.map(text).filter(Boolean);
	const address = text(value.address ?? value.billing_address);
	return address
		? address
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean)
		: [];
}

function party(value: unknown): QuotePresentationParty {
	const source = record(value);
	return {
		name: text(source.name ?? source.display_name),
		company: nullableText(source.company ?? source.company_name),
		addressLines: addressLines(source),
		email: nullableText(source.email),
		phone: nullableText(source.phone)
	};
}

export function formatQuotePresentationDimensions(
	dimensions: QuotePresentationDimension[]
): string {
	return dimensions
		.map((dimension) => `${dimension.label}: ${dimension.value ?? '—'} ${dimension.unit}`)
		.join(' × ');
}

export function groupQuotePresentationItems(
	items: QuotePresentationItem[]
): QuotePresentationItemGroup[] {
	const groups = new Map<string, QuotePresentationItemGroup>();
	for (const item of items) {
		const label = item.category.label || 'Other';
		const group = groups.get(label);
		if (group) {
			group.items.push(item);
			continue;
		}
		groups.set(label, { label, items: [item] });
	}
	return [...groups.values()];
}

function seller(value: unknown, fallbackBrand: QuotePresentationBrand): QuotePresentationSeller {
	const source = record(value);
	const projected = party(source);
	return {
		...projected,
		companyName: projected.name || projected.company || fallbackBrand.companyName,
		registrationDetails: nullableText(source.registration_details ?? source.registration_number)
	};
}

function brand(
	value: unknown,
	identity: JsonRecord,
	fallback: Partial<QuotePresentationBrand> | undefined
): QuotePresentationBrand {
	const identityTokens = record(identity.brand_tokens);
	return {
		companyName:
			text(value && record(value).companyName) ||
			text(identity.name) ||
			fallback?.companyName ||
			'Zephyr CRM',
		logoAsset: nullableText(record(value).logoAsset ?? identity.logo_path ?? fallback?.logoAsset),
		primary: text(identityTokens.primary ?? fallback?.primary) || '#315cce',
		primaryStrong: text(identityTokens.primary_strong ?? fallback?.primaryStrong) || '#2649a8',
		accent: text(identityTokens.accent ?? fallback?.accent) || '#d9773b'
	};
}

export function buildQuotePresentationModel(input: QuotePresentationInput): QuotePresentationModel {
	const snapshot = record(input.quote.quote_snapshot);
	const commercial = record(snapshot.commercial);
	const identity = record(snapshot.company_identity ?? input.companyIdentity);
	const fallbackBrand = {
		companyName: text(input.brand?.companyName) || text(identity.name) || 'Zephyr CRM',
		logoAsset: nullableText(input.brand?.logoAsset),
		primary: text(input.brand?.primary) || '#315cce',
		primaryStrong: text(input.brand?.primaryStrong) || '#2649a8',
		accent: text(input.brand?.accent) || '#d9773b'
	};
	const projectedBrand = brand(input.brand, identity, fallbackBrand);
	const sellerSource = snapshot.seller ?? snapshot.company_identity ?? input.companyIdentity;
	const recipientSource = snapshot.recipient ?? input.recipient;
	const value = (key: string, fallback: unknown) => commercial[key] ?? fallback;
	const number = text(input.quote.quote_number) || `Q-${input.quote.base_quote_number}`;
	const revision = input.quote.revision_number;
	const quoteDefaults = record(input.quoteDefaults);
	const itemValues = [...input.items].sort((a, b) => a.position - b.position);

	return {
		quoteIdentity: {
			number,
			revision,
			status: input.quote.status,
			issueDate: text(value('issue_date', input.quote.created_at)),
			validUntil: nullableText(value('valid_until', input.quote.valid_until)),
			currency: text(value('currency', input.quote.currency))
		},
		seller: seller(sellerSource, projectedBrand),
		recipient: party(recipientSource),
		subject: text(value('subject', input.quote.subject)),
		introduction: nullableText(value('introduction', input.quote.introduction)),
		items: itemValues.map((item) => ({
			code: nullableText(item.product_code_snapshot),
			name: text(item.name),
			description: nullableText(item.description),
			quantity: decimal(item.quantity),
			unit: nullableText(item.unit_label_snapshot),
			unitPrice: decimal(item.unit_price),
			amount: decimal(item.line_subtotal),
			taxable: item.taxable,
			category: category(item.product_category_label_snapshot),
			dimensions: customerFacingDimensions(item.dimensions)
		})),
		subtotal: decimal(value('subtotal', input.quote.subtotal)),
		tax: {
			label: text(value('tax_label', input.quote.tax_label)) || 'Tax',
			rate: decimal(value('tax_rate', input.quote.tax_rate)),
			amount: decimal(value('tax_amount', input.quote.tax_amount))
		},
		total: decimal(value('total', input.quote.total)),
		terms: nullableText(value('terms', input.quote.terms)),
		bankDetails: nullableText(snapshot.bank_details ?? quoteDefaults.bank_details),
		brand: projectedBrand,
		documentMetadata: {
			templateVersion: nullableText(
				input.quote.document_template_version ?? snapshot.document_template_version
			),
			generatorVersion: nullableText(
				input.quote.document_generator_version ?? snapshot.document_generator_version
			),
			quoteRevision: revision
		}
	};
}
