import { describe, expect, it } from 'vitest';
import {
	buildDimensionSnapshot,
	DIMENSION_KEYS,
	normalizeDimensionDefinitions,
	normalizeDimensionValue,
	type DimensionDefinition
} from './dimensions';

const width = {
	key: 'width',
	label: 'Width',
	unit: 'mm',
	required: true
} as const satisfies DimensionDefinition;
const height = {
	key: 'height',
	label: 'Height',
	unit: 'mm',
	required: true
} as const satisfies DimensionDefinition;

describe('product dimension contract', () => {
	it('normalizes ordered definitions from form JSON without changing their order', () => {
		expect(
			normalizeDimensionDefinitions(
				JSON.stringify([
					{ key: 'height', label: ' Height ', unit: ' mm ', required: 'true' },
					{ key: 'width', label: ' Width ', unit: 'mm', required: false },
					{ key: 'length', label: 'Length', unit: 'mm', required: 'false' },
					{ key: 'depth', label: 'Depth', unit: 'mm', required: true }
				])
			)
		).toEqual([
			{ key: 'height', label: 'Height', unit: 'mm', required: true },
			{ key: 'width', label: 'Width', unit: 'mm', required: false },
			{ key: 'length', label: 'Length', unit: 'mm', required: false },
			{ key: 'depth', label: 'Depth', unit: 'mm', required: true }
		]);
		expect(DIMENSION_KEYS).toEqual(['width', 'height', 'length', 'depth']);
	});

	it('allows a dimensionless product only when it is explicitly disabled', () => {
		expect(
			normalizeDimensionDefinitions({
				dimensionsEnabled: false,
				dimensionDefinitions: []
			})
		).toEqual([]);
		expect(
			normalizeDimensionDefinitions({
				kind: 'product',
				dimensionsEnabled: true,
				dimensionDefinitions: [width, height]
			})
		).toEqual([width, height]);

		expect(() =>
			normalizeDimensionDefinitions({
				dimensionsEnabled: false,
				dimensionDefinitions: [width]
			})
		).toThrow(/disabled/i);
	});

	it('rejects an unconfigured bare empty array while allowing an empty snapshot', () => {
		expect(() => normalizeDimensionDefinitions([])).toThrow(/at least one|enabled/i);
		expect(buildDimensionSnapshot([], {})).toEqual([]);
	});

	it('rejects dimensions for services', () => {
		expect(() =>
			normalizeDimensionDefinitions({
				kind: 'service',
				dimensionsEnabled: true,
				dimensionDefinitions: [width]
			})
		).toThrow(/service/i);
	});

	it('rejects non-string product kinds instead of coercing them', () => {
		expect(() =>
			normalizeDimensionDefinitions({
				kind: ['product'],
				dimensionsEnabled: true,
				dimensionDefinitions: [width]
			})
		).toThrow(/kind.*string|invalid/i);
	});

	it.each([
		['an unknown key', [{ ...width, key: 'angle' }], /unknown|key/i],
		['a duplicate key', [width, { ...height, key: 'width' }], /duplicate/i],
		['an invalid unit', [{ ...width, unit: 'cm' }], /unit/i],
		['an empty label', [{ ...width, label: '   ' }], /label/i],
		['an invalid required flag', [{ ...width, required: 'yes' }], /required/i]
	] as const)('rejects %s', (_reason, input, message) => {
		expect(() => normalizeDimensionDefinitions(input)).toThrow(message);
	});

	it('rejects more than four definitions before duplicate-key validation', () => {
		expect(() =>
			normalizeDimensionDefinitions([
				width,
				height,
				{ key: 'length', label: 'Length', unit: 'mm', required: false },
				{ key: 'depth', label: 'Depth', unit: 'mm', required: false },
				{ ...width, label: 'Second width' }
			])
		).toThrow('Dimension definitions cannot exceed 4 entries');
	});

	it('rejects malformed definition input instead of dropping it', () => {
		expect(() => normalizeDimensionDefinitions({})).toThrow(/array|definition/i);
		expect(() => normalizeDimensionDefinitions({ key: 'width', label: 'Width' })).toThrow(
			/array|definition/i
		);
		expect(() => normalizeDimensionDefinitions('[{"key":"width"}')).toThrow(/json|definition/i);
		expect(() =>
			normalizeDimensionDefinitions({ dimensionsEnabled: false, dimensionDefinitions: null })
		).toThrow(/array|definition/i);
	});

	it('normalizes positive values as canonical decimal strings and allows null drafts', () => {
		expect(normalizeDimensionValue(' 001500.00 ')).toBe('1500');
		expect(normalizeDimensionValue(0.5)).toBe('0.5');
		expect(normalizeDimensionValue(null)).toBeNull();
	});

	it.each(['0', '0.00', '-1', 'abc', '', '1e3'])(
		'rejects non-positive or malformed value %s',
		(value) => {
			expect(() => normalizeDimensionValue(value)).toThrow(/positive|decimal|dimension/i);
		}
	);

	it('builds an ordered snapshot with definition metadata and unmatched values as null', () => {
		expect(
			buildDimensionSnapshot(
				[
					{ ...width, label: 'Width' },
					{ ...height, required: false },
					{ key: 'length', label: 'Length', unit: 'mm', required: true }
				],
				{ width: '001500.00', height: null }
			)
		).toEqual([
			{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1500' },
			{ key: 'height', label: 'Height', unit: 'mm', required: false, value: null },
			{ key: 'length', label: 'Length', unit: 'mm', required: true, value: null }
		]);
	});

	it('rejects duplicate or unknown keys in a snapshot input', () => {
		expect(() => buildDimensionSnapshot([width, { ...height, key: 'width' }])).toThrow(
			/duplicate/i
		);
		expect(() => buildDimensionSnapshot([width], { width: '10', height: '20' })).toThrow(
			/unknown|dimension/i
		);
	});
});
