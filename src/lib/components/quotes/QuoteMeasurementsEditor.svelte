<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import {
		MAX_DIMENSION_VALUE_DECIMAL_PLACES,
		MAX_DIMENSION_VALUE_MM,
		type DimensionValue
	} from '$lib/domain/products/dimensions';
	import {
		dimensionSummary,
		isDimensionalQuoteItem,
		missingRequiredDimensions,
		quoteEditorItemKey
	} from './quote-editor-state';
	import type { QuoteEditorItem, QuoteLeadMeasurements } from './quote-editor-types';

	let {
		items = [],
		activeItemKey = null,
		leadMeasurements = null,
		validationMessage = '',
		onSelectItem,
		onApplyEnquiry,
		onDimensionChange
	}: {
		items?: QuoteEditorItem[];
		activeItemKey?: string | null;
		leadMeasurements?: QuoteLeadMeasurements | null;
		validationMessage?: string;
		onSelectItem?: (key: string) => void;
		onApplyEnquiry?: () => void;
		onDimensionChange?: (itemKey: string, key: DimensionValue['key'], value: string | null) => void;
	} = $props();

	const dimensionalItems = $derived(
		items
			.map((item, index) => ({ item, index, key: quoteEditorItemKey(item, index) }))
			.filter(({ item }) => isDimensionalQuoteItem(item))
	);
	const activeEntry = $derived(
		dimensionalItems.find((entry) => entry.key === activeItemKey) ?? null
	);
	const activeMissingDimensions = $derived(
		activeEntry ? missingRequiredDimensions(activeEntry.item) : []
	);
	const hasEnquiryMeasurements = $derived(
		Boolean(leadMeasurements?.width || leadMeasurements?.height || leadMeasurements?.openings)
	);

	function dimensionLabel(dimension: DimensionValue) {
		return `${dimension.label}${dimension.required ? ' (required)' : ''}`;
	}

	function inputId(itemKey: string, dimension: DimensionValue) {
		return `quote-measurement-${itemKey}-${dimension.key}`;
	}
</script>

