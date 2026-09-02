<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { DimensionValue } from '$lib/domain/products/dimensions';

	export type QuoteEditorItem = {
		id?: string;
		name: string;
		description: string;
		quantity: string;
		unit_price: string;
		taxable: boolean;
		source_type?: string;
		product_code_snapshot?: string | null;
		unit_label_snapshot?: string | null;
		catalogue_unit_price?: string | number | null;
		source_product_version?: number | null;
		current_product_lock_version?: number | null;
		is_stale?: boolean;
		dimensionsEnabled?: boolean;
		dimensions?: DimensionValue[];
		product_category_label_snapshot?: string | null;
	};

	let {
		item = $bindable(),
		index,
		readonly = false,
		removeDisabled = false,
		onRemove,
		onMoveUp,
		onMoveDown,
		moveUpDisabled = false,
		moveDownDisabled = false,
		reviewActions = false,
		refreshAction = '?/refreshProduct',
		reviewAction = '?/reviewProduct',
		validationMessage = ''
	}: {
		item: QuoteEditorItem;
		index: number;
		readonly?: boolean;
		removeDisabled?: boolean;
		onRemove?: () => void;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
		moveUpDisabled?: boolean;
		moveDownDisabled?: boolean;
		reviewActions?: boolean;
		refreshAction?: string;
		reviewAction?: string;
		validationMessage?: string;
	} = $props();

	const isCatalogue = $derived(item.source_type === 'catalogue');
	const isDimensional = $derived(isCatalogue && item.dimensionsEnabled === true);
	const canReviewSource = $derived(
		!readonly && reviewActions && isCatalogue && Boolean(item.id && item.is_stale)
	);

	function displayPrice(value: string | number | null | undefined) {
		if (value === null || value === undefined || value === '') return 'Not recorded';
		return String(value);
	}
</script>

