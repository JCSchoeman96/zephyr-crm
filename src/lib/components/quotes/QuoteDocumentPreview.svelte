<script lang="ts">
	import type { QuotePresentationModel } from '$lib/domain/quotes/documents/presentation-model';
	import { companyMonogram } from '$lib/domain/quotes/documents/template-v2';

	let { model }: { model: QuotePresentationModel | null } = $props();
	let logoFailedFor = $state<string | null>(null);

	function handleLogoError() {
		logoFailedFor = model?.brand.logoAsset ?? null;
	}

	function money(value: string, currency: string) {
		const numeric = Number(value);
		const formatted = Number.isFinite(numeric)
			? numeric.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
			: value;
		return `${currency} ${formatted}`;
	}
</script>

{#if model}
	<article class="document-preview" data-testid="quote-document-preview">
		<header class="document-header">
			<div class="brand-lockup">
				<div class="brand-mark" aria-hidden="true">
					{#if model.brand.logoAsset && logoFailedFor !== model.brand.logoAsset}
						<img
							src={model.brand.logoAsset}
							alt=""
							width="32"
							height="32"
							onerror={handleLogoError}
						/>
					{:else}<span data-testid="quote-brand-fallback"
							>{companyMonogram(model.brand.companyName)}</span
						>{/if}
				</div>
				<div>
					<strong>{model.brand.companyName}</strong>
					<span>{model.quoteIdentity.number} · Revision {model.quoteIdentity.revision}</span>
				</div>
			</div>
			<div class="document-status">{model.quoteIdentity.status}</div>
		</header>

		<div class="document-parties">
			<section>
				<h3>From</h3>
				<strong>{model.seller.companyName || model.seller.name}</strong>
				{#if model.seller.name && model.seller.name !== model.seller.companyName}<span
						>{model.seller.name}</span
					>{/if}
				{#each model.seller.addressLines as line, index (index)}<span>{line}</span>{/each}
				{#if model.seller.email}<span>{model.seller.email}</span>{/if}
				{#if model.seller.phone}<span>{model.seller.phone}</span>{/if}
			</section>
			<section>
				<h3>To</h3>
				<strong>{model.recipient.name || 'Customer'}</strong>
				{#if model.recipient.company}<span>{model.recipient.company}</span>{/if}
				{#each model.recipient.addressLines as line, index (index)}<span>{line}</span>{/each}
				{#if model.recipient.email}<span>{model.recipient.email}</span>{/if}
				{#if model.recipient.phone}<span>{model.recipient.phone}</span>{/if}
			</section>
		</div>

		<div class="document-title">
			<div>
				<span class="eyebrow">Quote {model.quoteIdentity.number}</span>
				<h2>{model.subject || 'Untitled quote'}</h2>
			</div>
			<div class="document-dates">
				<span>Issued {model.quoteIdentity.issueDate.slice(0, 10)}</span>
				{#if model.quoteIdentity.validUntil}<span>Valid until {model.quoteIdentity.validUntil}</span
					>{/if}
			</div>
		</div>

		{#if model.introduction}<p class="document-copy">{model.introduction}</p>{/if}
		<div class="items-wrap">
			<table class="document-items">
				<caption class="sr-only">Quoted items</caption>
				<thead
					><tr
						><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Unit price</th><th
							scope="col">Amount</th
						></tr
					></thead
				>
				<tbody>
					{#each model.items as item, index (index)}
						<tr>
							<td data-label="Item">
								<strong>{item.name}</strong>
								{#if item.code}<span
										>{item.code}{#if item.unit}
											· per {item.unit}{/if}</span
									>{:else if item.unit}<span>Per {item.unit}</span>{/if}
								{#if item.description}<small>{item.description}</small>{/if}
							</td>
							<td data-label="Qty">{item.quantity}</td>
							<td data-label="Unit price">{money(item.unitPrice, model.quoteIdentity.currency)}</td>
							<td data-label="Amount">{money(item.amount, model.quoteIdentity.currency)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="document-bottom">
			<div class="document-terms">
				{#if model.terms}<h3>Terms</h3>
					<p>{model.terms}</p>{/if}
				{#if model.bankDetails}<h3>Bank details</h3>
					<p>{model.bankDetails}</p>{/if}
			</div>
			<dl class="document-totals">
				<div>
					<dt>Subtotal</dt>
					<dd>{money(model.subtotal, model.quoteIdentity.currency)}</dd>
				</div>
				<div>
					<dt>{model.tax.label} ({model.tax.rate}%)</dt>
					<dd>{money(model.tax.amount, model.quoteIdentity.currency)}</dd>
				</div>
				<div class="grand-total">
					<dt>Total</dt>
					<dd>{money(model.total, model.quoteIdentity.currency)}</dd>
				</div>
			</dl>
		</div>
	</article>
{:else}
	<div class="preview-empty" data-testid="quote-document-preview-empty">
		<strong>Preview will appear after the quote is saved.</strong>
		<p>PostgreSQL owns the quote totals and the customer-facing snapshot.</p>
	</div>
{/if}

<style>
	.document-preview,
	.preview-empty {
		min-width: 0;
		padding: var(--space-lg);
		border: 1px solid var(--color-border-subtle);
		border-top: 4px solid var(--color-brand-primary);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
	}
	.document-preview * {
		min-width: 0;
		max-width: 100%;
	}
	.document-header,
	.brand-lockup,
	.document-title,
	.document-bottom,
	.document-totals div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: flex-start;
	}
	.brand-lockup {
		align-items: center;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		flex: 0 0 32px;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		background: var(--color-brand-primary);
		color: var(--color-text-inverse);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}
	.brand-mark img {
		display: block;
		flex: 0 0 auto;
		border-radius: var(--radius-sm);
	}
	.brand-lockup div,
	.document-parties section,
	.document-dates,
	.document-terms {
		display: grid;
		gap: 0.2rem;
	}
	.brand-lockup span,
	.document-status,
	.document-dates,
	.document-parties span,
	.document-items span,
	.document-items small,
	.preview-empty p {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.document-status {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
		text-transform: capitalize;
	}
	.document-parties {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-lg);
		margin: var(--space-xl) 0;
		padding: var(--space-md) 0;
		border-top: 1px solid var(--color-border-subtle);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.document-parties h3,
	.document-terms h3 {
		margin: 0;
		color: var(--color-brand-primary);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.document-title {
		align-items: end;
	}
	.document-title h2 {
		margin: var(--space-xs) 0 0;
		font-size: var(--font-size-xl);
		overflow-wrap: anywhere;
	}
	.eyebrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.document-dates {
		text-align: right;
	}
	.document-copy,
	.document-terms p,
	.preview-empty p {
		margin: var(--space-md) 0;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	.items-wrap {
		width: 100%;
		overflow: hidden;
	}
	.document-items {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	.document-items th,
	.document-items td {
		padding: var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	.document-items th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
	}
	.document-items th:first-child,
	.document-items td:first-child {
		width: 48%;
	}
	.document-items th:not(:first-child),
	.document-items td:not(:first-child) {
		text-align: right;
	}
	.document-items td[data-label='Qty'],
	.document-items td[data-label='Unit price'],
	.document-items td[data-label='Amount'] {
		white-space: nowrap;
		overflow-wrap: normal;
	}
	.document-items td strong,
	.document-items td span,
	.document-items td small {
		display: block;
	}
	.document-items td span,
	.document-items td small {
		margin-top: 0.2rem;
	}
	.document-bottom {
		align-items: end;
		margin-top: var(--space-lg);
	}
	.document-terms {
		max-width: 55%;
	}
	.document-totals {
		display: grid;
		gap: var(--space-xs);
		min-width: min(15rem, 100%);
		margin: 0;
	}
	.document-totals dt,
	.document-totals dd {
		margin: 0;
		font-size: var(--font-size-sm);
	}
	.document-totals dt {
		color: var(--color-text-muted);
	}
	.grand-total {
		padding-top: var(--space-sm);
		border-top: 2px solid var(--color-border);
	}
	.grand-total dt,
	.grand-total dd {
		color: var(--color-text);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}
	.preview-empty p {
		color: var(--color-text-muted);
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
	@media (max-width: 620px) {
		.document-preview,
		.preview-empty {
			padding: var(--space-md);
		}
		.document-header,
		.document-title,
		.document-bottom {
			flex-direction: column;
		}
		.document-dates {
			text-align: left;
		}
		.document-parties {
			grid-template-columns: 1fr;
			gap: var(--space-md);
		}
		.document-items,
		.document-items tbody,
		.document-items tr,
		.document-items td {
			display: block;
			width: 100%;
		}
		.document-items thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
		}
		.document-items tr {
			padding: var(--space-sm) 0;
			border-bottom: 1px solid var(--color-border-subtle);
		}
		.document-items td {
			display: grid;
			grid-template-columns: 7rem minmax(0, 1fr);
			gap: var(--space-sm);
			padding: var(--space-xs) 0;
			border: 0;
			text-align: left !important;
			white-space: normal;
			overflow-wrap: anywhere;
		}
		.document-items td[data-label='Qty'],
		.document-items td[data-label='Unit price'],
		.document-items td[data-label='Amount'] {
			white-space: normal;
			overflow-wrap: anywhere;
		}
		.document-items td::before {
			content: attr(data-label);
			color: var(--color-text-muted);
			font-size: var(--font-size-xs);
			font-weight: var(--font-weight-semibold);
			text-transform: uppercase;
		}
		.document-items th:first-child,
		.document-items td:first-child {
			width: 100%;
		}
		.document-terms {
			max-width: 100%;
		}
		.document-totals {
			width: 100%;
		}
	}
</style>
