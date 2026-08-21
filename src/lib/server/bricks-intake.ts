import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import type { Database } from '$lib/types/database';

const MAX_BODY_BYTES = 64 * 1024;

export class BricksIntakeError extends Error {
	status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

function trustedServiceClient() {
	const url = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL)?.trim();
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) throw new BricksIntakeError('Trusted intake is not configured', 503);
	return createClient<Database>(url, key, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
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
	return normalized;
}

async function parseRequest(
	event: RequestEvent
): Promise<{ formId: string; externalId: string; payload: Record<string, string> }> {
	const secret = env.BRICKS_WEBHOOK_SECRET?.trim();
	if (!secret || event.request.headers.get('authorization') !== `Bearer ${secret}`) {
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
	if (!formId || !externalId || !payload.first_name || !payload.email) {
		throw new BricksIntakeError(
			'form_id, external_submission_id, first_name, and email are required',
			422
		);
	}
	const expectedFormId = env.BRICKS_FORM_ID?.trim() || 'contact-form';
	if (formId !== expectedFormId) throw new BricksIntakeError('Unknown Bricks form', 422);
	if (
		payload.email.length > 320 ||
		payload.first_name.length > 120 ||
		payload.message.length > 10_000
	) {
		throw new BricksIntakeError('Intake field length is invalid', 422);
	}
	if (!/^\S+@\S+\.\S+$/.test(payload.email))
		throw new BricksIntakeError('Intake email is invalid', 422);
	return { formId, externalId, payload };
}

export async function handleBricksIntake(event: RequestEvent) {
	const { formId, externalId, payload } = await parseRequest(event);
	const { data, error } = await trustedServiceClient().rpc('ingest_bricks_lead', {
		p_form_id: formId,
		p_external_submission_id: externalId,
		p_payload: payload
	});
	if (error) throw new BricksIntakeError(error.message, 422);
	return data;
}
