<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import ProductForm from '$lib/components/products/ProductForm.svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import { activityEventLabel } from '$lib/domain/presentation/labels';
	import { productStatusLabel, type ProductStatus } from '$lib/domain/products/states';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canManage = $derived(data.profile.role === 'owner' || data.profile.role === 'admin');

	function statusTone(status: string) {
		if (status === 'active') return 'success';
		if (status === 'archived') return 'danger';
		if (status === 'inactive') return 'warning';
		return 'neutral';
	}

	function statusLabel(status: string) {
		return productStatusLabel(status as ProductStatus);
	}

	function kindLabel(kind: string) {
		return kind === 'service' ? 'Service' : 'Product';
	}

	function categoryLabel(categoryId: string | null) {
		return data.categories.find((category) => category.id === categoryId)?.label ?? 'Uncategorised';
	}

	function priceLabel() {
		return `${data.product.currency} ${Number(data.product.unit_price).toLocaleString('en-ZA', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		})}`;
	}

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : '—';
	}

	function actionErrorTitle(message: string | undefined) {
		return message?.startsWith('Conflict:')
			? 'Conflict — reload before saving'
			: 'Product action could not be completed';
	}

	function actionValue(name: string) {
		if (!form || !('values' in form) || !form.values) return '';
		return (form.values as Record<string, string>)[name] ?? '';
	}
</script>

