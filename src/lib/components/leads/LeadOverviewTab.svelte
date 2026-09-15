<script lang="ts">
	import { resolve } from '$app/paths';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import {
		activityEventLabel,
		followUpLabel,
		leadStageMeaning,
		quoteStatusLabel,
		taskStatusLabel,
		taskTypeLabel
	} from '$lib/domain/presentation/labels';
	import { detailTabHref } from '$lib/domain/leads/detail-tabs';
	import {
		formatLeadRequestValue,
		type ParsedLeadRequestMessage
	} from '$lib/domain/leads/request-details';
	import type {
		LeadDetailActivity,
		LeadDetailLead,
		LeadDetailQuote,
		LeadDetailTask
	} from '$lib/domain/leads/detail-types';

	let {
		lead,
		currentQuoteRecord,
		tasks,
		activities,
		leadRequestDetails,
		leadRequestOpenAll
	}: {
		lead: LeadDetailLead;
		currentQuoteRecord: LeadDetailQuote | null;
		tasks: LeadDetailTask[];
		activities: LeadDetailActivity[];
		leadRequestDetails: ParsedLeadRequestMessage;
		leadRequestOpenAll: boolean;
	} = $props();

	const latestOpenTask = $derived(tasks.find((task) => task.status === 'open') ?? null);
	const recentActivities = $derived(activities.slice(0, 3));

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : '—';
	}
</script>

