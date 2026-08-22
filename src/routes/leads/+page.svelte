<script lang="ts">
	import { navigating } from '$app/state';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data }: { data: PageData } = $props();

	const hasFilters = $derived(
		Boolean(
			data.filters.q || data.filters.stage || data.filters.attention || data.filters.assignedTo
		)
	);

	function stageTone(stage: string) {
		if (stage === 'WON') return 'success';
		if (stage === 'LOST') return 'danger';
		if (stage === 'DECISION') return 'warning';
		return 'info';
	}

	function attentionTone(attention: string) {
		if (attention === 'paused') return 'danger';
		if (attention === 'waiting_on_client') return 'warning';
		if (attention === 'waiting_on_us') return 'info';
		if (attention === 'follow_up_scheduled') return 'primary';
		return 'neutral';
	}

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : 'No activity recorded';
	}

	function leadName(firstName: string, lastName: string) {
		return `${firstName} ${lastName}`;
	}

	function pageQuery(page: number) {
		const params: string[] = [];
		const add = (key: string, value: string | number) =>
			params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		if (data.filters.q) add('q', data.filters.q);
		if (data.filters.stage) add('stage', data.filters.stage);
		if (data.filters.attention) add('attention', data.filters.attention);
		if (data.filters.assignedTo) add('assigned_to', data.filters.assignedTo);
		add('sort', data.filters.sort);
		add('direction', data.filters.direction);
		add('page_size', data.pagination.pageSize);
		add('page', page);
		return `?${params.join('&')}`;
	}
</script>

