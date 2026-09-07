<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { followUpLabel, leadStageLabel, leadStageMeaning } from '$lib/domain/presentation/labels';
	import { publicClientConfiguration } from '$lib/config/public-client-config';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';
	let { data }: { data: PageData } = $props();
	function pageHref(page: number) {
		const params = new SvelteURLSearchParams({ view: data.workspace.view, page: String(page) });
		if (data.workspace.search) params.set('q', data.workspace.search);
		if (data.workspace.closed) params.set('closed', 'true');
		if (data.workspace.attention) params.set('attention', data.workspace.attention);
		return resolve(`/sales?${params}`);
	}
	function date(value: string) {
		return new Date(value).toLocaleDateString(publicClientConfiguration.locale.language, {
			timeZone: publicClientConfiguration.locale.timezone,
			dateStyle: 'medium'
		});
	}
</script>

<svelte:head><title>Sales | {publicClientConfiguration.brand.companyName}</title></svelte:head>
<AppShell context="Sales" userEmail={data.auth.user?.email} userRole={data.profile.role}>
	<PageHeader title="Sales" description="Keep every enquiry moving toward a customer decision.">
		{#snippet actions()}<RealtimeStatus scope="sales-workspace" tables={['leads']} />{/snippet}
	</PageHeader>
	<nav class="views" aria-label="Sales work views">
		{#each data.views as [key, label] (key)}
			<a
				href={resolve(`/sales?view=${key}`)}
				aria-current={data.workspace.view === key ? 'page' : undefined}>{label}</a
			>
		{/each}
	</nav>
	<Card>
		<form method="GET" class="filters" aria-label="Find sales work">
			<input type="hidden" name="view" value={data.workspace.view} />
			{#if data.workspace.attention}<input
					type="hidden"
					name="attention"
					value={data.workspace.attention}
				/>{/if}
			<Input
				id="sales-search"
				name="q"
				label="Find an enquiry or company"
				value={data.workspace.search}
			/>
			{#if data.workspace.view === 'all'}<label
					><input type="checkbox" name="closed" value="true" checked={data.workspace.closed} /> Include
					closed enquiries</label
				>{/if}
			<Button type="submit" variant="secondary">Search</Button>
		</form>
	</Card>
	<p class="summary">Showing up to {data.workspace.pageSize} enquiries, oldest activity first.</p>
	{#if data.workspace.view === 'attention'}<p class="summary">
			Active, unpaused enquiries marked "{followUpLabel(
				data.workspace.attention ?? 'waiting_on_us'
			)}". Open Home for due follow-ups.
		</p>{/if}
	{#if data.workspace.rows.length === 0}
		<EmptyState
			title="No enquiries in this view"
			message="Choose another view or clear your search to find more work."
		/>
	{:else}
		<ul class="work-list" aria-label="Enquiries">
			{#each data.workspace.rows as row (row.id)}
				<li>
					<div class="identity">
						<h2>{row.first_name} {row.last_name}</h2>
						<p>{row.company ?? `Enquiry #${row.lead_number}`}</p>
						<small>Received {date(row.created_at)}</small>
					</div>
					<div class="reason">
						<Badge tone={row.paused_at ? 'warning' : 'neutral'}
							>{row.paused_at ? 'Paused' : leadStageLabel(row.pipeline_stage)}</Badge
						>
						<p>
							{row.paused_at
								? (row.pause_reason ?? 'Resume this enquiry before continuing.')
								: (row.attention_reason ??
									(row.attention_state !== 'none'
										? followUpLabel(row.attention_state)
										: leadStageMeaning(row.pipeline_stage)))}
						</p>
					</div>
					<a class="ui-button ui-button--primary ui-button--md" href={resolve(`/leads/${row.id}`)}
						>Continue<span class="sr-only"> enquiry #{row.lead_number}</span></a
					>
				</li>
			{/each}
		</ul>
	{/if}
	<nav class="pagination" aria-label="Sales pages">
		{#if data.workspace.page > 1}<a href={pageHref(data.workspace.page - 1)}>Previous</a>{/if}
		<span>Page {data.workspace.page}</span>
		{#if data.workspace.hasMore}<a href={pageHref(data.workspace.page + 1)}>Next</a>{/if}
	</nav>
</AppShell>

<style>
	.views,
	.filters,
	.pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-md);
	}
	.views {
		margin-bottom: var(--space-lg);
	}
	.views a {
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		color: var(--color-text);
	}
	.views a[aria-current] {
		background: var(--color-brand-primary);
		color: var(--color-text-inverse);
	}
	.filters {
		align-items: flex-end;
	}
	.summary,
	p,
	small {
		color: var(--color-text-muted);
	}
	.work-list {
		list-style: none;
		padding: 0;
		margin: var(--space-lg) 0;
	}
	.work-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
		align-items: center;
		gap: var(--space-lg);
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-lg) 0;
	}
	h2 {
		font-size: var(--font-size-lg);
		margin: 0;
		overflow-wrap: anywhere;
	}
	p {
		margin: var(--space-xs) 0;
		overflow-wrap: anywhere;
	}
	.pagination {
		justify-content: flex-end;
		margin-top: var(--space-lg);
	}
	.pagination a {
		padding: var(--space-sm);
	}
	@media (max-width: 640px) {
		.work-list li {
			grid-template-columns: 1fr;
			gap: var(--space-md);
		}
		.work-list a {
			justify-self: start;
		}
	}
</style>
