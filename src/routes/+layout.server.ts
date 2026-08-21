import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user, profile } = await locals.getAuthState();

	return {
		auth: {
			user: user ? { id: user.id, email: user.email ?? null } : null,
			profile
		}
	};
};
