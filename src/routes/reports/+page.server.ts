import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw error(404, 'Reports is not a separate v1 capability; use Dashboard.');
};
