<script lang="ts">
	import { navigating } from '$app/state';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data }: { data: PageData } = $props();
	const hasFilters = $derived(Boolean(data.filters.q || data.filters.status));

	function quoteNumber(quote: PageData['quotes'][number]) {
		return quote.quote_number ?? `#${quote.base_quote_number}`;
	}

	function quoteTone(status: string) {
		if (status === 'accepted') return 'success';
		if (['declined', 'expired', 'cancelled', 'superseded'].includes(status)) return 'danger';
		if (status === 'ready' || status === 'sent') return 'warning';
		return 'neutral';
	}

	function money(value: number) {
		return value.toFixed(2);
	}

	function leadFor(id: string) {
		return data.leads.find((lead) => lead.id === id);
	}

	function clientFor(id: string | null) {
		return id ? data.clients.find((client) => client.id === id) : undefined;
	}

	function pageQuery(page: number) {
		const params: string[] = [];
		const add = (key: string, value: string | number) =>
			params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		if (data.filters.q) add('q', data.filters.q);
		if (data.filters.status) add('status', data.filters.status);
		add('page', page);
		return `?${params.join('&')}`;
	}
</script>

<svelte:head>
	<title>Quotes | Zephyr CRM</title>
	<meta name="description" content="Create and manage durable commercial quotes" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email}>
	<PageHeader
		title="Quotes"
		description="Durable commercial snapshots with exact totals and controlled lifecycle actions."
	>
		{#snippet actions()}
			<RealtimeStatus scope="quotes" tables={['quotes']} />
			<a class="primary-link" href={resolve('/quotes/new')}>New quote</a>
		{/snippet}
	</PageHeader>

	{#if navigating.to}<LoadingState message="Loading quotes…" />{/if}
	<Card class="filters-card">
		<form method="GET" class="filters-form" aria-label="Filter quotes">
			<Input
				id="quote-search"
				name="q"
				label="Search"
				placeholder="Subject or quote number"
				value={data.filters.q}
			/>
			<Select id="quote-status" name="status" label="Status" value={data.filters.status}>
				<option value="">All statuses</option>
				<option value="draft">Draft</option><option value="ready">Ready</option><option value="sent"
					>Sent</option
				>
				<option value="accepted">Accepted</option><option value="declined">Declined</option><option
					value="expired">Expired</option
				>
				<option value="cancelled">Cancelled</option><option value="superseded">Superseded</option>
			</Select>
			<div class="filter-actions">
				<button class="ui-button ui-button--primary ui-button--sm" type="submit"
					>Apply filters</button
				>{#if hasFilters}<a class="clear-link" href={resolve('/quotes')}>Clear</a>{/if}
			</div>
		</form>
	</Card>

	<div class="list-summary">
		<span
			>{data.pagination.total === 0
				? 'No matching quotes'
				: `Showing ${data.quotes.length} of ${data.pagination.total} quotes`}</span
		><span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
	</div>
	{#if data.quotes.length === 0}
		<EmptyState
			title={hasFilters ? 'No matching quotes' : 'No quotes yet'}
			message={hasFilters
				? 'Try a different search or status.'
				: 'Create a quote after a Lead reaches Proposal or Decision.'}
		/>
	{:else}
		<Card class="quotes-card">
			<div class="quotes-table-wrap">
				<table class="quotes-table">
					<caption class="sr-only">Quote list</caption><thead
						><tr
							><th scope="col">Quote</th><th scope="col">Customer</th><th scope="col">Total</th><th
								scope="col">Status</th
							><th scope="col">Updated</th></tr
						></thead
					><tbody>
						{#each data.quotes as quote (quote.id)}
							{@const lead = leadFor(quote.lead_id)}
							{@const client = clientFor(quote.client_id)}
							<tr
								><td
									><a class="quote-link" href={resolve(`/quotes/${quote.id}`)}
										>{quoteNumber(quote)}</a
									><span>{quote.subject}</span></td
								><td
									>{#if client}{client.display_name || client.company_name}{:else if lead}<a
											class="source-link"
											href={resolve(`/leads/${lead.id}`)}
											>Lead #{lead.lead_number} · {lead.first_name} {lead.last_name}</a
										>{:else}—{/if}</td
								><td>{quote.currency} {money(quote.total)}</td><td
									><Badge tone={quoteTone(quote.status)}>{quote.status}</Badge></td
								><td>{new Date(quote.updated_at).toLocaleDateString('en-ZA')}</td></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}

	{#if data.pagination.totalPages > 1}<nav class="pagination" aria-label="Quote list pages">
			<a
				class:disabled={data.pagination.page <= 1}
				href={resolve(
					`/quotes${pageQuery(Math.max(1, data.pagination.page - 1))}` as `/quotes?${string}`
				)}>Previous</a
			><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><a
				class:disabled={data.pagination.page >= data.pagination.totalPages}
				href={resolve(
					`/quotes${pageQuery(Math.min(data.pagination.totalPages, data.pagination.page + 1))}` as `/quotes?${string}`
				)}>Next</a
			>
		</nav>{/if}
</AppShell>

<style>
	:global(.filters-card),
	.list-summary,
	:global(.quotes-card) {
		margin-bottom: var(--space-lg);
	}
	.filters-form {
		display: grid;
		grid-template-columns: minmax(14rem, 2fr) minmax(10rem, 1fr) auto;
		align-items: end;
		gap: var(--space-md);
	}
	.filter-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}
	.clear-link,
	.primary-link,
	.quote-link,
	.source-link {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.clear-link:hover,
	.primary-link:hover,
	.quote-link:hover,
	.source-link:hover {
		text-decoration: underline;
	}
	.primary-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.5rem;
		padding: 0 var(--space-lg);
		border-radius: var(--radius-md);
		background: var(--color-brand-primary);
		color: var(--color-text-inverse);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.list-summary {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	:global(.quotes-card) {
		padding: 0;
		overflow: hidden;
	}
	.quotes-table-wrap {
		overflow-x: auto;
	}
	.quotes-table {
		width: 100%;
		min-width: 62rem;
		border-collapse: collapse;
	}
	.quotes-table th,
	.quotes-table td {
		padding: var(--space-lg);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	.quotes-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.quotes-table td {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.quotes-table td:first-child {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.quotes-table td span {
		display: block;
		margin-top: var(--space-xs);
		color: var(--color-text-subtle);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
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
	@media (max-width: 720px) {
		.filters-form {
			grid-template-columns: 1fr;
		}
		.filter-actions {
			justify-content: space-between;
		}
	}
</style>
