import { describe, expect, it } from 'vitest';
import {
	initializeProductDimensions,
	parseProductDimensions,
	productDimensionsFieldValue,
	serializeProductDimensions
} from './product-form';

const width = { key: 'width', label: 'Width', unit: 'mm', required: true } as const;
const height = { key: 'height', label: 'Height', unit: 'mm', required: false } as const;

describe('ProductForm dimension serialization', () => {
	it('preserves the editor order and metadata for create and edit submissions', () => {
		const serialized = serializeProductDimensions('product', true, [height, width]);

		expect(serialized).toBe(
			'[{"key":"height","label":"Height","unit":"mm","required":false},{"key":"width","label":"Width","unit":"mm","required":true}]'
		);
		expect(parseProductDimensions('product', true, serialized)).toEqual([height, width]);
	});

	it('serializes disabled and service measurements as an empty list', () => {
		expect(serializeProductDimensions('product', false, [width])).toBe('[]');
		expect(serializeProductDimensions('service', true, [width])).toBe('[]');
		expect(parseProductDimensions('service', true, JSON.stringify([width]))).toEqual([]);
	});

	it('initializes persisted and failed-form dimension values without exposing service dimensions', () => {
		expect(initializeProductDimensions('product', true, JSON.stringify([height, width]))).toEqual({
			enabled: true,
			definitions: [height, width],
			preservedSerializedDefinitions: null
		});
		expect(initializeProductDimensions('product', 'on', JSON.stringify([width]))).toEqual({
			enabled: true,
			definitions: [width],
			preservedSerializedDefinitions: null
		});
		expect(initializeProductDimensions('service', true, JSON.stringify([width]))).toEqual({
			enabled: false,
			definitions: [],
			preservedSerializedDefinitions: null
		});
	});

	it('retains invalid failed-form payloads until the measurement editor changes', () => {
		const invalidPayload = '[{"key":"width","label":';
		const initialized = initializeProductDimensions('product', 'on', invalidPayload, true);

		expect(initialized.definitions).toEqual([]);
		expect(initialized.preservedSerializedDefinitions).toBe(invalidPayload);
		expect(
			productDimensionsFieldValue(
				'product',
				initialized.enabled,
				initialized.definitions,
				initialized.preservedSerializedDefinitions
			)
		).toBe(invalidPayload);
		expect(productDimensionsFieldValue('product', true, [width], null)).toBe(
			JSON.stringify([width])
		);
	});

	it('keeps valid failed-form definitions editable and preserves their submitted spelling', () => {
		const submittedPayload = ` ${JSON.stringify([height, width])} `;
		const initialized = initializeProductDimensions('product', 'on', submittedPayload, true);

		expect(initialized.definitions).toEqual([height, width]);
		expect(initialized.preservedSerializedDefinitions).toBe(submittedPayload);

		const editedDefinitions = initialized.definitions.map((definition) => ({ ...definition }));
		editedDefinitions[0].label = 'Customer height';
		expect(productDimensionsFieldValue('product', true, editedDefinitions, null)).toBe(
			JSON.stringify([{ ...height, label: 'Customer height' }, width])
		);
	});
});
