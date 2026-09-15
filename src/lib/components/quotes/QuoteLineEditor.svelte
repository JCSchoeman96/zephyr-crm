<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import {
		dimensionSummary,
		isDimensionalQuoteItem,
		missingRequiredDimensions
	} from './quote-editor-state';
	import type { QuoteEditorItem } from './quote-editor-types';

	let {
		item = $bindable(),
		index,
		active = false,
		readonly = false,
		removeDisabled = false,
		onSelect,
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
		active?: boolean;
		readonly?: boolean;
		removeDisabled?: boolean;
		onSelect?: () => void;
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
	const isDimensional = $derived(isDimensionalQuoteItem(item));
	const missingDimensions = $derived(missingRequiredDimensions(item));
	const canReviewSource = $derived(
		!readonly && reviewActions && isCatalogue && Boolean(item.id && item.is_stale)
	);

	function displayPrice(value: string | number | null | undefined) {
		if (value === null || value === undefined || value === '') return 'Not recorded';
		return String(value);
	}

	function sourceLabel() {
		return isCatalogue ? 'Catalogue line' : 'Custom line';
	}
</script>

<div class="line-item" class:catalogue-line={isCatalogue} class:line-item-active={active}>
	<div class="line-item-heading">
		<button
			type="button"
			class="line-item-summary"
			class:active
			aria-expanded={active}
			aria-controls={`quote-line-editor-${index}`}
			data-line-item-toggle={index}
			onclick={() => onSelect?.()}
		>
			<span class="line-item-index">Item {index + 1}</span>
			<span class="summary-item-name">
				<strong>{item.name || 'Untitled line'}</strong>
				{#if isCatalogue && item.product_code_snapshot}
					<small>{item.product_code_snapshot}</small>
				{/if}
			</span>
			<span class:catalogue-badge={isCatalogue} class="source-badge">{sourceLabel()}</span>
			<span class="summary-value">Qty {isDimensional ? '1' : item.quantity}</span>
			<span class="summary-value">Price {displayPrice(item.unit_price)}</span>
			<span class="summary-dimensions">{dimensionSummary(item)}</span>
			{#if item.is_stale}<span class="state-badge state-warning">Product changed</span>{/if}
			{#if missingDimensions.length}
				<span class="state-badge state-danger"
					>Missing {missingDimensions.map((dimension) => dimension.label).join(', ')}</span
				>
			{:else if validationMessage && isDimensional}
				<span class="state-badge state-danger">Needs attention</span>
			{/if}
			<span class="line-item-edit-label">{active ? 'Close' : 'Edit'}</span>
		</button>
		{#if active && !readonly}
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

	{#if active}
		<div class="line-item-editor" id={`quote-line-editor-${index}`}>
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
	{/if}
</div>

<style>
	.line-item {
		display: grid;
		gap: var(--space-sm);
		padding: var(--space-sm);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.catalogue-line {
		border-color: color-mix(in srgb, var(--color-brand-primary) 35%, var(--color-border-subtle));
	}
	.line-item-active {
		padding: var(--space-md);
	}
	.line-item-heading {
		display: grid;
		gap: var(--space-sm);
	}
	.line-item-summary {
		display: grid;
		grid-template-columns: auto minmax(8rem, 1.5fr) auto repeat(2, auto) minmax(10rem, 1.5fr) auto;
		gap: var(--space-sm);
		align-items: center;
		width: 100%;
		padding: var(--space-sm);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: var(--color-surface-subtle);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.line-item-summary:hover,
	.line-item-summary.active {
		border-color: var(--color-brand-primary);
		background: color-mix(in srgb, var(--color-brand-primary) 8%, var(--color-surface));
	}
	.line-item-index,
	.field-label,
	.raw-field label {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.source-badge,
	.state-badge {
		padding: 0.2rem 0.45rem;
		border-radius: 999px;
		font-size: var(--font-size-xs);
		white-space: nowrap;
	}
	.source-badge {
		background: var(--color-surface);
		color: var(--color-text-muted);
	}
	.catalogue-badge {
		background: color-mix(in srgb, var(--color-brand-primary) 12%, transparent);
		color: var(--color-brand-primary-strong);
	}
	.summary-value,
	.summary-dimensions,
	.summary-item-name small {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.summary-item-name {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}
	.summary-dimensions {
		overflow-wrap: anywhere;
	}
	.state-warning {
		background: color-mix(in srgb, var(--color-warning) 14%, transparent);
		color: var(--color-warning);
	}
	.state-danger {
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		color: var(--color-danger);
	}
	.line-item-edit-label {
		color: var(--color-brand-primary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}
	.line-item-controls {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-md);
		align-items: center;
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
	.line-item-editor {
		display: grid;
		gap: var(--space-sm);
	}
	.catalogue-summary {
		display: flex;
		justify-content: flex-start;
		gap: var(--space-md);
		align-items: center;
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
	.catalogue-summary .field-label,
	.stale-source p {
		font-size: var(--font-size-xs);
	}
	.raw-field {
		display: grid;
		gap: var(--space-xs);
	}
	.line-item-grid {
		display: grid;
		grid-template-columns: minmax(8rem, 0.7fr) minmax(9rem, 0.8fr);
		gap: var(--space-sm);
	}
	.fixed-quantity {
		display: grid;
		gap: 0.15rem;
		align-content: start;
	}
	.taxable-control {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
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
		display: flex;
		justify-content: flex-start;
		gap: var(--space-md);
		align-items: center;
		flex-wrap: wrap;
	}
	@media (max-width: 900px) {
		.line-item-summary {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.summary-value,
		.summary-dimensions,
		.state-badge {
			grid-column: 2 / -1;
		}
	}
	@media (max-width: 620px) {
		.line-item-grid {
			grid-template-columns: 1fr;
		}
		.catalogue-summary {
			align-items: start;
			flex-direction: column;
		}
		.line-item-controls {
			justify-content: flex-start;
		}
	}
</style>
