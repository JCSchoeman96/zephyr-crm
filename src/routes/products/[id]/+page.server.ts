import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import {
	canManageProducts,
	normalizeProductInput,
	normalizeProductPrice,
	type ProductInput
} from '$lib/server/products';
import { requireActiveStaff } from '$lib/server/require-auth';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function productId(value: string) {
	if (!uuidPattern.test(value)) throw error(404, 'Product not found');
	return value;
}

function lockVersion(form: FormData) {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid Product lock_version is required');
	return value;
}

function optionalReason(form: FormData) {
	return String(form.get('reason') ?? '').trim() || undefined;
}

function requiredReason(form: FormData) {
	const reason = String(form.get('reason') ?? '').trim();
	if (!reason) throw new Error('A reason is required');
	return reason;
}

function formValues(form: FormData): Record<string, string> {
	const names = [
		'lock_version',
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
		'reason'
	];
	return Object.fromEntries(names.map((name) => [name, String(form.get(name) ?? '')]));
}

function failure(cause: unknown, fallback: string, values?: Record<string, string>) {
	const details = actionFailureDetails(cause, fallback);
	logActionFailure(cause, details.code);
	return fail(details.status, { message: details.message, code: details.code, values });
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
		unitPrice: String(form.get('unit_price') ?? '0'),
		taxable: form.get('taxable') === 'on'
	};
}

export const load: PageServerLoad = async (event) => {
	const id = productId(event.params.id);
	const { supabase, profile } = await requireActiveStaff(event);
	const productResponse = await supabase.from('products').select('*').eq('id', id).maybeSingle();
	if (productResponse.error) throw error(500, 'Could not load Product details');
	if (!productResponse.data) throw error(404, 'Product not found');

	const [categoriesResponse, activitiesResponse] = await Promise.all([
		supabase
			.from('product_categories')
			.select('*')
			.order('sort_order', { ascending: true })
			.order('label', { ascending: true })
			.limit(100),
		supabase
			.from('activities')
			.select('*')
			.eq('product_id', id)
			.order('occurred_at', { ascending: false })
			.limit(100)
	]);
	if (categoriesResponse.error || activitiesResponse.error)
		throw error(500, 'Could not load Product history');

	return {
		product: productResponse.data,
		categories: categoriesResponse.data ?? [],
		activities: activitiesResponse.data ?? [],
		profile
	};
};

export const actions: Actions = {
	update: async (event) => {
		const id = productId(event.params.id);
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canManageProducts(profile.role))
			return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		const values = formValues(form);
		try {
			const input = normalizeProductInput(inputFromForm(form));
			const response = await supabase.rpc('update_product', {
				p_product_id: id,
				p_lock_version: lockVersion(form),
				p_product_code: input.productCode,
				p_name: input.name,
				p_customer_description: input.customerDescription ?? undefined,
				p_internal_notes: input.internalNotes ?? undefined,
				p_kind: input.kind,
				p_category_id: input.categoryId ?? undefined,
				p_unit_label: input.unitLabel,
				p_currency: input.currency,
				p_taxable: input.taxable
			} as never);
			if (response.error) return failure(response.error, 'Could not update Product', values);
		} catch (actionError) {
			return failure(actionError, 'Could not update Product', values);
		}
		throw redirect(303, `/products/${id}`);
	},
	price: async (event) => {
		const id = productId(event.params.id);
		const { supabase, profile } = await requireActiveStaff(event);
		if (!canManageProducts(profile.role))
			return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		const values = formValues(form);
		try {
			const response = await supabase.rpc('change_product_price', {
				p_product_id: id,
				p_lock_version: lockVersion(form),
				p_unit_price: normalizeProductPrice(String(form.get('unit_price') ?? '')),
				p_reason: optionalReason(form)
			} as never);
			if (response.error) return failure(response.error, 'Could not change Product price', values);
		} catch (actionError) {
			return failure(actionError, 'Could not change Product price', values);
		}
		throw redirect(303, `/products/${id}`);
	},
	activate: async (event) => transition(event, 'activate_product', false),
	inactivate: async (event) => transition(event, 'inactivate_product', false),
	archive: async (event) => transition(event, 'archive_product', true),
	restore: async (event) => transition(event, 'restore_product', true)
};

async function transition(
	event: Parameters<NonNullable<Actions['activate']>>[0],
	functionName: 'activate_product' | 'inactivate_product' | 'archive_product' | 'restore_product',
	reasonRequired: boolean
) {
	const id = productId(event.params.id);
	const { supabase, profile } = await requireActiveStaff(event);
	if (!canManageProducts(profile.role))
		return fail(403, { message: 'Viewer access is read-only.' });
	const form = await event.request.formData();
	const values = formValues(form);
	try {
		const response = await supabase.rpc(functionName, {
			p_product_id: id,
			p_lock_version: lockVersion(form),
			...(functionName === 'activate_product'
				? {}
				: { p_reason: reasonRequired ? requiredReason(form) : optionalReason(form) })
		} as never);
		if (response.error) return failure(response.error, 'Could not change Product status', values);
	} catch (actionError) {
		return failure(actionError, 'Could not change Product status', values);
	}
	throw redirect(303, `/products/${id}`);
}
