import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { SendPulseAdapter } from '$lib/domain/communications/sendpulse-adapter';

type ServerSupabaseClient = SupabaseClient<Database>;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value : String(value ?? '');
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export async function sendQuote(
	supabase: ServerSupabaseClient,
	quoteId: string,
	lockVersion: number
): Promise<JsonRecord> {
	const preparedResponse = await supabase.rpc('prepare_quote_send', {
		p_quote_id: quoteId,
		p_lock_version: lockVersion
	});
	if (preparedResponse.error) throw new Error(preparedResponse.error.message);

	const prepared = record(preparedResponse.data);
	if (prepared.already_submitted === true) return prepared;
	if (prepared.in_flight === true) throw new Error('This quote is already being sent.');

	const clientId = env.SENDPULSE_CLIENT_ID?.trim();
	const clientSecret = env.SENDPULSE_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) throw new Error('SendPulse integration is not configured.');

	const recipient = record(prepared.recipient);
	const adapter = new SendPulseAdapter({
		clientId,
		clientSecret,
		baseUrl: env.SENDPULSE_API_BASE_URL?.trim() || undefined,
		senderEmail: env.SENDPULSE_SENDER_EMAIL?.trim() || undefined,
		senderName: env.SENDPULSE_SENDER_NAME?.trim() || undefined
	});

	let providerMessageId: string;
	try {
		const result = await adapter.sendEmail({
			to: [{ email: stringValue(recipient.email), name: stringValue(recipient.name) }],
			subject: stringValue(prepared.subject),
			html: `<p>${escapeHtml(stringValue(prepared.subject))}</p><p>Total: ${escapeHtml(stringValue(prepared.total))}</p>`
		});
		providerMessageId = result.providerMessageId;
	} catch (error) {
		await supabase
			.from('outbound_messages')
			.update({
				delivery_status: 'failed',
				last_error: error instanceof Error ? error.message : 'Provider error'
			})
			.eq('id', stringValue(prepared.outbound_message_id));
		throw error;
	}

	const completedResponse = await supabase.rpc('complete_quote_send', {
		p_outbound_message_id: stringValue(prepared.outbound_message_id),
		p_provider_message_id: providerMessageId
	});
	if (completedResponse.error) throw new Error(completedResponse.error.message);
	return record(completedResponse.data);
}
