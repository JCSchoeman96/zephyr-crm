import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';
import type { Json } from '$lib/types/database';

type OperationalSeverity = 'info' | 'warning' | 'error' | 'critical';

export async function recordOperationalEvent(input: {
	severity: OperationalSeverity;
	source: string;
	eventType: string;
	message: string;
	metadata?: Json;
}) {
	try {
		await createTrustedSupabaseClient()
			.from('operational_events')
			.insert({
				severity: input.severity,
				source: input.source,
				event_type: input.eventType,
				message: input.message,
				metadata: input.metadata ?? {}
			});
	} catch {
		// Diagnostics must never replace or expose the original business error.
	}
}
