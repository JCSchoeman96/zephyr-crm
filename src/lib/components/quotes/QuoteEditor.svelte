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
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	type EditorItem = {
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
	};
	type LeadOption = { id: string; label: string };

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

	function normalizeItems(source: Partial<EditorItem>[]) {
		return source.length
			? source.map((item) => ({
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
					is_stale: item.is_stale ?? false
				}))
			: [{ name: '', description: '', quantity: '1', unit_price: '0', taxable: true }];
	}

	let items = $state<EditorItem[]>([]);
	let itemsInitialized = false;
	$effect(() => {
		if (itemsInitialized) return;
		items = normalizeItems(initialItems);
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
				taxable: item.taxable
			}))
		)
	);
	let reviewActions = $derived(!readonly && status === 'draft');

	function addItem() {
		items.push({ name: '', description: '', quantity: '1', unit_price: '0', taxable: true });
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

			<Card title="Line items" class="editor-card">
				<div class="line-items" aria-label="Quote line items">
					{#each items as item, index (item.id ?? `new-${index}`)}
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
	}
</style>
