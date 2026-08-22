import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { SendPulseAdapter } from '$lib/domain/communications/sendpulse-adapter';
import { bytesToBase64, ensureQuoteDocument } from '$lib/server/quote-documents';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';

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
	const currentQuote = await supabase
		.from('quotes')
		.select('status')
		.eq('id', quoteId)
		.maybeSingle();
	if (currentQuote.error) throw new Error(currentQuote.error.message);
	if (!currentQuote.data) throw new Error('Quote not found.');

	let document: Awaited<ReturnType<typeof ensureQuoteDocument>> | null = null;
	if (currentQuote.data.status === 'ready') {
		document = await ensureQuoteDocument(supabase, quoteId, lockVersion);
	}

	const preparedResponse = await supabase.rpc('prepare_quote_send', {
		p_quote_id: quoteId,
		p_lock_version: document?.lockVersion ?? lockVersion
	});
	if (preparedResponse.error) throw new Error(preparedResponse.error.message);

	const prepared = record(preparedResponse.data);
	if (prepared.already_submitted === true) return prepared;
	if (prepared.in_flight === true) throw new Error('This quote is already being sent.');

	const trusted = loadTrustedClientConfiguration();
	const clientId = trusted.secrets.sendpulseClientId || env.SENDPULSE_CLIENT_ID?.trim();
	const clientSecret = trusted.secrets.sendpulseClientSecret || env.SENDPULSE_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) throw new Error('SendPulse integration is not configured.');

	const recipient = record(prepared.recipient);
	const adapter = new SendPulseAdapter({
		clientId,
		clientSecret,
		baseUrl:
			(env.CLIENT_CONFIG_JSON?.trim()
				? trusted.configuration.integrations.sendpulse.apiBaseUrl
				: env.SENDPULSE_API_BASE_URL?.trim()) || undefined,
		senderEmail:
			(env.CLIENT_CONFIG_JSON?.trim()
				? trusted.configuration.email.senderEmail
				: env.SENDPULSE_SENDER_EMAIL?.trim()) || undefined,
		senderName:
			(env.CLIENT_CONFIG_JSON?.trim()
				? trusted.configuration.email.senderName
				: env.SENDPULSE_SENDER_NAME?.trim()) || undefined
	});

	let providerMessageId: string;
	try {
		const result = await adapter.sendEmail({
			to: [{ email: stringValue(recipient.email), name: stringValue(recipient.name) }],
			subject: stringValue(prepared.subject),
			html: `<p>${escapeHtml(stringValue(prepared.subject))}</p><p>A frozen PDF quote is attached.</p>`,
			attachments: document
				? [
						{
							name: document.path.split('/').at(-1) ?? 'quote.pdf',
							content: await bytesToBase64(document.bytes)
						}
					]
				: undefined
		});
		providerMessageId = result.providerMessageId;
	} catch (error) {
		await supabase.rpc('fail_quote_send', {
			p_outbound_message_id: stringValue(prepared.outbound_message_id),
			p_error: error instanceof Error ? error.message : 'Provider error'
		});
		throw error;
	}

	const completedResponse = await supabase.rpc('complete_quote_send', {
		p_outbound_message_id: stringValue(prepared.outbound_message_id),
		p_provider_message_id: providerMessageId
	});
	if (completedResponse.error) throw new Error(completedResponse.error.message);
	return record(completedResponse.data);
}
