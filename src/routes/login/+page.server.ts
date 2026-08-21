import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.supabase) {
			return fail(503, { message: 'Authentication is not configured for this local environment.' });
		}

		const formData = await request.formData();
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { message: 'Enter your email address and password.' });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) {
			return fail(400, { message: 'Sign-in failed. Check your invitation and credentials.' });
		}

		const { user, profile } = await locals.getAuthState();
		if (!user || profile?.status !== 'active') {
			await locals.supabase.auth.signOut();
			return fail(403, { message: 'Your staff invitation is not active yet.' });
		}

		throw redirect(303, '/');
	}
};
