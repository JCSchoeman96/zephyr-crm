import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { canManageProducts } from '$lib/server/products';
import { requireActiveStaff } from '$lib/server/require-auth';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CategoryValidationError extends Error {
	readonly status = 422;

	constructor(message: string) {
		super(message);
		this.name = 'CategoryValidationError';
	}
}

function categoryId(form: FormData): string {
	const value = String(form.get('category_id') ?? '').trim();
	if (!uuidPattern.test(value)) throw new Error('A valid Product category is required');
	return value;
}

function lockVersion(form: FormData): number {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid Product category lock_version is required');
	return value;
}

function requiredText(form: FormData, name: string, label: string, maxLength: number): string {
	const value = String(form.get(name) ?? '').trim();
	if (!value) throw new CategoryValidationError(`${label} is required`);
	if (value.length > maxLength) throw new CategoryValidationError(`${label} is too long`);
	return value;
}

function sortOrder(form: FormData): number {
	const rawValue = String(form.get('sort_order') ?? '').trim();
	if (!/^\d+$/.test(rawValue))
		throw new CategoryValidationError('Category sort order must be a nonnegative integer');
	const value = Number(rawValue);
	if (!Number.isSafeInteger(value))
		throw new CategoryValidationError('Category sort order is too large');
	return value;
}

function requiredReason(form: FormData): string {
	const reason = String(form.get('reason') ?? '').trim();
	if (!reason) throw new CategoryValidationError('An inactivation reason is required');
	if (reason.length > 2000) throw new CategoryValidationError('Inactivation reason is too long');
	return reason;
}

function formValues(form: FormData): Record<string, string> {
	const names = ['category_id', 'lock_version', 'code', 'label', 'sort_order', 'reason'];
	return Object.fromEntries(
		names.filter((name) => form.has(name)).map((name) => [name, String(form.get(name) ?? '')])
	);
}

function isUniqueViolation(cause: unknown): boolean {
	if (!cause || typeof cause !== 'object') return false;
	return (cause as { code?: unknown }).code === '23505';
}

function failure(cause: unknown, fallback: string, values?: Record<string, string>) {
	const details = actionFailureDetails(cause, fallback);
	logActionFailure(cause, details.code);
	return fail(details.status, { message: details.message, code: details.code, values });
}

function categoryMutationFailure(cause: unknown, fallback: string, values: Record<string, string>) {
	const actionError = isUniqueViolation(cause)
		? new CategoryValidationError('Product category code is already in use. Choose a unique code.')
		: cause;
	return failure(actionError, fallback, values);
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	if (!canManageProducts(profile.role))
		throw error(403, 'Only Owners and Admins can manage Product categories.');

	const categoriesResponse = await supabase
		.from('product_categories')
		.select('*')
		.order('sort_order', { ascending: true })
		.order('label', { ascending: true })
		.limit(100);
	if (categoriesResponse.error) throw error(500, 'Could not load Product categories');
	return { categories: categoriesResponse.data ?? [], profile };
};

async function requireCategoryManager(event: Parameters<NonNullable<Actions['create']>>[0]) {
	const { supabase, profile } = await requireActiveStaff(event);
	if (!canManageProducts(profile.role)) return null;
	return { supabase };
}

export const actions: Actions = {
	create: async (event) => {
		const manager = await requireCategoryManager(event);
		if (!manager) return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		const values = formValues(form);
		try {
			const response = await manager.supabase.rpc('create_product_category', {
				p_code: requiredText(form, 'code', 'Category code', 80),
				p_label: requiredText(form, 'label', 'Category label', 200),
				p_sort_order: sortOrder(form)
			} as never);
			if (response.error)
				return categoryMutationFailure(response.error, 'Could not create Product category', values);
		} catch (actionError) {
			return categoryMutationFailure(actionError, 'Could not create Product category', values);
		}
		throw redirect(303, '/products/categories');
	},
	update: async (event) => {
		const manager = await requireCategoryManager(event);
		if (!manager) return fail(403, { message: 'Viewer access is read-only.' });
		const form = await event.request.formData();
		const values = formValues(form);
		try {
			const response = await manager.supabase.rpc('update_product_category', {
				p_category_id: categoryId(form),
				p_lock_version: lockVersion(form),
				p_code: requiredText(form, 'code', 'Category code', 80),
				p_label: requiredText(form, 'label', 'Category label', 200),
				p_sort_order: sortOrder(form)
			} as never);
			if (response.error)
				return categoryMutationFailure(response.error, 'Could not update Product category', values);
		} catch (actionError) {
			return categoryMutationFailure(actionError, 'Could not update Product category', values);
		}
		throw redirect(303, '/products/categories');
	},
	activate: (event) => transition(event, 'activate_product_category'),
	inactivate: (event) => transition(event, 'inactivate_product_category')
};

async function transition(
	event: Parameters<NonNullable<Actions['activate']>>[0],
	functionName: 'activate_product_category' | 'inactivate_product_category'
) {
	const manager = await requireCategoryManager(event);
	if (!manager) return fail(403, { message: 'Viewer access is read-only.' });
	const form = await event.request.formData();
	const values = formValues(form);
	try {
		const response = await manager.supabase.rpc(functionName, {
			p_category_id: categoryId(form),
			p_lock_version: lockVersion(form),
			...(functionName === 'inactivate_product_category' ? { p_reason: requiredReason(form) } : {})
		} as never);
		if (response.error)
			return failure(response.error, 'Could not change Product category status', values);
	} catch (actionError) {
		return failure(actionError, 'Could not change Product category status', values);
	}
	throw redirect(303, '/products/categories');
}
