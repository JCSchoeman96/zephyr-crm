import type { DimensionKey } from '$lib/domain/products/dimensions';
import type { QuoteEditorItem } from './quote-editor-types';

export function quoteEditorItemKey(item: Pick<QuoteEditorItem, 'id' | 'editorKey'>, index = 0) {
	return item.id ?? item.editorKey ?? `new-${index}`;
}

export function isDimensionalQuoteItem(item: QuoteEditorItem) {
	return item.source_type === 'catalogue' && Boolean(item.dimensions?.length);
}

export function missingRequiredDimensions(item: QuoteEditorItem) {
	return (item.dimensions ?? []).filter((dimension) => dimension.required && !dimension.value);
}

export function dimensionSummary(item: QuoteEditorItem) {
	const dimensions = item.dimensions ?? [];
	if (!dimensions.length) return 'No measurements';
	return dimensions
		.map(
			(dimension) =>
				`${dimension.label}: ${dimension.value ? `${dimension.value} ${dimension.unit}` : 'Missing'}`
		)
		.join(' · ');
}

export function updateQuoteItemDimension(
	item: QuoteEditorItem,
	key: DimensionKey,
	value: string | null
): QuoteEditorItem {
	if (!item.dimensions?.some((dimension) => dimension.key === key)) return item;
	return {
		...item,
		dimensions: item.dimensions.map((dimension) =>
			dimension.key === key ? { ...dimension, value } : dimension
		)
	};
}
