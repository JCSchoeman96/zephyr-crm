import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePublicEnv } from '$lib/config/env';
import type { Database } from '$lib/types/database';

let browserClient: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
	if (!browser) {
		throw new Error('The browser Supabase client can only be created in the browser.');
	}
	if (!browserClient) {
		const publicEnvironment = parsePublicEnv(env);
		browserClient = createBrowserClient<Database>(
			publicEnvironment.supabaseUrl,
			publicEnvironment.supabasePublishableKey,
			{ auth: { flowType: 'pkce', detectSessionInUrl: true } }
		);
	}
	return browserClient;
}
