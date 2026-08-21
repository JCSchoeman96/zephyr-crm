import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

export function createTrustedSupabaseClient(): SupabaseClient<Database> {
	const url = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL)?.trim();
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new Error('Trusted Supabase integration is not configured.');
	return createClient<Database>(url, key, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}
