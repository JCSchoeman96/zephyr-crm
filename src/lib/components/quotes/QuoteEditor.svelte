<script lang="ts">
	import { calculateQuoteTotals, type QuoteMoneyLine } from '$lib/domain/quotes/money';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';
	import { quoteStatusLabel } from '$lib/domain/presentation/labels';

	type EditorItem = {
		name: string;
		description: string;
		quantity: string;
		unit_price: string;
		taxable: boolean;
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
					name: String(item.name ?? ''),
					description: String(item.description ?? ''),
					quantity: String(item.quantity ?? '1'),
					unit_price: String(item.unit_price ?? '0'),
					taxable: item.taxable ?? true
				}))
			: [{ name: '', description: '', quantity: '1', unit_price: '0', taxable: true }];
	}

	function initialItemValues() {
		return normalizeItems(initialItems);
	}

	let items = $state<EditorItem[]>(initialItemValues());

	let serializedItems = $derived(JSON.stringify(items));
	let previewTotals = $derived.by(() => {
		try {
			const lines: QuoteMoneyLine[] = items.map((item) => ({
				quantity: item.quantity || '0',
				unitPrice: item.unit_price || '0',
				taxable: item.taxable
			}));
			return calculateQuoteTotals(lines, taxRate || '0');
		} catch {
			return null;
		}
	});

	function addItem() {
		items.push({ name: '', description: '', quantity: '1', unit_price: '0', taxable: true });
	}

	function removeItem(index: number) {
		if (items.length > 1) items.splice(index, 1);
	}

	function money(value: string) {
		return `${currency} ${value}`;
	}
</script>

