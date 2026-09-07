<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import ClientContacts from '$lib/components/clients/ClientContacts.svelte';
	import ClientMaintenance from '$lib/components/clients/ClientMaintenance.svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';
	import {
		activityEventLabel,
		clientStatusLabel,
		clientTypeLabel,
		fulfilmentCaseStatusLabel,
		quoteStatusLabel,
		taskStatusLabel,
		taskTypeLabel
	} from '$lib/domain/presentation/labels';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canMutate = $derived(data.profile.role !== 'viewer' && data.client.status !== 'archived');
	const dateTimeHint = `Times use ${publicClientConfiguration.locale.timezone}`;

	function statusTone(status: string) {
		if (status === 'active') return 'success';
		if (status === 'archived') return 'danger';
		return 'neutral';
	}

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : '—';
	}

	function display(value: string | null) {
		return value?.trim() || '—';
	}
</script>

<svelte:head>
	<title>{data.client.display_name} | Zephyr CRM</title>
	<meta name="description" content="Customer details, contacts, and related work" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/clients')}>← Back to Customers</a>
	<PageHeader
		title={data.client.display_name}
		description={`${clientTypeLabel(data.client.type)} · Customer #${data.client.client_number}`}
	>
		{#snippet actions()}
			<Badge tone={statusTone(data.client.status)}>{clientStatusLabel(data.client.status)}</Badge>
		{/snippet}
	</PageHeader>
	{#if form?.message}<ErrorState title="Customer action failed" message={form.message} />{/if}
	{#if data.profile.role === 'viewer'}
		<p class="read-only-note">
			You can view this customer, but you do not have permission to change it.
		</p>
	{/if}

	<nav class="detail-nav" aria-label="Customer detail sections">
		<a href={resolve(`/clients/${data.client.id}#overview`)}>Overview</a>
		<a href={resolve(`/clients/${data.client.id}#contacts`)}>Contacts</a>
		<a href={resolve(`/clients/${data.client.id}#billing`)}>Billing</a>
		<a href={resolve(`/clients/${data.client.id}#related`)}>Related work</a>
		<a href={resolve(`/clients/${data.client.id}#provenance`)}>Source</a>
		<a href={resolve(`/clients/${data.client.id}#activity`)}>History</a>
		<a href={resolve(`/clients/${data.client.id}#maintenance`)}>Maintenance</a>
	</nav>

	<div id="overview" class="anchor-section">
		<Card>
			<SectionHeader
				title="Customer details"
				description="Identity and contact information for this customer."
			/>
			<dl class="detail-list">
				<div>
					<dt>Type</dt>
					<dd>{clientTypeLabel(data.client.type)}</dd>
				</div>
				<div>
					<dt>Display name</dt>
					<dd>{data.client.display_name}</dd>
				</div>
				<div>
					<dt>Company name</dt>
					<dd>{display(data.client.company_name)}</dd>
				</div>
				<div>
					<dt>Email</dt>
					<dd>{display(data.client.email)}</dd>
				</div>
				<div>
					<dt>Phone</dt>
					<dd>{display(data.client.phone)}</dd>
				</div>
				<div>
					<dt>Status</dt>
					<dd>{clientStatusLabel(data.client.status)}</dd>
				</div>
			</dl>
		</Card>
	</div>

	<div id="contacts" class="anchor-section">
		<ClientContacts
			clientStatus={data.client.status}
			contacts={data.contacts}
			profileRole={data.profile.role}
		/>
	</div>

	<div id="billing" class="anchor-section">
		<Card>
			<SectionHeader
				title="Billing and company information"
				description="Address and registration details used on commercial records."
			/>
			<dl class="detail-list">
				<div>
					<dt>Tax number</dt>
					<dd>{display(data.client.tax_number)}</dd>
				</div>
				<div>
					<dt>Registration number</dt>
					<dd>{display(data.client.registration_number)}</dd>
				</div>
			</dl>
			<address class="billing-address">
				<span>{display(data.client.billing_address_line_1)}</span>
				<span>{display(data.client.billing_address_line_2)}</span>
				<span>{display(data.client.billing_city)}</span>
				<span>{display(data.client.billing_region)}</span>
				<span>{display(data.client.billing_postal_code)}</span>
				<span>{display(data.client.billing_country)}</span>
			</address>
		</Card>
	</div>

	<div id="related" class="anchor-section detail-grid">
		<Card>
			<SectionHeader title="Related quotes" description="Recent quotes linked to this customer." />
			{#if data.quotes.length === 0}
				<EmptyState
					title="No quotes yet"
					message="Quotes appear here when linked to this customer."
				/>
			{:else}
				<ul class="related-list">
					{#each data.quotes as quote (quote.id)}
						<li>
							<a href={resolve(`/quotes/${quote.id}`)}
								>{quote.quote_number ?? 'Quote'} · {quote.subject}</a
							>
							<span>{quoteStatusLabel(quote.status)} · {dateTime(quote.updated_at)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
		<Card>
			<SectionHeader
				title="Related fulfilment"
				description="Accepted-sale work linked to this customer."
			/>
			{#if data.fulfilments.length === 0}
				<EmptyState
					title="No fulfilment yet"
					message="Fulfilment appears here after a quote is accepted."
				/>
			{:else}
				<ul class="related-list">
					{#each data.fulfilments as fulfilment (fulfilment.id)}
						<li>
							<a href={resolve(`/fulfilment/${fulfilment.id}`)}
								>Fulfilment #{fulfilment.fulfilment_number}</a
							>
							<span
								>{fulfilmentCaseStatusLabel(fulfilment.status)} · {dateTime(
									fulfilment.updated_at
								)}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
		<Card class="related-wide">
			<SectionHeader
				title="Follow-ups"
				description="Reminders and next actions for this customer."
			/>
			{#if canMutate}
				<form method="POST" action="?/followUp" class="follow-up-create">
					<Input
						id="customer-follow-up-title"
						name="title"
						label="What needs to happen?"
						required
					/>
					<Select id="customer-follow-up-type" name="type" label="Action type" value="follow_up">
						<option value="follow_up">Follow up</option>
						<option value="call_client">Call customer</option>
						<option value="custom">Other follow-up</option>
					</Select>
					<Input
						id="customer-follow-up-due"
						name="due_at"
						label="Due date"
						type="datetime-local"
						hint={dateTimeHint}
					/>
					<Input id="customer-follow-up-notes" name="description" label="Notes (optional)" />
					<div class="follow-up-actions">
						<Button type="submit" size="sm">Add follow-up</Button>
						<a class="muted-link" href={resolve('/tasks')}>Open all follow-ups</a>
					</div>
				</form>
			{/if}
			{#if data.tasks.length === 0}
				<p class="muted">No follow-ups yet.</p>
			{:else}
				<ul class="related-list">
					{#each data.tasks as task (task.id)}
						<li>
							<strong>{task.title}</strong>
							<span
								>{taskTypeLabel(task.type ?? 'custom')} · {taskStatusLabel(task.status ?? 'open')} ·
								{dateTime(task.due_at)}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</div>

	<div id="provenance" class="anchor-section">
		<Card>
			<SectionHeader
				title="Source enquiry"
				description="The enquiry that created this customer remains available for traceability."
			/>
			<div class="source-block">
				{#if data.sourceLead}
					<a href={resolve(`/leads/${data.sourceLead.id}`)}>
						Enquiry #{data.sourceLead.lead_number} · {data.sourceLead.first_name}
						{data.sourceLead.last_name}
					</a>
				{:else}<span>—</span>{/if}
				<span>Converted {dateTime(data.client.converted_at)}</span>
			</div>
		</Card>
	</div>

	<div id="activity" class="anchor-section">
		<Card>
			<SectionHeader title="History" description="What has happened with this customer." />
			{#if data.activities.length === 0}
				<EmptyState
					title="No customer history"
					message="No history has been recorded for this customer yet."
				/>
			{:else}
				<ol class="activity-list">
					{#each data.activities as activity (activity.id)}
						<li>
							<strong>{activity.summary}</strong>
							<span
								>{activityEventLabel(activity.event_type)} · {dateTime(activity.occurred_at)}</span
							>
						</li>
					{/each}
				</ol>
			{/if}
			{#if data.sourceLeadActivities.length > 0}
				<h3 class="history-heading">Source enquiry history</h3>
				<ol class="activity-list">
					{#each data.sourceLeadActivities as activity (activity.id)}
						<li>
							<strong>{activity.summary}</strong>
							<span
								>{activityEventLabel(activity.event_type)} · {dateTime(activity.occurred_at)}</span
							>
						</li>
					{/each}
				</ol>
			{/if}
		</Card>
	</div>

	<div id="maintenance" class="anchor-section">
		<ClientMaintenance client={data.client} profile={data.profile} {form} />
	</div>
</AppShell>

<style>
	.back-link {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-decoration: none;
	}
	.back-link:hover {
		color: var(--color-brand-primary);
	}
	.detail-nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-lg);
		margin: var(--space-lg) 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.detail-nav a {
		padding-bottom: var(--space-sm);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
	.detail-nav a:hover {
		color: var(--color-brand-primary);
	}
	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-lg);
	}
	:global(.related-wide) {
		grid-column: 1 / -1;
	}
	.anchor-section {
		scroll-margin-top: var(--space-lg);
		margin-bottom: var(--space-lg);
	}
	.detail-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
		margin: 0 0 var(--space-lg);
	}
	.detail-list div {
		min-width: 0;
	}
	.detail-list dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
	}
	.detail-list dd {
		margin: var(--space-xs) 0 0;
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.billing-address {
		display: grid;
		gap: var(--space-xs);
		margin: 0;
		color: var(--color-text);
		font-style: normal;
		font-size: var(--font-size-sm);
	}
	.source-block {
		display: grid;
		gap: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.source-block a,
	.related-list a {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.source-block a:hover,
	.related-list a:hover {
		text-decoration: underline;
	}
	.related-list,
	.activity-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.related-list li,
	.activity-list li {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.related-list strong,
	.activity-list strong {
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.related-list span,
	.activity-list span {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.history-heading {
		margin: var(--space-xl) 0 var(--space-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.follow-up-create {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
		padding-bottom: var(--space-lg);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.follow-up-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.muted-link,
	.muted,
	.read-only-note {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	@media (max-width: 760px) {
		.detail-grid,
		.detail-list,
		.follow-up-create {
			grid-template-columns: 1fr;
		}
	}
</style>
