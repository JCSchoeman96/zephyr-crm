<script lang="ts">
	import { resolve } from '$app/paths';
	import { detailTabHref, detailTabs, type DetailTab } from '$lib/domain/leads/detail-tabs';

	let {
		leadId,
		activeTab,
		quoteCount,
		openTaskCount
	}: {
		leadId: string;
		activeTab: DetailTab;
		quoteCount: number;
		openTaskCount: number;
	} = $props();

	const labels: Record<DetailTab, string> = {
		overview: 'Overview',
		quotes: 'Quotes',
		'follow-ups': 'Follow-up actions',
		history: 'History'
	};
</script>

<nav class="detail-tabs" aria-label="Enquiry detail sections">
	{#each detailTabs as tab (tab)}
		<a
			class="detail-tab"
			class:detail-tab--active={activeTab === tab}
			aria-current={activeTab === tab ? 'page' : undefined}
			href={resolve(detailTabHref(leadId, tab))}
		>
			{labels[tab]}
			{#if tab === 'quotes' && quoteCount > 0}<span class="detail-tab__count">{quoteCount}</span
				>{/if}
			{#if tab === 'follow-ups' && openTaskCount > 0}<span class="detail-tab__count"
					>{openTaskCount}</span
				>{/if}
		</a>
	{/each}
</nav>

<style>
	.detail-tabs {
		display: flex;
		gap: var(--space-xs);
		overflow-x: auto;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}
	.detail-tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 3rem;
		padding: 0 var(--space-md);
		border-bottom: 3px solid transparent;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
		white-space: nowrap;
	}
	.detail-tab:hover,
	.detail-tab:focus-visible {
		color: var(--color-brand-primary);
	}
	.detail-tab--active {
		border-bottom-color: var(--color-brand-primary);
		color: var(--color-brand-primary);
	}
	.detail-tab__count {
		display: inline-flex;
		min-width: 1.25rem;
		min-height: 1.25rem;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-xs);
		border-radius: var(--radius-pill);
		background: var(--color-surface-raised);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
</style>
