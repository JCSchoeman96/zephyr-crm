<script lang="ts">
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import type { PageData } from './$types';

	type Diagnostics = {
		generated_at: string;
		bricks: {
			last_success_at: string | null;
			last_failure_at: string | null;
			failed_last_24h: number;
		};
		sendpulse: {
			last_send_at: string | null;
			last_webhook_at: string | null;
			failed_outbound_last_24h: number;
			failed_outbound_total: number;
			submission_unknown_total: number;
			stale_submitting_total: number;
		};
		reminders: {
			last_run_at: string | null;
			last_run_status: string | null;
			failed_last_24h: number;
			partial_runs_last_24h: number;
			failed_tasks_last_24h: number;
			submission_unknown_tasks: number;
			stale_submitting_tasks: number;
			latest_run_error: string | null;
		};
		critical_errors: Array<{
			severity: string;
			source: string;
			event_type: string;
			message: string;
			occurred_at: string;
		}>;
	};

	let { data }: { data: PageData } = $props();
	const diagnostics = $derived(data.diagnostics as unknown as Diagnostics);

	function timestamp(value: string | null) {
		return value ? new Date(value).toLocaleString() : 'No evidence recorded';
	}

	function healthLabel(needsAttention: boolean) {
		return needsAttention ? 'Needs attention' : 'Healthy';
	}

	function healthTone(needsAttention: boolean) {
		return needsAttention ? 'warning' : 'success';
	}

	const websiteNeedsAttention = $derived(
		diagnostics.bricks.failed_last_24h > 0 ||
			(diagnostics.bricks.last_failure_at != null &&
				(diagnostics.bricks.last_success_at == null ||
					diagnostics.bricks.last_failure_at > diagnostics.bricks.last_success_at))
	);
	const emailNeedsAttention = $derived(
		diagnostics.sendpulse.failed_outbound_last_24h > 0 ||
			diagnostics.sendpulse.submission_unknown_total > 0 ||
			diagnostics.sendpulse.stale_submitting_total > 0
	);
	const automationNeedsAttention = $derived(
		diagnostics.reminders.failed_tasks_last_24h > 0 ||
			diagnostics.reminders.partial_runs_last_24h > 0 ||
			diagnostics.reminders.submission_unknown_tasks > 0 ||
			diagnostics.reminders.stale_submitting_tasks > 0 ||
			Boolean(diagnostics.reminders.latest_run_error)
	);
</script>

