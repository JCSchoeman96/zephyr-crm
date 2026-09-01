import {
	normalizeDimensionDefinitions,
	type DimensionDefinition
} from '$lib/domain/products/dimensions';

export function serializeProductDimensions(
	kind: string,
	dimensionsEnabled: boolean,
	definitions: readonly DimensionDefinition[]
): string {
	if (kind.trim().toLowerCase() === 'service' || !dimensionsEnabled) return '[]';
	return JSON.stringify(
		definitions.map(({ key, label, unit, required }) => ({ key, label, unit, required }))
	);
}

export function productDimensionsFieldValue(
	kind: string,
	dimensionsEnabled: boolean,
	definitions: readonly DimensionDefinition[],
	preservedSerializedDefinitions: string | null = null
): string {
	return (
		preservedSerializedDefinitions ??
		serializeProductDimensions(kind, dimensionsEnabled, definitions)
	);
}

function checkboxValue(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value !== 'string') return false;
	return ['on', 'true', '1'].includes(value.trim().toLowerCase());
}

export function parseProductDimensions(
	kind: string,
	dimensionsEnabled: boolean,
	input: unknown
): DimensionDefinition[] {
	if (kind.trim().toLowerCase() === 'service' || !dimensionsEnabled) return [];

	try {
		return normalizeDimensionDefinitions({
			kind: kind.trim().toLowerCase(),
			dimensionsEnabled,
			dimensionDefinitions: input
		});
	} catch {
		return [];
	}
}

export function initializeProductDimensions(
	kind: string,
	enabledInput: unknown,
	definitionsInput: unknown,
	preserveSerializedInput = false
): {
	enabled: boolean;
	definitions: DimensionDefinition[];
	preservedSerializedDefinitions: string | null;
} {
	const normalizedKind = kind.trim().toLowerCase();
	const enabled = normalizedKind !== 'service' && checkboxValue(enabledInput);
	return {
		enabled,
		definitions: parseProductDimensions(normalizedKind, enabled, definitionsInput),
		preservedSerializedDefinitions:
			preserveSerializedInput &&
			normalizedKind !== 'service' &&
			typeof definitionsInput === 'string'
				? definitionsInput
				: null
	};
}
