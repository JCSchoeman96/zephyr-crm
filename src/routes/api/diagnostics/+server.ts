import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user, profile } = await locals.getAuthState();
	if (!locals.supabase || !user || !profile || profile.status !== 'active') {
		return json({ error: 'Authentication required' }, { status: 401 });
	}
	if (!['owner', 'admin'].includes(profile.role)) {
		return json({ error: 'Owner or Admin role required' }, { status: 403 });
	}
	const result = await locals.supabase.rpc('operational_diagnostics');
	if (result.error) return json({ error: 'Diagnostics are unavailable' }, { status: 503 });
	return json(result.data, { headers: { 'cache-control': 'private, no-store' } });
};
