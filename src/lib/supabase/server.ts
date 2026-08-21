import { env } from '$env/dynamic/public';
import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePublicEnv } from '$lib/config/env';
import type { Database } from '$lib/types/database';

export function createSupabaseServerClient(event: RequestEvent): SupabaseClient<Database> {
	const publicEnvironment = parsePublicEnv(env);
	return createServerClient<Database>(
		publicEnvironment.supabaseUrl,
		publicEnvironment.supabasePublishableKey,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);
}
