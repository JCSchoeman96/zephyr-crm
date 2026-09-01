export const DIMENSION_KEYS = ['width', 'height', 'length', 'depth'] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type DimensionDefinition = {
	key: DimensionKey;
	label: string;
	unit: 'mm';
	required: boolean;
};

export type DimensionValue = DimensionDefinition & {
	value: string | null;
};

export type DimensionConfiguration = {
	kind?: string;
	dimensionsEnabled?: boolean;
	dimensionDefinitions?: unknown;
};

const dimensionKeys = new Set<string>(DIMENSION_KEYS);
const definitionFields = new Set(['key', 'label', 'unit', 'required']);
const configurationFields = new Set([
	'kind',
	'enabled',
	'dimensionsEnabled',
	'dimensions_enabled',
	'dimensionDefinitions',
	'dimension_definitions',
	'definitions'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: unknown, label: string): unknown {
	if (typeof value !== 'string') return value;

	const text = value.trim();
	if (!text) throw new Error(`${label} must be valid JSON`);

	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`${label} must be valid JSON`);
	}
}

function booleanValue(value: unknown, label: string): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
		if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
	}
	throw new Error(`${label} must be a boolean`);
}

function normalizedDefinition(value: unknown, index: number): DimensionDefinition {
	if (!isRecord(value)) throw new Error(`Dimension definition ${index + 1} is invalid`);

	for (const field of Object.keys(value)) {
		if (!definitionFields.has(field)) {
			throw new Error(`Unknown dimension definition field: ${field}`);
		}
	}

	const key = typeof value.key === 'string' ? value.key.trim() : '';
	if (!dimensionKeys.has(key)) throw new Error(`Unknown dimension key: ${key || '(missing)'}`);

	const label = typeof value.label === 'string' ? value.label.trim() : '';
	if (!label) throw new Error(`Dimension label for ${key} is required`);

	const unit = typeof value.unit === 'string' ? value.unit.trim() : '';
	if (unit !== 'mm') throw new Error(`Dimension unit for ${key} must be mm`);

	return {
		key: key as DimensionKey,
		label,
		unit: 'mm',
		required: booleanValue(value.required, `Dimension required flag for ${key}`)
	};
}

function normalizeDefinitionArray(input: unknown, allowEmpty: boolean): DimensionDefinition[] {
	const definitions = parseJson(input, 'Dimension definitions');
	if (!Array.isArray(definitions)) throw new Error('Dimension definitions must be an array');
	if (definitions.length > DIMENSION_KEYS.length) {
		throw new Error(`Dimension definitions cannot exceed ${DIMENSION_KEYS.length} entries`);
	}
	if (!allowEmpty && definitions.length === 0) {
		throw new Error('At least one dimension definition is required when dimensions are enabled');
	}

	const seen = new Set<DimensionKey>();
	return definitions.map((definition, index) => {
		const normalized = normalizedDefinition(definition, index);
		if (seen.has(normalized.key)) {
			throw new Error(`Duplicate dimension key: ${normalized.key}`);
		}
		seen.add(normalized.key);
		return normalized;
	});
}

function configurationValue(
	configuration: Record<string, unknown>,
	keys: string[],
	label: string
): unknown {
	const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(configuration, key));
	if (present.length > 1) throw new Error(`${label} must use one configuration field`);
	return present.length === 1 ? configuration[present[0]] : undefined;
}

export function normalizeDimensionDefinitions(input: unknown): DimensionDefinition[] {
	const parsed = parseJson(input, 'Dimension definitions');
	if (Array.isArray(parsed)) return normalizeDefinitionArray(parsed, true);
	if (!isRecord(parsed))
		throw new Error('Dimension definitions must be an array or configuration object');
	if (Object.keys(parsed).length === 0) {
		throw new Error('Dimension definitions must be an array or configuration object');
	}
	if (Object.keys(parsed).some((field) => definitionFields.has(field))) {
		throw new Error('Dimension definitions must be an array or configuration object');
	}

	for (const field of Object.keys(parsed)) {
		if (!configurationFields.has(field)) {
			throw new Error(`Unknown dimension configuration field: ${field}`);
		}
	}

	const kindInput = parsed.kind;
	const kind = kindInput === undefined ? undefined : String(kindInput).trim().toLowerCase();
	if (kind !== undefined && kind !== 'product' && kind !== 'service') {
		throw new Error('Product kind is invalid for dimensions');
	}
	const definitionsInput = configurationValue(
		parsed,
		['dimensionDefinitions', 'dimension_definitions', 'definitions'],
		'Dimension definitions'
	);
	const hasDefinitionsField = ['dimensionDefinitions', 'dimension_definitions', 'definitions'].some(
		(field) => Object.prototype.hasOwnProperty.call(parsed, field)
	);
	const definitions = normalizeDefinitionArray(hasDefinitionsField ? definitionsInput : [], true);
	const enabledInput = configurationValue(
		parsed,
		['dimensionsEnabled', 'dimensions_enabled', 'enabled'],
		'Dimensions enabled'
	);
	const enabled =
		enabledInput === undefined
			? definitions.length > 0
			: booleanValue(enabledInput, 'Dimensions enabled');

	if (kind === 'service' && (enabled || definitions.length > 0)) {
		throw new Error('Services cannot use dimensions');
	}
	if (!enabled) {
		if (definitions.length > 0) {
			throw new Error('Disabled products cannot have dimension definitions');
		}
		return [];
	}

	if (definitions.length === 0) {
		throw new Error('At least one dimension definition is required when dimensions are enabled');
	}
	return definitions;
}

function canonicalDecimal(text: string): string {
	const [whole, fraction] = text.split('.');
	const normalizedWhole = whole.replace(/^0+/, '') || '0';
	const normalizedFraction = (fraction ?? '').replace(/0+$/, '');
	return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

export function normalizeDimensionValue(input: unknown): string | null {
	if (input === null) return null;

	const text =
		typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : '';
	if (!text || !/^\d+(?:\.\d+)?$/.test(text)) {
		throw new Error('Dimension value must be a positive decimal or null');
	}

	const normalized = canonicalDecimal(text);
	if (normalized === '0') throw new Error('Dimension value must be greater than zero');
	return normalized;
}

export function buildDimensionSnapshot(
	definitions: DimensionDefinition[],
	values: Record<string, unknown> = {}
): DimensionValue[] {
	const normalizedDefinitions = normalizeDimensionDefinitions(definitions);
	if (!isRecord(values)) throw new Error('Dimension values must be an object');

	const allowedKeys = new Set<string>(normalizedDefinitions.map((definition) => definition.key));
	for (const key of Object.keys(values)) {
		if (!allowedKeys.has(key)) throw new Error(`Unknown dimension value key: ${key}`);
	}

	return normalizedDefinitions.map((definition) => ({
		...definition,
		value: Object.prototype.hasOwnProperty.call(values, definition.key)
			? normalizeDimensionValue(values[definition.key])
			: null
	}));
}
