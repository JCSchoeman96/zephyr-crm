<script lang="ts">
	import { resolve } from '$app/paths';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let brandMode = $state<'default' | 'alternate'>('default');
</script>

<svelte:head>
	<title>Zephyr CRM</title>
	<meta name="description" content="Zephyr CRM application shell" />
</svelte:head>

<AppShell bind:brandMode>
	<PageHeader
		title="Zephyr CRM"
		description="A focused sales workflow workspace. Feature modules will be introduced after the identity foundation."
	/>
	<section class="placeholder-card" aria-label="Application status">
		<h2>Application shell ready</h2>
		<p>
			Use the component lab at <a href={resolve('/system')}>/system</a> to review the current design primitives.
		</p>
	</section>
</AppShell>

<style>
	.placeholder-card {
		padding: var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.placeholder-card h2,
	.placeholder-card p {
		margin: 0;
	}

	.placeholder-card p {
		margin-top: var(--space-sm);
		color: var(--color-text-muted);
	}

	.placeholder-card a {
		color: var(--color-brand-primary);
		font-weight: var(--font-weight-semibold);
	}
</style>
