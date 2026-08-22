import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	if (!['owner', 'admin'].includes(profile.role)) throw error(403, 'Owner or Admin role required');
	const diagnostics = await supabase.rpc('operational_diagnostics');
	if (diagnostics.error) throw error(503, 'Operational diagnostics are unavailable');
	return { diagnostics: diagnostics.data, profile };
};
