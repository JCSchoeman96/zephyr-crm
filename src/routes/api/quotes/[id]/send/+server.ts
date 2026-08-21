import { json } from '@sveltejs/kit';
import { sendQuote } from '$lib/server/quote-actions';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { profile } = await locals.getAuthState();
	if (!locals.supabase || !profile || profile.status !== 'active') {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as { lock_version?: number };
	const lockVersion = Number(body.lock_version);
	if (!Number.isInteger(lockVersion) || lockVersion < 1) {
		return json({ error: 'A valid quote lock_version is required' }, { status: 400 });
	}

	try {
		return json(await sendQuote(locals.supabase, params.id, lockVersion));
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Quote send failed' },
			{ status: 422 }
		);
	}
};
