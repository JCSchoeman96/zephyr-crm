import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { SendPulseAdapter } from '$lib/domain/communications/sendpulse-adapter';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown) {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export const POST: RequestHandler = async ({ request }) => {
	const expectedSecret = env.AUTOMATION_CRON_SECRET?.trim();
	if (!expectedSecret) return json({ error: 'Automation is not configured' }, { status: 503 });
	if (request.headers.get('authorization') !== `Bearer ${expectedSecret}`) {
		return json({ error: 'Invalid automation authorization' }, { status: 401 });
	}

	const body = record(await request.json().catch(() => ({})));
	const runId = text(body.run_id) || crypto.randomUUID();
	const requestedLimit = Number(body.limit);
	const limit =
		Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : null;
	const supabase = createTrustedSupabaseClient();
	const processed = await supabase.rpc('process_reminders', {
		p_run_id: runId,
		...(limit === null ? {} : { p_limit: limit })
	});
	if (processed.error)
		return json({ error: processed.error.message, run_id: runId }, { status: 502 });

	const result = record(processed.data);
	const claims = Array.isArray(result.claims) ? result.claims : [];
	const outcomes: JsonRecord[] = [];
	const clientId = env.SENDPULSE_CLIENT_ID?.trim();
	const clientSecret = env.SENDPULSE_CLIENT_SECRET?.trim();
	if (claims.length > 0 && (!clientId || !clientSecret)) {
		return json(
			{ error: 'SendPulse integration is not configured', run_id: runId },
			{ status: 503 }
		);
	}
	const adapter =
		clientId && clientSecret
			? new SendPulseAdapter({
					clientId,
					clientSecret,
					baseUrl: env.SENDPULSE_API_BASE_URL?.trim() || undefined,
					senderEmail: env.SENDPULSE_SENDER_EMAIL?.trim() || undefined,
					senderName: env.SENDPULSE_SENDER_NAME?.trim() || undefined
				})
			: null;

	for (const value of claims) {
		const claim = record(value);
		const taskId = text(claim.task_id);
		try {
			if (!adapter) throw new Error('SendPulse integration is not configured');
			const recipient = record(claim.recipient);
			const subject = text(claim.subject);
			const sent = await adapter.sendEmail({
				to: [{ email: text(recipient.email), name: text(recipient.name) }],
				subject,
				html: `<p>Reminder: ${escapeHtml(subject)}</p>`
			});
			const completed = await supabase.rpc('record_task_reminder', {
				p_task_id: taskId,
				p_run_id: runId,
				p_provider_message_id: sent.providerMessageId
			});
			if (completed.error) throw new Error(completed.error.message);
			outcomes.push(record(completed.data));
		} catch (error) {
			const failed = await supabase.rpc('record_task_reminder', {
				p_task_id: taskId,
				p_run_id: runId,
				p_error: error instanceof Error ? error.message : 'Reminder provider failed'
			});
			if (failed.error)
				return json({ error: failed.error.message, run_id: runId }, { status: 502 });
			outcomes.push(record(failed.data));
		}
	}

	return json({ ...result, outcomes });
};
