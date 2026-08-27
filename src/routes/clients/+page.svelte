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

	let { data }: { data: PageData } = $props();

	const hasFilters = $derived(Boolean(data.filters.q || data.filters.type || data.filters.status));

	function clientTone(status: string) {
		if (status === 'active') return 'success';
		if (status === 'archived') return 'danger';
		return 'neutral';
	}

	function clientName(client: PageData['clients'][number]) {
		return client.display_name || client.company_name || 'Unnamed client';
	}

	function sourceLead(sourceLeadId: string | null) {
		return data.sourceLeads.find((lead) => lead.id === sourceLeadId);
	}

	function pageQuery(page: number) {
		const params: string[] = [];
		const add = (key: string, value: string | number) =>
			params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		if (data.filters.q) add('q', data.filters.q);
		if (data.filters.type) add('type', data.filters.type);
		if (data.filters.status) add('status', data.filters.status);
		add('page', page);
		return `?${params.join('&')}`;
	}
</script>

<svelte:head>
	<title>Clients | Zephyr CRM</title>
	<meta name="description" content="Review converted Zephyr CRM clients and their source leads" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader
		title="Clients"
		description="Recognized customers remain traceable to the enquiry that created them."
	/>

	{#if navigating.to}
		<LoadingState message="Loading clients…" />
	{/if}

	<Card class="filters-card">
		<form method="GET" class="filters-form" aria-label="Filter clients">
			<Input
				id="client-search"
				name="q"
				label="Search"
				placeholder="Name, company, email or phone"
				value={data.filters.q}
			/>
			<Select id="client-type" name="type" label="Type" value={data.filters.type}>
				<option value="">All types</option>
				<option value="individual">Individual</option>
				<option value="company">Company</option>
			</Select>
			<Select id="client-status" name="status" label="Status" value={data.filters.status}>
				<option value="">All statuses</option>
				<option value="active">Active</option>
				<option value="inactive">Inactive</option>
				<option value="archived">Archived</option>
			</Select>
			<div class="filter-actions">
				<Button type="submit" size="sm">Apply filters</Button>
				{#if hasFilters}<a class="clear-link" href={resolve('/clients')}>Clear</a>{/if}
			</div>
		</form>
	</Card>

	<div class="list-summary" aria-live="polite">
		<span>
			{#if data.pagination.total === 0}No matching clients{:else}Showing {data.clients.length} of {data
					.pagination.total} clients{/if}
		</span>
		<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
	</div>

	{#if data.clients.length === 0}
		<EmptyState
			title={hasFilters ? 'No matching clients' : 'No clients yet'}
			message={hasFilters
				? 'Try a different search or filter combination.'
				: 'A client appears here after a customer accepts a quote.'}
		/>
	{:else}
		<Card class="clients-card">
			<div class="clients-table-wrap">
				<table class="clients-table">
					<caption class="sr-only">Client list</caption>
					<thead>
						<tr>
							<th scope="col">Client</th>
							<th scope="col">Type</th>
							<th scope="col">Contact</th>
							<th scope="col">Status</th>
							<th scope="col">Source enquiry</th>
						</tr>
					</thead>
					<tbody>
						{#each data.clients as client (client.id)}
							{@const lead = sourceLead(client.source_lead_id)}
							<tr>
								<td>
									<a class="client-link" href={resolve(`/clients/${client.id}`)}
										>{clientName(client)}</a
									>
									<span>#{client.client_number}</span>
								</td>
								<td>{client.type}</td>
								<td>{client.email ?? client.phone ?? 'No contact detail'}</td>
								<td><Badge tone={clientTone(client.status)}>{client.status}</Badge></td>
								<td>
									{#if lead}
										<a class="source-link" href={resolve(`/leads/${lead.id}`)}>
											Enquiry #{lead.lead_number} · {lead.first_name}
											{lead.last_name}
										</a>
									{:else if client.source_lead_id}
										<a class="source-link" href={resolve(`/leads/${client.source_lead_id}`)}
											>View source enquiry</a
										>
									{:else}—{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}

	{#if data.pagination.totalPages > 1}
		<nav class="pagination" aria-label="Client list pages">
			<a
				class:disabled={data.pagination.page <= 1}
				aria-disabled={data.pagination.page <= 1}
				href={resolve(
					`/clients${pageQuery(Math.max(1, data.pagination.page - 1))}` as `/clients?${string}`
				)}>Previous</a
			>
			<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
			<a
				class:disabled={data.pagination.page >= data.pagination.totalPages}
				aria-disabled={data.pagination.page >= data.pagination.totalPages}
				href={resolve(
					`/clients${pageQuery(Math.min(data.pagination.totalPages, data.pagination.page + 1))}` as `/clients?${string}`
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
		grid-template-columns: minmax(14rem, 2fr) repeat(2, minmax(9rem, 1fr)) auto;
		align-items: end;
		gap: var(--space-md);
	}
	.filter-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
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
	:global(.clients-card) {
		padding: 0;
		overflow: hidden;
	}
	.clients-table-wrap {
		overflow-x: auto;
	}
	.clients-table {
		width: 100%;
		min-width: 58rem;
		border-collapse: collapse;
	}
	.clients-table th,
	.clients-table td {
		padding: var(--space-lg);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	.clients-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.clients-table td {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.clients-table td:first-child {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.clients-table td:first-child span {
		display: block;
		margin-top: var(--space-xs);
		color: var(--color-text-subtle);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}
	.client-link,
	.source-link {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.client-link:hover,
	.source-link:hover {
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
	@media (max-width: 920px) {
		.filters-form {
			grid-template-columns: repeat(2, minmax(10rem, 1fr));
		}
	}
	@media (max-width: 640px) {
		.filters-form {
			grid-template-columns: 1fr;
		}
		.list-summary {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
