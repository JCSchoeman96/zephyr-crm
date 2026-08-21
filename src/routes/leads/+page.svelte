<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let { data }: { data: PageData } = $props();

	function stageTone(stage: string) {
		if (stage === 'WON') return 'success';
		if (stage === 'LOST') return 'danger';
		if (stage === 'DECISION') return 'warning';
		return 'info';
	}
</script>

<svelte:head>
	<title>Leads | Zephyr CRM</title>
	<meta name="description" content="Review and qualify Zephyr CRM leads" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email}>
	<PageHeader
		title="Leads"
		description="Qualify enquiries and move the right opportunities forward."
	/>
	{#if data.leads.length === 0}
		<EmptyState
			title="No leads yet"
			message="Website enquiries will appear here after authenticated intake."
		/>
	{:else}
		<Card class="leads-card">
			<div class="leads-table-wrap">
				<table class="leads-table">
					<caption class="sr-only">Lead pipeline</caption>
					<thead>
						<tr
							><th scope="col">Lead</th><th scope="col">Contact</th><th scope="col">Stage</th><th
								scope="col">Updated</th
							></tr
						>
					</thead>
					<tbody>
						{#each data.leads as lead (lead.id)}
							<tr>
								<td
									><a class="lead-link" href={resolve(`/leads/${lead.id}`)}
										>{lead.first_name} {lead.last_name}</a
									><span>#{lead.lead_number}</span></td
								>
								<td>{lead.email ?? lead.phone ?? 'No contact detail'}</td>
								<td><Badge tone={stageTone(lead.pipeline_stage)}>{lead.pipeline_stage}</Badge></td>
								<td>{new Date(lead.updated_at).toLocaleDateString('en-ZA')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</AppShell>

<style>
	:global(.leads-card) {
		padding: 0;
		overflow: hidden;
	}
	.leads-table-wrap {
		overflow-x: auto;
	}
	.leads-table {
		width: 100%;
		min-width: 42rem;
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
</style>
