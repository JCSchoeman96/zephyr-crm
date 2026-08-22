import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { SendPulseAdapter } from '$lib/domain/communications/sendpulse-adapter';
import { createTrustedSupabaseClient } from '$lib/server/trusted-supabase';
import { verifyBearerSecret } from '$lib/security/secrets';
import { recordOperationalEvent } from '$lib/server/operational-events';

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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request }) => {
	const expectedSecret = env.AUTOMATION_CRON_SECRET?.trim();
	if (!expectedSecret) return json({ error: 'Automation is not configured' }, { status: 503 });
	if (!(await verifyBearerSecret(request.headers.get('authorization'), expectedSecret))) {
		return json({ error: 'Invalid automation authorization' }, { status: 401 });
	}

	const body = record(await request.json().catch(() => ({})));
	const requestedRunId = text(body.run_id);
	const runId = uuidPattern.test(requestedRunId) ? requestedRunId : crypto.randomUUID();
	const requestedLimit = Number(body.limit);
	const limit =
		Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : null;
	const supabase = createTrustedSupabaseClient();
	await supabase
		.from('automation_runs')
		.upsert(
			{ run_id: runId, status: 'running', started_at: new Date().toISOString() },
			{ onConflict: 'run_id' }
		);
	const finishRun = async (values: {
		status: 'succeeded' | 'failed';
		created_tasks?: number;
		expired_quotes?: number;
		claims_count?: number;
		sent_count?: number;
		failed_count?: number;
		error_message?: string | null;
	}) => {
		await supabase
			.from('automation_runs')
			.update({ ...values, finished_at: new Date().toISOString() })
			.eq('run_id', runId);
	};
	const processed = await supabase.rpc('process_reminders', {
		p_run_id: runId,
		...(limit === null ? {} : { p_limit: limit })
	});
	if (processed.error) {
		await recordOperationalEvent({
			severity: 'error',
			source: 'reminder_processor',
			eventType: 'claim_failure',
			message: 'Reminder claim processing failed'
		});
		await finishRun({ status: 'failed', error_message: 'Reminder claim processing failed' });
		return json({ error: processed.error.message, run_id: runId }, { status: 502 });
	}

	const result = record(processed.data);
	const claims = Array.isArray(result.claims) ? result.claims : [];
	const outcomes: JsonRecord[] = [];
	const clientId = env.SENDPULSE_CLIENT_ID?.trim();
	const clientSecret = env.SENDPULSE_CLIENT_SECRET?.trim();
	if (claims.length > 0 && (!clientId || !clientSecret)) {
		await recordOperationalEvent({
			severity: 'error',
			source: 'reminder_processor',
			eventType: 'provider_not_configured',
			message: 'SendPulse integration is not configured'
		});
		await finishRun({
			status: 'failed',
			claims_count: claims.length,
			error_message: 'SendPulse integration is not configured'
		});
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
			if (failed.error) {
				await recordOperationalEvent({
					severity: 'critical',
					source: 'reminder_processor',
					eventType: 'outcome_record_failure',
					message: 'Reminder outcome recording failed'
				});
				await finishRun({
					status: 'failed',
					claims_count: claims.length,
					failed_count: outcomes.length + 1,
					error_message: 'Reminder outcome recording failed'
				});
				return json({ error: failed.error.message, run_id: runId }, { status: 502 });
			}
			outcomes.push(record(failed.data));
		}
	}

	const failedCount = outcomes.filter((outcome) => outcome.status === 'failed').length;
	await finishRun({
		status: 'succeeded',
		created_tasks: Number(result.created_tasks ?? 0),
		expired_quotes: Number(result.expired_quotes ?? 0),
		claims_count: claims.length,
		sent_count: claims.length - failedCount,
		failed_count: failedCount
	});
	return json({ ...result, outcomes });
};
