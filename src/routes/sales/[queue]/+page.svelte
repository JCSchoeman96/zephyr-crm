<script lang="ts">
	import { navigating } from '$app/state';
	import { resolve } from '$app/paths';
	import type { PageData, ActionData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import SalesQueueTable from '$lib/components/sales/SalesQueueTable.svelte';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canMutate = $derived(data.profile.role !== 'viewer');

	function leadLabel(row: PageData['queue']['rows'][number]) {
		return `Reference #${row.lead.lead_number} · ${row.lead.first_name} ${row.lead.last_name}`;
	}

	function quoteHref(row: PageData['queue']['rows'][number]) {
		return row.quote
			? resolve(`/quotes/${row.quote.id}`)
			: resolve(`/quotes/new?lead_id=${encodeURIComponent(row.lead.id)}`);
	}

	function proposalActionLabel(row: PageData['queue']['rows'][number]) {
		if (!row.quote) return 'Create quote';
		if (row.quoteState === 'draft') return 'Open draft';
		return 'Open quote';
	}
</script>

<svelte:head>
	<title>{data.queue.definition.title} | Zephyr CRM</title>
	<meta name="description" content={data.queue.definition.description} />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader title={data.queue.definition.title} description={data.queue.definition.description}>
		{#snippet actions()}
			<RealtimeStatus scope={`sales-${data.queue.key}`} tables={['leads', 'quotes']} />
		{/snippet}
	</PageHeader>

	{#if form?.message}<ErrorState
			title="Sales action could not be completed"
			message={form.message}
		/>{/if}
	{#if navigating.to}<LoadingState message="Loading Sales queue…" />{/if}

	<div class="queue-summary" aria-live="polite">
		<span>{data.queue.rows.length} {data.queue.definition.title.toLowerCase()}</span>
		<span>Showing up to {data.queue.limits.leads} enquiries</span>
	</div>

	{#if data.queue.rows.length === 0}
		<EmptyState title="Queue is clear" message={data.queue.definition.emptyMessage} />
	{:else}
		<SalesQueueTable queue={data.queue.key} rows={data.queue.rows}>
			{#snippet rowActions(row)}
				{#if data.queue.key === 'enquiries'}
					<div class="queue-action-stack">
						<span class="queue-action-context">{leadLabel(row)}</span>
						{#if canMutate}
							<form method="POST" action="?/start" class="queue-action-form">
								<input type="hidden" name="lead_id" value={row.lead.id} />
								<input type="hidden" name="lock_version" value={row.lead.lock_version} />
								<Button type="submit" size="sm">Start Qualification</Button>
							</form>
						{:else}<span class="queue-read-only"
								>You can view this enquiry, but you do not have permission to change it.</span
							>{/if}
					</div>
				{:else if data.queue.key === 'qualification'}
					<div class="queue-action-stack">
						{#if canMutate}
							<form method="POST" action="?/ready" class="queue-action-form">
								<input type="hidden" name="lead_id" value={row.lead.id} />
								<input type="hidden" name="lock_version" value={row.lead.lock_version} />
								<Textarea
									id={`qualification-notes-${row.lead.id}`}
									name="qualification_notes"
									label="Qualification notes"
									value={row.lead.qualification_notes ?? ''}
									rows={3}
									hint="Record the requirements and details you confirmed."
								/>
								<Button type="submit" size="sm">Ready for Quote</Button>
							</form>
						{:else}<span class="queue-read-only"
								>You can view this enquiry, but you do not have permission to change it.</span
							>{/if}
					</div>
				{:else if data.queue.key === 'proposals'}
					<div class="queue-action-stack">
						{#if row.quote || canMutate}
							<a class="queue-action-link" href={quoteHref(row)}>{proposalActionLabel(row)}</a>
						{:else}<span class="queue-read-only">No quote has been started.</span>{/if}
						{#if row.quote}
							<span class="queue-action-context">{row.quote.subject}</span>
						{/if}
					</div>
				{:else if row.quote}
					<div class="queue-action-stack queue-decision-stack">
						<a class="queue-action-link" href={quoteHref(row)}
							>Open {row.quote.quote_number ?? 'Quote'}</a
						>
						{#if canMutate}
							<form method="POST" action="?/accept" class="queue-decision-form">
								<input type="hidden" name="quote_id" value={row.quote.id} />
								<input type="hidden" name="lock_version" value={row.quote.lock_version} />
								<Input
									id={`acceptance-source-${row.quote.id}`}
									name="acceptance_source"
									label="Acceptance source"
									placeholder="Email, phone call, or other source"
									required
								/>
								<Textarea
									id={`acceptance-evidence-${row.quote.id}`}
									name="acceptance_evidence"
									label="Acceptance evidence"
									rows={2}
									required
								/>
								<Button type="submit" size="sm">Accept sale</Button>
							</form>
							<form method="POST" action="?/revise" class="queue-action-form">
								<input type="hidden" name="quote_id" value={row.quote.id} />
								<input type="hidden" name="lock_version" value={row.quote.lock_version} />
								<Button type="submit" variant="secondary" size="sm">Adjust / Requote</Button>
							</form>
							<form method="POST" action="?/decline" class="queue-decision-form">
								<input type="hidden" name="quote_id" value={row.quote.id} />
								<input type="hidden" name="lock_version" value={row.quote.lock_version} />
								<Select
									id={`lost-reason-${row.quote.id}`}
									name="lost_reason_id"
									label="Why is it not proceeding?"
									required
								>
									<option value="">Choose a reason</option>
									{#each data.lostReasons as reason (reason.id)}
										<option value={reason.id}>{reason.label}</option>
									{/each}
								</Select>
								<Textarea
									id={`lost-notes-${row.quote.id}`}
									name="lost_notes"
									label="Extra notes (optional)"
									rows={2}
								/>
								<Button type="submit" variant="danger" size="sm">Decline quote</Button>
							</form>
						{:else}<span class="queue-read-only"
								>You can view this enquiry, but you do not have permission to change it.</span
							>{/if}
					</div>
				{/if}
			{/snippet}
		</SalesQueueTable>
	{/if}
</AppShell>

<style>
	.queue-summary {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.queue-action-stack {
		display: grid;
		gap: var(--space-sm);
		min-width: 12rem;
	}
	.queue-action-context {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.queue-read-only {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.queue-action-form,
	.queue-decision-form {
		display: grid;
		gap: var(--space-sm);
	}
	.queue-action-link {
		font-weight: var(--font-weight-semibold);
	}
	.queue-decision-stack {
		min-width: 18rem;
	}
	@media (max-width: 48rem) {
		.queue-summary {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
