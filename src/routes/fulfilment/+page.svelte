<script lang="ts">
	import { navigating } from '$app/state';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import FulfilmentQueueTable from '$lib/components/fulfilment/FulfilmentQueueTable.svelte';
	import { fulfilmentQueueDefinitions, fulfilmentQueueKeys } from '$lib/domain/fulfilment/queues';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data }: { data: PageData } = $props();

	const viewLabels: Record<(typeof fulfilmentQueueKeys)[number], string> = {
		needs_planning: 'Needs planning',
		installations: 'Installations',
		courier: 'Deliveries',
		pickup: 'Collections',
		payment_attention: 'Payment attention',
		completed: 'Completed'
	};
</script>

<svelte:head>
	<title>Fulfilment | Zephyr CRM</title>
	<meta name="description" content="Operational work for accepted sales" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader title="Fulfilment" description="What must happen to complete each accepted sale.">
		{#snippet actions()}
			<RealtimeStatus
				scope="fulfilment"
				tables={[
					'quotes',
					'tasks',
					'fulfilment_cases',
					'fulfilment_steps',
					'payment_milestones',
					'activities'
				]}
			/>
		{/snippet}
	</PageHeader>

	{#if navigating.to}<LoadingState message="Loading fulfilment work…" />{/if}

	<nav class="views" aria-label="Fulfilment work views">
		{#each fulfilmentQueueKeys as key (key)}
			<a
				href={resolve(`/fulfilment?view=${key}`)}
				aria-current={data.workspace.view === key ? 'page' : undefined}
			>
				{viewLabels[key]}
				<span class="count">{data.workspace.counts[key]}</span>
			</a>
		{/each}
	</nav>

	<section aria-label={data.workspace.queue.title}>
		<p class="summary">{fulfilmentQueueDefinitions[data.workspace.view].description}</p>
		{#if data.workspace.queue.rows.length === 0}
			<EmptyState
				title="Nothing in this view"
				message="When accepted sales need this kind of work, they appear here."
			/>
		{:else}
			<FulfilmentQueueTable queue={data.workspace.queue} rows={data.workspace.queue.rows} />
		{/if}
	</section>
</AppShell>

<style>
	.views {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
	}
	.views a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		color: var(--color-text);
		text-decoration: none;
	}
	.views a[aria-current] {
		background: var(--color-brand-primary);
		color: var(--color-text-inverse);
	}
	.count {
		min-width: 1.5rem;
		padding: 0 var(--space-xs);
		border-radius: var(--radius-full);
		background: color-mix(in oklab, currentColor 16%, transparent);
		font-size: var(--font-size-sm);
		text-align: center;
	}
	.summary {
		margin: 0 0 var(--space-lg);
		color: var(--color-text-muted);
	}
</style>
