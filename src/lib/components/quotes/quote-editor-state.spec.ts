import { describe, expect, it } from 'vitest';
import type { DimensionValue } from '$lib/domain/products/dimensions';
import type { QuoteEditorItem } from './quote-editor-types';
import {
	dimensionSummary,
	isDimensionalQuoteItem,
	missingRequiredDimensions,
	quoteEditorItemKey,
	updateQuoteItemDimension
} from './quote-editor-state';

const dimensions: DimensionValue[] = [
	{ key: 'width', label: 'Width', unit: 'mm', required: true, value: '1500' },
	{ key: 'height', label: 'Height', unit: 'mm', required: true, value: null },
	{ key: 'depth', label: 'Depth', unit: 'mm', required: false, value: '80' }
];

function catalogueItem(overrides: Partial<QuoteEditorItem> = {}): QuoteEditorItem {
	return {
		name: 'Blockout Blinds',
		description: '',
		quantity: '1',
		unit_price: '1400',
		taxable: true,
		source_type: 'catalogue',
		dimensions,
		...overrides
	};
}

describe('quote editor state', () => {
	it('uses the persisted id before the temporary editor key', () => {
		expect(quoteEditorItemKey({ ...catalogueItem(), id: 'item-1', editorKey: 'new-1' }, 0)).toBe(
			'item-1'
		);
		expect(quoteEditorItemKey({ ...catalogueItem(), editorKey: 'new-1' }, 0)).toBe('new-1');
		expect(quoteEditorItemKey(catalogueItem(), 3)).toBe('new-3');
	});

	it('recognizes only catalogue items with configured dimensions', () => {
		expect(isDimensionalQuoteItem(catalogueItem())).toBe(true);
		expect(isDimensionalQuoteItem(catalogueItem({ source_type: 'custom' }))).toBe(false);
		expect(isDimensionalQuoteItem(catalogueItem({ dimensions: [] }))).toBe(false);
	});

	it('summarizes entered and missing measurements for collapsed rows', () => {
		expect(dimensionSummary(catalogueItem())).toBe(
			'Width: 1500 mm · Height: Missing · Depth: 80 mm'
		);
		expect(missingRequiredDimensions(catalogueItem()).map((dimension) => dimension.label)).toEqual([
			'Height'
		]);
	});

	it('updates one measurement without changing the other line fields', () => {
		const item = catalogueItem();
		const updated = updateQuoteItemDimension(item, 'height', '1200');

		expect(updated).toMatchObject({
			name: item.name,
			quantity: '1',
			unit_price: '1400',
			taxable: true
		});
		expect(updated.dimensions?.map((dimension) => dimension.value)).toEqual(['1500', '1200', '80']);
		expect(item.dimensions?.[1].value).toBeNull();
	});
});
