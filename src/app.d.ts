// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

declare global {
	namespace App {
		type Profile = Database['public']['Tables']['profiles']['Row'];
		interface Locals {
			supabase: SupabaseClient<Database> | null;
			getAuthState: () => Promise<{ user: User | null; profile: Profile | null }>;
		}

		interface Platform {
			env: Cloudflare.Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
