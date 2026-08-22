<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import QuoteEditor from '$lib/components/quotes/QuoteEditor.svelte';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const editableStatuses = ['draft', 'ready'];

	function quoteNumber() {
		return data.quote.quote_number ?? `#${data.quote.base_quote_number}`;
	}

	function tone(status: string) {
		if (status === 'accepted') return 'success';
		if (['declined', 'expired', 'cancelled', 'superseded'].includes(status)) return 'danger';
		if (status === 'ready' || status === 'sent') return 'warning';
		return 'neutral';
	}

	function hasCompanySnapshot(value: unknown) {
		return Boolean(
			value && typeof value === 'object' && !Array.isArray(value) && 'company_identity' in value
		);
	}

	function messageTone(status: string) {
		if (status === 'delivered') return 'success';
		if (['failed', 'bounced'].includes(status)) return 'danger';
		if (status === 'submitted') return 'warning';
		return 'neutral';
	}

	function recipientEmail(value: unknown) {
		return value && typeof value === 'object' && !Array.isArray(value) && 'email' in value
			? String(value.email ?? '')
			: 'recipient unavailable';
	}

	function actionErrorTitle(message: string | undefined) {
		return message?.startsWith('Conflict:')
			? 'Conflict — reload before saving'
			: 'Quote action could not be completed';
	}
</script>

<svelte:head
	><title>{quoteNumber()} | Zephyr CRM</title><meta
		name="description"
		content="Quote detail, editor, preview and lifecycle actions"
	/></svelte:head
