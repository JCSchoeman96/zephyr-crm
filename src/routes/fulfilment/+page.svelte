<script lang="ts">
	import { navigating } from '$app/state';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatCard from '$lib/components/ui/StatCard.svelte';
	import FulfilmentQueueTable from '$lib/components/fulfilment/FulfilmentQueueTable.svelte';
	import { fulfilmentQueueKeys } from '$lib/domain/fulfilment/queues';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data }: { data: PageData } = $props();

	function queueSummary(key: (typeof fulfilmentQueueKeys)[number]) {
		return data.queues[key];
	}
</script>

<svelte:head>
	<title>Fulfilment | Zephyr CRM</title>
	<meta name="description" content="Operational work queues for accepted sales" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader
		title="Fulfilment"
		description="Work starts when a quote is accepted and stays linked to the customer, quote, work, payments, and history."
	>
		{#snippet actions()}
			<RealtimeStatus scope="fulfilment" tables={['tasks', 'quotes']} />
		{/snippet}
	</PageHeader>

	{#if navigating.to}<LoadingState message="Loading Fulfilment queues…" />{/if}

	<section class="queue-summary" aria-label="Fulfilment queue counts">
		{#each fulfilmentQueueKeys as key (key)}
			{@const queue = queueSummary(key)}
			<StatCard label={queue.title} value={String(queue.rows.length)} detail="Work items" />
		{/each}
	</section>

	<section class="queue-list" aria-label="Fulfilment work queues">
		{#each fulfilmentQueueKeys as key (key)}
			{@const queue = queueSummary(key)}
			<Card class="queue-card">
				<div class="queue-heading">
					<div>
						<h2 id={`${key}-heading`}>{queue.title}</h2>
						<p>{queue.description}</p>
					</div>
					<span class="queue-count">{queue.rows.length}</span>
				</div>
				{#if queue.rows.length === 0}
					<EmptyState title="Queue is clear" message="No fulfilment records match this queue." />
				{:else}
					<FulfilmentQueueTable {queue} rows={queue.rows} />
				{/if}
			</Card>
		{/each}
	</section>
</AppShell>

<style>
	.queue-summary {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: var(--space-md);
		margin-bottom: var(--space-xl);
	}
	.queue-list {
		display: grid;
		gap: var(--space-lg);
	}
	:global(.queue-card) {
		overflow: hidden;
	}
	.queue-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-lg);
	}
	.queue-heading h2,
	.queue-heading p {
		margin: 0;
	}
	.queue-heading h2 {
		font-size: var(--font-size-lg);
	}
	.queue-heading p {
		margin-top: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.queue-count {
		display: grid;
		min-width: 2.4rem;
		min-height: 2.4rem;
		place-items: center;
		border-radius: var(--radius-full);
		background: var(--color-surface-subtle);
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
	}
	@media (max-width: 72rem) {
		.queue-summary {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 40rem) {
		.queue-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
