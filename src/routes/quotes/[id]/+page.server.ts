import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { quoteFormValues } from '$lib/server/quote-form';
import { sendQuote } from '$lib/server/quote-actions';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { requireActiveStaff } from '$lib/server/require-auth';
import { buildQuotePresentationModel } from '$lib/domain/quotes/documents/presentation-model';

function actionFailure(errorValue: unknown, fallback = 'Could not complete Quote action') {
	const details = actionFailureDetails(errorValue, fallback);
	logActionFailure(errorValue, details.code);
	return fail(details.status, { message: details.message, code: details.code });
}

function lockVersion(form: FormData) {
	const value = Number(form.get('lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid quote lock version is required');
	return value;
}

function record(value: unknown) {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function productLockVersion(form: FormData) {
	const value = Number(form.get('product_lock_version'));
	if (!Number.isInteger(value) || value < 1)
		throw new Error('A valid Product lock version is required');
	return value;
}

function productId(form: FormData) {
	const value = String(form.get('product_id') ?? '').trim();
	if (!uuidPattern.test(value)) throw new Error('A valid Product is required');
	return value;
}

function quoteItemId(form: FormData) {
	const value = String(form.get('quote_item_id') ?? '').trim();
	if (!uuidPattern.test(value)) throw new Error('A valid Quote line is required');
	return value;
}

function text(value: unknown) {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function recipientFrom(lead: Record<string, unknown>, client: Record<string, unknown> | null) {
	if (client) {
		const address = [
			client.billing_address_line_1,
			client.billing_address_line_2,
			client.billing_city,
			client.billing_region,
			client.billing_postal_code,
			client.billing_country
		]
			.map(text)
			.filter(Boolean)
			.join('\n');
		return {
			name: text(client.display_name),
			company: text(client.company_name) || null,
			address,
			email: text(client.email) || null,
			phone: text(client.phone) || null
		};
	}
	return {
		name: `${text(lead.first_name)} ${text(lead.last_name)}`.trim(),
		company: text(lead.company) || null,
		address: '',
		email: text(lead.email) || null,
		phone: text(lead.phone) || null
	};
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const quoteResponse = await supabase
		.from('quotes')
		.select('*')
		.eq('id', event.params.id)
		.maybeSingle();
	if (quoteResponse.error) throw error(500, 'Could not load the quote');
	if (!quoteResponse.data) throw error(404, 'Quote not found');
	const [
		itemsResponse,
		leadResponse,
		clientResponse,
		activityResponse,
		outboundResponse,
		reasonsResponse,
		categoriesResponse
	] = await Promise.all([
		supabase
			.from('quote_items')
			.select('*')
			.eq('quote_id', event.params.id)
			.order('position')
			.limit(100),
		supabase.from('leads').select('*').eq('id', quoteResponse.data.lead_id).maybeSingle(),
		quoteResponse.data.client_id
			? supabase.from('clients').select('*').eq('id', quoteResponse.data.client_id).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		supabase
			.from('activities')
			.select('*')
			.eq('quote_id', event.params.id)
			.order('occurred_at', { ascending: false })
			.limit(50),
		supabase
			.from('outbound_messages')
			.select('*')
			.eq('quote_id', event.params.id)
			.order('created_at', { ascending: false })
			.limit(10),
		supabase
			.from('lost_reasons')
			.select('id,code,label')
			.eq('active', true)
			.order('sort_order')
			.limit(100),
		supabase
			.from('product_categories')
			.select('id,label')
			.eq('status', 'active')
			.order('sort_order', { ascending: true })
			.order('label', { ascending: true })
			.limit(100)
	]);
	if (
		itemsResponse.error ||
		leadResponse.error ||
		clientResponse.error ||
		activityResponse.error ||
		outboundResponse.error ||
		reasonsResponse.error ||
		categoriesResponse.error
	)
		throw error(500, 'Could not load quote details');
	if (!leadResponse.data) throw error(500, 'Quote lead could not be loaded');
	const catalogueItemIds = (itemsResponse.data ?? [])
		.filter((item) => item.source_type === 'catalogue' && item.product_id)
		.map((item) => item.product_id as string);
	const [productsResponse, settingsResponse] = await Promise.all([
		catalogueItemIds.length
			? supabase
					.from('products')
					.select(
						'id,product_code,name,customer_description,kind,category_id,unit_label,currency,unit_price,taxable,status,lock_version'
					)
					.in('id', catalogueItemIds)
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('app_settings')
			.select('setting_key,setting_value')
			.in('setting_key', ['company_identity', 'quote_defaults'])
	]);
	if (productsResponse.error || settingsResponse.error)
		throw error(500, 'Could not load Quote catalogue details');
	const productsById = new Map(
		(productsResponse.data ?? []).map((product) => [product.id, product])
	);
	const productSources = (itemsResponse.data ?? [])
		.filter((item) => item.source_type === 'catalogue' && item.product_id)
		.map((item) => {
			const product = productsById.get(item.product_id as string);
			const reviewedVersion = item.source_product_reviewed_version;
			const isStale = Boolean(
				product &&
				product.lock_version !== item.source_product_version &&
				(reviewedVersion === null || product.lock_version > reviewedVersion)
			);
			return {
				quoteItemId: item.id,
				productId: item.product_id,
				productCode: item.product_code_snapshot,
				name: item.name,
				customerDescription: item.description,
				unitLabel: item.unit_label_snapshot,
				currency: product?.currency ?? quoteResponse.data?.currency ?? '',
				catalogueUnitPrice: item.catalogue_unit_price,
				status: product?.status ?? 'missing',
				currentLockVersion: product?.lock_version ?? null,
				sourceProductVersion: item.source_product_version,
				sourceProductReviewedVersion: reviewedVersion,
				isStale
			};
		});
	const settings = new Map(
		(settingsResponse.data ?? []).map((setting) => [setting.setting_key, setting.setting_value])
	);
	const presentationModel = buildQuotePresentationModel({
		quote: quoteResponse.data,
		items: itemsResponse.data ?? [],
		recipient: recipientFrom(
			record(leadResponse.data),
			clientResponse.data ? record(clientResponse.data) : null
		),
		companyIdentity: settings.get('company_identity'),
		quoteDefaults: settings.get('quote_defaults')
	});
	return {
		quote: quoteResponse.data,
		items: itemsResponse.data ?? [],
		lead: leadResponse.data,
		client: clientResponse.data,
		activities: activityResponse.data ?? [],
		outboundMessages: outboundResponse.data ?? [],
		lostReasons: reasonsResponse.data ?? [],
		productCategories: categoriesResponse.data ?? [],
		productSources,
		presentationModel,
		profile
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc(
				'save_quote_draft',
				quoteFormValues(form, String(form.get('lead_id') ?? ''), event.params.id) as never
			);
			if (response.error) return actionFailure(response.error, 'Could not save Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not save Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	markReady: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('mark_quote_ready', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) {
				if (
					response.error.code === '23514' &&
					response.error.message.includes('unresolved Product source changes')
				) {
					return fail(422, {
						message: 'Quote has unresolved Product source changes',
						code: 'VALIDATION'
					});
				}
				return actionFailure(response.error, 'Could not mark Quote ready');
			}
		} catch (actionError) {
			return actionFailure(actionError, 'Could not mark Quote ready');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	addProduct: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const quantity = String(form.get('quantity') ?? '1').trim() || '1';
			const response = await supabase.rpc('add_product_quote_item', {
				p_quote_id: event.params.id,
				p_quote_lock_version: lockVersion(form),
				p_product_id: productId(form),
				p_product_lock_version: productLockVersion(form),
				p_quantity: quantity
			} as never);
			if (response.error) return actionFailure(response.error, 'Could not add Product to Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not add Product to Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	refreshProduct: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('refresh_product_quote_item', {
				p_quote_id: event.params.id,
				p_quote_lock_version: lockVersion(form),
				p_quote_item_id: quoteItemId(form),
				p_product_lock_version: productLockVersion(form)
			} as never);
			if (response.error) return actionFailure(response.error, 'Could not refresh Product values');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not refresh Product values');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	reviewProduct: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('review_product_quote_item', {
				p_quote_id: event.params.id,
				p_quote_lock_version: lockVersion(form),
				p_quote_item_id: quoteItemId(form),
				p_product_lock_version: productLockVersion(form)
			} as never);
			if (response.error) return actionFailure(response.error, 'Could not review Product changes');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not review Product changes');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	send: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			await sendQuote(supabase, event.params.id, lockVersion(await event.request.formData()));
		} catch (actionError) {
			return actionFailure(actionError, 'Could not send Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	revise: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			const response = await supabase.rpc('revise_quote', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(await event.request.formData())
			});
			if (response.error) return actionFailure(response.error, 'Could not create Quote revision');
			const newQuoteId = String(record(response.data).quote_id ?? '');
			if (!newQuoteId) return fail(500, { message: 'Revision was created without an identifier.' });
			throw redirect(303, `/quotes/${newQuoteId}`);
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return actionFailure(actionError, 'Could not revise Quote');
		}
	},
	accept: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('accept_quote', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_acceptance_source: String(form.get('acceptance_source') ?? ''),
				p_acceptance_evidence: String(form.get('acceptance_evidence') ?? '') || null
			});
			if (response.error) return actionFailure(response.error, 'Could not accept Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not accept Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	decline: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		const form = await event.request.formData();
		try {
			const response = await supabase.rpc('decline_quote', {
				p_quote_id: event.params.id,
				p_lock_version: lockVersion(form),
				p_lost_reason_id: String(form.get('lost_reason_id') ?? ''),
				p_lost_notes: String(form.get('lost_notes') ?? '') || null
			});
			if (response.error) return actionFailure(response.error, 'Could not decline Quote');
		} catch (actionError) {
			return actionFailure(actionError, 'Could not decline Quote');
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	cancel: async (event) => transition(event, 'cancel_quote'),
	expire: async (event) => transition(event, 'expire_quote')
};

async function transition(
	event: Parameters<NonNullable<Actions['accept']>>[0],
	functionName: 'cancel_quote' | 'expire_quote'
) {
	const { supabase } = await requireActiveStaff(event);
	try {
		const response = await supabase.rpc(functionName, {
			p_quote_id: event.params.id,
			p_lock_version: lockVersion(await event.request.formData())
		});
		if (response.error) return actionFailure(response.error, 'Could not update Quote state');
	} catch (actionError) {
		return actionFailure(actionError, 'Could not update Quote state');
	}
	throw redirect(303, `/quotes/${event.params.id}`);
}
