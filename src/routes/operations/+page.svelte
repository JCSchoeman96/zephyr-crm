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
</script>

<svelte:head>
	<title>Operations | Zephyr CRM</title>
	<meta name="description" content="Redacted operational health and failure evidence" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.profile.role} context="Operations">
	<PageHeader
		title="Operations"
		description="Redacted integration, automation, and failure evidence. No raw payloads or secrets are shown."
	/>

	<div class="operations-grid">
		<Card title="Bricks intake">
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
		<Card title="SendPulse">
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
		<Card title="Reminder processor">
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
							<strong>{event.source} · {event.event_type}</strong><span>{event.message}</span><small
								>{timestamp(event.occurred_at)}</small
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
	<p class="generated">
		Generated {timestamp(diagnostics.generated_at)} · Owner/Admin access only.
	</p>
</AppShell>

<style>
	.operations-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-xl);
		margin-bottom: var(--space-xl);
	}
	dl {
		display: grid;
		gap: var(--space-md);
		margin: 0;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
	}
	dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	dd {
		margin: 0;
		text-align: right;
		font-weight: 650;
	}
	.empty,
	.generated {
		color: var(--color-text-muted);
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
		align-items: flex-start;
		gap: var(--space-md);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.error-list li:last-child {
		padding-bottom: 0;
		border-bottom: 0;
	}
	.error-list div {
		display: grid;
		gap: var(--space-xs);
	}
	.error-list span,
	.error-list small {
		color: var(--color-text-muted);
	}
	.generated {
		margin: var(--space-md) 0 0;
		font-size: var(--font-size-sm);
	}
	@media (max-width: 900px) {
		.operations-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
