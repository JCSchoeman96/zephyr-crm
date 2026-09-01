export type LeadRequestGroupKey =
	'location-product' | 'measurements' | 'follow-up' | 'source-promotion' | 'notes';

export type LeadRequestField = {
	key: string;
	label: string;
	value: string;
};

export type LeadRequestGroup = {
	key: LeadRequestGroupKey;
	title: string;
	fields: LeadRequestField[];
	summary: string;
};

export type ParsedLeadRequestMessage = {
	hasStructuredFields: boolean;
	fallbackMessage: string;
	notes: string;
	groups: LeadRequestGroup[];
};

type FieldDefinition = {
	key: string;
	sourceLabel: string;
	label: string;
	group: LeadRequestGroupKey;
};

const fieldDefinitions: FieldDefinition[] = [
	{ key: 'town', sourceLabel: 'Town/area', label: 'Town / area', group: 'location-product' },
	{ key: 'product', sourceLabel: 'Product', label: 'Product', group: 'location-product' },
	{
		key: 'product-type',
		sourceLabel: 'Product type',
		label: 'Product type',
		group: 'location-product'
	},
	{ key: 'area-type', sourceLabel: 'Area type', label: 'Area type', group: 'location-product' },
	{ key: 'width', sourceLabel: 'Width (mm)', label: 'Width', group: 'measurements' },
	{ key: 'height', sourceLabel: 'Height (mm)', label: 'Height', group: 'measurements' },
	{ key: 'openings', sourceLabel: 'Openings', label: 'Openings', group: 'measurements' },
	{
		key: 'installation',
		sourceLabel: 'Installation',
		label: 'Installation',
		group: 'follow-up'
	},
	{ key: 'timing', sourceLabel: 'Timing', label: 'Timing', group: 'follow-up' },
	{
		key: 'contact-method',
		sourceLabel: 'Contact method',
		label: 'Contact method',
		group: 'follow-up'
	},
	{
		key: 'affiliate-id',
		sourceLabel: 'Affiliate ID',
		label: 'Affiliate ID',
		group: 'source-promotion'
	},
	{
		key: 'referral-date',
		sourceLabel: 'Referral date',
		label: 'Referral date',
		group: 'source-promotion'
	},
	{
		key: 'promo-code',
		sourceLabel: 'Promo code',
		label: 'Promo code',
		group: 'source-promotion'
	},
	{ key: 'notes', sourceLabel: 'Notes', label: 'Notes', group: 'notes' }
];

const groupDefinitions: Array<{ key: LeadRequestGroupKey; title: string }> = [
	{ key: 'location-product', title: 'Location & Product' },
	{ key: 'measurements', title: 'Measurements' },
	{ key: 'follow-up', title: 'Follow-Up Preferences' },
	{ key: 'source-promotion', title: 'Source & Promotion' },
	{ key: 'notes', title: 'Notes' }
];

const knownLabels = new Map(
	fieldDefinitions.map((definition) => [definition.sourceLabel.toLowerCase(), definition])
);

const displayValues: Record<string, Record<string, string>> = {
	product: {
		screens: 'Screens',
		blinds: 'Blinds',
		shutters: 'Shutters'
	},
	'area-type': {
		window: 'Window',
		door: 'Door',
		'sliding-door': 'Sliding door',
		patio: 'Patio',
		other: 'Other'
	},
	installation: {
		diy: 'DIY',
		install: 'Installation by Danoptics',
		unsure: 'Not sure yet'
	},
	timing: {
		asap: 'ASAP',
		'2-4-weeks': 'Within 2–4 weeks',
		planning: 'Still planning'
	},
	'contact-method': {
		phone: 'Phone',
		email: 'Email',
		whatsapp: 'WhatsApp'
	}
};

function fieldValuesByKey(fields: LeadRequestField[]): Map<string, string> {
	return new Map(fields.map((field) => [field.key, field.value]));
}

function fieldSummary(fields: LeadRequestField[]): string {
	return fields
		.map((field) => formatLeadRequestValue(field.key, field.value))
		.filter(Boolean)
		.join(' · ');
}

function groupSummary(key: LeadRequestGroupKey, fields: LeadRequestField[]): string {
	const values = fieldValuesByKey(fields);

	if (key === 'measurements') {
		const width = values.get('width');
		const height = values.get('height');
		const dimensions = [width, height]
			.filter(Boolean)
			.map((value) => formatLeadRequestValue('width', value ?? ''))
			.join(' × ');
		const openings = values.get('openings');
		const openingSummary = openings ? openings + ' opening' + (openings === '1' ? '' : 's') : '';
		return [dimensions, openingSummary].filter(Boolean).join(' · ');
	}

	if (key === 'follow-up') {
		return fieldSummary(
			fields.filter((field) => ['installation', 'timing', 'contact-method'].includes(field.key))
		);
	}

	return fieldSummary(fields);
}

