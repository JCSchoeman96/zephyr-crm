import { json } from '@sveltejs/kit';
import { BricksIntakeError, handleBricksIntake } from '$lib/server/bricks-intake';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		const result = await handleBricksIntake(event);
		return json(result, {
			status:
				result && typeof result === 'object' && 'duplicate' in result && result.duplicate
					? 200
					: 201
		});
	} catch (error) {
		if (error instanceof BricksIntakeError)
			return json({ error: error.message }, { status: error.status });
		return json({ error: 'Intake failed' }, { status: 500 });
	}
};