>
<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/quotes')}>← Back to Quotes</a>
	<PageHeader title={quoteNumber()} description={data.quote.subject}>
		{#snippet actions()}
			<RealtimeStatus scope={`quote-${data.quote.id}`} tables={['quotes']} />
			<Badge tone={tone(data.quote.status)}>{data.quote.status}</Badge>
		{/snippet}
	</PageHeader>
	{#if form?.message}<ErrorState
			title={actionErrorTitle(form.message)}
			message={form.message}
		/>{/if}

	{#if editableStatuses.includes(data.quote.status)}
		<QuoteEditor
			action="?/save"
			quoteId={data.quote.id}
			leadId={data.quote.lead_id}
			clientId={data.quote.client_id ?? ''}
			subject={data.quote.subject}
			introduction={data.quote.introduction ?? ''}
			terms={data.quote.terms ?? ''}
			taxLabel={data.quote.tax_label ?? 'VAT'}
			taxRate={String(data.quote.tax_rate)}
			validUntil={data.quote.valid_until ?? ''}
			currency={data.quote.currency}
			lockVersion={data.quote.lock_version}
			initialItems={data.items.map((item) => ({
				name: item.name,
				description: item.description ?? '',
				quantity: String(item.quantity),
				unit_price: String(item.unit_price),
				taxable: item.taxable
			}))}
			status={data.quote.status}
		/>
	{:else}
		<QuoteEditor
			action=""
			readonly
			quoteId={data.quote.id}
			quoteNumber={quoteNumber()}
			leadId={data.quote.lead_id}
			subject={data.quote.subject}
			introduction={data.quote.introduction ?? ''}
			terms={data.quote.terms ?? ''}
			taxLabel={data.quote.tax_label ?? 'VAT'}
			taxRate={String(data.quote.tax_rate)}
			validUntil={data.quote.valid_until ?? ''}
			currency={data.quote.currency}
			initialItems={data.items.map((item) => ({
				name: item.name,
				description: item.description ?? '',
				quantity: String(item.quantity),
				unit_price: String(item.unit_price),
				taxable: item.taxable
			}))}
			status={data.quote.status}
		/>
	{/if}

	<div class="quote-actions">
		{#if data.quote.status === 'draft'}
			<form method="POST" action="?/markReady">
				<input type="hidden" name="lock_version" value={data.quote.lock_version} /><Button
					type="submit">Mark ready</Button
				>
			</form>
		{:else if data.quote.status === 'ready'}
			<form method="POST" action="?/send">
				<input type="hidden" name="lock_version" value={data.quote.lock_version} /><Button
					type="submit">Send quote</Button
				>
			</form>
		{:else if data.quote.status === 'sent'}
			<form method="POST" action="?/revise">
				<input type="hidden" name="lock_version" value={data.quote.lock_version} /><Button
					type="submit"
					variant="secondary">Create revision</Button
				>
			</form>
			<form method="POST" action="?/accept">
				<input type="hidden" name="lock_version" value={data.quote.lock_version} /><Button
					type="submit">Mark accepted</Button
				>
			</form>
			<form method="POST" action="?/decline">
				<input type="hidden" name="lock_version" value={data.quote.lock_version} /><Button
					type="submit"
					variant="danger">Mark declined</Button
				>
			</form>
			<form method="POST" action="?/cancel">
				<input type="hidden" name="lock_version" value={data.quote.lock_version} /><Button
					type="submit"
					variant="ghost">Cancel quote</Button
				>
			</form>
		{/if}
	</div>

	<div class="detail-grid">
		<Card title="Commercial snapshot"
			><dl class="detail-list">
				<div>
					<dt>Customer</dt>
					<dd>
						{data.client?.display_name ||
							data.client?.company_name ||
							`${data.lead.first_name} ${data.lead.last_name}`}
					</dd>
				</div>
				<div>
					<dt>Lead</dt>
					<dd><a href={resolve(`/leads/${data.lead.id}`)}>#{data.lead.lead_number}</a></dd>
				</div>
				<div>
					<dt>Valid until</dt>
					<dd>{data.quote.valid_until ?? 'Not set'}</dd>
				</div>
				<div>
					<dt>Lock version</dt>
					<dd>{data.quote.lock_version}</dd>
				</div>
				<div>
					<dt>Snapshot</dt>
					<dd>{hasCompanySnapshot(data.quote.quote_snapshot) ? 'Captured' : 'Missing'}</dd>
				</div>
			</dl></Card
		>
		<Card title="Activity"
			><ul class="activity-list">
				{#if data.activities.length === 0}<li class="muted">
						No quote activity yet.
					</li>{:else}{#each data.activities as activity (activity.id)}<li>
							<strong>{activity.summary}</strong><span
								>{activity.event_type} · {new Date(activity.occurred_at).toLocaleString(
									'en-ZA'
								)}</span
							>
						</li>{/each}{/if}
			</ul></Card
		>
		<Card title="Document & delivery">
			<div class="delivery-panel">
				{#if data.quote.document_path}
					<a class="document-link" href={resolve(`/api/quotes/${data.quote.id}/document`)}
						>Download frozen PDF</a
					>
					<p class="muted">Generated {data.quote.document_generated_at ?? 'time unavailable'}</p>
				{:else}
					<p class="muted">The private PDF is generated when this Quote is sent.</p>
				{/if}
				{#if data.outboundMessages.length > 0}
					<ul class="delivery-list">
						{#each data.outboundMessages as message (message.id)}
							<li>
								<span>{recipientEmail(message.recipient_snapshot)}</span>
								<Badge tone={messageTone(message.delivery_status)}>{message.delivery_status}</Badge>
								{#if message.last_error}<small>{message.last_error}</small>{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted">No outbound message has been created.</p>
				{/if}
			</div>
		</Card>
	</div>
</AppShell>

<style>
	.quote-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: var(--space-lg) 0;
	}
	.quote-actions form {
		display: inline-flex;
	}
	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-lg);
		margin-top: var(--space-lg);
	}
	.detail-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
	}
	.detail-list div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-lg);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.detail-list dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.detail-list dd {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		text-align: right;
	}
	.detail-list a {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.activity-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.activity-list li {
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.activity-list span {
		display: block;
		margin-top: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.delivery-panel {
		display: grid;
		gap: var(--space-sm);
	}
	.document-link {
		color: var(--color-brand-primary);
		font-weight: 600;
		text-decoration: none;
	}
	.delivery-list {
		display: grid;
		gap: var(--space-sm);
		margin: var(--space-sm) 0 0;
		padding: 0;
		list-style: none;
	}
	.delivery-list li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-xs) var(--space-sm);
		align-items: center;
		padding-top: var(--space-sm);
		border-top: 1px solid var(--color-border-subtle);
		font-size: var(--font-size-sm);
	}
	.delivery-list small {
		grid-column: 1 / -1;
		color: var(--color-text-muted);
	}
	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	@media (max-width: 760px) {
		.detail-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
