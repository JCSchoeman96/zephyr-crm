import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { canManageProducts, normalizeProductInput, type ProductInput } from '$lib/server/products';
import { requireActiveStaff } from '$lib/server/require-auth';

function formValues(form: FormData, includeDimensionFields = false): Record<string, string> {
	const names = [
		'product_code',
		'name',
		'kind',
		'category_id',
		'unit_label',
		'currency',
		'unit_price',
		'customer_description',
		'internal_notes',
		'taxable',
		'dimensions_enabled',
		'dimension_definitions'
	];
	const values = Object.fromEntries(names.map((name) => [name, String(form.get(name) ?? '')]));
	if (!includeDimensionFields) {
		delete values.dimensions_enabled;
		delete values.dimension_definitions;
	}
	return values;
}

function inputFromForm(form: FormData): ProductInput {
	return {
		productCode: String(form.get('product_code') ?? ''),
		name: String(form.get('name') ?? ''),
		customerDescription: String(form.get('customer_description') ?? ''),
		internalNotes: String(form.get('internal_notes') ?? ''),
		kind: String(form.get('kind') ?? ''),
		categoryId: String(form.get('category_id') ?? '').trim() || null,
		unitLabel: String(form.get('unit_label') ?? ''),
		currency: String(form.get('currency') ?? ''),
		unitPrice: String(form.get('unit_price') ?? ''),
		taxable: form.get('taxable') === 'on',
		dimensionsEnabled: form.get('dimensions_enabled') === 'on',
		dimensionDefinitions: String(form.get('dimension_definitions') ?? '[]')
	};
}

function failure(cause: unknown, fallback: string, values: Record<string, string>) {
	const details = actionFailureDetails(cause, fallback);
	logActionFailure(cause, details.code);
	return fail(details.status, { message: details.message, code: details.code, values });
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

async function saveProduct(event: Parameters<NonNullable<Actions['save']>>[0], activate: boolean) {
	const { supabase, profile } = await requireActiveStaff(event);
	if (!canManageProducts(profile.role))
		return fail(403, { message: 'Viewer access is read-only.' });
	const form = await event.request.formData();
	const values = formValues(form, true);
	let productId: string;
	try {
		const input = normalizeProductInput(inputFromForm(form));
		const response = await supabase.rpc('create_product', {
			p_product_code: input.productCode,
			p_name: input.name,
			p_customer_description: input.customerDescription,
			p_internal_notes: input.internalNotes,
			p_kind: input.kind,
			p_category_id: input.categoryId,
			p_unit_label: input.unitLabel,
			p_currency: input.currency,
			p_unit_price: input.unitPrice,
			p_taxable: input.taxable,
			p_dimensions_enabled: input.dimensionsEnabled,
			p_dimension_definitions: input.dimensionDefinitions
		} as never);
		if (response.error) return failure(response.error, 'Could not create Product', values);
		const created = record(response.data);
		productId = String(created.product_id ?? '');
		if (!productId)
			return failure(
				new Error('Product was created without an identifier'),
				'Could not create Product',
				values
			);
		if (activate) {
			const activated = await supabase.rpc('activate_product', {
				p_product_id: productId,
				p_lock_version: Number(created.lock_version ?? 1)
			});
			if (activated.error) return failure(activated.error, 'Could not activate Product', values);
		}
	} catch (actionError) {
		return failure(
			actionError,
			activate ? 'Could not save and activate Product' : 'Could not save Product',
			values
		);
	}
	throw redirect(303, `/products/${productId}`);
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	if (!canManageProducts(profile.role))
		throw error(403, 'Only Owners and Admins can create Products.');
	const categoriesResponse = await supabase
		.from('product_categories')
		.select('*')
		.eq('status', 'active')
		.order('sort_order', { ascending: true })
		.order('label', { ascending: true })
		.limit(100);
	if (categoriesResponse.error) throw error(500, 'Could not load Product categories');
	return { categories: categoriesResponse.data ?? [], profile };
};

export const actions: Actions = {
	save: (event) => saveProduct(event, false),
	saveAndActivate: (event) => saveProduct(event, true)
};
