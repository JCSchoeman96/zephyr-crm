<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';

	let { data }: { data: PageData } = $props();

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
	<meta name="description" content="Client detail, contacts, and source Lead history" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/clients')}>← Back to Clients</a>
	<PageHeader
		title={data.client.display_name}
		description={`${data.client.type} · Client #${data.client.client_number}`}
	>
		{#snippet actions()}
			<Badge tone={statusTone(data.client.status)}>{data.client.status}</Badge>
		{/snippet}
	</PageHeader>
	<nav class="detail-nav" aria-label="Client detail sections">
		<a href={resolve(`/clients/${data.client.id}#overview`)}>Overview</a>
		<a href={resolve(`/clients/${data.client.id}#contacts`)}>Contacts</a>
		<a href={resolve(`/clients/${data.client.id}#activity`)}>Activity</a>
	</nav>

	<div id="overview" class="anchor-section detail-grid">
		<Card>
			<SectionHeader
				title="Client details"
				description="Customer identity and billing fields are durable PostgreSQL records."
			/>
			<dl class="detail-list">
				<div>
					<dt>Type</dt>
					<dd>{data.client.type}</dd>
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
					<dt>Tax number</dt>
					<dd>{display(data.client.tax_number)}</dd>
				</div>
				<div>
					<dt>Registration number</dt>
					<dd>{display(data.client.registration_number)}</dd>
				</div>
			</dl>
		</Card>

		<Card>
			<SectionHeader
				title="Billing address"
				description="Address fields are retained for the commercial customer record."
			/>
			<address class="billing-address">
				<span>{display(data.client.billing_address_line_1)}</span>
				<span>{display(data.client.billing_address_line_2)}</span>
				<span>{display(data.client.billing_city)}</span>
				<span>{display(data.client.billing_region)}</span>
				<span>{display(data.client.billing_postal_code)}</span>
				<span>{display(data.client.billing_country)}</span>
			</address>
			<div class="source-block">
				<strong>Source Lead</strong>
				{#if data.sourceLead}
					<a href={resolve(`/leads/${data.sourceLead.id}`)}>
						Lead #{data.sourceLead.lead_number} · {data.sourceLead.first_name}
						{data.sourceLead.last_name}
					</a>
				{:else}—{/if}
				<span>Converted {dateTime(data.client.converted_at)}</span>
			</div>
		</Card>
	</div>

	<div id="contacts" class="anchor-section">
		<Card>
			<SectionHeader
				title="Contacts"
				description="A Client may have multiple contacts; at most one is primary."
			/>
			{#if data.contacts.length === 0}
				<EmptyState title="No contacts" message="No contact records are attached to this Client." />
			{:else}
				<div class="contacts-table-wrap">
					<table class="contacts-table">
						<caption class="sr-only">Client contacts</caption>
						<thead>
							<tr
								><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Role</th><th
									scope="col">Status</th
								></tr
							>
						</thead>
						<tbody>
							{#each data.contacts as contact (contact.id)}
								<tr>
									<td>{contact.first_name} {contact.last_name}</td>
									<td>{contact.email ?? contact.phone ?? 'No contact detail'}</td>
									<td>{contact.job_title ?? '—'}</td>
									<td
										>{#if contact.is_primary}<Badge tone="primary">Primary</Badge
											>{:else}Additional{/if}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	</div>

	<div id="activity" class="anchor-section">
		<Card>
			<SectionHeader
				title="Activity history"
				description="Conversion evidence remains linked to the original Lead and Client."
			/>
			{#if data.activities.length === 0}
				<EmptyState
					title="No Client activity"
					message="No Client-scoped activity has been recorded yet."
				/>
			{:else}
				<ol class="activity-list">
					{#each data.activities as activity (activity.id)}
						<li>
							<strong>{activity.summary}</strong>
							<span>{activity.event_type} · {dateTime(activity.occurred_at)}</span>
						</li>
					{/each}
				</ol>
			{/if}
			{#if data.sourceLeadActivities.length > 0}
				<h3 class="history-heading">Source Lead history</h3>
				<ol class="activity-list">
					{#each data.sourceLeadActivities as activity (activity.id)}
						<li>
							<strong>{activity.summary}</strong>
							<span>{activity.event_type} · {dateTime(activity.occurred_at)}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</Card>
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
	.anchor-section {
		scroll-margin-top: var(--space-lg);
		margin-bottom: var(--space-lg);
	}
	.detail-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
		margin: 0;
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
		margin-top: var(--space-xl);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.source-block a {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.source-block a:hover {
		text-decoration: underline;
	}
	.contacts-table-wrap {
		overflow-x: auto;
	}
	.contacts-table {
		width: 100%;
		border-collapse: collapse;
	}
	.contacts-table th,
	.contacts-table td {
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		font-size: var(--font-size-sm);
	}
	.contacts-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.contacts-table td {
		color: var(--color-text-muted);
	}
	.contacts-table td:first-child {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.activity-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.history-heading {
		margin: var(--space-xl) 0 var(--space-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.activity-list li {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.activity-list strong {
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.activity-list span {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
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
	@media (max-width: 760px) {
		.detail-grid,
		.detail-list {
			grid-template-columns: 1fr;
		}
	}
</style>
