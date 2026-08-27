import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

type AuthState = {
	user: User | null;
	profile: App.Profile | null;
};

type ServerSupabaseClient = SupabaseClient<Database>;

async function loadAuthState(supabase: ServerSupabaseClient): Promise<AuthState> {
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
}

/**
 * Creates a request-scoped auth lookup. SvelteKit can evaluate layout and page
 * loads concurrently, so the same SSR client must not run duplicate auth
 * lookups and compete over its response-cookie side effects.
 */
export function createAuthStateLoader(
	supabase: ServerSupabaseClient | null
): () => Promise<AuthState> {
	if (!supabase) return async () => ({ user: null, profile: null });

	let authState: Promise<AuthState> | undefined;
	return () => {
		authState ??= loadAuthState(supabase);
		return authState;
	};
}
