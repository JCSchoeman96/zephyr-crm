import { verifyBearerSecret } from '../_shared/security.ts';

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown) {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

async function rpc(supabaseUrl: string, serviceRoleKey: string, name: string, body: JsonRecord) {
	const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
		method: 'POST',
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	const parsed = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}`);
	return parsed;
}

async function sendPulseReminder(claim: JsonRecord) {
	const clientId = text(Deno.env.get('SENDPULSE_CLIENT_ID'));
	const clientSecret = text(Deno.env.get('SENDPULSE_CLIENT_SECRET'));
	const baseUrl = text(Deno.env.get('SENDPULSE_API_BASE_URL')) || 'https://api.sendpulse.com';
	const senderEmail = text(Deno.env.get('SENDPULSE_SENDER_EMAIL')) || 'no-reply@example.invalid';
	const senderName = text(Deno.env.get('SENDPULSE_SENDER_NAME')) || 'Zephyr CRM';
	if (!clientId || !clientSecret) throw new Error('SendPulse integration is not configured');

	const tokenResponse = await fetch(`${baseUrl}/oauth/access_token`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'client_credentials',
			client_id: clientId,
			client_secret: clientSecret
		})
	});
	const tokenBody = record(await tokenResponse.json().catch(() => ({})));
	const accessToken = text(tokenBody.access_token);
	if (!tokenResponse.ok || !accessToken) throw new Error('SendPulse authentication failed');

	const recipient = record(claim.recipient);
	const subject = text(claim.subject);
	const sendResponse = await fetch(`${baseUrl}/smtp/emails`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			email: {
				from: { email: senderEmail, name: senderName },
				to: [{ email: text(recipient.email), name: text(recipient.name) }],
				subject,
				html: `<p>Reminder: ${subject.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`
			}
		})
	});
	const sendBody = record(await sendResponse.json().catch(() => ({})));
	const providerMessageId = text(sendBody.id ?? sendBody.message_id);
	if (!sendResponse.ok || sendBody.result !== true || !providerMessageId) {
		throw new Error('SendPulse email submission failed');
	}
	return providerMessageId;
}

Deno.serve(async (request) => {
	if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
	const expectedSecret = text(Deno.env.get('AUTOMATION_CRON_SECRET'));
	if (!(await verifyBearerSecret(request.headers.get('authorization'), expectedSecret))) {
		return jsonResponse({ error: 'Invalid automation authorization' }, 401);
	}

	const supabaseUrl = text(Deno.env.get('SUPABASE_URL'));
	const serviceRoleKey = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
	if (!supabaseUrl || !serviceRoleKey)
		return jsonResponse({ error: 'Trusted automation is not configured' }, 503);

	const body = record(await request.json().catch(() => ({})));
	const runId = text(body.run_id) || crypto.randomUUID();
	const requestedLimit = Number(body.limit);
	const limit =
		Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : null;
	let result: JsonRecord;
	try {
		result = record(
			await rpc(supabaseUrl, serviceRoleKey, 'process_reminders', {
				p_run_id: runId,
				p_limit: limit
			})
		);
	} catch {
		return jsonResponse({ error: 'Reminder claim processing failed', run_id: runId }, 502);
	}

	const claims = Array.isArray(result.claims) ? result.claims : [];
	const outcomes: JsonRecord[] = [];
	for (const value of claims) {
		const claim = record(value);
		const taskId = text(claim.task_id);
		try {
			const providerMessageId = await sendPulseReminder(claim);
			outcomes.push(
				(await rpc(supabaseUrl, serviceRoleKey, 'record_task_reminder', {
					p_task_id: taskId,
					p_run_id: runId,
					p_provider_message_id: providerMessageId,
					p_error: null
				})) as JsonRecord
			);
		} catch (error) {
			outcomes.push(
				(await rpc(supabaseUrl, serviceRoleKey, 'record_task_reminder', {
					p_task_id: taskId,
					p_run_id: runId,
					p_provider_message_id: null,
					p_error: error instanceof Error ? error.message : 'Reminder provider failed'
				})) as JsonRecord
			);
		}
	}

	return jsonResponse({ ...result, outcomes });
});
