import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import {
	SendPulseAdapter,
	SendPulseSubmissionUnknownError
} from '$lib/domain/communications/sendpulse-adapter';
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

type AutomationRunStatus = 'running' | 'succeeded' | 'partial_failure' | 'failed';

let reminderFinalizationFaultInjected = false;

function shouldInjectReminderFinalizationFailure(): boolean {
	if (env.NODE_ENV === 'production' || env.ZEPHYR_TEST_FAIL_REMINDER_FINALIZATION_ONCE !== '1') {
		return false;
	}
	if (reminderFinalizationFaultInjected) return false;
	reminderFinalizationFaultInjected = true;
	return true;
}

function storedRunResult(row: JsonRecord, idempotent: boolean): JsonRecord {
	return {
		run_id: row.run_id,
		status: row.status,
		created_tasks: Number(row.created_tasks ?? 0),
		expired_quotes: Number(row.expired_quotes ?? 0),
		claims_count: Number(row.claims_count ?? 0),
		sent_count: Number(row.sent_count ?? 0),
		failed_count: Number(row.failed_count ?? 0),
		unknown_count: Number(row.unknown_count ?? 0),
		error_message: row.error_message ?? null,
		idempotent
	};
}

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
	const existingRun = await supabase
		.from('automation_runs')
		.select('*')
		.eq('run_id', runId)
		.maybeSingle();
	if (existingRun.error) {
		return json({ error: 'Automation run state is unavailable', run_id: runId }, { status: 503 });
	}
	if (existingRun.data) {
		if (existingRun.data.status !== 'running') {
			return json(storedRunResult(existingRun.data as JsonRecord, true));
		}
		return json(
			{ error: 'Automation run is already running', run_id: runId, status: 'running' },
			{ status: 409 }
		);
	}
	const insertedRun = await supabase.from('automation_runs').insert({
		run_id: runId,
		status: 'running',
		started_at: new Date().toISOString()
	});
	if (insertedRun.error) {
		const racedRun = await supabase
			.from('automation_runs')
			.select('*')
			.eq('run_id', runId)
			.maybeSingle();
		if (!racedRun.error && racedRun.data && racedRun.data.status !== 'running') {
			return json(storedRunResult(racedRun.data as JsonRecord, true));
		}
		return json({ error: 'Automation run could not be claimed', run_id: runId }, { status: 409 });
	}
	const finishRun = async (values: {
		status: Exclude<AutomationRunStatus, 'running'>;
		created_tasks?: number;
		expired_quotes?: number;
		claims_count?: number;
		sent_count?: number;
		failed_count?: number;
		unknown_count?: number;
		error_message?: string | null;
	}) => {
		await supabase
			.from('automation_runs')
			.update({ ...values, finished_at: new Date().toISOString() })
			.eq('run_id', runId)
			.eq('status', 'running');
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
		return json(
			{ error: processed.error.message, run_id: runId, status: 'failed' },
			{ status: 502 }
		);
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
			const started = await supabase.rpc('start_task_reminder', {
				p_task_id: taskId,
				p_run_id: runId
			});
			if (started.error) throw new Error(started.error.message);
			const startedResult = record(started.data);
			if (startedResult.idempotent === true || startedResult.status === 'submission_unknown') {
				outcomes.push(startedResult);
				continue;
			}
			const recipient = record(claim.recipient);
			const subject = text(claim.subject);
			const sent = await adapter.sendEmail({
				to: [{ email: text(recipient.email), name: text(recipient.name) }],
				subject,
				html: `<p>Reminder: ${escapeHtml(subject)}</p>`
			});
			const completed = shouldInjectReminderFinalizationFailure()
				? { data: null, error: { message: 'Deterministic local reminder finalization failure' } }
				: await supabase.rpc('record_task_reminder', {
						p_task_id: taskId,
						p_run_id: runId,
						p_provider_message_id: sent.providerMessageId
					});
			if (completed.error) {
				const acknowledged = await supabase.rpc('mark_task_reminder_unknown', {
					p_task_id: taskId,
					p_run_id: runId,
					p_provider_message_id: sent.providerMessageId,
					p_error: completed.error.message
				});
				if (acknowledged.error) {
					await recordOperationalEvent({
						severity: 'critical',
						source: 'reminder_processor',
						eventType: 'finalization_ack_failure',
						message:
							'Provider accepted a reminder but CRM finalization evidence could not be persisted'
					});
					await finishRun({
						status: 'failed',
						claims_count: claims.length,
						failed_count: outcomes.length + 1,
						error_message: 'Reminder finalization evidence could not be persisted'
					});
					return json(
						{
							error: 'Reminder finalization evidence could not be persisted',
							run_id: runId,
							status: 'failed'
						},
						{ status: 502 }
					);
				}
				outcomes.push(record(acknowledged.data));
				continue;
			}
			outcomes.push(record(completed.data));
		} catch (error) {
			const unknown = error instanceof SendPulseSubmissionUnknownError;
			const failed = unknown
				? await supabase.rpc('mark_task_reminder_unknown', {
						p_task_id: taskId,
						p_run_id: runId,
						p_error:
							error instanceof Error ? error.message : 'Reminder provider acknowledgement was lost'
					})
				: await supabase.rpc('record_task_reminder', {
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
				return json(
					{ error: failed.error.message, run_id: runId, status: 'failed' },
					{ status: 502 }
				);
			}
			outcomes.push(record(failed.data));
		}
	}

	const failedCount = outcomes.filter((outcome) => outcome.status === 'failed').length;
	const unknownCount = outcomes.filter((outcome) => outcome.status === 'submission_unknown').length;
	const runStatus: Exclude<AutomationRunStatus, 'running'> =
		failedCount > 0 || unknownCount > 0 ? 'partial_failure' : 'succeeded';
	await finishRun({
		status: runStatus,
		created_tasks: Number(result.created_tasks ?? 0),
		expired_quotes: Number(result.expired_quotes ?? 0),
		claims_count: claims.length,
		sent_count: outcomes.filter((outcome) => outcome.status === 'sent').length,
		failed_count: failedCount,
		unknown_count: unknownCount
	});
	return json({ ...result, run_id: runId, status: runStatus, outcomes, idempotent: false });
};
