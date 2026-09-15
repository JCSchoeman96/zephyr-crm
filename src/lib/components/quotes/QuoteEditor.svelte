<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import ProductPicker from '$lib/components/products/ProductPicker.svelte';
	import QuoteDocumentPreview from '$lib/components/quotes/QuoteDocumentPreview.svelte';
	import QuoteLineEditor from '$lib/components/quotes/QuoteLineEditor.svelte';
	import QuoteMeasurementsEditor from '$lib/components/quotes/QuoteMeasurementsEditor.svelte';
	import type { QuotePresentationModel } from '$lib/domain/quotes/documents/presentation-model';
	import { normalizeDimensionValue } from '$lib/domain/products/dimensions';
	import { publicClientConfiguration } from '$lib/config/public-client-config';
	import type { ProductOption } from '$lib/services/products';
	import {
		isDimensionalQuoteItem,
		quoteEditorItemKey,
		updateQuoteItemDimension
	} from './quote-editor-state';
	import type {
		QuoteEditorCategory,
		QuoteEditorItem,
		QuoteLeadMeasurements,
		QuoteLeadOption
	} from './quote-editor-types';

	let {
		action,
		quoteId = null,
		leadId = $bindable(''),
		leadOptions = [],
		clientId = $bindable(''),
		clientOptions = [],
		subject = $bindable(''),
		introduction = $bindable(''),
		terms = $bindable(publicClientConfiguration.quotes.terms),
		taxLabel = $bindable(publicClientConfiguration.quotes.taxLabel),
		taxRate = $bindable(String(publicClientConfiguration.quotes.taxRate)),
		validUntil = $bindable(defaultValidUntil()),
		currency = $bindable(publicClientConfiguration.locale.currency),
		lockVersion = 1,
		initialItems = [],
		initialActiveItemKey = '',
		focusItemKey = null,
		formId = 'quote-editor-form',
		markReadyAction = '?/markReady',
		sendAction = '?/send',
		readonly = false,
		presentationModel = null,
		productCategories = [],
		leadMeasurements = null,
		errorMessage = '',
		productAction = '?/addProduct',
		refreshAction = '?/refreshProduct',
		reviewAction = '?/reviewProduct',
		quoteNumber = '',
		status = 'draft'
	}: {
		action: string;
		quoteId?: string | null;
		leadId?: string;
		leadOptions?: QuoteLeadOption[];
		clientId?: string;
		clientOptions?: { id: string; label: string }[];
		subject?: string;
		introduction?: string;
		terms?: string;
		taxLabel?: string;
		taxRate?: string;
		validUntil?: string;
		currency?: string;
		lockVersion?: number;
		initialItems?: Partial<QuoteEditorItem>[];
		initialActiveItemKey?: string;
		focusItemKey?: string | null;
		formId?: string;
		markReadyAction?: string;
		sendAction?: string;
		readonly?: boolean;
		quoteNumber?: string;
		presentationModel?: QuotePresentationModel | null;
		productCategories?: QuoteEditorCategory[];
		leadMeasurements?: QuoteLeadMeasurements | null;
		errorMessage?: string;
		productAction?: string;
		refreshAction?: string;
		reviewAction?: string;
		status?: string;
	} = $props();

	function defaultValidUntil() {
		const timestamp =
			Date.now() + publicClientConfiguration.quotes.defaultValidityDays * 24 * 60 * 60 * 1000;
		return new Date(timestamp).toISOString().slice(0, 10);
	}

	function normalizeItems(source: Partial<QuoteEditorItem>[]): QuoteEditorItem[] {
		return source.map((item) => {
			const sourceType = item.source_type ?? 'custom';
			const dimensions =
				sourceType === 'catalogue' && Array.isArray(item.dimensions) ? item.dimensions : [];
			return {
				editorKey: item.editorKey ?? item.id,
				id: item.id,
				name: String(item.name ?? ''),
				description: String(item.description ?? ''),
				quantity: String(item.quantity ?? '1'),
				unit_price: String(item.unit_price ?? '0'),
				taxable: item.taxable ?? true,
				source_type: sourceType,
				product_id: item.product_id ?? null,
				product_code_snapshot: item.product_code_snapshot ?? null,
				unit_label_snapshot: item.unit_label_snapshot ?? null,
				catalogue_unit_price: item.catalogue_unit_price ?? null,
				source_product_version: item.source_product_version ?? null,
				source_product_reviewed_version: item.source_product_reviewed_version ?? null,
				current_product_lock_version: item.current_product_lock_version ?? null,
				product_lock_version: item.product_lock_version ?? null,
				is_stale: item.is_stale ?? false,
				dimensionsEnabled: item.dimensionsEnabled ?? dimensions.length > 0,
				dimensions,
				product_category_id_snapshot: item.product_category_id_snapshot ?? null,
				product_category_code_snapshot: item.product_category_code_snapshot ?? null,
				product_category_label_snapshot: item.product_category_label_snapshot ?? null
			};
		});
	}

	let items = $state<QuoteEditorItem[]>([]);
	let nextEditorKey = 0;
	let itemsInitialized = false;
	let activeStateInitialized = false;
	let activeItemKey = $state<string | null>(null);

	$effect(() => {
		if (itemsInitialized) return;
		items = normalizeItems(initialItems).map((item, index) => ({
			...item,
			editorKey: item.editorKey ?? `new-${index}-${nextEditorKey++}`
		}));
		itemsInitialized = true;
	});

	$effect(() => {
		if (!itemsInitialized || activeStateInitialized) return;
		const requestedKey = focusItemKey || initialActiveItemKey;
		if (requestedKey) {
			const entry = items.find((item, index) => quoteEditorItemKey(item, index) === requestedKey);
			if (entry) {
				const index = items.indexOf(entry);
				activeItemKey = quoteEditorItemKey(entry, index);
			}
		}
		activeStateInitialized = true;
	});

	let serializedItems = $derived(
		JSON.stringify(
			items.map((item) => ({
				...(item.id ? { id: item.id } : {}),
				...(item.editorKey ? { editor_key: item.editorKey } : {}),
				...(item.source_type === 'catalogue' && !item.id
					? {
							source_type: 'catalogue',
							product_id: item.product_id,
							product_lock_version: item.product_lock_version
						}
					: {}),
				name: item.name,
				description: item.description,
				quantity: item.quantity,
				unit_price: item.unit_price,
				taxable: item.taxable,
				...(item.dimensions?.length ? { dimensions: item.dimensions } : {})
			}))
		)
	);
	let serializedFailureRehydrationCatalogueDisplay = $derived(
		JSON.stringify(
			items.map((item) =>
				item.source_type === 'catalogue'
					? {
							product_code_snapshot: item.product_code_snapshot ?? null,
							unit_label_snapshot: item.unit_label_snapshot ?? null,
							catalogue_unit_price: item.catalogue_unit_price ?? null,
							source_product_version: item.source_product_version ?? null,
							source_product_reviewed_version: item.source_product_reviewed_version ?? null,
							current_product_lock_version: item.current_product_lock_version ?? null,
							is_stale: item.is_stale ?? false,
							product_category_id_snapshot: item.product_category_id_snapshot ?? null,
							product_category_code_snapshot: item.product_category_code_snapshot ?? null,
							product_category_label_snapshot: item.product_category_label_snapshot ?? null
						}
					: null
			)
		)
	);
	let reviewActions = $derived(!readonly && status === 'draft');
	let enquiry = $derived(
		leadMeasurements ?? leadOptions.find((lead) => lead.id === leadId)?.measurements ?? null
	);

	function isDimensionReadinessError(message: string | undefined) {
		return Boolean(message && /required.*product dimensions|dimensions.*required/i.test(message));
	}

	function selectItem(key: string) {
		activeItemKey = key;
	}

	function updateDimension(
		itemKey: string,
		key: Parameters<typeof updateQuoteItemDimension>[1],
		value: string | null
	) {
		items = items.map((item, index) =>
			quoteEditorItemKey(item, index) === itemKey
				? updateQuoteItemDimension(item, key, value)
				: item
		);
	}

	function applyEnquiryMeasurements() {
		if (!activeItemKey || !enquiry) return;
		const entry = items.find((item, index) => quoteEditorItemKey(item, index) === activeItemKey);
		if (!entry || !isDimensionalQuoteItem(entry)) return;
		let updated = entry;
		for (const key of ['width', 'height'] as const) {
			const rawValue = enquiry[key];
			if (!rawValue) continue;
			try {
				updated = updateQuoteItemDimension(updated, key, normalizeDimensionValue(rawValue));
			} catch {
				// Keep the entered value when an enquiry measurement is outside the quote bounds.
			}
		}
		items = items.map((item, index) =>
			quoteEditorItemKey(item, index) === activeItemKey ? updated : item
		);
	}

	function addItem() {
		const editorKey = `new-${nextEditorKey++}`;
		items.push({
			editorKey,
			name: '',
			description: '',
			quantity: '1',
			unit_price: '0',
			taxable: true,
			dimensionsEnabled: false,
			dimensions: []
		});
		activeItemKey = editorKey;
	}

	function addCatalogueProduct(product: ProductOption, selectedQuantity: string) {
		const dimensions = product.dimension_definitions.map((definition) => ({
			...definition,
			value: null
		}));
		const editorKey = `new-${nextEditorKey++}`;
		items.push({
			editorKey,
			name: product.name,
			description: product.customer_description ?? '',
			quantity: product.dimensions_enabled ? '1' : selectedQuantity,
			unit_price: String(product.unit_price),
			taxable: product.taxable,
			source_type: 'catalogue',
			product_id: product.id,
			product_lock_version: product.lock_version,
			product_code_snapshot: product.product_code,
			unit_label_snapshot: product.unit_label,
			catalogue_unit_price: product.unit_price,
			source_product_version: product.lock_version,
			source_product_reviewed_version: null,
			current_product_lock_version: product.lock_version,
			is_stale: false,
			dimensionsEnabled: dimensions.length > 0,
			dimensions,
			product_category_id_snapshot: product.category_id,
			product_category_label_snapshot:
				productCategories.find((category) => category.id === product.category_id)?.label ??
				'Uncategorised'
		});
		activeItemKey = editorKey;
	}

	function removeItem(index: number) {
		const removedKey = quoteEditorItemKey(items[index], index);
		items.splice(index, 1);
		if (activeItemKey !== removedKey) return;
		const replacement = items[index] ?? items[index - 1];
		activeItemKey = replacement
			? quoteEditorItemKey(replacement, items.indexOf(replacement))
			: null;
	}

	function moveItem(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= items.length) return;
		[items[index], items[target]] = [items[target], items[index]];
	}
