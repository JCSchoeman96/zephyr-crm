<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';
	let { data }: { data: PageData } = $props();
	function date(value: string | null) {
		return value
			? new Date(value).toLocaleString(publicClientConfiguration.locale.language, {
					timeZone: publicClientConfiguration.locale.timezone,
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			: 'No due date';
	}
</script>

<svelte:head><title>Home | {publicClientConfiguration.brand.companyName}</title></svelte:head>
<AppShell
	context="Home"
	userEmail={data.auth.user?.email}
	userRole={data.auth.profile?.role}
	signOutAction="?/logout"
>
	<PageHeader title="Home" description="Start with the work that needs your attention.">
		{#snippet actions()}<RealtimeStatus
				scope="home"
				tables={['leads', 'tasks', 'quotes', 'fulfilment_cases']}
			/>{/snippet}
	</PageHeader>
	<div class="home-layout">
		<div class="work">
			<Card title="What needs attention">
				<p class="intro">
					Overdue and upcoming follow-ups appear first. Open the record to continue.
				</p>
				{#if data.tasks.length === 0}
					<EmptyState
						title="No follow-ups waiting"
						message="Follow-ups you add to enquiries, quotes, customers and fulfilment will appear here."
					/>
				{:else}
					<ul class="work-list">
						{#each data.tasks as task (task.id)}
							<li>
								<div>
									<strong>{task.title}</strong>
									<p>{date(task.due_at)}</p>
									{#if task.isOverdue}<Badge tone="danger">Overdue</Badge>{/if}
								</div>
								<a
									class="ui-button ui-button--secondary ui-button--md"
									href={resolve(task.href as '/')}>Open<span class="sr-only"> {task.title}</span></a
								>
							</li>
						{/each}
					</ul>
				{/if}
				<a class="more" href={resolve('/tasks')}>View all follow-ups</a>
			</Card>
			<Card title="New enquiries">
				<p class="intro">Review the oldest new requests first so each customer gets a response.</p>
				{#if data.enquiries.length === 0}
					<EmptyState
						title="No new enquiries waiting"
						message="New website enquiries will appear here when they arrive."
					/>
				{:else}
					<ul class="work-list">
						{#each data.enquiries as enquiry (enquiry.id)}
							<li>
								<div>
									<strong>{enquiry.first_name} {enquiry.last_name}</strong>
									<p>Enquiry #{enquiry.lead_number} · {date(enquiry.created_at)}</p>
								</div>
								<a
									class="ui-button ui-button--secondary ui-button--md"
									href={resolve(`/leads/${enquiry.id}`)}>Review enquiry</a
								>
							</li>
						{/each}
					</ul>
				{/if}
				<a class="more" href={resolve('/sales' as '/')}>Open Sales</a>
			</Card>
		</div>
		<aside aria-label="Current work summary">
			<Card title="Current work">
				<dl class="summary">
					<div>
						<dt><a href={resolve('/sales?view=new' as '/')}>New enquiries</a></dt>
						<dd>{data.operational.newLeads}</dd>
					</div>
					<div>
						<dt><a href={resolve('/tasks?overdue=true')}>Overdue follow-ups</a></dt>
						<dd>{data.operational.overdueTasks}</dd>
					</div>
					<div>
						<dt><a href={resolve('/tasks?due=today')}>Follow-ups due today</a></dt>
						<dd>{data.operational.dueToday}</dd>
					</div>
					<div>
						<dt>
							<a href={resolve('/sales?view=attention&attention=waiting_on_us' as '/')}
								>We need to respond</a
							>
						</dt>
						<dd>{data.operational.waitingOnUs}</dd>
					</div>
					<div>
						<dt>
							<a href={resolve('/sales?view=all&attention=waiting_on_client')}
								>Waiting for customer</a
							>
						</dt>
						<dd>{data.operational.waitingOnClient}</dd>
					</div>
					<div>
						<dt>
							<a href={resolve('/quotes?status=sent&expiring=soon')}>Quotes expiring soon</a><small
								>Today through {data.expiry.to}</small
							>
						</dt>
						<dd>{data.operational.expiringQuotes}</dd>
					</div>
				</dl>
				<p class="intro">
					Today's follow-ups use UTC calendar days. Times above use {publicClientConfiguration
						.locale.timezone}.
				</p>
			</Card>
			<a class="more" href={resolve('/reports')}>View business reports</a>
		</aside>
	</div>
</AppShell>

<style>
	.home-layout {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(15rem, 1fr);
		gap: var(--space-lg);
		align-items: start;
	}
	.work {
		display: grid;
		gap: var(--space-lg);
	}
	.intro,
	.work-list p,
	small {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.intro {
		margin: 0 0 var(--space-md);
	}
	.work-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.work-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.work-list p {
		margin: var(--space-xs) 0;
	}
	.work-list strong {
		overflow-wrap: anywhere;
	}
	.more {
		display: inline-block;
		margin-top: var(--space-md);
		padding: var(--space-sm) 0;
	}
	a {
		color: var(--color-brand-primary);
	}
	.summary {
		margin: 0 0 var(--space-md);
	}
	.summary > div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
	}
	dd {
		margin: 0;
		font-weight: var(--font-weight-semibold);
	}
	small {
		display: block;
	}
	@media (max-width: 900px) {
		.home-layout {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 640px) {
		.work-list li {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
