import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function requireActiveStaff(event: Pick<RequestEvent, 'locals'>) {
	const { user, profile } = await event.locals.getAuthState();
	if (!event.locals.supabase || !user || !profile || profile.status !== 'active') {
		throw redirect(303, '/login');
	}
	return { supabase: event.locals.supabase, user, profile };
}
