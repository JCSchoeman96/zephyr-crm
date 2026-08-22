import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';
import { verifyBearerSecret } from '$lib/security/secrets';
import { recordOperationalEvent } from '$lib/server/operational-events';

const MAX_BODY_BYTES = 64 * 1024;

export class BricksIntakeError extends Error {
	status: number;
	context?: {
		formId?: string;
		externalId?: string;
		payload?: Record<string, string>;
	};

	constructor(message: string, status = 400, context?: BricksIntakeError['context']) {
		super(message);
		this.status = status;
		this.context = context;
	}
}

function trustedServiceClient() {
	try {
		return createTrustedSupabaseClient();
	} catch {
		throw new BricksIntakeError('Trusted intake is not configured', 503);
	}
}

function textField(payload: Record<string, unknown>, key: string): string {
	const value = payload[key];
	return typeof value === 'string' ? value.trim() : '';
}

function normalizePayload(payload: Record<string, unknown>): Record<string, string> {
	const normalized = Object.fromEntries(
		[
			'first_name',
			'last_name',
			'email',
			'phone',
			'company',
			'message',
			'landing_page',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
			'utm_content',
			'utm_term',
			'source'
		].map((key) => [key, textField(payload, key)])
	);
	if (!normalized.first_name) normalized.first_name = textField(payload, 'name');
	return normalized;
}

async function parseRequest(
	event: RequestEvent
): Promise<{ formId: string; externalId: string; payload: Record<string, string> }> {
	const trusted = loadTrustedClientConfiguration();
	const secret = trusted.secrets.bricksWebhookSecret || env.BRICKS_WEBHOOK_SECRET?.trim();
	if (!(await verifyBearerSecret(event.request.headers.get('authorization'), secret))) {
		throw new BricksIntakeError('Invalid intake authorization', 401);
	}

	const body = await event.request.arrayBuffer();
	if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) {
		throw new BricksIntakeError('Intake payload size is invalid', 413);
	}
	const contentType = event.request.headers.get('content-type') ?? '';
	let rawPayload: Record<string, unknown>;
	try {
		if (contentType.includes('application/json')) {
			const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				throw new Error('object expected');
			rawPayload = parsed as Record<string, unknown>;
		} else if (contentType.includes('application/x-www-form-urlencoded')) {
			rawPayload = Object.fromEntries(
				new URLSearchParams(new TextDecoder().decode(body)).entries()
			);
		} else {
			throw new BricksIntakeError('Unsupported intake content type', 415);
		}
	} catch (error) {
		if (error instanceof BricksIntakeError) throw error;
		throw new BricksIntakeError('Malformed intake payload', 400);
	}

	const formId =
		textField(rawPayload, 'form_id') || event.request.headers.get('x-bricks-form-id')?.trim() || '';
	const externalId =
		textField(rawPayload, 'external_submission_id') || textField(rawPayload, 'submission_id');
	const payload = normalizePayload(rawPayload);
	const context = { formId, externalId, payload };
	if (!formId || !externalId || !payload.first_name || !payload.email) {
		throw new BricksIntakeError(
			'form_id, external_submission_id, first_name, and email are required',
			422,
			context
		);
	}
	const expectedFormId = env.CLIENT_CONFIG_JSON?.trim()
		? trusted.configuration.integrations.bricks.formId
		: env.BRICKS_FORM_ID?.trim() || trusted.configuration.integrations.bricks.formId;
	if (formId !== expectedFormId) throw new BricksIntakeError('Unknown Bricks form', 422, context);
	if (
		payload.email.length > 320 ||
		payload.first_name.length > 120 ||
		payload.message.length > 10_000
	) {
		throw new BricksIntakeError('Intake field length is invalid', 422, context);
	}
	if (!/^\S+@\S+\.\S+$/.test(payload.email))
		throw new BricksIntakeError('Intake email is invalid', 422, context);
	return { formId, externalId, payload };
}

export async function handleBricksIntake(event: RequestEvent) {
	try {
		const { formId, externalId, payload } = await parseRequest(event);
		const { data, error } = await trustedServiceClient().rpc('ingest_bricks_lead', {
			p_form_id: formId,
			p_external_submission_id: externalId,
			p_payload: payload
		});
		if (error) throw new BricksIntakeError(error.message, 422, { formId, externalId, payload });
		return data;
	} catch (error) {
		await recordOperationalEvent({
			severity: error instanceof BricksIntakeError && error.status < 500 ? 'warning' : 'error',
			source: 'bricks',
			eventType: 'intake_failure',
			message: error instanceof Error ? error.message : 'Intake failed'
		});
		if (error instanceof BricksIntakeError && error.context?.externalId) {
			const context = error.context;
			const externalId = context.externalId as string;
			try {
				await trustedServiceClient().rpc('record_bricks_rejection', {
					p_form_id: context.formId || 'unknown',
					p_external_submission_id: externalId,
					p_payload: context.payload ?? {},
					p_error_message: error.message
				});
			} catch {
				// Preserve the original intake error if the rejection recorder is unavailable.
			}
		}
		throw error;
	}
}