<div class="overview-grid">
	<Card class="state-card">
		<SectionHeader title="What’s happening" description={leadStageMeaning(lead.pipeline_stage)} />
		<div class="state-summary">
			<div>
				<span class="summary-label">Current position</span>
				<strong>{followUpLabel(lead.attention_state)}</strong>
			</div>
			<div>
				<span class="summary-label">Last meaningful update</span>
				<strong>{dateTime(lead.last_activity_at ?? lead.updated_at)}</strong>
			</div>
		</div>
		{#if lead.qualification_notes}<div class="note-block">
				<span class="summary-label">Qualification notes</span>
				<p>{lead.qualification_notes}</p>
			</div>{/if}
	</Card>

	<Card>
		<SectionHeader
			title="Current work"
			description="The open work most likely to move this enquiry forward."
		/>
		{#if latestOpenTask}
			<div class="work-preview">
				<div>
					<span class="summary-label">Follow-up action</span>
					<strong>{latestOpenTask.title}</strong>
					<span
						>{taskTypeLabel(latestOpenTask.type)} · {taskStatusLabel(latestOpenTask.status)} · {dateTime(
							latestOpenTask.due_at
						)}</span
					>
				</div>
				<a
					class="ui-button ui-button--secondary ui-button--sm"
					href={resolve(detailTabHref(lead.id, 'follow-ups'))}>Open actions</a
				>
			</div>
		{:else if currentQuoteRecord}
			<div class="work-preview">
				<div>
					<span class="summary-label">Current quote</span>
					<strong>{currentQuoteRecord.subject}</strong>
					<span
						>{currentQuoteRecord.quote_number ?? `#${currentQuoteRecord.base_quote_number}`} · {quoteStatusLabel(
							currentQuoteRecord.status
						)}</span
					>
				</div>
				<a
					class="ui-button ui-button--secondary ui-button--sm"
					href={resolve(`/quotes/${currentQuoteRecord.id}`)}>Open quote</a
				>
			</div>
		{:else}
			<p class="muted">No open follow-up or current quote is recorded.</p>
		{/if}
	</Card>

	<Card>
		<SectionHeader
			title="Recent history"
			description="A short view of what has happened. Open History for the full timeline."
		/>
		{#if recentActivities.length === 0}
			<EmptyState
				title="No history yet"
				message="Activity will appear here as the enquiry moves forward."
			/>
		{:else}<ol class="activity-list">
				{#each recentActivities as activity (activity.id)}<li>
						<strong>{activity.summary}</strong>
						<span>{activityEventLabel(activity.event_type)} · {dateTime(activity.occurred_at)}</span
						>
					</li>{/each}
			</ol>
		{/if}
		<a class="text-link" href={resolve(detailTabHref(lead.id, 'history'))}>View full history</a>
	</Card>

	<details class="request-disclosure">
		<summary>Request details</summary>
		<Card>
			<SectionHeader
				title="Captured request"
				description="Information from the original quote request."
			/>
			{#if leadRequestDetails.hasStructuredFields}
				<div class="lead-request-groups" aria-label="Captured request details">
					{#each leadRequestDetails.groups as group, index (group.key)}
						<details class="lead-request-group" open={leadRequestOpenAll || index === 0}>
							<summary class="lead-request-group__summary">
								<strong>{group.title}</strong>
								{#if group.summary}<span>{group.summary}</span>{/if}
							</summary>
							{#if group.key === 'notes'}
								<p class="lead-request-note">{leadRequestDetails.notes}</p>
							{:else}<dl class="lead-request-fields">
									{#each group.fields as field (field.key)}<div>
											<dt>{field.label}</dt>
											<dd>{formatLeadRequestValue(field.key, field.value)}</dd>
										</div>{/each}
								</dl>{/if}
						</details>
					{/each}
				</div>
			{:else if leadRequestDetails.fallbackMessage}
				<p class="lead-request-note">{leadRequestDetails.fallbackMessage}</p>
			{:else}<p class="muted">No captured request details.</p>{/if}
		</Card>
	</details>
</div>

<style>
	.overview-grid,
	.state-summary,
	.lead-request-groups,
	.lead-request-fields,
	.activity-list {
		display: grid;
		gap: var(--space-lg);
	}
	.overview-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.overview-grid > :first-child,
	.request-disclosure {
		grid-column: 1 / -1;
	}
	.state-summary {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-top: var(--space-lg);
	}
	.state-summary > div,
	.work-preview {
		display: grid;
		gap: var(--space-xs);
	}
	.summary-label {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.state-summary strong,
	.work-preview strong {
		color: var(--color-text);
	}
	.note-block {
		margin-top: var(--space-lg);
		padding: var(--space-lg);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
		color: var(--color-text);
	}
	.note-block p {
		margin: var(--space-sm) 0 0;
		white-space: pre-wrap;
	}
	.work-preview {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}
	.work-preview > div {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
	}
	.work-preview span:not(.summary-label),
	.activity-list span,
	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.activity-list {
		margin: 0 0 var(--space-lg);
		padding: 0;
		list-style: none;
	}
	.activity-list li {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border);
	}
	.text-link {
		color: var(--color-brand-primary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.request-disclosure > summary {
		padding: var(--space-sm) 0;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.lead-request-group {
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.lead-request-group > summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xs);
		min-height: 3.5rem;
		padding: var(--space-md) var(--space-lg);
		color: var(--color-text);
		cursor: pointer;
		list-style: none;
	}
	.lead-request-group > summary::-webkit-details-marker {
		display: none;
	}
	.lead-request-group > summary span {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.lead-request-group > summary::after {
		flex: 0 0 auto;
		color: var(--color-brand-primary);
		content: '+';
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: 1;
	}
	.lead-request-group[open] > summary {
		border-bottom: 1px solid var(--color-border);
	}
	.lead-request-group[open] > summary::after {
		content: '−';
	}
	.lead-request-group__summary strong {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
	}
	.lead-request-fields {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0;
		padding: var(--space-lg);
	}
	.lead-request-fields div {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}
	.lead-request-fields dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.lead-request-fields dd {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.lead-request-fields > div:last-child {
		border-bottom: 0;
	}
	.lead-request-note {
		margin: 0;
		padding: var(--space-lg);
		background: var(--color-brand-accent-soft);
		color: var(--color-text);
		white-space: pre-wrap;
	}
	@media (max-width: 760px) {
		.overview-grid,
		.state-summary,
		.lead-request-fields {
			grid-template-columns: 1fr;
		}
	}
	@media (min-width: 761px) {
		.lead-request-fields > div:nth-last-child(2):nth-child(odd) {
			border-bottom: 0;
		}
	}
</style>
