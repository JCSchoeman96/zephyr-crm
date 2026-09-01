<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function statusTone(status: string) {
		return status === 'active' ? 'success' : 'warning';
	}

	function actionErrorTitle(message: string | undefined) {
		return message?.startsWith('Conflict:')
			? 'Conflict — reload before saving'
			: 'Product category action could not be completed';
	}
</script>

<svelte:head>
	<title>Product categories | Zephyr CRM</title>
	<meta name="description" content="Manage the flat categories used by the Product catalogue" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role} context="Products">
	<a class="back-link" href={resolve('/products')}>← Back to Products</a>
	<PageHeader
		title="Product categories"
		description="Keep the flat catalogue groups used to organise Products. Category order controls catalogue and picker ordering."
	>
		{#snippet actions()}
			<a class="new-link" href={resolve('/products/new')}>New Product</a>
		{/snippet}
	</PageHeader>

	{#if form?.message}
		<ErrorState title={actionErrorTitle(form.message)} message={form.message} />
	{/if}

	<Card title="Add category" class="category-create-card">
		<form method="POST" action="?/create" class="category-create-form">
			<Input id="category-create-code" name="code" label="Category code" maxlength={80} required />
			<Input
				id="category-create-label"
				name="label"
				label="Category label"
				maxlength={200}
				required
			/>
			<Input
				id="category-create-sort-order"
				name="sort_order"
				label="Sort order"
				type="number"
				min="0"
				step="1"
				value="0"
				required
			/>
			<Button type="submit" size="sm">Create category</Button>
		</form>
	</Card>

	<Card title="Categories" class="category-list-card">
		{#if data.categories.length === 0}
			<EmptyState
				title="No Product categories"
				message="Create a flat category to organise reusable Products."
			/>
		{:else}
			<div class="category-table-wrap">
				<table class="category-table">
					<caption class="sr-only">Product category management</caption>
					<thead>
						<tr>
							<th scope="col">Category</th>
							<th scope="col">Sort order</th>
							<th scope="col">Status</th>
							<th scope="col">Status actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.categories as category (category.id)}
							<tr class="category-row">
								<td>
									<form method="POST" action="?/update" class="category-edit-form">
										<input type="hidden" name="category_id" value={category.id} />
										<input type="hidden" name="lock_version" value={category.lock_version} />
										<Input
											id={`category-code-${category.id}`}
											name="code"
											label="Category code"
											value={category.code}
											maxlength={80}
											required
										/>
										<Input
											id={`category-label-${category.id}`}
											name="label"
											label="Category label"
											value={category.label}
											maxlength={200}
											required
										/>
										<Input
											id={`category-sort-order-${category.id}`}
											name="sort_order"
											label="Sort order"
											type="number"
											min="0"
											step="1"
											value={String(category.sort_order)}
											required
										/>
										<Button type="submit" size="sm" variant="secondary">Save category</Button>
									</form>
								</td>
								<td>{category.sort_order}</td>
								<td><Badge tone={statusTone(category.status)}>{category.status}</Badge></td>
								<td>
									{#if category.status === 'active'}
										<form method="POST" action="?/inactivate" class="category-status-form">
											<input type="hidden" name="category_id" value={category.id} />
											<input type="hidden" name="lock_version" value={category.lock_version} />
											<Input
												id={`category-inactivation-reason-${category.id}`}
												name="reason"
												label="Inactivation reason"
												maxlength={2000}
												required
											/>
											<Button type="submit" size="sm" variant="secondary"
												>Inactivate category</Button
											>
										</form>
									{:else}
										<form method="POST" action="?/activate">
											<input type="hidden" name="category_id" value={category.id} />
											<input type="hidden" name="lock_version" value={category.lock_version} />
											<Button type="submit" size="sm">Activate category</Button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
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
	.new-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.5rem;
		padding: 0 var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-brand-primary);
		color: white;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
	.new-link:hover {
		background: var(--color-brand-primary-strong);
	}
	:global(.category-create-card),
	:global(.category-list-card) {
		margin-bottom: var(--space-lg);
	}
	.category-create-form {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
		align-items: end;
		gap: var(--space-md);
	}
	.category-table-wrap {
		overflow-x: auto;
	}
	.category-table {
		width: 100%;
		min-width: 62rem;
		border-collapse: collapse;
	}
	.category-table th,
	.category-table td {
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	.category-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.category-table td {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.category-edit-form,
	.category-status-form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-sm);
	}
	.category-edit-form :global(.ui-field) {
		min-width: 12rem;
		flex: 1 1 12rem;
	}
	.category-status-form :global(.ui-field) {
		min-width: 16rem;
		flex: 1 1 16rem;
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
	@media (max-width: 900px) {
		.category-create-form {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 640px) {
		.category-create-form {
			grid-template-columns: 1fr;
		}
	}
</style>
