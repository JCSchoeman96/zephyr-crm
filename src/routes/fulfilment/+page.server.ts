import type { PageServerLoad } from './$types';
import { loadFulfilmentQueues } from '$lib/server/fulfilment';
import { requireActiveStaff } from '$lib/server/require-auth';

export const load: PageServerLoad = async (event) => {
	const { supabase, profile } = await requireActiveStaff(event);
	return { queues: await loadFulfilmentQueues(supabase), profile };
};
