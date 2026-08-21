import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { quoteFormValues } from '$lib/server/quote-form';
import { sendQuote } from '$lib/server/quote-actions';
import { requireActiveStaff } from '$lib/server/require-auth';

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

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const quoteResponse = await supabase
		.from('quotes')
		.select('*')
		.eq('id', event.params.id)
		.maybeSingle();
	if (quoteResponse.error) throw error(500, 'Could not load the quote');
	if (!quoteResponse.data) throw error(404, 'Quote not found');
	const [itemsResponse, leadResponse, clientResponse, activityResponse, outboundResponse] =
		await Promise.all([
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
				.limit(10)
		]);
	if (
		itemsResponse.error ||
		leadResponse.error ||
		clientResponse.error ||
		activityResponse.error ||
		outboundResponse.error
	)
		throw error(500, 'Could not load quote details');
	if (!leadResponse.data) throw error(500, 'Quote lead could not be loaded');
	return {
		quote: quoteResponse.data,
		items: itemsResponse.data ?? [],
		lead: leadResponse.data,
		client: clientResponse.data,
		activities: activityResponse.data ?? [],
		outboundMessages: outboundResponse.data ?? [],
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
				quoteFormValues(form, String(form.get('lead_id') ?? ''), event.params.id)
			);
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not save quote'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not mark quote ready'
			});
		}
		throw redirect(303, `/quotes/${event.params.id}`);
	},
	send: async (event) => {
		const { supabase } = await requireActiveStaff(event);
		try {
			await sendQuote(supabase, event.params.id, lockVersion(await event.request.formData()));
		} catch (actionError) {
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not send quote'
			});
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
			if (response.error) return fail(422, { message: response.error.message });
			const newQuoteId = String(record(response.data).quote_id ?? '');
			if (!newQuoteId) return fail(500, { message: 'Revision was created without an identifier.' });
			throw redirect(303, `/quotes/${newQuoteId}`);
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return fail(422, {
				message: actionError instanceof Error ? actionError.message : 'Could not revise quote'
			});
		}
	},
	accept: async (event) => transition(event, 'accept_quote'),
	decline: async (event) => transition(event, 'decline_quote'),
	cancel: async (event) => transition(event, 'cancel_quote'),
	expire: async (event) => transition(event, 'expire_quote')
};

async function transition(
	event: Parameters<NonNullable<Actions['accept']>>[0],
	functionName: 'accept_quote' | 'decline_quote' | 'cancel_quote' | 'expire_quote'
) {
	const { supabase } = await requireActiveStaff(event);
	try {
		const response = await supabase.rpc(functionName, {
			p_quote_id: event.params.id,
			p_lock_version: lockVersion(await event.request.formData())
		});
		if (response.error) return fail(422, { message: response.error.message });
	} catch (actionError) {
		return fail(422, {
			message: actionError instanceof Error ? actionError.message : 'Could not update quote state'
		});
	}
	throw redirect(303, `/quotes/${event.params.id}`);
}
