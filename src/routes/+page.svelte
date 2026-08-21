<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let { data }: { data: PageData } = $props();
	let brandMode = $state<'default' | 'alternate'>('default');
</script>

<svelte:head>
	<title>Zephyr CRM</title>
	<meta name="description" content="Zephyr CRM application shell" />
</svelte:head>

<AppShell
	bind:brandMode
	userEmail={data.auth.user?.email}
	signOutAction={data.auth.user ? '?/logout' : null}
>
	<PageHeader
		title="Zephyr CRM"
		description="A focused sales workflow workspace for the next action that keeps opportunities moving."
	/>
	<div class="metric-grid" aria-label="Operational dashboard">
		<a class="metric-card" href={resolve('/tasks')}>
			<span>Open Tasks</span><strong>{data.metrics.openTasks}</strong>
		</a>
		<a class="metric-card metric-card--warning" href={resolve('/tasks?overdue=true')}>
			<span>Overdue</span><strong>{data.metrics.overdueTasks}</strong>
		</a>
		<a class="metric-card" href={resolve('/leads')}>
			<span>Active opportunities</span><strong>{data.metrics.activeLeads}</strong>
		</a>
	</div>
	<Card class="dashboard-card">
		<div class="section-heading">
			<div>
				<h2>Next actions</h2>
				<p>Due state is derived from each open Task and the current time.</p>
			</div>
			<a href={resolve('/tasks')}>View all Tasks →</a>
		</div>
		{#if data.recentTasks.length === 0}
			<p class="muted">No open Tasks are currently scheduled.</p>
		{:else}
			<ul class="task-list">
				{#each data.recentTasks as task (task.id)}
					<li>
						<div>
							<strong>{task.title}</strong><span
								>{task.type} · {task.due_at
									? new Date(task.due_at).toLocaleString('en-ZA')
									: 'No due date'}</span
							>
						</div>
						{#if task.is_overdue}<Badge tone="danger">Overdue</Badge>{:else}<Badge tone="info"
								>Open</Badge
							>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
	<p class="system-link">
		<a href={resolve('/system')}>Component lab</a> · Active user: {data.auth.user?.email ?? '—'}
	</p>
</AppShell>

<style>
	.metric-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
	}
	.metric-card {
		display: grid;
		gap: var(--space-xs);
		padding: var(--space-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
		text-decoration: none;
	}
	.metric-card:hover {
		border-color: var(--color-brand-primary);
	}
	.metric-card span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.metric-card strong {
		font-size: 2rem;
	}
	.metric-card--warning strong {
		color: var(--color-danger);
	}
	:global(.dashboard-card) {
		margin-bottom: var(--space-md);
	}
	.section-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-lg);
		margin-bottom: var(--space-lg);
	}
	.section-heading h2,
	.section-heading p,
	.muted,
	.system-link {
		margin: 0;
	}
	.section-heading p,
	.muted,
	.task-list span,
	.system-link {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.section-heading p {
		margin-top: var(--space-xs);
	}
	.section-heading a,
	.system-link a {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
	}
	.task-list {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.task-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-md) 0;
		border-top: 1px solid var(--color-border-subtle);
	}
	.task-list span {
		display: block;
		margin-top: var(--space-xs);
	}
	@media (max-width: 640px) {
		.metric-grid {
			grid-template-columns: 1fr;
		}
		.section-heading {
			flex-direction: column;
		}
	}
</style>
