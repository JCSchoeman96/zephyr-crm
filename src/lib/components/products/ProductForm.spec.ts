import { describe, expect, it } from 'vitest';
import {
	initializeProductDimensions,
	parseProductDimensions,
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
			definitions: [height, width]
		});
		expect(initializeProductDimensions('product', 'on', JSON.stringify([width]))).toEqual({
			enabled: true,
			definitions: [width]
		});
		expect(initializeProductDimensions('service', true, JSON.stringify([width]))).toEqual({
			enabled: false,
			definitions: []
		});
	});
});
