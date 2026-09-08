<script lang="ts">
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatCard from '$lib/components/ui/StatCard.svelte';
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
</script>

<svelte:head>
	<title>Reports | {publicClientConfiguration.brand.companyName}</title>
	<meta name="description" content="Review sales performance, customer decisions and fulfilment." />
</svelte:head>

<AppShell
	context="Reports"
	bind:brandMode
	userEmail={data.auth.user?.email}
	userRole={data.auth.profile?.role}
	signOutAction={data.auth.user ? '?/logout' : null}
>
	<PageHeader
		title="Reports"
		description="See how the business is performing over the selected period."
	>
		{#snippet actions()}
			<RealtimeStatus
				scope="reports"
				tables={[
					'leads',
					'tasks',
					'quotes',
					'fulfilment_cases',
					'fulfilment_steps',
					'payment_milestones'
				]}
			/>
		{/snippet}
	</PageHeader>

	<Card class="range-card">
		<form method="GET" class="range-form" aria-label="Reports date range">
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

	<section class="dashboard-section" aria-labelledby="sales-kpis-heading">
		<div class="section-heading">
			<div>
				<h2 id="sales-kpis-heading">Sales overview</h2>
				<p>Enquiries and customer decisions in the selected period.</p>
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
				detail="Closed enquiries"
				tone="success"
			/>
			<StatCard
				label="Not proceeding"
				value={whole(data.kpis.lostLeads)}
				detail="Closed enquiries"
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
					Enquiries are grouped by captured source and campaign metadata; accepted value is quote
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
							><th scope="col">Accepted value</th></tr
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
</AppShell>

<style>
	:global(.range-card),
	:global(.dashboard-card),
	:global(.analysis-card),
	.dashboard-section,
	.analysis-grid {
		margin-bottom: var(--space-lg);
	}
	.range-form,
	.section-heading {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		align-items: center;
	}
	.section-heading {
		margin-bottom: var(--space-md);
	}
	.section-heading h2,
	.section-heading p {
		margin: 0;
	}
	.section-heading h2 {
		font-size: var(--font-size-lg);
	}
	.section-heading p,
	.range-help,
	.metrics-note {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.date-field {
		display: grid;
		gap: var(--space-xs);
	}
	.date-field input {
		min-height: 2.75rem;
		padding: var(--space-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-md);
	}
	.analysis-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
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
		padding: var(--space-sm);
		text-align: left;
		border-top: 1px solid var(--color-border-subtle);
	}
	.utm-line {
		display: block;
		overflow-wrap: anywhere;
	}
	@media (max-width: 900px) {
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.analysis-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 640px) {
		.kpi-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
