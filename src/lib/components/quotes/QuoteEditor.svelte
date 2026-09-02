<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import ProductPicker from '$lib/components/products/ProductPicker.svelte';
	import QuoteDocumentPreview from '$lib/components/quotes/QuoteDocumentPreview.svelte';
	import QuoteLineEditor from '$lib/components/quotes/QuoteLineEditor.svelte';
	import type { QuotePresentationModel } from '$lib/domain/quotes/documents/presentation-model';
	import { normalizeDimensionValue, type DimensionValue } from '$lib/domain/products/dimensions';
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	type EditorItem = {
		editorKey?: string;
		id?: string;
		name: string;
		description: string;
		quantity: string;
		unit_price: string;
		taxable: boolean;
		source_type?: string;
		product_id?: string | null;
		product_code_snapshot?: string | null;
		unit_label_snapshot?: string | null;
		catalogue_unit_price?: string | number | null;
		source_product_version?: number | null;
		source_product_reviewed_version?: number | null;
		current_product_lock_version?: number | null;
		is_stale?: boolean;
		dimensionsEnabled?: boolean;
		dimensions?: DimensionValue[];
		product_category_id_snapshot?: string | null;
		product_category_code_snapshot?: string | null;
		product_category_label_snapshot?: string | null;
	};
	export type QuoteLeadMeasurements = {
		width: string | null;
		height: string | null;
		openings: string | null;
	};
	type LeadOption = { id: string; label: string; measurements?: QuoteLeadMeasurements };

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
		leadOptions?: LeadOption[];
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
		initialItems?: Partial<EditorItem>[];
		readonly?: boolean;
		quoteNumber?: string;
		presentationModel?: QuotePresentationModel | null;
		productCategories?: { id: string; label: string }[];
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

	function normalizeItems(source: Partial<EditorItem>[]): EditorItem[] {
		return source.length
			? source.map((item) => ({
					editorKey: item.editorKey ?? item.id,
					id: item.id,
					name: String(item.name ?? ''),
					description: String(item.description ?? ''),
					quantity: String(item.quantity ?? '1'),
					unit_price: String(item.unit_price ?? '0'),
					taxable: item.taxable ?? true,
					source_type: item.source_type ?? 'custom',
					product_id: item.product_id ?? null,
					product_code_snapshot: item.product_code_snapshot ?? null,
					unit_label_snapshot: item.unit_label_snapshot ?? null,
					catalogue_unit_price: item.catalogue_unit_price ?? null,
					source_product_version: item.source_product_version ?? null,
					source_product_reviewed_version: item.source_product_reviewed_version ?? null,
					current_product_lock_version: item.current_product_lock_version ?? null,
					is_stale: item.is_stale ?? false,
					dimensionsEnabled: Boolean(item.dimensions?.length),
					dimensions: Array.isArray(item.dimensions) ? item.dimensions : [],
					product_category_id_snapshot: item.product_category_id_snapshot ?? null,
					product_category_code_snapshot: item.product_category_code_snapshot ?? null,
					product_category_label_snapshot: item.product_category_label_snapshot ?? null
				}))
			: [{ name: '', description: '', quantity: '1', unit_price: '0', taxable: true }];
	}

	let items = $state<EditorItem[]>([]);
	let nextEditorKey = 0;
	let itemsInitialized = false;
	$effect(() => {
		if (itemsInitialized) return;
		items = normalizeItems(initialItems).map((item, index) => ({
			...item,
			editorKey: item.editorKey ?? `new-${index}-${nextEditorKey++}`
		}));
		itemsInitialized = true;
	});
	let serializedItems = $derived(
		JSON.stringify(
			items.map((item) => ({
				...(item.id ? { id: item.id } : {}),
				name: item.name,
				description: item.description,
				quantity: item.quantity,
				unit_price: item.unit_price,
				taxable: item.taxable,
				...(item.dimensions?.length ? { dimensions: item.dimensions } : {})
			}))
		)
	);
	let reviewActions = $derived(!readonly && status === 'draft');
	let selectedMeasurementLine = $state('');
	let enquiry = $derived(
		leadMeasurements ?? leadOptions.find((lead) => lead.id === leadId)?.measurements ?? null
	);
	let dimensionalItems = $derived(
		items
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => item.dimensions?.length && item.source_type === 'catalogue')
	);

	function isDimensionReadinessError(message: string | undefined) {
		return Boolean(message && /required.*product dimensions|dimensions.*required/i.test(message));
	}

	function applyEnquiryMeasurements() {
		const target = dimensionalItems.find(
			({ item, index }) => (item.id ?? item.editorKey ?? `new-${index}`) === selectedMeasurementLine
		);
		if (!target || !enquiry) return;
		target.item.dimensions = (target.item.dimensions ?? []).map((dimension) => {
			if (dimension.key !== 'width' && dimension.key !== 'height') return dimension;
			const rawValue = enquiry[dimension.key];
			if (!rawValue) return dimension;
			try {
				return { ...dimension, value: normalizeDimensionValue(rawValue) };
			} catch {
				return dimension;
			}
		});
	}

	function addItem() {
		items.push({
			editorKey: `new-${nextEditorKey++}`,
			name: '',
			description: '',
			quantity: '1',
			unit_price: '0',
			taxable: true,
			dimensionsEnabled: false,
			dimensions: []
		});
	}

	function removeItem(index: number) {
		if (items.length > 1) items.splice(index, 1);
	}

	function moveItem(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= items.length) return;
		[items[index], items[target]] = [items[target], items[index]];
	}
</script>