<div class="quote-editor-layout">
	{#if readonly}
		<Card title="Quote preview" class="quote-preview-card">
			<div class="preview-heading">
				<div>
					<span class="eyebrow">{quoteNumber || 'Quote'} · Revision</span>
					<h2>{subject}</h2>
				</div>
				<strong>{quoteStatusLabel(status)}</strong>
			</div>
			{#if introduction}<p class="preview-copy">{introduction}</p>{/if}
			<div class="preview-lines">
				{#each items as item, index (index)}
					<div class="preview-line">
						<div>
							<strong>{item.name}</strong>
							{#if item.description}<span>{item.description}</span>{/if}
						</div>
						<span>{item.quantity} × {money(item.unit_price)}</span>
					</div>
				{/each}
			</div>
			{#if terms}<p class="preview-copy preview-terms">{terms}</p>{/if}
			<div class="preview-totals">
				<div>
					<span>Subtotal</span><strong>{money(String(previewTotals?.subtotal ?? '—'))}</strong>
				</div>
				<div>
					<span>{taxLabel || 'Tax'} ({taxRate}%)</span><strong
						>{money(String(previewTotals?.taxAmount ?? '—'))}</strong
					>
				</div>
				<div class="preview-total">
					<span>Total</span><strong>{money(String(previewTotals?.total ?? '—'))}</strong>
				</div>
			</div>
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

			<Card title="Line items" class="editor-card">
				<div class="line-items" aria-label="Quote line items">
					{#each items as item, index (index)}
						<div class="line-item">
							<div class="line-item-heading">
								<strong>Item {index + 1}</strong><button
									type="button"
									class="remove-line"
									onclick={() => removeItem(index)}
									disabled={items.length === 1}>Remove</button
								>
							</div>
							<div class="line-item-grid">
								<div class="raw-field line-name">
									<label for={`quote-item-name-${index}`}>Name</label><input
										id={`quote-item-name-${index}`}
										class="ui-field__control"
										bind:value={item.name}
										required
									/>
								</div>
								<div class="raw-field">
									<label for={`quote-item-quantity-${index}`}>Quantity</label><input
										id={`quote-item-quantity-${index}`}
										class="ui-field__control"
										type="text"
										inputmode="decimal"
										bind:value={item.quantity}
										required
									/>
								</div>
								<div class="raw-field">
									<label for={`quote-item-price-${index}`}>Unit price</label><input
										id={`quote-item-price-${index}`}
										class="ui-field__control"
										type="text"
										inputmode="decimal"
										bind:value={item.unit_price}
										required
									/>
								</div>
							</div>
							<div class="raw-field">
								<label for={`quote-item-description-${index}`}>Description</label><input
									id={`quote-item-description-${index}`}
									class="ui-field__control"
									bind:value={item.description}
								/>
							</div>
							<label class="taxable-control"
								><input type="checkbox" bind:checked={item.taxable} /> Taxable line</label
							>
						</div>
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
				<Button type="submit">Save draft</Button><span
					>Totals are recalculated by PostgreSQL when saved or marked ready.</span
				>
			</div>
		</form>
	{/if}

	{#if !readonly}
		<Card title="Live preview" class="quote-preview-card">
			<div class="preview-heading">
				<div>
					<span class="eyebrow">Preview · {currency}</span>
					<h2>{subject || 'Untitled quote'}</h2>
				</div>
				<strong>{validUntil || 'Validity not set'}</strong>
			</div>
			{#if introduction}<p class="preview-copy">{introduction}</p>{/if}
			<div class="preview-lines">
				{#each items as item, index (index)}<div class="preview-line">
						<div>
							<strong>{item.name || `Line item ${index + 1}`}</strong>{#if item.description}<span
									>{item.description}</span
								>{/if}
						</div>
						<span>{item.quantity || '0'} × {money(item.unit_price || '0')}</span>
					</div>{/each}
			</div>
			<div class="preview-totals">
				<div>
					<span>Subtotal</span><strong>{money(String(previewTotals?.subtotal ?? '—'))}</strong>
				</div>
				<div>
					<span>{taxLabel || 'Tax'} ({taxRate || '0'}%)</span><strong
						>{money(String(previewTotals?.taxAmount ?? '—'))}</strong
					>
				</div>
				<div class="preview-total">
					<span>Total</span><strong>{money(String(previewTotals?.total ?? '—'))}</strong>
				</div>
			</div>
		</Card>
	{/if}
</div>

<style>
	.quote-editor-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(19rem, 0.7fr);
		gap: var(--space-lg);
		align-items: start;
	}
	.quote-editor-form {
		display: grid;
		gap: var(--space-lg);
	}
	:global(.editor-card) {
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
	.line-item {
		display: grid;
		gap: var(--space-sm);
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
	}
	.line-item-heading {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: center;
	}
	.line-item-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(6rem, 0.6fr) minmax(7rem, 0.8fr);
		gap: var(--space-sm);
	}
	.raw-field {
		display: grid;
		gap: var(--space-xs);
	}
	.raw-field label,
	.taxable-control {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.taxable-control {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
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
	}
	.preview-heading {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: start;
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.preview-heading h2 {
		margin: var(--space-xs) 0 0;
		font-size: var(--font-size-xl);
	}
	.preview-heading strong {
		color: var(--color-brand-primary);
		font-size: var(--font-size-sm);
		text-transform: capitalize;
	}
	.eyebrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.preview-copy {
		margin: var(--space-md) 0;
		color: var(--color-text-muted);
		white-space: pre-wrap;
	}
	.preview-terms {
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-border-subtle);
		font-size: var(--font-size-sm);
	}
	.preview-lines {
		display: grid;
		gap: var(--space-sm);
		margin: var(--space-lg) 0;
	}
	.preview-line {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.preview-line strong,
	.preview-line span {
		display: block;
	}
	.preview-line strong {
		color: var(--color-text);
	}
	.preview-line div span {
		margin-top: var(--space-xs);
		color: var(--color-text-subtle);
		font-size: var(--font-size-xs);
	}
	.preview-totals {
		display: grid;
		gap: var(--space-sm);
	}
	.preview-totals div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.preview-total {
		padding-top: var(--space-sm);
		border-top: 2px solid var(--color-border);
		color: var(--color-text) !important;
		font-size: var(--font-size-md) !important;
	}
	@media (max-width: 900px) {
		.quote-editor-layout {
			grid-template-columns: 1fr;
		}
		:global(.quote-preview-card) {
			position: static;
		}
	}
	@media (max-width: 620px) {
		.editor-grid,
		.line-item-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
