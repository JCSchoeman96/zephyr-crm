import type { DimensionValue } from '$lib/domain/products/dimensions';

export type QuoteEditorItem = {
	editorKey?: string;
	id?: string;
	name: string;
	description: string;
	quantity: string;
	unit_price: string;
	taxable: boolean;
	source_type?: string;
	product_id?: string | null;
	product_code_snapshot?: string | null;
	unit_label_snapshot?: string | null;
	catalogue_unit_price?: string | number | null;
	source_product_version?: number | null;
	source_product_reviewed_version?: number | null;
	current_product_lock_version?: number | null;
	product_lock_version?: number | null;
	is_stale?: boolean;
	dimensionsEnabled?: boolean;
	dimensions?: DimensionValue[];
	product_category_id_snapshot?: string | null;
	product_category_code_snapshot?: string | null;
	product_category_label_snapshot?: string | null;
};

export type QuoteLeadMeasurements = {
	width: string | null;
	height: string | null;
	openings: string | null;
};

export type QuoteLeadOption = {
	id: string;
	label: string;
	measurements?: QuoteLeadMeasurements;
};

export type QuoteEditorCategory = { id: string; label: string };