<svelte:head>
	<title>{data.product.name} | Zephyr CRM</title>
	<meta name="description" content="Product catalogue detail and maintenance" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/products')}>← Back to Products</a>
	<PageHeader
		title={data.product.name}
		description={`${data.product.product_code} · ${kindLabel(data.product.kind)} · per ${data.product.unit_label}`}
	>
		{#snippet actions()}
			<Badge tone={statusTone(data.product.status)}>{statusLabel(data.product.status)}</Badge>
		{/snippet}
	</PageHeader>
	{#if form?.message}
		<ErrorState title={actionErrorTitle(form.message)} message={form.message} />
	{/if}
	{#if !canManage}
		<p class="read-only-note">
			You can view this Product, but only Owners and Admins can change catalogue records.
		</p>
	{/if}

	{#if canManage && data.product.status !== 'archived'}
		<Card title="Product details" class="details-card">
			<ProductForm
				action="?/update"
				product={data.product}
				categories={data.categories}
				form={form as { values?: Record<string, string>; message?: string }}
				submitLabel="Save changes"
			/>
		</Card>
	{:else}
		<Card title="Product details" class="details-card">
			<dl class="detail-list">
				<div>
					<dt>Product code</dt>
					<dd>{data.product.product_code}</dd>
				</div>
				<div>
					<dt>Kind</dt>
					<dd>{kindLabel(data.product.kind)}</dd>
				</div>
				<div>
					<dt>Category</dt>
					<dd>{categoryLabel(data.product.category_id)}</dd>
				</div>
				<div>
					<dt>Unit</dt>
					<dd>Per {data.product.unit_label}</dd>
				</div>
				<div>
					<dt>Currency</dt>
					<dd>{data.product.currency}</dd>
				</div>
				<div>
					<dt>Unit price</dt>
					<dd>{priceLabel()}</dd>
				</div>
				<div>
					<dt>Taxable</dt>
					<dd>{data.product.taxable ? 'Yes' : 'No'}</dd>
				</div>
				<div>
					<dt>Customer description</dt>
					<dd>{data.product.customer_description || '—'}</dd>
				</div>
				<div>
					<dt>Internal notes</dt>
					<dd>{data.product.internal_notes || '—'}</dd>
				</div>
			</dl>
		</Card>
	{/if}

	{#if canManage && data.product.status !== 'archived'}
		<Card title="Price" class="price-card">
			<p class="muted">
				Price changes are explicit catalogue actions and do not change existing Quotes.
			</p>
			<form method="POST" action="?/price" class="price-form">
				<input type="hidden" name="lock_version" value={data.product.lock_version} />
				<Input
					id="product-price"
					name="unit_price"
					label={`New unit price (${data.product.currency})`}
					value={String(data.product.unit_price)}
					inputmode="decimal"
					maxlength={15}
					required
				/>
				<Input
					id="product-price-reason"
					name="reason"
					label="Reason (optional)"
					value={actionValue('reason')}
					maxlength={2000}
				/>
				<Button type="submit" size="sm">Change price</Button>
			</form>
		</Card>
	{/if}

	{#if canManage}
		<Card title="Status actions" class="status-card">
			<div class="status-actions">
				{#if data.product.status === 'draft' || data.product.status === 'inactive'}
					<form method="POST" action="?/activate">
						<input type="hidden" name="lock_version" value={data.product.lock_version} />
						<Button type="submit" size="sm">Activate product</Button>
					</form>
				{/if}
				{#if data.product.status === 'active'}
					<form method="POST" action="?/inactivate" class="reason-action">
						<input type="hidden" name="lock_version" value={data.product.lock_version} />
						<Input
							id="product-inactivate-reason"
							name="reason"
							label="Reason (optional)"
							maxlength={2000}
						/>
						<Button type="submit" size="sm" variant="secondary">Inactivate product</Button>
					</form>
				{/if}
				{#if data.product.status === 'draft' || data.product.status === 'inactive'}
					<form method="POST" action="?/archive" class="reason-action">
						<input type="hidden" name="lock_version" value={data.product.lock_version} />
						<Input
							id="product-archive-reason"
							name="reason"
							label="Archive reason"
							maxlength={2000}
							required
						/>
						<Button type="submit" size="sm" variant="danger">Archive product</Button>
					</form>
				{/if}
				{#if data.product.status === 'archived'}
					<form method="POST" action="?/restore" class="reason-action">
						<input type="hidden" name="lock_version" value={data.product.lock_version} />
						<Input
							id="product-restore-reason"
							name="reason"
							label="Restore reason"
							maxlength={2000}
							required
						/>
						<Button type="submit" size="sm" variant="secondary">Restore product</Button>
					</form>
				{/if}
			</div>
		</Card>
	{/if}

	<Card title="History" class="history-card">
		{#if data.activities.length === 0}
			<EmptyState
				title="No Product history"
				message="No catalogue activity has been recorded yet."
			/>
		{:else}
			<ol class="activity-list">
				{#each data.activities as activity (activity.id)}
					<li>
						<strong>{activity.summary}</strong>
						<span>{activityEventLabel(activity.event_type)} · {dateTime(activity.occurred_at)}</span
						>
					</li>
				{/each}
			</ol>
		{/if}
	</Card>
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
	:global(.details-card),
	:global(.price-card),
	:global(.status-card),
	:global(.history-card) {
		margin-bottom: var(--space-lg);
	}
	.read-only-note {
		margin: var(--space-lg) 0;
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface-subtle);
		color: var(--color-text-muted);
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
		white-space: pre-wrap;
		word-break: break-word;
	}
	.muted {
		color: var(--color-text-muted);
	}
	.price-form,
	.reason-action {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-md);
	}
	.price-form :global(.ui-field:first-of-type) {
		min-width: 14rem;
	}
	.reason-action {
		flex: 1 1 20rem;
	}
	.reason-action :global(.ui-field) {
		flex: 1 1 12rem;
	}
	.status-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-lg);
	}
	.activity-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.activity-list li {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.activity-list li:last-child {
		padding-bottom: 0;
		border-bottom: 0;
	}
	.activity-list span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	@media (max-width: 760px) {
		.detail-list {
			grid-template-columns: 1fr;
		}
		.price-form,
		.reason-action {
			align-items: stretch;
			flex-direction: column;
		}
		.price-form :global(.ui-field:first-of-type),
		.reason-action :global(.ui-field) {
			min-width: 0;
			width: 100%;
		}
	}
</style>
