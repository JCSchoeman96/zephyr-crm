<script lang="ts">
	import { resolve } from '$app/paths';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import { quoteStatusLabel } from '$lib/domain/presentation/labels';
	import type { LeadDetailQuote } from '$lib/domain/leads/detail-types';

	let {
		leadId,
		quotes,
		currentQuoteRecord,
		canMutate
	}: {
		leadId: string;
		quotes: LeadDetailQuote[];
		currentQuoteRecord: LeadDetailQuote | null;
		canMutate: boolean;
	} = $props();

	const previousQuotes = $derived(
		currentQuoteRecord ? quotes.filter((quote) => quote.id !== currentQuoteRecord?.id) : quotes
	);

	function quoteNumber(quote: LeadDetailQuote) {
		return quote.quote_number ?? `#${quote.base_quote_number}`;
	}

	function money(value: number | string) {
		const [whole, fraction = ''] = String(value).split('.');
		return `${whole}.${(fraction + '00').slice(0, 2)}`;
	}
</script>

<div class="quotes-workspace">
	<Card class="current-quote-card">
		<SectionHeader
			title="Current quote"
			description="The commercial proposal currently linked to this enquiry."
		/>
		{#if currentQuoteRecord}
			<div class="quote-highlight">
				<div>
					<span class="eyebrow">{quoteNumber(currentQuoteRecord)}</span>
					<h2>{currentQuoteRecord.subject}</h2>
					<p>
						{currentQuoteRecord.currency}
						{money(currentQuoteRecord.total)} · {quoteStatusLabel(currentQuoteRecord.status)}
					</p>
				</div>
				<a
					class="ui-button ui-button--primary ui-button--md"
					href={resolve(`/quotes/${currentQuoteRecord.id}`)}
				>
					{currentQuoteRecord.status === 'draft' ? 'Open draft' : 'Open quote'}
				</a>
			</div>
		{:else if canMutate}
			<EmptyState
				title="No quote yet"
				message="Create the commercial proposal once the enquiry is ready for pricing."
			>
				{#snippet action()}<a
						class="ui-button ui-button--primary ui-button--md"
						href={resolve(`/quotes/new?lead_id=${leadId}`)}>Create quote</a
					>{/snippet}
			</EmptyState>
		{:else}
			<EmptyState
				title="No quote yet"
				message="A quote will appear here when pricing has started."
			/>
		{/if}
	</Card>

	{#if previousQuotes.length > 0}
		<details class="revision-disclosure">
			<summary>Previous quote revisions ({previousQuotes.length})</summary>
			<Card>
				<div class="quote-list">
					{#each previousQuotes as quote (quote.id)}<div class="quote-row">
							<div>
								<strong>{quote.subject}</strong>
								<span
									>{quoteNumber(quote)} · {quote.currency}
									{money(quote.total)} · {quoteStatusLabel(quote.status)}</span
								>
							</div>
							<a href={resolve(`/quotes/${quote.id}`)}>Open</a>
						</div>{/each}
				</div>
			</Card>
		</details>
	{/if}
</div>

<style>
	.quotes-workspace,
	.quote-list {
		display: grid;
		gap: var(--space-lg);
	}
	:global(.current-quote-card) {
		border-color: color-mix(in srgb, var(--color-brand-primary) 30%, var(--color-border));
	}
	.quote-highlight,
	.quote-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
	}
	.quote-highlight {
		padding: var(--space-lg);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
	}
	.eyebrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.quote-highlight h2 {
		margin: var(--space-xs) 0;
		color: var(--color-text);
		font-size: var(--font-size-lg);
	}
	.quote-highlight p,
	.quote-row span {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.revision-disclosure > summary {
		padding: var(--space-sm) 0;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.quote-row {
		padding: var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.quote-row > div {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
	}
	.quote-row strong {
		color: var(--color-text);
	}
	.quote-row a {
		color: var(--color-brand-primary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	@media (max-width: 560px) {
		.quote-highlight,
		.quote-row {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