<svelte:head>
	<title>Leads | Zephyr CRM</title>
	<meta name="description" content="Review and qualify Zephyr CRM leads" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader
		title="Leads"
		description="Qualify enquiries and move the right opportunities forward."
	>
		{#snippet actions()}<RealtimeStatus scope="leads" tables={['leads']} />{/snippet}
	</PageHeader>

	{#if navigating.to}
		<LoadingState message="Loading leads…" />
	{/if}

	<Card class="filters-card">
		<form method="GET" class="filters-form" aria-label="Filter leads">
			<Input
				id="lead-search"
				name="q"
				label="Search"
				placeholder="Name, company or email"
				value={data.filters.q}
			/>
			<Select id="lead-stage" name="stage" label="Pipeline stage" value={data.filters.stage}>
				<option value="">All stages</option>
				<option value="NEW">New</option>
				<option value="QUALIFICATION">Qualification</option>
				<option value="PROPOSAL">Proposal</option>
				<option value="DECISION">Decision</option>
				<option value="WON">Won</option>
				<option value="LOST">Lost</option>
			</Select>
			<Select id="lead-attention" name="attention" label="Attention" value={data.filters.attention}>
				<option value="">All attention states</option>
				<option value="none">None</option>
				<option value="waiting_on_client">Waiting on client</option>
				<option value="waiting_on_us">Waiting on us</option>
				<option value="follow_up_scheduled">Follow-up scheduled</option>
				<option value="paused">Paused</option>
			</Select>
			<Select id="lead-sort" name="sort" label="Sort by" value={data.filters.sort}>
				<option value="updated_at">Recently updated</option>
				<option value="created_at">Recently created</option>
				<option value="last_activity_at">Last activity</option>
				<option value="lead_number">Lead number</option>
			</Select>
			<Select id="lead-direction" name="direction" label="Direction" value={data.filters.direction}>
				<option value="desc">Descending</option>
				<option value="asc">Ascending</option>
			</Select>
			<div class="filter-actions">
				<Button type="submit" size="sm">Apply filters</Button>
				{#if hasFilters}<a class="clear-link" href={resolve('/leads')}>Clear</a>{/if}
			</div>
		</form>
	</Card>

	<div class="list-summary" aria-live="polite">
		<span>
			{#if data.pagination.total === 0}No matching leads{:else}Showing {data.leads.length} of {data
					.pagination.total} leads{/if}
		</span>
		<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
	</div>

	{#if data.leads.length === 0}
		<EmptyState
			title={hasFilters ? 'No matching leads' : 'No leads yet'}
			message={hasFilters
				? 'Try a different search or filter combination.'
				: 'Website enquiries will appear here after authenticated intake.'}
		/>
	{:else}
		<Card class="leads-card">
			<div class="leads-table-wrap">
				<table class="leads-table">
					<caption class="sr-only">Lead pipeline</caption>
					<thead>
						<tr>
							<th scope="col">Lead</th>
							<th scope="col">Contact</th>
							<th scope="col">Pipeline</th>
							<th scope="col">Attention</th>
							<th scope="col">Owner</th>
							<th scope="col">Last activity</th>
						</tr>
					</thead>
					<tbody>
						{#each data.leads as lead (lead.id)}
							<tr>
								<td>
									<a class="lead-link" href={resolve(`/leads/${lead.id}`)}
										>{leadName(lead.first_name, lead.last_name)}</a
									>
									<span>#{lead.lead_number}</span>
								</td>
								<td>{lead.email ?? lead.phone ?? 'No contact detail'}</td>
								<td><Badge tone={stageTone(lead.pipeline_stage)}>{lead.pipeline_stage}</Badge></td>
								<td>
									<Badge tone={attentionTone(lead.attention_state)}>{lead.attention_state}</Badge>
								</td>
								<td>{lead.assigned_to ? `User ${lead.assigned_to.slice(0, 8)}` : 'Unassigned'}</td>
								<td>{dateTime(lead.last_activity_at ?? lead.updated_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}

	{#if data.pagination.totalPages > 1}
		<nav class="pagination" aria-label="Lead list pages">
			<a
				class:disabled={data.pagination.page <= 1}
				aria-disabled={data.pagination.page <= 1}
				href={resolve(
					`/leads${pageQuery(Math.max(1, data.pagination.page - 1))}` as `/leads?${string}`
				)}>Previous</a
			>
			<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
			<a
				class:disabled={data.pagination.page >= data.pagination.totalPages}
				aria-disabled={data.pagination.page >= data.pagination.totalPages}
				href={resolve(
					`/leads${pageQuery(Math.min(data.pagination.totalPages, data.pagination.page + 1))}` as `/leads?${string}`
				)}>Next</a
			>
		</nav>
	{/if}
</AppShell>

<style>
	:global(.filters-card) {
		margin-bottom: var(--space-lg);
	}
	.filters-form {
		display: grid;
		grid-template-columns: minmax(14rem, 2fr) repeat(4, minmax(8rem, 1fr)) auto;
		align-items: end;
		gap: var(--space-md);
	}
	.filter-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding-bottom: 0.1rem;
	}
	.clear-link {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.list-summary {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	:global(.leads-card) {
		padding: 0;
		overflow: hidden;
	}
	.leads-table-wrap {
		overflow-x: auto;
	}
	.leads-table {
		width: 100%;
		min-width: 68rem;
		border-collapse: collapse;
	}
	.leads-table th,
	.leads-table td {
		padding: var(--space-lg);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	.leads-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.leads-table td {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.leads-table td:first-child {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.leads-table td:first-child span {
		display: block;
		margin-top: var(--space-xs);
		color: var(--color-text-subtle);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}
	.lead-link {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.lead-link:hover {
		text-decoration: underline;
	}
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--space-lg);
		margin-top: var(--space-lg);
		font-size: var(--font-size-sm);
	}
	.pagination a {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
	.pagination a.disabled {
		color: var(--color-text-subtle);
		pointer-events: none;
	}
	.pagination span {
		color: var(--color-text-muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 1120px) {
		.filters-form {
			grid-template-columns: repeat(3, minmax(10rem, 1fr));
		}
	}
	@media (max-width: 640px) {
		.filters-form {
			grid-template-columns: 1fr;
		}
		.filter-actions {
			padding-top: var(--space-sm);
		}
		.list-summary {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
