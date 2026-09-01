<script lang="ts">
	import { navigating } from '$app/state';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ProductTable from '$lib/components/products/ProductTable.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	let { data }: { data: PageData } = $props();
	const canManage = $derived(data.profile.role === 'owner' || data.profile.role === 'admin');
	const hasFilters = $derived(
		Boolean(data.filters.q || data.filters.status || data.filters.kind || data.filters.categoryId)
	);

	function pageQuery(page: number) {
		const params: string[] = [];
		const add = (key: string, value: string | number) =>
			params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		if (data.filters.q) add('q', data.filters.q);
		if (data.filters.status) add('status', data.filters.status);
		if (data.filters.kind) add('kind', data.filters.kind);
		if (data.filters.categoryId) add('category_id', data.filters.categoryId);
		add('page', page);
		return `?${params.join('&')}`;
	}
</script>

<svelte:head>
	<title>Products | Zephyr CRM</title>
	<meta name="description" content="Manage reusable Products and services for future Quotes" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader
		title="Products"
		description="Reusable Products and services can be selected into future Quotes without changing historical commercial records."
	>
		{#snippet actions()}
			{#if canManage}
				<a class="manage-link" href={resolve('/products/categories')}>Manage categories</a>
				<a class="new-link" href={resolve('/products/new')}>New Product</a>
			{/if}
		{/snippet}
	</PageHeader>

	{#if navigating.to}<LoadingState message="Loading Products…" />{/if}

	<Card class="filters-card">
		<form method="GET" class="filters-form" aria-label="Filter Products">
			<Input
				id="product-search"
				name="q"
				label="Search"
				placeholder="Code, name or description"
				value={data.filters.q}
			/>
			<Select id="product-status" name="status" label="Status" value={data.filters.status}>
				<option value="">All statuses</option>
				<option value="draft">Draft</option>
				<option value="active">Active</option>
				<option value="inactive">Inactive</option>
				<option value="archived">Archived</option>
			</Select>
			<Select id="product-kind" name="kind" label="Kind" value={data.filters.kind}>
				<option value="">All kinds</option>
				<option value="product">Products</option>
				<option value="service">Services</option>
			</Select>
			<Select
				id="product-category-filter"
				name="category_id"
				label="Category"
				value={data.filters.categoryId}
			>
				<option value="">All categories</option>
				{#each data.categories as category (category.id)}
					<option value={category.id}>{category.label}</option>
				{/each}
			</Select>
			<div class="filter-actions">
				<Button type="submit" size="sm">Apply filters</Button>
				{#if hasFilters}<a class="clear-link" href={resolve('/products')}>Clear</a>{/if}
			</div>
		</form>
	</Card>

	<div class="list-summary" aria-live="polite">
		<span>
			{#if data.pagination.total === 0}No matching Products{:else}Showing {data.products.length} of {data
					.pagination.total} Products{/if}
		</span>
		<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
	</div>

	{#if data.products.length === 0}
		<EmptyState
			title={hasFilters ? 'No matching Products' : 'No Products yet'}
			message={hasFilters
				? 'Try a different search or filter combination.'
				: canManage
					? 'Create a reusable Product or service to use when preparing a Quote.'
					: 'An administrator has not added any reusable Products yet.'}
		/>
	{:else}
		<Card class="products-card"
			><ProductTable products={data.products} categories={data.categories} /></Card
		>
	{/if}

	{#if data.pagination.totalPages > 1}
		<nav class="pagination" aria-label="Product list pages">
			<a
				class:disabled={data.pagination.page <= 1}
				aria-disabled={data.pagination.page <= 1}
				href={resolve(
					`/products${pageQuery(Math.max(1, data.pagination.page - 1))}` as `/products?${string}`
				)}>Previous</a
			>
			<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
			<a
				class:disabled={data.pagination.page >= data.pagination.totalPages}
				aria-disabled={data.pagination.page >= data.pagination.totalPages}
				href={resolve(
					`/products${pageQuery(Math.min(data.pagination.totalPages, data.pagination.page + 1))}` as `/products?${string}`
				)}>Next</a
			>
		</nav>
	{/if}
</AppShell>

<style>
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
	.manage-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.5rem;
		padding: 0 var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		color: var(--color-brand-primary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
	.manage-link:hover {
		background: var(--color-surface-subtle);
	}
	.new-link:hover {
		background: var(--color-brand-primary-strong);
	}
	:global(.filters-card),
	:global(.products-card) {
		margin-bottom: var(--space-lg);
	}
	.filters-form {
		display: grid;
		grid-template-columns: minmax(14rem, 2fr) repeat(3, minmax(9rem, 1fr)) auto;
		align-items: end;
		gap: var(--space-md);
	}
	.filter-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}
	.clear-link {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.list-summary {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	:global(.products-card) {
		padding: 0;
		overflow: hidden;
	}
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--space-lg);
		margin-top: var(--space-lg);
		font-size: var(--font-size-sm);
	}
	.pagination a {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
	.pagination a.disabled {
		color: var(--color-text-subtle);
		pointer-events: none;
	}
	.pagination span {
		color: var(--color-text-muted);
	}
	@media (max-width: 1100px) {
		.filters-form {
			grid-template-columns: repeat(3, minmax(10rem, 1fr));
		}
		.filter-actions {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 640px) {
		.filters-form {
			grid-template-columns: 1fr;
		}
		.filter-actions {
			grid-column: auto;
		}
		.list-summary {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
