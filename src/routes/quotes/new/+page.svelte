<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import QuoteEditor from '$lib/components/quotes/QuoteEditor.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>New Quote | Zephyr CRM</title></svelte:head>
<AppShell userEmail={data.auth.user?.email}>
	<a class="back-link" href={resolve('/quotes')}>← Back to Quotes</a>
	<PageHeader
		title="New quote"
		description="Build a durable draft from a Proposal or Decision Lead."
	/>
	{#if form?.message}<ErrorState title="Quote could not be saved" message={form.message} />{/if}
	<QuoteEditor action="?/save" leadOptions={data.leads} clientOptions={data.clients} />
</AppShell>
