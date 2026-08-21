export type SendPulseEvent = {
	providerEventId: string | null;
	providerMessageId: string;
	eventType: string;
	occurredAt: string;
	metadata: Record<string, unknown>;
	deduplicationHash: string;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function field(source: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	}
	return '';
}

export function normalizeEventType(value: string): string {
	const type = value.trim().toLowerCase();
	if (['delivery', 'delivered', 'success'].includes(type)) return 'delivered';
	if (['bounce', 'bounced', 'soft_bounce'].includes(type)) return 'bounced';
	if (['hard_bounce', 'spam', 'unsubscribed'].includes(type)) return 'hard_bounced';
	if (['open', 'opened'].includes(type)) return 'opened';
	if (['click', 'clicked'].includes(type)) return 'clicked';
	if (['failed', 'error'].includes(type)) return 'failed';
	throw new Error('Unsupported SendPulse event type.');
}

function occurredAt(value: string): string {
	if (!value) return new Date().toISOString();
	const numeric = Number(value);
	const parsed = Number.isFinite(numeric)
		? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
		: new Date(value);
	if (Number.isNaN(parsed.getTime())) throw new Error('SendPulse event timestamp is invalid.');
	return parsed.toISOString();
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
	const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
	const safeBytes = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest('SHA-256', safeBytes.buffer as ArrayBuffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function parseSendPulseEvents(payload: unknown): Promise<SendPulseEvent[]> {
	const values = Array.isArray(payload) ? payload : [payload];
	const events: SendPulseEvent[] = [];
	for (const value of values) {
		const root = record(value);
		const nested = [root, record(root.data), record(root.event_data), record(root.message)];
		const providerMessageId =
			nested
				.map((item) => field(item, ['message_id', 'messageId', 'email_id', 'emailId']))
				.find(Boolean) ?? '';
		const eventType =
			nested.map((item) => field(item, ['event_type', 'event', 'type', 'status'])).find(Boolean) ??
			'';
		if (!providerMessageId || !eventType)
			throw new Error('SendPulse event requires a message ID and event type.');
		const providerEventId =
			nested
				.map((item) => field(item, ['provider_event_id', 'event_id', 'eventId', 'id']))
				.find(Boolean) || null;
		const timestamp =
			nested
				.map((item) => field(item, ['occurred_at', 'timestamp', 'date', 'created_at']))
				.find(Boolean) ?? '';
		const normalizedEventType = normalizeEventType(eventType);
		const occurred = occurredAt(timestamp);
		const deduplicationHash = await sha256Hex(
			`${providerMessageId}|${normalizedEventType}|${providerEventId ?? occurred}`
		);
		events.push({
			providerEventId,
			providerMessageId,
			eventType: normalizedEventType,
			occurredAt: occurred,
			metadata: root,
			deduplicationHash
		});
	}
	return events;
}

export async function verifyWebhookSignature(
	body: Uint8Array,
	signature: string | null,
	secret: string
): Promise<boolean> {
	if (!signature || !secret) return false;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const safeBody = new Uint8Array(body);
	const signed = await crypto.subtle.sign('HMAC', key, safeBody.buffer as ArrayBuffer);
	const expected = [...new Uint8Array(signed)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	const received = signature
		.trim()
		.replace(/^sha256=/i, '')
		.toLowerCase();
	return received.length === expected.length && received === expected;
}
