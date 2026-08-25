import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import {
	SendPulseAdapter,
	SendPulseSubmissionUnknownError
} from '$lib/domain/communications/sendpulse-adapter';
import { bytesToBase64, ensureQuoteDocument } from '$lib/server/quote-documents';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';
import { recordOperationalEvent } from '$lib/server/operational-events';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';
import { buildQuoteEmail } from '$lib/server/quote-email';

type ServerSupabaseClient = SupabaseClient<Database>;
type JsonRecord = Record<string, unknown>;

let quoteFinalizationFaultInjected = false;

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value : String(value ?? '');
}

function shouldInjectQuoteFinalizationFailure(): boolean {
	if (env.NODE_ENV === 'production' || env.ZEPHYR_TEST_FAIL_QUOTE_FINALIZATION_ONCE !== '1') {
		return false;
	}
	if (quoteFinalizationFaultInjected) return false;
	quoteFinalizationFaultInjected = true;
	return true;
}

export async function sendQuote(
	supabase: ServerSupabaseClient,
	quoteId: string,
	lockVersion: number
): Promise<JsonRecord> {
	const currentQuote = await supabase
		.from('quotes')
		.select('lead_id,status,quote_number,subject,valid_until,currency,total,quote_snapshot')
		.eq('id', quoteId)
		.maybeSingle();
	if (currentQuote.error) throw new Error(currentQuote.error.message);
	if (!currentQuote.data) throw new Error('Quote not found.');

	let document: Awaited<ReturnType<typeof ensureQuoteDocument>> | null = null;
	if (currentQuote.data.status === 'ready') {
		document = await ensureQuoteDocument(supabase, quoteId, lockVersion);
	}

	// Validate all local configuration and customer-facing content before claiming
	// the logical outbound message. Once the trusted action claims it, every
	// failure must represent a real provider or persistence uncertainty.
	const leadResponse = await supabase
		.from('leads')
		.select('email,first_name,last_name')
		.eq('id', currentQuote.data.lead_id)
		.maybeSingle();
	if (leadResponse.error) throw new Error(leadResponse.error.message);
	if (!leadResponse.data) throw new Error('Lead not found.');

	const trusted = loadTrustedClientConfiguration();
	const clientId = trusted.secrets.sendpulseClientId || env.SENDPULSE_CLIENT_ID?.trim();
	const clientSecret = trusted.secrets.sendpulseClientSecret || env.SENDPULSE_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) throw new Error('SendPulse integration is not configured.');

	const recipient = {
		email: stringValue(leadResponse.data.email),
		name: `${stringValue(leadResponse.data.first_name)} ${stringValue(leadResponse.data.last_name)}`.trim()
	};
	const snapshot = record(currentQuote.data.quote_snapshot);
	const identity = record(snapshot.company_identity);
	buildQuoteEmail({
		companyName: stringValue(identity.name || identity.company_name),
		recipientName: recipient.name,
		recipientEmail: recipient.email,
		quoteNumber: stringValue(currentQuote.data.quote_number),
		subject: stringValue(currentQuote.data.subject),
		currency: stringValue(currentQuote.data.currency),
		total: stringValue(currentQuote.data.total),
		validUntil: stringValue(currentQuote.data.valid_until),
		hasFrozenPdf: Boolean(document)
	});
	const usesFileConfiguration = Boolean(env.CLIENT_CONFIG_JSON?.trim());
	const baseUrl = usesFileConfiguration
		? trusted.configuration.integrations.sendpulse.apiBaseUrl
		: env.SENDPULSE_API_BASE_URL?.trim();
	const senderEmail = usesFileConfiguration
		? trusted.configuration.email.senderEmail
		: env.SENDPULSE_SENDER_EMAIL?.trim();
	const senderName = usesFileConfiguration
		? trusted.configuration.email.senderName
		: env.SENDPULSE_SENDER_NAME?.trim();
	if (!senderEmail || !senderName) {
		throw new Error('A configured SendPulse sender email and name are required.');
	}
	const adapter = new SendPulseAdapter({
		clientId,
		clientSecret,
		baseUrl: baseUrl || undefined,
		senderEmail,
		senderName
	});

	const preparedResponse = await supabase.rpc('prepare_quote_send', {
		p_quote_id: quoteId,
		p_lock_version: document?.lockVersion ?? lockVersion
	});
	if (preparedResponse.error) throw new Error(preparedResponse.error.message);

	const prepared = record(preparedResponse.data);
	if (prepared.already_submitted === true) return prepared;
	if (prepared.submission_unknown === true) {
		throw new Error(
			'Provider acknowledgement is uncertain; reconcile the existing submission before retrying.'
		);
	}
	if (prepared.in_flight === true) throw new Error('This quote is already being sent.');
	const claimedRecipientRecord = record(prepared.recipient);
	const claimedRecipient = {
		email: stringValue(claimedRecipientRecord.email),
		name: stringValue(claimedRecipientRecord.name)
	};
	if (!claimedRecipient.email) {
		await supabase.rpc('fail_quote_send', {
			p_outbound_message_id: stringValue(prepared.outbound_message_id),
			p_error: 'The claimed Quote recipient is missing.'
		});
		throw new Error('The claimed Quote recipient is missing.');
	}
	const claimedEmail = buildQuoteEmail({
		companyName: stringValue(identity.name || identity.company_name),
		recipientName: claimedRecipient.name,
		recipientEmail: claimedRecipient.email,
		quoteNumber: stringValue(currentQuote.data.quote_number),
		subject: stringValue(currentQuote.data.subject),
		currency: stringValue(currentQuote.data.currency),
		total: stringValue(currentQuote.data.total),
		validUntil: stringValue(currentQuote.data.valid_until),
		hasFrozenPdf: Boolean(document)
	});

	let providerMessageId: string;
	try {
		const result = await adapter.sendEmail({
			to: [claimedRecipient],
			subject: claimedEmail.subject,
			html: claimedEmail.html,
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
		if (error instanceof SendPulseSubmissionUnknownError) {
			await supabase.rpc('mark_quote_send_unknown', {
				p_outbound_message_id: stringValue(prepared.outbound_message_id),
				p_error: error.message
			});
		} else {
			await supabase.rpc('fail_quote_send', {
				p_outbound_message_id: stringValue(prepared.outbound_message_id),
				p_error: error instanceof Error ? error.message : 'Provider error'
			});
		}
		throw error;
	}

	const completedResponse = shouldInjectQuoteFinalizationFailure()
		? {
				data: null,
				error: { message: 'Deterministic local quote finalization failure' }
			}
		: await supabase.rpc('complete_quote_send', {
				p_outbound_message_id: stringValue(prepared.outbound_message_id),
				p_provider_message_id: providerMessageId
			});
	if (completedResponse.error) {
		const acknowledged = await createTrustedSupabaseClient().rpc('record_quote_send_ack', {
			p_outbound_message_id: stringValue(prepared.outbound_message_id),
			p_provider_message_id: providerMessageId,
			p_error: completedResponse.error.message
		});
		if (acknowledged.error) {
			await recordOperationalEvent({
				severity: 'critical',
				source: 'quote_send',
				eventType: 'finalization_ack_failure',
				message:
					'Provider accepted a Quote message but CRM finalization evidence could not be persisted'
			});
		}
		throw new Error(
			'Provider accepted the Quote message; CRM finalization requires reconciliation.'
		);
	}
	return record(completedResponse.data);
}
