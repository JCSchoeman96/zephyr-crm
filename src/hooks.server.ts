import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { createSupabaseServerClient } from '$lib/supabase/server';

export const handle: Handle = async ({ event, resolve }) => {
	let supabase: App.Locals['supabase'] = null;

	const authConfigured = Boolean(
		env.PUBLIC_SUPABASE_URL?.trim() &&
		env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
		env.PUBLIC_SITE_URL?.trim() &&
		!env.PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('replace-with')
	);

	if (authConfigured) {
		supabase = createSupabaseServerClient(event);
	}

	event.locals.supabase = supabase;
	event.locals.getAuthState = async () => {
		if (!supabase) return { user: null, profile: null };

		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return { user: null, profile: null };

		const { data: profile } = await supabase
			.from('profiles')
			.select('id, full_name, email, role, status, timezone, created_at, updated_at')
			.eq('id', user.id)
			.maybeSingle();

		return { user, profile };
	};

	return resolve(event);
};
