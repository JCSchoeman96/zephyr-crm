import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	const { data: leads, error: queryError } = await supabase
		.from('leads')
		.select('*')
		.order('updated_at', { ascending: false });
	if (queryError) throw error(500, queryError.message);
	return { leads: leads ?? [], profile };
};
