<script lang="ts">
	import type { Database } from '$lib/types/database';
	import {
		DIMENSION_KEYS,
		type DimensionDefinition,
		type DimensionKey
	} from '$lib/domain/products/dimensions';
	import Button from '$lib/components/ui/Button.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { initializeProductDimensions, serializeProductDimensions } from './product-form';

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

	function initialDimensionState() {
		const initialKind = value('kind', product?.kind ?? 'product');
		return {
			kind: initialKind,
			...initializeProductDimensions(
				initialKind,
				form?.values?.dimensions_enabled ?? product?.dimensions_enabled ?? false,
				form?.values?.dimension_definitions ?? product?.dimension_definitions ?? []
			)
		};
	}

	const initialDimensions = initialDimensionState();
	let kind = $state(initialDimensions.kind);
	let dimensionsEnabled = $state(initialDimensions.enabled);
	let dimensionDefinitions = $state<DimensionDefinition[]>(initialDimensions.definitions);
	let selectedPreset = $state<DimensionKey | ''>('');
	let dimensionsInitialized = true;
	function currentFormValues() {
		return form?.values;
	}

	function currentProductId() {
		return product?.id;
	}

	let previousFormValues: ProductFormValues | undefined = currentFormValues();
	let previousProductId: string | undefined = currentProductId();

	$effect(() => {
		const currentFormValues = form?.values;
		const currentProductId = product?.id;
		if (
			dimensionsInitialized &&
			currentFormValues === previousFormValues &&
			currentProductId === previousProductId
		)
			return;

		dimensionsInitialized = true;
		previousFormValues = currentFormValues;
		previousProductId = currentProductId;

		const initialKind = value('kind', product?.kind ?? 'product');
		const initialDimensions = initializeProductDimensions(
			initialKind,
			form?.values?.dimensions_enabled ?? product?.dimensions_enabled ?? false,
			form?.values?.dimension_definitions ?? product?.dimension_definitions ?? []
		);
		kind = initialKind;
		dimensionsEnabled = initialDimensions.enabled;
		dimensionDefinitions = initialDimensions.definitions;
	});

	$effect(() => {
		if (kind.trim().toLowerCase() === 'service' || !dimensionsEnabled) {
			if (dimensionsEnabled) dimensionsEnabled = false;
			if (dimensionDefinitions.length) dimensionDefinitions = [];
		}
	});

	const availableDimensionKeys = $derived(
		DIMENSION_KEYS.filter(
			(key) => !dimensionDefinitions.some((definition) => definition.key === key)
		)
	);

	$effect(() => {
		if (selectedPreset !== '' && availableDimensionKeys.includes(selectedPreset)) return;
		selectedPreset = availableDimensionKeys[0] ?? '';
	});

	function presetLabel(key: DimensionKey): string {
		return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
	}

	function addDimension() {
		const key =
			selectedPreset !== '' && availableDimensionKeys.includes(selectedPreset)
				? selectedPreset
				: availableDimensionKeys[0];
		if (!key) return;
		dimensionDefinitions = [
			...dimensionDefinitions,
			{ key, label: presetLabel(key), unit: 'mm', required: true }
		];
	}

	function removeDimension(index: number) {
		dimensionDefinitions = dimensionDefinitions.filter((_, currentIndex) => currentIndex !== index);
	}

	function moveDimension(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= dimensionDefinitions.length) return;
		const next = [...dimensionDefinitions];
		[next[index], next[target]] = [next[target], next[index]];
		dimensionDefinitions = next;
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
	<Select id="product-kind" name="kind" label="Kind" bind:value={kind} required>
		<option value="product">Product</option>
		<option value="service">Service</option>
	</Select>
	<fieldset class="dimensions-panel">
		<legend>Measurements</legend>
		<Checkbox
			id="product-dimensions-enabled"
			name="dimensions_enabled"
			label="This Product requires measurements"
			bind:checked={dimensionsEnabled}
			disabled={kind.trim().toLowerCase() === 'service'}
		/>
		{#if kind.trim().toLowerCase() === 'service'}
			<p class="field-hint">Services do not use Product measurements.</p>
		{:else if dimensionsEnabled}
			<div class="dimension-list" aria-label="Product measurements">
				{#if dimensionDefinitions.length === 0}
					<p class="dimensions-empty">Add at least one measurement before saving.</p>
				{/if}
				{#each dimensionDefinitions as definition, index (definition.key)}
					<div class="dimension-row">
						<div class="dimension-row-heading">
							<div class="dimension-title">
								<strong>{presetLabel(definition.key)}</strong>
								<span>Millimetres (mm)</span>
							</div>
							<div class="dimension-controls">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									ariaLabel={`Move ${presetLabel(definition.key)} up`}
									disabled={index === 0}
									onclick={() => moveDimension(index, -1)}>Up</Button
								>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									ariaLabel={`Move ${presetLabel(definition.key)} down`}
									disabled={index === dimensionDefinitions.length - 1}
									onclick={() => moveDimension(index, 1)}>Down</Button
								>
								<Button
									type="button"
									variant="danger"
									size="sm"
									onclick={() => removeDimension(index)}>Remove</Button
								>
							</div>
						</div>
						<label class="dimension-label" for={`product-dimension-label-${definition.key}`}>
							<span>Customer-facing label</span>
							<input
								id={`product-dimension-label-${definition.key}`}
								class="ui-field__control"
								bind:value={definition.label}
								maxlength="200"
								required
							/>
						</label>
						<label class="dimension-required">
							<input type="checkbox" bind:checked={definition.required} />
							<span>Required measurement</span>
						</label>
					</div>
				{/each}
			</div>
			<div class="dimension-add">
				<Select
					id="product-dimension-preset"
					label="Add measurement preset"
					bind:value={selectedPreset}
					disabled={availableDimensionKeys.length === 0}
				>
					{#if availableDimensionKeys.length === 0}
						<option value="">All four presets added</option>
					{:else}
						{#each availableDimensionKeys as key}
							<option value={key}>{presetLabel(key)} (mm)</option>
						{/each}
					{/if}
				</Select>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={availableDimensionKeys.length === 0 || selectedPreset === ''}
					onclick={addDimension}>Add measurement</Button
				>
			</div>
		{:else}
			<p class="field-hint">
				Enable measurements to configure the fields required for this Product.
			</p>
		{/if}
	</fieldset>
	<input
		type="hidden"
		name="dimension_definitions"
		value={serializeProductDimensions(kind, dimensionsEnabled, dimensionDefinitions)}
	/>
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
		class="wide-field"
		value={value('customer_description', product?.customer_description ?? '')}
		rows={4}
		maxlength={10000}
	/>
	{#if showInternalNotes}
		<Textarea
			id="product-internal-notes"
			name="internal_notes"
			label="Internal notes"
			class="wide-field"
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
	.product-form :global(.wide-field) {
		grid-column: span 3;
	}
	.dimensions-panel {
		display: grid;
		grid-column: 1 / -1;
		gap: var(--space-md);
		min-width: 0;
		margin: 0;
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface-subtle);
	}
	.dimensions-panel legend {
		padding: 0 var(--space-xs);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.dimension-list {
		display: grid;
		gap: var(--space-sm);
	}
	.dimension-row {
		display: grid;
		gap: var(--space-sm);
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.dimension-row-heading,
	.dimension-title,
	.dimension-controls,
	.dimension-required {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.dimension-row-heading {
		justify-content: space-between;
	}
	.dimension-title {
		align-items: baseline;
		flex-wrap: wrap;
	}
	.dimension-title span,
	.field-hint,
	.dimensions-empty {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.dimension-label {
		display: grid;
		gap: var(--space-xs);
		max-width: 32rem;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.dimension-required {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.dimension-add {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--space-sm);
		max-width: 42rem;
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
		.product-form :global(.wide-field) {
			grid-column: auto;
		}
		.dimension-row-heading,
		.dimension-add {
			grid-template-columns: 1fr;
			align-items: stretch;
		}
		.dimension-row-heading {
			display: grid;
		}
	}
</style>