function parseSegment(segment: string): { label: string; value: string } | null {
	const separatorIndex = segment.indexOf(':');
	if (separatorIndex < 0) return null;

	return {
		label: segment.slice(0, separatorIndex).trim(),
		value: segment.slice(separatorIndex + 1).trim()
	};
}

function appendNote(notes: string[], value: string) {
	const trimmed = value.trim();
	if (trimmed) notes.push(trimmed);
}

export function parseLeadRequestMessage(
	message: string | null | undefined
): ParsedLeadRequestMessage {
	const fallbackMessage = message?.trim() ?? '';
	if (!fallbackMessage) {
		return {
			hasStructuredFields: false,
			fallbackMessage: '',
			notes: '',
			groups: []
		};
	}

	const fieldsByKey = new Map<string, LeadRequestField>();
	const noteParts: string[] = [];
	let hasKnownField = false;

	for (const segment of fallbackMessage.split(/\s*\|\s*/)) {
		const parsed = parseSegment(segment);
		if (!parsed) {
			appendNote(noteParts, segment);
			continue;
		}

		const definition = knownLabels.get(parsed.label.toLowerCase());
		if (!definition) {
			appendNote(noteParts, segment);
			continue;
		}

		if (!parsed.value) continue;
		hasKnownField = true;

		const previous = fieldsByKey.get(definition.key);
		fieldsByKey.set(definition.key, {
			key: definition.key,
			label: definition.label,
			value: previous ? previous.value + ', ' + parsed.value : parsed.value
		});
	}

	const notes = fieldsByKey.get('notes')?.value ?? '';
	if (notes) {
		fieldsByKey.delete('notes');
		noteParts.unshift(notes);
	}

	const groups = groupDefinitions
		.map((groupDefinition) => {
			const fields = fieldDefinitions
				.filter((definition) => definition.group === groupDefinition.key)
				.map((definition) => fieldsByKey.get(definition.key))
				.filter((field): field is LeadRequestField => Boolean(field));

			if (groupDefinition.key === 'notes' && hasKnownField && noteParts.length > 0) {
				fields.push({ key: 'notes', label: 'Notes', value: noteParts.join(' | ') });
			}

			if (fields.length === 0) return null;

			return {
				key: groupDefinition.key,
				title: groupDefinition.title,
				fields,
				summary:
					groupDefinition.key === 'notes'
						? noteParts.join(' | ')
						: groupSummary(groupDefinition.key, fields)
			};
		})
		.filter((group): group is LeadRequestGroup => Boolean(group));

	const hasStructuredFields = hasKnownField;
	return {
		hasStructuredFields,
		fallbackMessage: hasStructuredFields ? '' : fallbackMessage,
		notes: hasKnownField ? noteParts.join(' | ') : '',
		groups
	};
}

export function extractLeadMeasurements(parsed: ParsedLeadRequestMessage): {
	width: string | null;
	height: string | null;
	openings: string | null;
} {
	const fields = new Map(
		parsed.groups.flatMap((group) => group.fields).map((field) => [field.key, field.value])
	);
	return {
		width: fields.get('width') ?? null,
		height: fields.get('height') ?? null,
		openings: fields.get('openings') ?? null
	};
}

export function formatLeadRequestValue(key: string, value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';

	const explicitValue = displayValues[key]?.[trimmed.toLowerCase()];
	if (explicitValue) return explicitValue;

	if (key === 'width' || key === 'height') {
		return /(?:\s|^)mm$/i.test(trimmed) ? trimmed : trimmed + ' mm';
	}

	if (trimmed.includes('-') || trimmed.includes('_')) {
		return trimmed
			.replace(/[-_]+/g, ' ')
			.replace(/\s+/g, ' ')
			.replace(/^[a-z]/, (character) => character.toUpperCase());
	}

	return trimmed;
}

export function shouldExpandLeadRequestDetails(input: {
	createdAt: string;
	lastActivityAt: string | null;
	pipelineStage: string;
	now?: number;
	recentDays?: number;
}): boolean {
	if (input.pipelineStage === 'WON' || input.pipelineStage === 'LOST') return false;

	const now = input.now ?? Date.now();
	const recentDays =
		Number.isFinite(input.recentDays) && (input.recentDays ?? 0) > 0
			? (input.recentDays ?? 14)
			: 14;
	const referenceDate = Date.parse(input.lastActivityAt || input.createdAt);
	if (!Number.isFinite(referenceDate)) return true;

	return now - referenceDate <= recentDays * 24 * 60 * 60 * 1000;
}
