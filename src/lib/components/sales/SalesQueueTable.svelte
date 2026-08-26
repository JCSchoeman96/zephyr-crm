<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import type {
		SalesQueueKey,
		SalesQueueRow,
		SalesQueueQuoteState
	} from '$lib/domain/sales/queues';

	let {
		queue,
		rows,
		rowActions
	}: {
		queue: SalesQueueKey;
		rows: SalesQueueRow[];
		rowActions?: Snippet<[SalesQueueRow]>;
	} = $props();

	function leadName(row: SalesQueueRow) {
		return `${row.lead.first_name} ${row.lead.last_name}`.trim();
	}

	function quoteStateLabel(state: SalesQueueQuoteState) {
		if (state === 'not_started') return 'Not started';
		if (state === 'ready_to_send') return 'Ready to send';
		if (state === 'accepted') return 'Accepted';
		return state[0].toUpperCase() + state.slice(1);
	}

	function quoteStateTone(state: SalesQueueQuoteState) {
		if (state === 'ready_to_send') return 'success';
		if (state === 'sent') return 'warning';
		if (state === 'accepted') return 'success';
		if (state === 'draft') return 'info';
		return 'neutral';
	}

	function requestSummary(row: SalesQueueRow) {
		return row.lead.message || row.lead.qualification_notes || 'No enquiry detail recorded';
	}

	function quoteSummary(row: SalesQueueRow) {
		if (!row.quote) return null;
		return `${row.quote.quote_number ?? 'Quote'} · ${row.quote.subject}`;
	}
</script>

<DataTable caption={`${queue} Sales queue`} class="sales-queue-table">
	<thead>
		<tr>
			<th scope="col">Lead</th>
			<th scope="col">Contact</th>
			<th scope="col">Enquiry</th>
			<th scope="col">Work state</th>
			<th scope="col" aria-label="Actions"></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.lead.id)}
			<tr>
				<td>
					<a class="sales-queue-table__lead" href={resolve(`/leads/${row.lead.id}`)}>
						{leadName(row)}
					</a>
					<span class="sales-queue-table__number">#{row.lead.lead_number}</span>
					{#if row.lead.company}
						<span class="sales-queue-table__company">{row.lead.company}</span>
					{/if}
				</td>
				<td>
					<span>{row.lead.email || row.lead.phone || 'No contact detail'}</span>
					{#if row.lead.email && row.lead.phone}
						<span class="sales-queue-table__secondary">{row.lead.phone}</span>
					{/if}
				</td>
				<td class="sales-queue-table__request">
					<span>{requestSummary(row)}</span>
					{#if quoteSummary(row)}
						<span class="sales-queue-table__secondary">{quoteSummary(row)}</span>
					{/if}
				</td>
				<td>
					<Badge tone={quoteStateTone(row.quoteState)}>{quoteStateLabel(row.quoteState)}</Badge>
				</td>
				<td class="sales-queue-table__actions">
					{@render rowActions?.(row)}
				</td>
			</tr>
		{/each}
	</tbody>
</DataTable>

<style>
	:global(.sales-queue-table) {
		margin-top: var(--space-lg);
	}
	.sales-queue-table__lead {
		display: block;
		font-weight: var(--font-weight-semibold);
	}
	.sales-queue-table__number,
	.sales-queue-table__company,
	.sales-queue-table__secondary {
		display: block;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.sales-queue-table__request {
		max-width: 28rem;
		white-space: normal;
	}
	.sales-queue-table__actions {
		min-width: 12rem;
		white-space: normal;
	}
	@media (max-width: 48rem) {
		:global(.sales-queue-table .ui-table) {
			min-width: 54rem;
		}
	}
</style>