<svelte:head>
	<title>System Health | Zephyr CRM</title>
	<meta name="description" content="Redacted operational health and failure evidence" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.profile.role} context="System Health">
	<PageHeader
		title="System Health"
		description="Is Zephyr's intake, email delivery, and follow-up automation healthy?"
	/>

	<section class="health-summary" aria-label="System health overview">
		<Card title="Website enquiries">
			<Badge tone={healthTone(websiteNeedsAttention)}>{healthLabel(websiteNeedsAttention)}</Badge>
			<p class="health-copy">
				Last accepted {timestamp(diagnostics.bricks.last_success_at)}. Failures in the last 24
				hours: {diagnostics.bricks.failed_last_24h}.
			</p>
		</Card>
		<Card title="Email delivery">
			<Badge tone={healthTone(emailNeedsAttention)}>{healthLabel(emailNeedsAttention)}</Badge>
			<p class="health-copy">
				Last accepted send {timestamp(diagnostics.sendpulse.last_send_at)}. Failed outbound in the
				last 24 hours: {diagnostics.sendpulse.failed_outbound_last_24h}.
			</p>
		</Card>
		<Card title="Follow-up automation">
			<Badge tone={healthTone(automationNeedsAttention)}
				>{healthLabel(automationNeedsAttention)}</Badge
			>
			<p class="health-copy">
				Last run {timestamp(diagnostics.reminders.last_run_at)}. Failed follow-up tasks in the last
				24 hours: {diagnostics.reminders.failed_tasks_last_24h}.
			</p>
		</Card>
	</section>

	<details class="diagnostics">
		<summary>Technical details</summary>
		<div class="operations-grid">
			<Card title="Website enquiries evidence">
				<dl>
					<div>
						<dt>Last accepted</dt>
						<dd>{timestamp(diagnostics.bricks.last_success_at)}</dd>
					</div>
					<div>
						<dt>Last rejected/failed</dt>
						<dd>{timestamp(diagnostics.bricks.last_failure_at)}</dd>
					</div>
					<div>
						<dt>Failures, last 24h</dt>
						<dd>{diagnostics.bricks.failed_last_24h}</dd>
					</div>
				</dl>
			</Card>
			<Card title="Email delivery evidence">
				<dl>
					<div>
						<dt>Last accepted send</dt>
						<dd>{timestamp(diagnostics.sendpulse.last_send_at)}</dd>
					</div>
					<div>
						<dt>Last webhook</dt>
						<dd>{timestamp(diagnostics.sendpulse.last_webhook_at)}</dd>
					</div>
					<div>
						<dt>Failed outbound, last 24h</dt>
						<dd>{diagnostics.sendpulse.failed_outbound_last_24h}</dd>
					</div>
					<div>
						<dt>Submission uncertainty</dt>
						<dd>{diagnostics.sendpulse.submission_unknown_total}</dd>
					</div>
					<div>
						<dt>Stale submitting</dt>
						<dd>{diagnostics.sendpulse.stale_submitting_total}</dd>
					</div>
				</dl>
			</Card>
			<Card title="Follow-up automation evidence">
				<dl>
					<div>
						<dt>Last run</dt>
						<dd>{timestamp(diagnostics.reminders.last_run_at)}</dd>
					</div>
					<div>
						<dt>Last status</dt>
						<dd>{diagnostics.reminders.last_run_status ?? 'No evidence recorded'}</dd>
					</div>
					<div>
						<dt>Failed tasks, last 24h</dt>
						<dd>{diagnostics.reminders.failed_tasks_last_24h}</dd>
					</div>
					<div>
						<dt>Partial runs, last 24h</dt>
						<dd>{diagnostics.reminders.partial_runs_last_24h}</dd>
					</div>
					<div>
						<dt>Uncertain reminders</dt>
						<dd>{diagnostics.reminders.submission_unknown_tasks}</dd>
					</div>
					<div>
						<dt>Stale submitting reminders</dt>
						<dd>{diagnostics.reminders.stale_submitting_tasks}</dd>
					</div>
					<div>
						<dt>Latest run error</dt>
						<dd>{diagnostics.reminders.latest_run_error ?? 'None recorded'}</dd>
					</div>
				</dl>
			</Card>
		</div>

		<Card title="Critical function errors">
			{#if diagnostics.critical_errors.length === 0}
				<p class="empty">No critical or error events recorded.</p>
			{:else}
				<ul class="error-list">
					{#each diagnostics.critical_errors as event, index (event.occurred_at + event.source + event.event_type + index)}
						<li>
							<Badge tone={event.severity === 'critical' ? 'danger' : 'warning'}
								>{event.severity}</Badge
							>
							<div>
								<strong>{event.source} · {event.event_type}</strong><span>{event.message}</span
								><small>{timestamp(event.occurred_at)}</small>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</details>
	<p class="generated">
		Generated {timestamp(diagnostics.generated_at)} · Owner/Admin access only. No secrets or raw provider
		payloads are shown.
	</p>
</AppShell>

<style>
	.health-summary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-lg);
		margin-bottom: var(--space-xl);
	}
	.health-copy {
		margin: var(--space-md) 0 0;
		color: var(--color-text-muted);
	}
	.diagnostics {
		margin-bottom: var(--space-lg);
	}
	.diagnostics > summary {
		cursor: pointer;
		margin-bottom: var(--space-lg);
		font-weight: var(--font-weight-semibold);
	}
	.operations-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-lg);
		margin-bottom: var(--space-lg);
	}
	dl {
		display: grid;
		gap: var(--space-md);
		margin: 0;
	}
	dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	dd {
		margin: var(--space-xs) 0 0;
	}
	.error-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.error-list li {
		display: flex;
		gap: var(--space-md);
		align-items: flex-start;
	}
	.error-list div {
		display: grid;
		gap: var(--space-xs);
	}
	.error-list span,
	.error-list small,
	.empty,
	.generated {
		color: var(--color-text-muted);
	}
	@media (max-width: 56rem) {
		.health-summary,
		.operations-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
