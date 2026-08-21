type BricksPayload = Record<string, unknown>;

const maxBodyBytes = 64 * 1024;

function textField(payload: BricksPayload, key: string): string {
	const value = payload[key];
	return typeof value === 'string' ? value.trim() : '';
}

function normalizedPayload(payload: BricksPayload): Record<string, string> {
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
	) as Record<string, string>;
	if (!normalized.first_name) normalized.first_name = textField(payload, 'name');
	return normalized;
}

function jsonResponse(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

async function recordRejection(
	supabaseUrl: string,
	serviceRoleKey: string,
	formId: string,
	externalId: string,
	payload: BricksPayload,
	errorMessage: string
) {
	if (!formId || !externalId) return;
	await fetch(`${supabaseUrl}/rest/v1/rpc/record_bricks_rejection`, {
		method: 'POST',
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			p_form_id: formId,
			p_external_submission_id: externalId,
			p_payload: normalizedPayload(payload),
			p_error_message: errorMessage
		})
	}).catch(() => undefined);
}

Deno.serve(async (request) => {
	if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
	const secret = Deno.env.get('BRICKS_WEBHOOK_SECRET')?.trim();
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
		return jsonResponse({ error: 'Invalid intake authorization' }, 401);
	}

	const body = await request.arrayBuffer();
	if (body.byteLength === 0 || body.byteLength > maxBodyBytes) {
		return jsonResponse({ error: 'Intake payload size is invalid' }, 413);
	}
	const contentType = request.headers.get('content-type') ?? '';
	let payload: BricksPayload;
	try {
		if (contentType.includes('application/json')) {
			const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				throw new Error('object expected');
			payload = parsed as BricksPayload;
		} else if (contentType.includes('application/x-www-form-urlencoded')) {
			payload = Object.fromEntries(new URLSearchParams(new TextDecoder().decode(body)).entries());
		} else {
			return jsonResponse({ error: 'Unsupported intake content type' }, 415);
		}
	} catch {
		return jsonResponse({ error: 'Malformed intake payload' }, 400);
	}

	const formId =
		textField(payload, 'form_id') || request.headers.get('x-bricks-form-id')?.trim() || '';
	const externalId =
		textField(payload, 'external_submission_id') || textField(payload, 'submission_id');
	const firstName = textField(payload, 'first_name') || textField(payload, 'name');
	const email = textField(payload, 'email');
	const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
	if (!formId || !externalId || !firstName || !email || !/^\S+@\S+\.\S+$/.test(email)) {
		if (supabaseUrl && serviceRoleKey && formId && externalId)
			await recordRejection(
				supabaseUrl,
				serviceRoleKey,
				formId,
				externalId,
				payload,
				'form_id, external_submission_id, first_name, and valid email are required'
			);
		return jsonResponse(
			{ error: 'form_id, external_submission_id, first_name, and valid email are required' },
			422
		);
	}
	const expectedFormId = Deno.env.get('BRICKS_FORM_ID')?.trim() || 'contact-form';
	const message = textField(payload, 'message');
	if (formId !== expectedFormId) {
		if (supabaseUrl && serviceRoleKey)
			await recordRejection(
				supabaseUrl,
				serviceRoleKey,
				formId,
				externalId,
				payload,
				'Unknown Bricks form'
			);
		return jsonResponse({ error: 'Unknown Bricks form' }, 422);
	}
	if (email.length > 320 || firstName.length > 120 || message.length > 10_000) {
		if (supabaseUrl && serviceRoleKey)
			await recordRejection(
				supabaseUrl,
				serviceRoleKey,
				formId,
				externalId,
				payload,
				'Intake field length is invalid'
			);
		return jsonResponse({ error: 'Intake field length is invalid' }, 422);
	}

	if (!supabaseUrl || !serviceRoleKey)
		return jsonResponse({ error: 'Trusted intake is not configured' }, 503);

	const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_bricks_lead`, {
		method: 'POST',
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			p_form_id: formId,
			p_external_submission_id: externalId,
			p_payload: normalizedPayload(payload)
		})
	});
	const responseBody = await rpcResponse
		.json()
		.catch(() => ({ error: 'Invalid trusted intake response' }));
	if (!rpcResponse.ok)
		await recordRejection(
			supabaseUrl,
			serviceRoleKey,
			formId,
			externalId,
			payload,
			`Trusted intake failed with HTTP ${rpcResponse.status}`
		);
	return jsonResponse(
		(responseBody && typeof responseBody === 'object'
			? responseBody
			: { error: 'Intake failed' }) as Record<string, unknown>,
		rpcResponse.ok ? 201 : 422
	);
});
