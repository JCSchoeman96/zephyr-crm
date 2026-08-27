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
	import { taskTypeLabel } from '$lib/domain/presentation/labels';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	let { data }: { data: PageData } = $props();
	let brandMode = $state<'default' | 'alternate'>('default');

	function currency(value: number) {
		return new Intl.NumberFormat(publicClientConfiguration.locale.language, {
			style: 'currency',
			currency: publicClientConfiguration.locale.currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}

	function whole(value: number) {
		return new Intl.NumberFormat(publicClientConfiguration.locale.language, {
			maximumFractionDigits: 0
		}).format(value);
	}

	function percentage(value: number) {
		return `${value.toFixed(2)}%`;
	}

	function responseTime(hours: number) {
		if (hours <= 0) return '0 h';
		if (hours < 1) return `${Math.round(hours * 60)} min`;
		return `${hours.toFixed(2)} h`;
	}

	function taskDate(value: string | null) {
		return value
			? new Date(value).toLocaleString(publicClientConfiguration.locale.language, {
					timeZone: publicClientConfiguration.locale.timezone
				})
			: 'No due date';
	}
</script>

<svelte:head>
	<title>Dashboard | {publicClientConfiguration.brand.companyName}</title>
	<meta
		name="description"
		content={`Bounded operational and management visibility for the ${publicClientConfiguration.brand.companyName} pipeline`}
	/>
</svelte:head>

<AppShell
	bind:brandMode
	userEmail={data.auth.user?.email}
	userRole={data.auth.profile?.role}
	signOutAction={data.auth.user ? '?/logout' : null}
>
	<PageHeader
		title={publicClientConfiguration.brand.companyName}
		description="Start with the work that needs attention, then reconcile the pipeline for the selected period."
	>
		{#snippet actions()}
			<RealtimeStatus scope="dashboard" tables={['leads', 'tasks', 'quotes']} />
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
			<a href={resolve('/tasks')}>Open follow-ups →</a>
		</div>
		<div class="attention-grid" aria-label="Needs attention metrics">
			<a class="attention-card" href={resolve('/leads?stage=NEW')}>
				<span>New enquiries</span><strong>{whole(data.operational.newLeads)}</strong>
			</a>
			<a class="attention-card attention-card--warning" href={resolve('/tasks?overdue=true')}>
				<span>Overdue follow-ups</span><strong>{whole(data.operational.overdueTasks)}</strong>
			</a>
			<a class="attention-card" href={resolve('/tasks')}>
				<span>Follow-ups due today</span><strong>{whole(data.operational.dueToday)}</strong>
			</a>
			<a class="attention-card" href={resolve('/leads?attention=waiting_on_us')}>
				<span>We need to respond</span><strong>{whole(data.operational.waitingOnUs)}</strong>
			</a>
			<a class="attention-card" href={resolve('/leads?attention=waiting_on_client')}>
				<span>Waiting for customer</span><strong>{whole(data.operational.waitingOnClient)}</strong>
			</a>
			<a class="attention-card attention-card--warning" href={resolve('/quotes?status=sent')}>
				<span>Quotes expiring soon</span><strong>{whole(data.operational.expiringQuotes)}</strong>
			</a>
		</div>
	</section>

	<section class="dashboard-section" aria-labelledby="sales-kpis-heading">
		<div class="section-heading">
			<div>
				<h2 id="sales-kpis-heading">Sales overview</h2>
				<p>Reconciled PostgreSQL aggregates for the same bounded date range.</p>
			</div>
		</div>
		<div class="kpi-grid" aria-label="Sales KPIs">
			<StatCard label="Enquiries" value={whole(data.kpis.leads)} detail="Created in range" />
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
				label="Customers confirmed"
				value={whole(data.kpis.wonLeads)}
				detail="Terminal leads"
				tone="success"
			/>
			<StatCard
				label="Not proceeding"
				value={whole(data.kpis.lostLeads)}
				detail="Terminal leads"
				tone="danger"
			/>
			<StatCard
				label="Customer conversion rate"
				value={percentage(data.kpis.conversionRate)}
				detail="Won ÷ (Won + Lost)"
			/>
			<StatCard
				label="Open quote value"
				value={currency(data.kpis.pipelineValue)}
				detail="Eligible active quotes"
			/>
		</div>
	</section>

	<section class="dashboard-section" aria-labelledby="sales-fulfilment-metrics-heading">
		<div class="section-heading">
			<div>
				<h2 id="sales-fulfilment-metrics-heading">Sales and Fulfilment metrics</h2>
				<p>
					Current work queues plus bounded UTC event metrics for {data.dateRange.from} through
					{data.dateRange.to}.
				</p>
			</div>
		</div>
		<div class="kpi-grid" aria-label="Sales and Fulfilment metrics">
			<StatCard
				label="New enquiries waiting"
				value={whole(data.metrics.newEnquiriesWaiting)}
				detail="New enquiries currently waiting"
			/>
			<StatCard
				label="Qualification backlog"
				value={whole(data.metrics.qualificationBacklog)}
				detail="Enquiries with details being reviewed"
			/>
			<StatCard
				label="Quotes needing preparation"
				value={whole(data.metrics.quotesNeedingPreparation)}
				detail="Enquiries with quotes to prepare"
			/>
			<StatCard
				label="Quotes awaiting decision"
				value={whole(data.metrics.quotesAwaitingDecision)}
				detail="Current sent quotes"
			/>
			<StatCard
				label="Average quote response time"
				value={responseTime(data.metrics.averageQuoteResponseHours)}
				detail="Sent to accepted or declined"
			/>
			<StatCard
				label="Accepted value"
				value={currency(data.metrics.acceptedValue)}
				detail="Accepted quote total; not recorded cash"
				tone="success"
			/>
			<StatCard
				label="Open fulfilments"
				value={whole(data.metrics.openFulfilments)}
				detail="Current open fulfilments"
			/>
			<StatCard
				label="Upcoming installations"
				value={whole(data.metrics.upcomingInstallations)}
				detail="Scheduled in selected window"
			/>
			<StatCard
				label="Awaiting dispatch"
				value={whole(data.metrics.awaitingDispatch)}
				detail="Current courier deliveries"
			/>
			<StatCard
				label="Awaiting collection"
				value={whole(data.metrics.awaitingCollection)}
				detail="Current pickup collections"
			/>
			<StatCard
				label="Payments awaiting follow-up"
				value={whole(data.metrics.paymentsAwaitingFollowUp)}
				detail="Awaiting payment evidence and a follow-up action"
				tone="warning"
			/>
			<StatCard
				label="Completed fulfilments"
				value={whole(data.metrics.completedFulfilments)}
				detail="Completed in selected window"
				tone="success"
			/>
		</div>
		<p class="metrics-note">
			Accepted value and recorded payments are CRM evidence, not reconciled revenue, bank
			settlement, or provider confirmation.
		</p>
	</section>

	<section class="analysis-grid" aria-label="Management analysis">
		<Card class="analysis-card">
			<div class="section-heading">
				<div>
					<h2>Why enquiries did not proceed</h2>
					<p>Closed enquiries grouped by recorded reason and latest quote value.</p>
				</div>
			</div>
			{#if data.lost.byReason.length === 0}
				<EmptyState
					title="No enquiries closed"
					message="No closed enquiries fall inside this date range."
				/>
			{:else}
				<div class="table-wrap">
					<table>
						<caption class="sr-only">Enquiries that did not proceed by reason</caption>
						<thead
							><tr
								><th scope="col">Reason</th><th scope="col">Enquiries</th><th scope="col">Value</th
								></tr
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
					<h2>Enquiry sources</h2>
					<p>Closed enquiry volume and latest quote value by source.</p>
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
						<caption class="sr-only">Closed enquiries by source</caption>
						<thead
							><tr
								><th scope="col">Source</th><th scope="col">Enquiries</th><th scope="col">Value</th
								></tr
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
					Enquiries are grouped by captured source and campaign metadata; revenue is accepted quote
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
							><th scope="col">Source</th><th scope="col">UTM</th><th scope="col">Enquiries</th><th
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
				<h2>Next follow-ups</h2>
				<p>Each open follow-up action is shown with its current due time.</p>
			</div>
			<a href={resolve('/tasks')}>View all follow-ups →</a>
		</div>
		{#if data.recentTasks.length === 0}
			<p class="muted">No open follow-ups are currently scheduled.</p>
		{:else}
			<ul class="task-list">
				{#each data.recentTasks as task (task.id)}
					<li>
						<div>
							<strong>{task.title}</strong><span
								>{taskTypeLabel(task.type ?? 'custom')} · {taskDate(task.due_at)}</span
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
	.section-heading a {
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
	.muted {
		margin: 0;
	}
	.section-heading h2 {
		font-size: var(--font-size-lg);
	}
	.section-heading p,
	.muted,
	.task-list span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.section-heading p {
		margin-top: var(--space-xs);
	}
	.metrics-note {
		margin: var(--space-md) 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
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
