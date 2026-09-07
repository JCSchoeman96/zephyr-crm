import type { PageServerLoad } from './$types';
import { requireActiveStaff } from '$lib/server/require-auth';
import { loadSalesWorkspace, salesViews } from '$lib/server/sales-workspace';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	return {
		workspace: await loadSalesWorkspace(supabase, event.url.searchParams),
		views: Object.entries(salesViews),
		profile
	};
};
