import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { normalizeQuoteDefaults, parseQuoteDefaultsForm } from '$lib/domain/quotes/defaults';
import { actionFailureDetails, logActionFailure } from '$lib/server/action-errors';
import { requireActiveStaff } from '$lib/server/require-auth';

function actionFailure(cause: unknown, fallback: string) {
	const details = actionFailureDetails(cause, fallback);
	logActionFailure(cause, details.code);
	return fail(details.status, { message: details.message, code: details.code });
}

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	if (!['owner', 'admin'].includes(profile.role)) throw error(403, 'Owner or Admin role required');
	const [diagnostics, quoteDefaults] = await Promise.all([
		supabase.rpc('operational_diagnostics'),
		supabase
			.from('app_settings')
			.select('setting_value')
			.eq('setting_key', 'quote_defaults')
			.maybeSingle()
	]);
	if (diagnostics.error) throw error(503, 'Operational diagnostics are unavailable');
	if (quoteDefaults.error) throw error(503, 'Quote defaults are unavailable');
	return {
		diagnostics: diagnostics.data,
		quoteDefaults: normalizeQuoteDefaults(quoteDefaults.data?.setting_value),
		saved: event.url.searchParams.get('saved') === 'quote-defaults',
		profile
	};
};

export const actions: Actions = {
	saveQuoteDefaults: async (event) => {
		const { supabase, profile } = await requireActiveStaff(event);
		if (!['owner', 'admin'].includes(profile.role))
			throw error(403, 'Owner or Admin role required');
		try {
			const parsed = parseQuoteDefaultsForm(await event.request.formData());
			const response = await supabase.rpc('set_app_setting', {
				p_setting_key: 'quote_defaults',
				p_setting_value: parsed,
				p_description: 'Customer-facing Quote defaults and payment instructions'
			});
			if (response.error) return actionFailure(response.error, 'Could not save Quote defaults');
		} catch (actionError) {
			if (actionError && typeof actionError === 'object' && 'status' in actionError)
				throw actionError;
			return actionFailure(actionError, 'Could not save Quote defaults');
		}
		throw redirect(303, '/operations?saved=quote-defaults');
	}
};
