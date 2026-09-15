<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import { activityEventLabel } from '$lib/domain/presentation/labels';
	import type { LeadDetailActivity } from '$lib/domain/leads/detail-types';

	let { activities }: { activities: LeadDetailActivity[] } = $props();

	function dateTime(value: string) {
		return new Date(value).toLocaleString('en-ZA');
	}

	function actorLabel(activity: LeadDetailActivity) {
		return activity.actor_id ? 'Staff member' : 'System';
	}
</script>

<Card>
	<SectionHeader
		title="History"
		description="A chronological record of what happened with this enquiry."
	/>
	{#if activities.length === 0}
		<EmptyState
			title="No history yet"
			message="Activity will appear here as the enquiry moves forward."
		/>
	{:else}<ol class="timeline">
			{#each activities as activity (activity.id)}<li class="timeline-item">
					<div class="timeline-marker" aria-hidden="true"></div>
					<div class="timeline-content">
						<div class="timeline-meta">
							<span>{dateTime(activity.occurred_at)}</span>
							<span>{actorLabel(activity)}</span>
						</div>
						<strong>{activity.summary}</strong>
						<span class="timeline-event">{activityEventLabel(activity.event_type)}</span>
						{#if activity.metadata && typeof activity.metadata === 'object'}<details
								class="metadata-disclosure"
							>
								<summary>Details</summary>
								<pre>{JSON.stringify(activity.metadata, null, 2)}</pre>
							</details>{/if}
					</div>
				</li>{/each}
		</ol>{/if}
</Card>

<style>
	.timeline {
		display: grid;
		gap: var(--space-lg);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.timeline-item {
		display: grid;
		grid-template-columns: 0.75rem minmax(0, 1fr);
		gap: var(--space-md);
	}
	.timeline-marker {
		width: 0.75rem;
		height: 0.75rem;
		margin-top: 0.3rem;
		border: 2px solid var(--color-brand-primary);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
	}
	.timeline-content {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-lg);
		border-bottom: 1px solid var(--color-border);
	}
	.timeline-meta,
	.timeline-event {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.timeline-meta {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}
	.timeline-content strong {
		color: var(--color-text);
		font-size: var(--font-size-md);
	}
	.metadata-disclosure {
		margin-top: var(--space-sm);
	}
	.metadata-disclosure summary {
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: var(--font-size-xs);
	}
	.metadata-disclosure pre {
		max-width: 100%;
		margin: var(--space-sm) 0 0;
		overflow-x: auto;
		padding: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
		color: var(--color-text);
		font-size: var(--font-size-xs);
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
