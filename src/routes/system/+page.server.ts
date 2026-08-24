import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (env.ZEPHYR_COMPONENT_LAB_ENABLED !== '1') {
		throw error(404, 'Component Lab is disabled outside local/test mode.');
	}
};
