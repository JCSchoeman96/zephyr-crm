<script lang="ts">
	import type { Database } from '$lib/types/database';
	import Button from '$lib/components/ui/Button.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';

	type Product = Database['public']['Tables']['products']['Row'];
	type ProductCategory = Database['public']['Tables']['product_categories']['Row'];
	type ProductFormValues = Record<string, string>;

	let {
		action,
		product = null,
		categories = [],
		form = null,
		showInternalNotes = true,
		showActivateButton = false,
		submitLabel = 'Save product'
	}: {
		action: string;
		product?: Product | null;
		categories?: ProductCategory[];
		form?: { values?: ProductFormValues; message?: string } | null;
		showInternalNotes?: boolean;
		showActivateButton?: boolean;
		submitLabel?: string;
	} = $props();

	function value(name: string, fallback = ''): string {
		return form?.values?.[name] ?? fallback;
	}
</script>

<form method="POST" {action} class="product-form">
	{#if product}<input type="hidden" name="lock_version" value={product.lock_version} />{/if}
	<Input
		id="product-code"
		name="product_code"
		label="Product code"
		value={value('product_code', product?.product_code ?? '')}
		maxlength={80}
		required
	/>
	<Input
		id="product-name"
		name="name"
		label="Product name"
		value={value('name', product?.name ?? '')}
		maxlength={200}
		required
	/>
	<Select
		id="product-kind"
		name="kind"
		label="Kind"
		value={value('kind', product?.kind ?? 'product')}
		required
	>
		<option value="product">Product</option>
		<option value="service">Service</option>
	</Select>
	<Select
		id="product-category"
		name="category_id"
		label="Category"
		value={value('category_id', product?.category_id ?? '')}
	>
		<option value="">No category</option>
		{#each categories as category (category.id)}
			<option value={category.id}>{category.label} ({category.code})</option>
		{/each}
	</Select>
	<Input
		id="product-unit"
		name="unit_label"
		label="Unit label"
		value={value('unit_label', product?.unit_label ?? 'each')}
		maxlength={80}
		required
	/>
	<Input
		id="product-currency"
		name="currency"
		label="Currency"
		value={value('currency', product?.currency ?? 'ZAR')}
		maxlength={3}
		inputmode="text"
		required
	/>
	{#if product}
		<div class="current-price" aria-label="Current unit price">
			<span class="field-label">Current unit price</span>
			<strong>{product.currency} {product.unit_price}</strong>
			<span class="field-hint">Price changes use the separate price-change action.</span>
		</div>
	{:else}
		<Input
			id="product-unit-price"
			name="unit_price"
			label="Unit price"
			value={value('unit_price', '0.0000')}
			inputmode="decimal"
			placeholder="0.0000"
			maxlength={15}
			required
		/>
	{/if}
	<Textarea
		id="product-customer-description"
		name="customer_description"
		label="Customer description"
		value={value('customer_description', product?.customer_description ?? '')}
		rows={4}
		maxlength={10000}
	/>
	{#if showInternalNotes}
		<Textarea
			id="product-internal-notes"
			name="internal_notes"
			label="Internal notes"
			value={value('internal_notes', product?.internal_notes ?? '')}
			rows={4}
			maxlength={10000}
			hint="Staff-only notes. They never enter a Quote or customer document."
		/>
	{/if}
	<Checkbox
		id="product-taxable"
		name="taxable"
		label="Taxable"
		checked={value('taxable', product?.taxable === false ? '' : 'on') === 'on'}
	/>
	<div class="form-actions">
		<Button type="submit" size="sm">{submitLabel}</Button>
		{#if showActivateButton}
			<Button type="submit" size="sm" variant="secondary" formaction="?/saveAndActivate"
				>Save &amp; activate</Button
			>
		{/if}
	</div>
</form>

<style>
	.product-form {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: end;
		gap: var(--space-md);
	}
	.product-form :global(.ui-field:nth-of-type(8)),
	.product-form :global(.ui-field:nth-of-type(9)) {
		grid-column: span 3;
	}
	.current-price {
		display: grid;
		gap: var(--space-xs);
		align-content: center;
		min-height: 4.6rem;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface-subtle);
	}
	.field-label,
	.field-hint {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.current-price strong {
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.form-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm);
		grid-column: 1 / -1;
	}
	@media (max-width: 760px) {
		.product-form {
			grid-template-columns: 1fr;
		}
		.product-form :global(.ui-field:nth-of-type(8)),
		.product-form :global(.ui-field:nth-of-type(9)) {
			grid-column: auto;
		}
	}
</style>
