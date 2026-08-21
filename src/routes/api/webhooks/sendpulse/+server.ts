import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import {
	parseSendPulseEvents,
	verifyWebhookSignature
} from '$lib/domain/communications/sendpulse-events';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';

const MAX_BODY_BYTES = 64 * 1024;

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.SENDPULSE_WEBHOOK_SECRET?.trim();
	if (!secret) return json({ error: 'SendPulse webhook is not configured' }, { status: 503 });
	const body = new Uint8Array(await request.arrayBuffer());
	if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) {
		return json({ error: 'Webhook payload size is invalid' }, { status: 413 });
	}
	if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
		return json({ error: 'Webhook content type is invalid' }, { status: 415 });
	}
	if (
		!(await verifyWebhookSignature(
			body,
			request.headers.get('x-sendpulse-signature') ?? request.headers.get('x-signature'),
			secret
		))
	) {
		return json({ error: 'Invalid SendPulse webhook signature' }, { status: 401 });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(body));
	} catch {
		return json({ error: 'Malformed SendPulse webhook payload' }, { status: 400 });
	}

	try {
		const events = await parseSendPulseEvents(payload);
		const client = createTrustedSupabaseClient();
		const results = [];
		for (const event of events) {
			const result = await client.rpc('process_sendpulse_event', {
				p_provider_event_id: event.providerEventId ?? '',
				p_provider_message_id: event.providerMessageId,
				p_event_type: event.eventType,
				p_occurred_at: event.occurredAt,
				p_metadata: JSON.parse(JSON.stringify(event.metadata)),
				p_deduplication_hash: event.deduplicationHash
			});
			if (result.error) throw new Error(result.error.message);
			results.push(result.data);
		}
		return json({ accepted: results.length, results });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'SendPulse webhook failed' },
			{ status: 422 }
		);
	}
};
