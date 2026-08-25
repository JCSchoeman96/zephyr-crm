import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';
import { loadTrustedClientConfiguration } from '$lib/server/client-config';
import { verifyBearerSecret } from '$lib/security/secrets';
import { recordOperationalEvent } from '$lib/server/operational-events';
import { collectFormEncodedPayload, normalizeBricksPayload } from './bricks-payload';
import { z } from 'zod';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_FORM_ID_LENGTH = 120;
const MAX_EXTERNAL_ID_LENGTH = 128;

const normalizedIntakeSchema = z.object({
	first_name: z.string().trim().min(1).max(120),
	last_name: z.string().max(120),
	email: z.string().trim().email().max(320),
	phone: z.string().max(80),
	company: z.string().max(240),
	message: z.string().max(10_000),
	landing_page: z.string().max(2_000),
	referrer: z.string().max(2_000),
	utm_source: z.string().max(160),
	utm_medium: z.string().max(160),
	utm_campaign: z.string().max(160),
	utm_content: z.string().max(160),
	utm_term: z.string().max(160),
	source: z.string().max(120)
});

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

async function parseRequest(
	event: RequestEvent
): Promise<{ formId: string; externalId: string; payload: Record<string, string> }> {
	const trusted = loadTrustedClientConfiguration();
	const secret = trusted.secrets.bricksWebhookSecret || env.BRICKS_WEBHOOK_SECRET?.trim();
	if (!(await verifyBearerSecret(event.request.headers.get('authorization'), secret))) {
		throw new BricksIntakeError('Invalid intake authorization', 401);
	}
	const expectedFormId = env.CLIENT_CONFIG_JSON?.trim()
		? trusted.configuration.integrations.bricks.formId
		: env.BRICKS_FORM_ID?.trim() || trusted.configuration.integrations.bricks.formId;

	const body = await event.request.arrayBuffer();
	if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) {
		throw new BricksIntakeError('Intake payload size is invalid', 413);
	}
	const contentType = event.request.headers.get('content-type') ?? '';
	let rawPayload: Record<string, unknown>;
	try {
		const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
		if (mediaType === 'application/json') {
			const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				throw new Error('object expected');
			rawPayload = parsed as Record<string, unknown>;
		} else if (mediaType === 'application/x-www-form-urlencoded') {
			rawPayload = collectFormEncodedPayload(new URLSearchParams(new TextDecoder().decode(body)));
		} else {
			throw new BricksIntakeError('Unsupported intake content type', 415);
		}
	} catch (error) {
		if (error instanceof BricksIntakeError) throw error;
		throw new BricksIntakeError('Malformed intake payload', 400);
	}
	const normalized = normalizeBricksPayload(
		rawPayload,
		expectedFormId,
		event.request.headers.get('x-bricks-form-id')?.trim() ?? ''
	);
	const formId = normalized.formId;
	const externalIdRaw = normalized.externalId;
	const context = {
		formId: formId.length <= MAX_FORM_ID_LENGTH ? formId : '',
		externalId: externalIdRaw.length <= MAX_EXTERNAL_ID_LENGTH ? externalIdRaw : '',
		payload: normalized.payload
	};
	const unknownFields = normalized.unknownFields;
	if (unknownFields.length > 0) {
		throw new BricksIntakeError(`Unknown intake field: ${unknownFields[0]}`, 422, context);
	}
	if (normalized.payload.message.length > 10_000) {
		throw new BricksIntakeError('Intake message is too long', 422, context);
	}
	if (!formId || !externalIdRaw || !normalized.payload.first_name || !normalized.payload.email) {
		throw new BricksIntakeError(
			normalized.rawMode
				? 'external_submission_id, first_name, and email are required'
				: 'form_id, external_submission_id, first_name, and email are required',
			422,
			context
		);
	}
	if (formId.length > MAX_FORM_ID_LENGTH) {
		throw new BricksIntakeError('Bricks form ID is too long', 422, context);
	}
	if (externalIdRaw.length > MAX_EXTERNAL_ID_LENGTH) {
		throw new BricksIntakeError('external_submission_id is too long', 422, context);
	}
	const uuidResult = z.uuid().safeParse(externalIdRaw);
	if (!uuidResult.success) {
		throw new BricksIntakeError('external_submission_id must be a UUID', 422, context);
	}
	const externalId = externalIdRaw.toLowerCase();
	context.externalId = externalId;
	const parsedPayload = normalizedIntakeSchema.safeParse(normalized.payload);
	if (!parsedPayload.success) {
		throw new BricksIntakeError('Intake payload schema is invalid', 422, context);
	}
	const payload = parsedPayload.data;
	if (formId !== expectedFormId) throw new BricksIntakeError('Unknown Bricks form', 422, context);
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
