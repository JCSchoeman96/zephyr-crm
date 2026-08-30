<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import QuoteEditor from '$lib/components/quotes/QuoteEditor.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function defaultValidUntil(validityDays: number) {
		const timestamp = Date.now() + validityDays * 24 * 60 * 60 * 1000;
		return new Date(timestamp).toISOString().slice(0, 10);
	}
</script>

<svelte:head><title>New Quote | Zephyr CRM</title></svelte:head>
<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/quotes')}>← Back to Quotes</a>
	<PageHeader
		title="New quote"
		description="Build a quote for an enquiry that is ready for pricing."
	/>
	{#if form?.message}<ErrorState title="Quote could not be saved" message={form.message} />{/if}
	<QuoteEditor
		action="?/save"
		leadId={data.selectedLeadId}
		leadOptions={data.leads}
		clientOptions={data.clients}
		terms={data.quoteDefaults.terms}
		taxLabel={data.quoteDefaults.tax_label}
		taxRate={String(data.quoteDefaults.tax_rate)}
		validUntil={defaultValidUntil(data.quoteDefaults.validity_days)}
	/>
</AppShell>