<div data-testid="quote-measurements-editor">
	<Card title="Quote measurements" class="quote-measurements-editor">
		<div class="measurements-heading">
			<span class="eyebrow">One line at a time</span>
			<p class="measurements-help">
				Choose a dimensional catalogue line, then enter its measurements.
			</p>
		</div>

		<div class="enquiry-strip" aria-label="Read-only enquiry measurements">
			<span class="strip-label">From enquiry</span>
			{#if hasEnquiryMeasurements}
				{#if leadMeasurements?.width}
					<div><span>Width</span><strong>{leadMeasurements.width} mm</strong></div>
				{/if}
				{#if leadMeasurements?.height}
					<div><span>Height</span><strong>{leadMeasurements.height} mm</strong></div>
				{/if}
				{#if leadMeasurements?.openings}
					<div><span>Openings</span><strong>{leadMeasurements.openings}</strong></div>
				{/if}
			{:else}
				<span class="empty-enquiry">No captured measurements</span>
			{/if}
			<Button
				type="button"
				variant="secondary"
				size="sm"
				disabled={!activeEntry || (!leadMeasurements?.width && !leadMeasurements?.height)}
				onclick={() => onApplyEnquiry?.()}>Use on active item</Button
			>
		</div>

		{#if dimensionalItems.length}
			<div class="measurement-lines" aria-label="Dimensional catalogue lines">
				{#each dimensionalItems as entry, measurementIndex (entry.key)}
					{@const missing = missingRequiredDimensions(entry.item)}
					<button
						type="button"
						class="measurement-line"
						class:active={entry.key === activeItemKey}
						aria-expanded={entry.key === activeItemKey}
						data-measurement-line-key={entry.key}
						onclick={() => onSelectItem?.(entry.key)}
					>
						<span class="measurement-line-index">{measurementIndex + 1}</span>
						<span class="measurement-line-copy">
							<strong>{entry.item.name || `Product line ${measurementIndex + 1}`}</strong>
							<span>{dimensionSummary(entry.item)}</span>
						</span>
						{#if missing.length}
							<span class="measurement-warning"
								>Missing: {missing.map((dimension) => dimension.label).join(', ')}</span
							>
						{:else}<span class="measurement-complete">Measurements entered</span>{/if}
						<span class="measurement-line-action"
							>{entry.key === activeItemKey ? 'Active' : 'Edit'}</span
						>
					</button>
				{/each}
			</div>

			{#if activeEntry}
				<div class="active-measurement-editor">
					<div class="active-measurement-heading">
						<div>
							<span class="eyebrow">Editing line</span>
							<strong>{activeEntry.item.name || 'Untitled Product line'}</strong>
						</div>
						{#if activeMissingDimensions.length}
							<span class="measurement-warning" role="status">
								Required: {activeMissingDimensions.map((dimension) => dimension.label).join(', ')}
							</span>
						{/if}
					</div>
					<div class="dimensions-grid">
						{#each activeEntry.item.dimensions ?? [] as dimension (dimension.key)}
							<div class:missing={dimension.required && !dimension.value} class="dimension-field">
								<label for={inputId(activeEntry.key, dimension)}>{dimensionLabel(dimension)}</label>
								<div class="dimension-input">
									<input
										id={inputId(activeEntry.key, dimension)}
										class="ui-field__control"
										type="number"
										min={10 ** -MAX_DIMENSION_VALUE_DECIMAL_PLACES}
										max={MAX_DIMENSION_VALUE_MM}
										step={10 ** -MAX_DIMENSION_VALUE_DECIMAL_PLACES}
										inputmode="decimal"
										value={dimension.value ?? ''}
										aria-required={dimension.required ? 'true' : undefined}
										oninput={(event) =>
											onDimensionChange?.(
												activeEntry.key,
												dimension.key,
												(event.currentTarget as HTMLInputElement).value || null
											)}
									/>
									<span>{dimension.unit}</span>
								</div>
								{#if dimension.required && !dimension.value}<small>Required</small>{/if}
							</div>
						{/each}
					</div>
					{#if validationMessage}
						<p class="dimension-error" role="alert">{validationMessage}</p>
					{/if}
				</div>
			{:else}
				<p class="measurements-empty">Select a line to enter measurements.</p>
			{/if}
		{:else}
			<p class="measurements-empty">
				Add a dimensional Product line from the catalogue to enter measurements.
			</p>
		{/if}
	</Card>
</div>

<style>
	:global(.quote-measurements-editor) {
		display: grid;
		gap: var(--space-md);
	}
	.measurements-heading {
		display: grid;
		gap: var(--space-xs);
	}
	.measurements-help,
	.measurements-empty {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.eyebrow,
	.strip-label,
	.enquiry-strip div span,
	.measurement-line-index {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.enquiry-strip {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		flex-wrap: wrap;
		padding: var(--space-sm);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		background: var(--color-surface-subtle);
	}
	.enquiry-strip div {
		display: grid;
		gap: 0.1rem;
	}
	:global(.enquiry-strip .ui-button) {
		margin-left: auto;
	}
	.empty-enquiry {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.measurement-lines {
		display: grid;
		gap: var(--space-xs);
	}
	.measurement-line {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		gap: var(--space-sm);
		align-items: center;
		width: 100%;
		padding: var(--space-sm);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.measurement-line:hover,
	.measurement-line.active {
		border-color: var(--color-brand-primary);
		background: color-mix(in srgb, var(--color-brand-primary) 8%, var(--color-surface));
	}
	.measurement-line-copy {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.measurement-line-copy span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		overflow-wrap: anywhere;
	}
	.measurement-line-action {
		color: var(--color-brand-primary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}
	.measurement-warning,
	.dimension-field.missing small,
	.dimension-error {
		color: var(--color-danger);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}
	.measurement-complete {
		color: var(--color-success);
		font-size: var(--font-size-xs);
	}
	.active-measurement-editor {
		display: grid;
		gap: var(--space-md);
		padding: var(--space-md);
		border: 1px solid var(--color-brand-primary);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.active-measurement-heading {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: start;
	}
	.active-measurement-heading div {
		display: grid;
		gap: 0.15rem;
	}
	.dimensions-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
	}
	.dimension-field {
		display: grid;
		gap: var(--space-xs);
	}
	.dimension-field label {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.dimension-input {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-xs);
		align-items: center;
	}
	.dimension-input span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.dimension-field.missing .ui-field__control {
		border-color: var(--color-danger);
	}
	.dimension-error {
		margin: 0;
	}
	@media (max-width: 620px) {
		:global(.enquiry-strip .ui-button) {
			width: 100%;
			margin-left: 0;
		}
		.measurement-line {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.measurement-warning,
		.measurement-complete {
			grid-column: 2 / -1;
		}
		.dimensions-grid {
			grid-template-columns: 1fr;
		}
		.active-measurement-heading {
			flex-direction: column;
		}
	}
</style>
