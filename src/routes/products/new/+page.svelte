<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import ProductForm from '$lib/components/products/ProductForm.svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>New Product | Zephyr CRM</title>
	<meta name="description" content="Create a reusable Zephyr CRM Product or service" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/products')}>← Back to Products</a>
	<PageHeader
		title="New Product"
		description="Save a reusable commercial source for future draft Quotes. Product data is not inventory data."
	/>
	{#if form?.message}<ErrorState title="Product action failed" message={form.message} />{/if}
	<ProductForm
		action="?/save"
		categories={data.categories}
		form={form as { values?: Record<string, string>; message?: string }}
		showActivateButton
		submitLabel="Save draft"
	/>
</AppShell>

<style>
	.back-link {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-decoration: none;
	}
	.back-link:hover {
		color: var(--color-brand-primary);
	}
</style>