<div class="quote-editor-layout" data-quote-number={quoteNumber}>
	{#if readonly}
		<Card title="Quote preview" class="quote-preview-card">
			<QuoteDocumentPreview model={presentationModel} />
		</Card>
	{:else}
		<form method="POST" {action} class="quote-editor-form">
			<input type="hidden" name="quote_id" value={quoteId ?? ''} />
			<input type="hidden" name="lock_version" value={lockVersion} />
			<input type="hidden" name="items" value={serializedItems} />
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
				<div class="editor-grid">
					<Input id="quote-subject" name="subject" label="Subject" bind:value={subject} required />
					<Input
						id="quote-currency"
						name="currency"
						label="Currency"
						bind:value={currency}
						maxlength={3}
						required
					/>
				</div>
				<Textarea
					id="quote-introduction"
					name="introduction"
					label="Introduction"
					rows={3}
					bind:value={introduction}
				/>
			</Card>

			{#if quoteId && status === 'draft'}
				<ProductPicker action={productAction} {quoteId} {currency} categories={productCategories} />
			{/if}

			<Card title="Measurements from enquiry" class="editor-card enquiry-measurements">
				{#if enquiry?.width || enquiry?.height || enquiry?.openings}
					<p class="panel-help">
						These values came from the enquiry. Applying Width or Height copies them into one
						selected Product line as editable defaults; it does not change the enquiry.
					</p>
					<div class="measurement-summary" aria-label="Read-only enquiry measurements">
						<div>
							<span>Width</span><strong
								>{enquiry.width ? `${enquiry.width} mm` : 'Not captured'}</strong
							>
						</div>
						<div>
							<span>Height</span><strong
								>{enquiry.height ? `${enquiry.height} mm` : 'Not captured'}</strong
							>
						</div>
						<div><span>Openings</span><strong>{enquiry.openings ?? 'Not captured'}</strong></div>
					</div>
					<p class="panel-help">
						Openings is context only. It never creates or multiplies quote lines.
					</p>
					{#if dimensionalItems.length}
						<div class="apply-measurements">
							<Select
								id="measurement-line-target"
								label="Apply Width/Height to line"
								bind:value={selectedMeasurementLine}
							>
								<option value="">Select a dimensional Product line</option>
								{#each dimensionalItems as entry, measurementIndex (entry.item.id ?? entry.item.editorKey ?? `measurement-${entry.index}`)}
									<option value={entry.item.id ?? entry.item.editorKey ?? `new-${entry.index}`}>
										{entry.item.name || `Product line ${measurementIndex + 1}`}
									</option>
								{/each}
							</Select>
							<Button
								type="button"
								variant="secondary"
								disabled={!selectedMeasurementLine || (!enquiry?.width && !enquiry?.height)}
								onclick={applyEnquiryMeasurements}>Apply to line</Button
							>
						</div>
					{:else}
						<p class="panel-help">Add a dimensional Product line to apply these values.</p>
					{/if}
				{:else}
					<p class="panel-help">
						No structured Width, Height, or Openings values were captured on this enquiry.
					</p>
				{/if}
			</Card>

			<Card title="Line items" class="editor-card">
				<div class="line-items" aria-label="Quote line items">
					{#each items as item, index (item.id ?? item.editorKey ?? `new-${index}`)}
						<QuoteLineEditor
							bind:item={items[index]}
							{index}
							{readonly}
							removeDisabled={items.length === 1}
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
				<Button type="button" variant="secondary" size="sm" onclick={addItem}>Add line item</Button>
			</Card>

			<Card title="Terms and validity" class="editor-card">
				<div class="editor-grid">
					<Input id="quote-tax-label" name="tax_label" label="Tax label" bind:value={taxLabel} />
					<Input
						id="quote-tax-rate"
						name="tax_rate"
						label="Tax rate (%)"
						bind:value={taxRate}
						inputmode="decimal"
						required
					/>
					<Input
						id="quote-valid-until"
						name="valid_until"
						label="Valid until"
						type="date"
						bind:value={validUntil}
					/>
				</div>
				<Textarea id="quote-terms" name="terms" label="Terms" rows={4} bind:value={terms} />
			</Card>
			<div class="editor-actions">
				<Button type="submit">Save draft</Button>
				<span>Totals are recalculated by PostgreSQL when saved or marked ready.</span>
			</div>
		</form>
	{/if}

	{#if !readonly}
		<Card title="Customer preview" class="quote-preview-card">
			<QuoteDocumentPreview model={presentationModel} />
		</Card>
	{/if}
</div>

<style>
	.quote-editor-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(26rem, 1fr);
		gap: var(--space-lg);
		align-items: start;
	}
	.quote-editor-form {
		display: grid;
		gap: var(--space-lg);
	}
	:global(.editor-card),
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
	:global(.enquiry-measurements) {
		display: grid;
		gap: var(--space-sm);
	}
	.panel-help {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.measurement-summary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-sm);
	}
	.measurement-summary div {
		display: grid;
		gap: 0.15rem;
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		background: var(--color-surface-subtle);
	}
	.measurement-summary span {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.apply-measurements {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-sm);
		align-items: end;
	}
	.editor-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		flex-wrap: wrap;
	}
	.editor-actions span {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	:global(.quote-preview-card) {
		position: sticky;
		top: var(--space-lg);
		min-width: 0;
	}
	:global(.quote-preview-card .ui-card__body) {
		padding: 0;
	}
	@media (max-width: 1100px) {
		.quote-editor-layout {
			grid-template-columns: 1fr;
		}
		:global(.quote-preview-card) {
			position: static;
		}
	}
	@media (max-width: 620px) {
		.editor-grid {
			grid-template-columns: 1fr;
		}
		.measurement-summary {
			grid-template-columns: 1fr;
		}
		.apply-measurements {
			grid-template-columns: 1fr;
		}
	}
</style>