<div class="line-item" class:catalogue-line={isCatalogue}>
	<div class="line-item-heading">
		<div class="line-item-title">
			<strong>Item {index + 1}</strong>
			<span class:catalogue-badge={isCatalogue} class="source-badge">
				{isCatalogue ? 'Catalogue line' : 'Custom line'}
			</span>
		</div>
		{#if !readonly}
			<div class="line-item-controls">
				<button type="button" onclick={() => onMoveUp?.()} disabled={moveUpDisabled}
					>Move item {index + 1} up</button
				>
				<button type="button" onclick={() => onMoveDown?.()} disabled={moveDownDisabled}
					>Move item {index + 1} down</button
				>
				<button
					type="button"
					class="remove-line"
					data-remove-line={index}
					onclick={() => onRemove?.()}
					disabled={removeDisabled}>Remove</button
				>
			</div>
		{/if}
	</div>

	{#if isCatalogue}
		<div class="catalogue-summary">
			<div>
				<span class="field-label">Product code</span>
				<strong>{item.product_code_snapshot || 'Code unavailable'}</strong>
			</div>
			<div>
				<span class="field-label">Category</span>
				<strong>{item.product_category_label_snapshot || 'Uncategorised'}</strong>
			</div>
			<div>
				<span class="field-label">Unit</span>
				<strong>{item.unit_label_snapshot || 'Unit unavailable'}</strong>
			</div>
			<div>
				<span class="field-label">Catalogue price</span>
				<strong>{displayPrice(item.catalogue_unit_price)}</strong>
			</div>
			<div>
				<span class="field-label">Source version</span>
				<strong>{item.source_product_version ?? 'Unknown'}</strong>
			</div>
		</div>
		<div class="raw-field">
			<label for={`quote-item-name-${index}`}>Name</label><input
				id={`quote-item-name-${index}`}
				class="ui-field__control"
				value={item.name}
				readonly
				required
			/>
		</div>
		{#if isDimensional}
			<fieldset class="dimensions-fieldset">
				<legend>Measurements (mm)</legend>
				<div class="dimensions-grid">
					{#each item.dimensions ?? [] as dimension (dimension.key)}
						<div class="raw-field">
							<label for={`quote-item-${index}-${dimension.key}`}>
								{dimension.label}{dimension.required ? ' (required)' : ''}
							</label>
							<input
								id={`quote-item-${index}-${dimension.key}`}
								class="ui-field__control"
								type="number"
								min="0.000001"
								step="any"
								inputmode="decimal"
								value={dimension.value ?? ''}
								oninput={(event) => {
									dimension.value = (event.currentTarget as HTMLInputElement).value || null;
								}}
								disabled={readonly}
								required={dimension.required}
								aria-required={dimension.required ? 'true' : undefined}
							/>
						</div>
					{/each}
				</div>
				{#if validationMessage}
					<p class="dimension-error" role="alert">{validationMessage}</p>
				{/if}
			</fieldset>
		{/if}
	{:else}
		<div class="raw-field line-name">
			<label for={`quote-item-name-${index}`}>Name</label><input
				id={`quote-item-name-${index}`}
				class="ui-field__control"
				bind:value={item.name}
				disabled={readonly}
				required
			/>
		</div>
	{/if}

	<div class="line-item-grid">
		{#if isDimensional}
			<div class="fixed-quantity">
				<span class="field-label">Quantity</span>
				<strong>1</strong>
				<input type="hidden" name={`quote-item-quantity-${index}`} value="1" />
			</div>
		{:else}
			<div class="raw-field">
				<label for={`quote-item-quantity-${index}`}>Quantity</label><input
					id={`quote-item-quantity-${index}`}
					class="ui-field__control"
					type="text"
					inputmode="decimal"
					bind:value={item.quantity}
					disabled={readonly}
					required
				/>
			</div>
		{/if}
		<div class="raw-field">
			<label for={`quote-item-price-${index}`}
				>{isDimensional ? 'Full quoted price' : 'Unit price'}</label
			><input
				id={`quote-item-price-${index}`}
				class="ui-field__control"
				type="text"
				inputmode="decimal"
				bind:value={item.unit_price}
				disabled={readonly}
				required
			/>
		</div>
	</div>
	<div class="raw-field">
		<label for={`quote-item-description-${index}`}>Description</label><textarea
			id={`quote-item-description-${index}`}
			class="ui-field__control"
			rows="2"
			bind:value={item.description}
			disabled={readonly}></textarea>
	</div>
	<label class="taxable-control"
		><input type="checkbox" bind:checked={item.taxable} disabled={readonly} /> Taxable line</label
	>

	{#if canReviewSource}
		<div class="stale-source" role="alert">
			<strong>Product changed since this line was added</strong>
			<p>
				Product changed since this line was added (version {item.source_product_version ??
					'unknown'} →
				{item.current_product_lock_version ?? 'unknown'}).
			</p>
			<div class="stale-actions">
				<Button
					type="submit"
					variant="secondary"
					formaction={refreshAction}
					name="quote_item_id"
					value={item.id}>Refresh from Catalogue</Button
				>
				<input
					type="hidden"
					name="product_lock_version"
					value={item.current_product_lock_version ?? ''}
				/>
				<Button
					type="submit"
					variant="ghost"
					formaction={reviewAction}
					name="quote_item_id"
					value={item.id}>Keep Quoted Values</Button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-item {
		display: grid;
		gap: var(--space-sm);
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.catalogue-line {
		border-color: color-mix(in srgb, var(--color-brand-primary) 35%, var(--color-border-subtle));
	}
	.line-item-heading,
	.line-item-title,
	.line-item-controls,
	.catalogue-summary,
	.stale-actions {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: center;
	}
	.line-item-title {
		justify-content: flex-start;
	}
	.line-item-controls {
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	.line-item-controls button:not(.remove-line) {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-brand-primary);
		cursor: pointer;
		font: inherit;
		font-size: var(--font-size-xs);
	}
	.line-item-controls button:disabled {
		color: var(--color-text-subtle);
		cursor: not-allowed;
	}
	.source-badge {
		padding: 0.2rem 0.45rem;
		border-radius: 999px;
		background: var(--color-surface-subtle);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.catalogue-badge {
		background: color-mix(in srgb, var(--color-brand-primary) 12%, transparent);
		color: var(--color-brand-primary-strong);
	}
	.catalogue-summary {
		justify-content: flex-start;
		flex-wrap: wrap;
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		background: var(--color-surface-subtle);
	}
	.catalogue-summary > div {
		display: grid;
		gap: 0.15rem;
		min-width: 7rem;
	}
	.field-label,
	.raw-field label {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.catalogue-summary .field-label,
	.stale-source p {
		font-size: var(--font-size-xs);
	}
	.raw-field {
		display: grid;
		gap: var(--space-xs);
	}
	.dimensions-fieldset {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: var(--space-sm);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
	}
	.dimensions-fieldset legend {
		padding: 0 var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.dimensions-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
	}
	.fixed-quantity {
		display: grid;
		gap: 0.15rem;
		align-content: start;
	}
	.dimension-error {
		margin: 0;
		color: var(--color-danger);
		font-size: var(--font-size-sm);
	}
	.line-item-grid {
		display: grid;
		grid-template-columns: minmax(8rem, 0.7fr) minmax(9rem, 0.8fr);
		gap: var(--space-sm);
	}
	.taxable-control {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.remove-line {
		border: 0;
		background: transparent;
		color: var(--color-danger);
		cursor: pointer;
		font: inherit;
		font-size: var(--font-size-xs);
	}
	.remove-line:disabled {
		color: var(--color-text-subtle);
		cursor: not-allowed;
	}
	.stale-source {
		display: grid;
		gap: var(--space-xs);
		padding: var(--space-md);
		border: 1px solid var(--color-warning);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
	}
	.stale-source p {
		margin: 0;
		color: var(--color-text-muted);
	}
	.stale-actions {
		justify-content: flex-start;
		flex-wrap: wrap;
	}
	@media (max-width: 620px) {
		.line-item-grid {
			grid-template-columns: 1fr;
		}
		.dimensions-grid {
			grid-template-columns: 1fr;
		}
		.catalogue-summary {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