</script>

<div class="quote-editor-layout" data-quote-number={quoteNumber}>
	{#if !readonly}
		<form id={formId} method="POST" {action} class="quote-editor-form">
			<input type="hidden" name="quote_id" value={quoteId ?? ''} />
			<input type="hidden" name="lock_version" value={lockVersion} />
			<input type="hidden" name="items" value={serializedItems} />
			<input type="hidden" name="active_item_key" value={activeItemKey ?? ''} />
			{#if !quoteId}
				<input
					type="hidden"
					name="quote_failure_rehydration_catalogue_display"
					value={serializedFailureRehydrationCatalogueDisplay}
				/>
			{/if}
			<Card title="Customer and header" class="editor-card">
				<div class="editor-grid">
					{#if leadOptions.length}
						<Select id="quote-lead" name="lead_id" label="Enquiry" bind:value={leadId} required>
							<option value="">Select an enquiry</option>
							{#each leadOptions as lead (lead.id)}<option value={lead.id}>{lead.label}</option
								>{/each}
						</Select>
					{:else}<input type="hidden" name="lead_id" value={leadId} />{/if}
					{#if clientOptions.length}
						<Select
							id="quote-client"
							name="client_id"
							label="Customer (optional)"
							bind:value={clientId}
						>
							<option value="">No linked customer</option>
							{#each clientOptions as client (client.id)}<option value={client.id}
									>{client.label}</option
								>{/each}
						</Select>
					{:else}<input type="hidden" name="client_id" value={clientId} />{/if}
				</div>
				<Input id="quote-subject" name="subject" label="Subject" bind:value={subject} required />
			</Card>

			<QuoteMeasurementsEditor
				{items}
				{activeItemKey}
				leadMeasurements={enquiry}
				validationMessage={isDimensionReadinessError(errorMessage) ? errorMessage : ''}
				onSelectItem={selectItem}
				onApplyEnquiry={applyEnquiryMeasurements}
				onDimensionChange={updateDimension}
			/>

			{#if status === 'draft'}
				<ProductPicker
					action={productAction}
					{quoteId}
					{currency}
					categories={productCategories}
					onAddProduct={quoteId ? undefined : addCatalogueProduct}
				/>
			{/if}

			<Card title="Quote items" class="editor-card">
				<div class="line-items" aria-label="Quote line items">
					{#each items as item, index (item.id ?? item.editorKey ?? `new-${index}`)}
						<QuoteLineEditor
							bind:item={items[index]}
							{index}
							active={activeItemKey === quoteEditorItemKey(item, index)}
							onSelect={() => selectItem(quoteEditorItemKey(item, index))}
							{readonly}
							removeDisabled={false}
							onRemove={() => removeItem(index)}
							onMoveUp={() => moveItem(index, -1)}
							onMoveDown={() => moveItem(index, 1)}
							moveUpDisabled={index === 0}
							moveDownDisabled={index === items.length - 1}
							{reviewActions}
							{refreshAction}
							{reviewAction}
							validationMessage={isDimensionReadinessError(errorMessage) ? errorMessage : ''}
						/>
					{/each}
				</div>
				<Button type="button" variant="secondary" size="sm" onclick={addItem}
					>Add custom item</Button
				>
			</Card>

			<div class="totals-controls">
				<Input
					id="quote-tax-rate"
					name="tax_rate"
					label="Tax rate (%)"
					bind:value={taxRate}
					inputmode="decimal"
					required
				/>
			</div>

			<details class="quote-settings">
				<summary>Introduction, terms, and validity</summary>
				<div class="quote-settings-body">
					<div class="editor-grid">
						<Input
							id="quote-currency"
							name="currency"
							label="Currency"
							bind:value={currency}
							maxlength={3}
							required
						/>
						<Input id="quote-tax-label" name="tax_label" label="Tax label" bind:value={taxLabel} />
						<Input
							id="quote-valid-until"
							name="valid_until"
							label="Valid until"
							type="date"
							bind:value={validUntil}
						/>
					</div>
					<Textarea
						id="quote-introduction"
						name="introduction"
						label="Introduction"
						rows={3}
						bind:value={introduction}
					/>
					<Textarea id="quote-terms" name="terms" label="Terms" rows={4} bind:value={terms} />
				</div>
			</details>
		</form>
	{/if}

	<aside class="quote-preview-rail" aria-label="Quote actions and preview">
		{#if !readonly}
			<Card title="Quote actions" class="quote-actions-card">
				<p class="quote-actions-help">
					{quoteId
						? status === 'ready'
							? 'Save changes or send this quote to the customer.'
							: 'Save your draft or review it when the measurements and prices are ready.'
						: 'Save this draft to create the quote.'}
				</p>
				<div class="quote-action-buttons">
					<Button type="submit" form={formId}>Save draft</Button>
					{#if quoteId && status === 'draft'}
						<Button type="submit" form={formId} formaction={markReadyAction} variant="secondary"
							>Review quote</Button
						>
					{:else if quoteId && status === 'ready'}
						<Button type="submit" form={formId} formaction={sendAction}>Send quote</Button>
					{/if}
				</div>
			</Card>
		{/if}

		<Card title={readonly ? 'Quote preview' : 'Customer preview'} class="quote-preview-card">
			<QuoteDocumentPreview model={presentationModel} />
		</Card>
	</aside>
</div>

<style>
	.quote-editor-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(26rem, 1fr);
		gap: var(--space-lg);
		align-items: start;
	}
	.quote-editor-form,
	.quote-preview-rail {
		display: grid;
		gap: var(--space-lg);
		min-width: 0;
	}
	.quote-preview-rail {
		position: sticky;
		top: var(--space-lg);
	}
	:global(.editor-card),
	:global(.quote-actions-card),
	:global(.quote-preview-card) {
		min-width: 0;
	}
	.editor-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
	}
	.line-items {
		display: grid;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.totals-controls {
		max-width: 12rem;
	}
	.quote-actions-help {
		margin: 0 0 var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.quote-action-buttons {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}
	:global(.quote-preview-card .ui-card__body) {
		padding: 0;
	}
	@media (max-width: 1100px) {
		.quote-editor-layout {
			grid-template-columns: 1fr;
		}
		.quote-preview-rail {
			position: static;
		}
	}
	@media (max-width: 620px) {
		.editor-grid {
			grid-template-columns: 1fr;
		}
		.quote-action-buttons {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
