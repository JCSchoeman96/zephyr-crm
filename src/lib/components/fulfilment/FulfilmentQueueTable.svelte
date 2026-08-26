<script lang="ts">
	import { resolve } from '$app/paths';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import type { FulfilmentQueue, FulfilmentQueueRow } from '$lib/domain/fulfilment/queues';

	type QueueRow = FulfilmentQueueRow & {
		client: {
			id: string;
			client_number: number;
			display_name: string;
			company_name: string | null;
			status: string;
		} | null;
		lead: { id: string; lead_number: number; first_name: string; last_name: string } | null;
		quote: {
			id: string;
			quote_number: string | null;
			subject: string;
			status: string;
			currency: string;
			total: number;
		} | null;
		nextWork: string;
	};

	let {
		queue,
		rows
	}: {
		queue: Pick<FulfilmentQueue, 'key' | 'title'>;
		rows: QueueRow[];
	} = $props();

	function caseLabel(row: QueueRow) {
		return `Fulfilment #${row.case.fulfilment_number}`;
	}

	function clientLabel(row: QueueRow) {
		return row.client?.display_name ?? 'Client unavailable';
	}

	function quoteLabel(row: QueueRow) {
		if (!row.quote) return 'Accepted Quote unavailable';
		return `${row.quote.quote_number ? `Quote ${row.quote.quote_number}` : 'Accepted Quote'} · ${row.quote.subject}`;
	}

	function statusTone(status: string) {
		if (status === 'completed' || status === 'delivered' || status === 'collected')
			return 'success';
		if (status === 'cancelled') return 'neutral';
		if (status === 'awaiting' || status === 'awaiting_dispatch' || status === 'awaiting_schedule')
			return 'warning';
		return 'info';
	}

	function workStatus(row: QueueRow) {
		const step = row.steps.find(
			(item) => !['completed', 'delivered', 'collected', 'cancelled'].includes(item.status)
		);
		if (step) return step.status.replaceAll('_', ' ');
		const payment = row.payments.find((item) => item.status === 'awaiting');
		return payment ? `${payment.type.replaceAll('_', ' ')} awaiting` : row.case.status;
	}
</script>

<DataTable caption={`${queue.title} Fulfilment queue`} class="fulfilment-queue-table">
	<thead>
		<tr>
			<th scope="col">Case</th>
			<th scope="col">Client</th>
			<th scope="col">Accepted Quote</th>
			<th scope="col">Current work</th>
			<th scope="col">Next action</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.case.id)}
			<tr>
				<td>
					<a class="fulfilment-queue-table__case" href={resolve(`/fulfilment/${row.case.id}`)}>
						{caseLabel(row)}
					</a>
					<span class="fulfilment-queue-table__secondary">Lock {row.case.lock_version}</span>
				</td>
				<td>
					<a href={resolve(`/clients/${row.case.client_id}`)}>{clientLabel(row)}</a>
					<span class="fulfilment-queue-table__secondary"
						>Client #{row.client?.client_number ?? '—'}</span
					>
				</td>
				<td>
					<a href={resolve(`/quotes/${row.case.accepted_quote_id}`)}>{quoteLabel(row)}</a>
					{#if row.quote}<span class="fulfilment-queue-table__secondary">{row.quote.status}</span
						>{/if}
				</td>
				<td><Badge tone={statusTone(workStatus(row))}>{workStatus(row)}</Badge></td>
				<td>
					<span>{row.nextWork}</span>
					<a class="fulfilment-queue-table__open" href={resolve(`/fulfilment/${row.case.id}`)}
						>Open case →</a
					>
				</td>
			</tr>
		{/each}
	</tbody>
</DataTable>

<style>
	:global(.fulfilment-queue-table) {
		margin-top: var(--space-md);
	}
	.fulfilment-queue-table__case,
	.fulfilment-queue-table__open {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
	}
	.fulfilment-queue-table__secondary {
		display: block;
		margin-top: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	:global(.fulfilment-queue-table td) {
		vertical-align: top;
	}
	@media (max-width: 48rem) {
		:global(.fulfilment-queue-table .ui-table) {
			min-width: 58rem;
		}
	}
</style>
