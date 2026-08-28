<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import {
		searchProducts,
		type ProductOption,
		type ProductSearchPagination as Pagination
	} from '$lib/services/products';

	type ProductCategory = { id: string; label: string };

	let {
		action,
		quoteId,
		currency,
		categories = [],
		disabled = false
	}: {
		action: string;
		quoteId: string;
		currency: string;
		categories?: ProductCategory[];
		disabled?: boolean;
	} = $props();

	let query = $state('');
	let categoryId = $state('');
	let page = $state(1);
	let products = $state<ProductOption[]>([]);
	let pagination = $state<Pagination>({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
	let selectedProduct = $state<ProductOption | null>(null);
	let quantity = $state('1');
	let loading = $state(false);
	let errorMessage = $state('');

	function formatPrice(product: ProductOption) {
		return `${product.currency} ${Number(product.unit_price).toLocaleString('en-ZA', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		})}`;
	}

	function categoryLabel(categoryIdValue: string | null) {
		return categories.find((category) => category.id === categoryIdValue)?.label ?? 'Uncategorised';
	}

	$effect(() => {
		const normalizedQuery = query.trim();
		const normalizedCategory = categoryId;
		const normalizedCurrency = currency.trim().toUpperCase();
		const currentPage = page;
		if (!normalizedQuery && !normalizedCategory) {
			products = [];
			pagination = { page: 1, pageSize: 12, total: 0, totalPages: 1 };
			loading = false;
			errorMessage = '';
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			loading = true;
			errorMessage = '';
			try {
				const result = await searchProducts({
					currency: normalizedCurrency,
					page: currentPage,
					pageSize: 12,
					query: normalizedQuery,
					categoryId: normalizedCategory,
					signal: controller.signal
				});
				products = result.products;
				pagination = result.pagination;
			} catch (cause) {
				if (cause instanceof DOMException && cause.name === 'AbortError') return;
				errorMessage = cause instanceof Error ? cause.message : 'Could not search the catalogue';
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, 250);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function selectProduct(product: ProductOption) {
		selectedProduct = product;
		quantity = '1';
	}

	function goToPage(nextPage: number) {
		page = Math.min(Math.max(1, nextPage), pagination.totalPages);
	}
</script>

<section class="product-picker" aria-labelledby="product-picker-title" data-quote-id={quoteId}>
	<div class="picker-heading">
		<div>
			<p class="eyebrow">Reusable pricing</p>
			<h2 id="product-picker-title">Add from catalogue</h2>
		</div>
		<p class="picker-help">Search active Products and services that match {currency}.</p>
	</div>
	<div class="picker-filters">
		<Input
			id="catalogue-search"
			label="Search catalogue"
			placeholder="Code, name or description"
			bind:value={query}
			{disabled}
		/>
		<Select id="catalogue-category" label="Category" bind:value={categoryId} {disabled}>
			<option value="">All categories</option>
			{#each categories as category (category.id)}
				<option value={category.id}>{category.label}</option>
			{/each}
		</Select>
	</div>

	{#if loading}
		<p class="picker-status" aria-live="polite">Searching active Products…</p>
	{:else if errorMessage}
		<p class="picker-status picker-error" role="alert">{errorMessage}</p>
	{:else if !query.trim() && !categoryId}
		<p class="picker-status" aria-live="polite">Enter a search term or choose a category.</p>
	{:else if products.length === 0}
		<p class="picker-status" aria-live="polite">No active Products match this search.</p>
	{:else}
		<div class="product-picker-options" aria-live="polite">
			{#each products as product (product.id)}
				<article class="product-picker-option">
					<div class="product-option-copy">
						<div class="product-option-title">
							<strong>{product.name}</strong><span>{product.product_code}</span>
						</div>
						{#if product.customer_description}<p>{product.customer_description}</p>{/if}
						<span class="product-option-meta"
							>{categoryLabel(product.category_id)} · per {product.unit_label}</span
						>
					</div>
					<div class="product-option-side">
						<strong>{formatPrice(product)}</strong>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onclick={() => selectProduct(product)}>Use Product</Button
						>
					</div>
				</article>
			{/each}
		</div>
		{#if pagination.totalPages > 1}
			<nav class="picker-pagination" aria-label="Catalogue search pages">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={page <= 1}
					onclick={() => goToPage(page - 1)}>Previous</Button
				>
				<span>Page {page} of {pagination.totalPages}</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={page >= pagination.totalPages}
					onclick={() => goToPage(page + 1)}>Next</Button
				>
			</nav>
		{/if}
	{/if}

	{#if selectedProduct}
		<div class="selected-product" aria-label="Selected catalogue Product">
			<div>
				<span class="eyebrow">Selected Product</span>
				<strong>{selectedProduct.name}</strong>
				<span
					>{selectedProduct.product_code} · {formatPrice(selectedProduct)} per {selectedProduct.unit_label}</span
				>
			</div>
			<div class="selected-product-actions">
				<Input
					id="catalogue-quantity"
					name="quantity"
					label="Catalogue quantity"
					inputmode="decimal"
					bind:value={quantity}
					required
				/>
				<input type="hidden" name="product_id" value={selectedProduct.id} />
				<input type="hidden" name="product_lock_version" value={selectedProduct.lock_version} />
				<Button type="submit" formaction={action}>Add Product to quote</Button>
			</div>
		</div>
	{/if}
</section>

<style>
	.product-picker {
		display: grid;
		gap: var(--space-md);
		padding: var(--space-lg);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface-subtle);
	}
	.picker-heading,
	.selected-product,
	.product-picker-option,
	.picker-pagination {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: start;
	}
	.picker-heading h2 {
		margin: var(--space-xs) 0 0;
		font-size: var(--font-size-lg);
	}
	.picker-help,
	.picker-status,
	.product-option-meta,
	.selected-product > div > span:last-child {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.picker-filters {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(12rem, 1fr);
		gap: var(--space-md);
	}
	.product-picker-options {
		display: grid;
		gap: var(--space-sm);
	}
	.product-picker-option {
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.product-option-copy,
	.product-option-side,
	.selected-product-actions {
		display: grid;
		gap: var(--space-xs);
	}
	.product-option-title {
		display: flex;
		gap: var(--space-sm);
		align-items: baseline;
	}
	.product-option-title span {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.product-option-copy p {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.product-option-side {
		justify-items: end;
		text-align: right;
	}
	.picker-pagination {
		align-items: center;
		justify-content: center;
	}
	.picker-pagination span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.selected-product {
		align-items: end;
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-border-subtle);
	}
	.selected-product > div:first-child,
	.selected-product-actions {
		display: grid;
		gap: var(--space-xs);
	}
	.selected-product-actions {
		grid-template-columns: minmax(8rem, 10rem) auto;
		align-items: end;
	}
	.selected-product-actions :global(.ui-field) {
		min-width: 8rem;
	}
	.eyebrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.picker-error {
		color: var(--color-danger);
	}
	@media (max-width: 640px) {
		.picker-heading,
		.product-picker-option,
		.selected-product {
			flex-direction: column;
		}
		.picker-filters,
		.selected-product-actions {
			grid-template-columns: 1fr;
		}
		.product-option-side {
			justify-items: start;
			text-align: left;
		}
	}
</style>
