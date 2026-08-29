<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Database } from '$lib/types/database';
	import Badge from '$lib/components/ui/Badge.svelte';

	type Product = Database['public']['Tables']['products']['Row'];
	type ProductCategory = Database['public']['Tables']['product_categories']['Row'];

	let { products, categories = [] }: { products: Product[]; categories?: ProductCategory[] } =
		$props();

	function categoryLabel(categoryId: string | null) {
		return categories.find((category) => category.id === categoryId)?.label ?? 'Uncategorised';
	}

	function statusTone(status: string) {
		if (status === 'active') return 'success';
		if (status === 'archived') return 'danger';
		if (status === 'inactive') return 'warning';
		return 'neutral';
	}

	function formatPrice(product: Product) {
		return `${product.currency} ${Number(product.unit_price).toLocaleString('en-ZA', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		})}`;
	}
</script>

<div class="products-table-wrap">
	<table class="products-table">
		<caption class="sr-only">Product catalogue</caption>
		<thead>
			<tr>
				<th scope="col">Product</th>
				<th scope="col">Kind</th>
				<th scope="col">Category</th>
				<th scope="col">Unit price</th>
				<th scope="col">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each products as product (product.id)}
				<tr>
					<td>
						<a class="product-link" href={resolve(`/products/${product.id}`)}>{product.name}</a>
						<span>{product.product_code} · per {product.unit_label}</span>
					</td>
					<td>{product.kind === 'service' ? 'Service' : 'Product'}</td>
					<td>{categoryLabel(product.category_id)}</td>
					<td>{formatPrice(product)}</td>
					<td><Badge tone={statusTone(product.status)}>{product.status}</Badge></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.products-table-wrap {
		overflow-x: auto;
	}
	.products-table {
		width: 100%;
		min-width: 48rem;
		border-collapse: collapse;
	}
	.products-table th,
	.products-table td {
		padding: var(--space-lg);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	.products-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.products-table td {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.products-table td:first-child {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.products-table td:first-child span {
		display: block;
		margin-top: var(--space-xs);
		color: var(--color-text-subtle);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}
	.product-link {
		color: var(--color-brand-primary);
		text-decoration: none;
	}
	.product-link:hover {
		text-decoration: underline;
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
</style>
