<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatCard from '$lib/components/ui/StatCard.svelte';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data }: { data: PageData } = $props();
	let brandMode = $state<'default' | 'alternate'>('default');

	function currency(value: number) {
		return new Intl.NumberFormat('en-ZA', {
			style: 'currency',
			currency: 'ZAR',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}

	function whole(value: number) {
		return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(value);
	}

	function percentage(value: number) {
		return `${value.toFixed(2)}%`;
	}

	function taskDate(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : 'No due date';
	}
</script>

<svelte:head>
	<title>Dashboard | Zephyr CRM</title>
	<meta
		name="description"
		content="Bounded operational and management visibility for the Zephyr CRM pipeline"
	/>
</svelte:head>

<AppShell
	bind:brandMode
	userEmail={data.auth.user?.email}
	userRole={data.auth.profile?.role}
	signOutAction={data.auth.user ? '?/logout' : null}
>
	<PageHeader
		title="Zephyr CRM"
		description="Start with the work that needs attention, then reconcile the pipeline for the selected period."
	>
		{#snippet actions()}
			<RealtimeStatus scope="dashboard" tables={['leads', 'tasks', 'quotes']} />
			<a class="header-link" href={resolve('/reports')}>Reports</a>
		{/snippet}
	</PageHeader>

	<Card class="range-card">
		<form method="GET" class="range-form" aria-label="Dashboard date range">
			<div class="date-field">
				<label for="dashboard-from">From</label>
				<input id="dashboard-from" type="date" name="from" value={data.dateRange.from} />
			</div>
			<div class="date-field">
				<label for="dashboard-to">To</label>
				<input id="dashboard-to" type="date" name="to" value={data.dateRange.to} />
			</div>
			<Button type="submit" size="sm">Apply range</Button>
			<p class="range-help">Inclusive UTC calendar days · maximum 367 days</p>
		</form>
	</Card>

	<section class="dashboard-section" aria-labelledby="needs-attention-heading">
		<div class="section-heading">
			<div>
				<h2 id="needs-attention-heading">Needs attention</h2>
				<p>Operational counts for {data.dateRange.from} through {data.dateRange.to}.</p>
			</div>
			<a href={resolve('/tasks')}>Open Tasks →</a>
		</div>
		<div class="attention-grid" aria-label="Needs attention metrics">
			<a class="attention-card" href={resolve('/leads?stage=NEW')}>
				<span>New Leads</span><strong>{whole(data.operational.newLeads)}</strong>
			</a>
			<a class="attention-card attention-card--warning" href={resolve('/tasks?overdue=true')}>
				<span>Overdue Tasks</span><strong>{whole(data.operational.overdueTasks)}</strong>
			</a>
			<a class="attention-card" href={resolve('/tasks')}>
				<span>Due today</span><strong>{whole(data.operational.dueToday)}</strong>
			</a>
			<a class="attention-card" href={resolve('/leads?attention=waiting_on_us')}>
				<span>Waiting on us</span><strong>{whole(data.operational.waitingOnUs)}</strong>
			</a>
			<a class="attention-card" href={resolve('/leads?attention=waiting_on_client')}>
				<span>Waiting on client</span><strong>{whole(data.operational.waitingOnClient)}</strong>
			</a>
			<a class="attention-card attention-card--warning" href={resolve('/quotes?status=sent')}>
				<span>Expiring Quotes</span><strong>{whole(data.operational.expiringQuotes)}</strong>
			</a>
		</div>
	</section>

	<section class="dashboard-section" aria-labelledby="sales-kpis-heading">
		<div class="section-heading">
			<div>
				<h2 id="sales-kpis-heading">Sales KPIs</h2>
				<p>Reconciled PostgreSQL aggregates for the same bounded date range.</p>
			</div>
		</div>
		<div class="kpi-grid" aria-label="Sales KPIs">
			<StatCard label="Leads" value={whole(data.kpis.leads)} detail="Created in range" />
			<StatCard
				label="Quotes sent"
				value={whole(data.kpis.quotesSent)}
				detail="Submitted in range"
			/>
			<StatCard
				label="Quote value"
				value={currency(data.kpis.quoteValue)}
				detail="Sent quote totals"
			/>
			<StatCard
				label="Accepted value"
				value={currency(data.kpis.acceptedValue)}
				detail="Accepted in range"
				tone="success"
			/>
			<StatCard
				label="Won"
				value={whole(data.kpis.wonLeads)}
				detail="Terminal leads"
				tone="success"
			/>
			<StatCard
				label="Lost"
				value={whole(data.kpis.lostLeads)}
				detail="Terminal leads"
				tone="danger"
			/>
			<StatCard
				label="Conversion rate"
				value={percentage(data.kpis.conversionRate)}
				detail="Won ÷ (Won + Lost)"
			/>
			<StatCard
				label="Pipeline value"
				value={currency(data.kpis.pipelineValue)}
				detail="Eligible active quotes"
			/>
		</div>
	</section>

	<section class="analysis-grid" aria-label="Management analysis">
		<Card class="analysis-card">
			<div class="section-heading">
				<div>
					<h2>Lost reasons</h2>
					<p>Terminal losses by recorded reason and latest non-draft quote value.</p>
				</div>
			</div>
			{#if data.lost.byReason.length === 0}
				<EmptyState
					title="No lost Leads"
					message="No terminal losses fall inside this date range."
				/>
			{:else}
				<div class="table-wrap">
					<table>
						<caption class="sr-only">Lost Leads by reason</caption>
						<thead
							><tr
								><th scope="col">Reason</th><th scope="col">Leads</th><th scope="col">Value</th></tr
							></thead
						>
						<tbody>
							{#each data.lost.byReason as row (row.reasonCode)}
								<tr
									><td>{row.reasonLabel}</td><td>{whole(row.lostCount)}</td><td
										>{currency(row.lostValue)}</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
		<Card class="analysis-card">
			<div class="section-heading">
				<div>
					<h2>Lost sources</h2>
					<p>Loss volume and latest non-draft quote value by source.</p>
				</div>
			</div>
			{#if data.lost.bySource.length === 0}
				<EmptyState
					title="No source losses"
					message="No source-level losses fall inside this date range."
				/>
			{:else}
				<div class="table-wrap">
					<table>
						<caption class="sr-only">Lost Leads by source</caption>
						<thead
							><tr
								><th scope="col">Source</th><th scope="col">Leads</th><th scope="col">Value</th></tr
							></thead
						>
						<tbody>
							{#each data.lost.bySource as row (row.sourceCode)}
								<tr
									><td>{row.sourceCode}</td><td>{whole(row.lostCount)}</td><td
										>{currency(row.lostValue)}</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	</section>

	<Card class="dashboard-card">
		<div class="section-heading">
			<div>
				<h2>Source and UTM attribution</h2>
				<p>
					Leads are grouped by captured source and campaign metadata; revenue is accepted quote
					value.
				</p>
			</div>
		</div>
		{#if data.attribution.length === 0}
			<EmptyState
				title="No attribution data"
				message="No captured source or UTM activity falls inside this date range."
			/>
		{:else}
			<div class="table-wrap">
				<table>
					<caption class="sr-only">Source and UTM attribution</caption>
					<thead>
						<tr
							><th scope="col">Source</th><th scope="col">UTM</th><th scope="col">Leads</th><th
								scope="col">Won</th
							><th scope="col">Revenue</th></tr
						>
					</thead>
					<tbody>
						{#each data.attribution as row (row.sourceCode + row.utmSource + row.utmMedium + row.utmCampaign)}
							<tr>
								<td>{row.sourceCode}</td>
								<td
									><span class="utm-line">{row.utmSource}</span><span class="utm-line"
										>{row.utmMedium} / {row.utmCampaign}</span
									></td
								>
								<td>{whole(row.leadCount)}</td><td>{whole(row.wonCount)}</td><td
									>{currency(row.revenue)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>

	<Card class="dashboard-card">
		<div class="section-heading">
			<div>
				<h2>Next actions</h2>
				<p>Task state is derived from each open Task and the current time.</p>
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
							<strong>{task.title}</strong><span>{task.type} · {taskDate(task.due_at)}</span>
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
	:global(.range-card),
	:global(.dashboard-card),
	:global(.analysis-card) {
		margin-bottom: var(--space-md);
	}
	.range-form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-md);
		flex-wrap: wrap;
	}
	.date-field {
		display: grid;
		gap: var(--space-xs);
	}
	.date-field label {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.date-field input {
		min-height: 2.35rem;
		padding: 0 var(--space-sm);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}
	.range-help {
		margin: 0 0 var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.header-link,
	.section-heading a,
	.system-link a {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
	}
	.dashboard-section {
		margin-bottom: var(--space-xl);
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
	.section-heading h2 {
		font-size: var(--font-size-lg);
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
	.attention-grid,
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-md);
	}
	.attention-card {
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
	.attention-card:hover {
		border-color: var(--color-brand-primary);
	}
	.attention-card span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.attention-card strong {
		font-size: var(--font-size-2xl);
	}
	.attention-card--warning strong {
		color: var(--color-danger);
	}
	.analysis-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}
	th,
	td {
		padding: var(--space-sm) var(--space-xs);
		border-top: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.utm-line {
		display: block;
		white-space: nowrap;
	}
	.utm-line + .utm-line {
		margin-top: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
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
	@media (max-width: 900px) {
		.attention-grid,
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.analysis-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 640px) {
		.attention-grid,
		.kpi-grid {
			grid-template-columns: 1fr;
		}
		.section-heading {
			flex-direction: column;
		}
	}
</style>
