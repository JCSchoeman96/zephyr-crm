<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';

	let {
		brandMode = $bindable('default'),
		children,
		context = 'Workspace',
		userEmail = null,
		onSignOut,
		signOutAction = null
	}: {
		brandMode?: 'default' | 'alternate';
		children?: Snippet;
		context?: string;
		userEmail?: string | null;
		onSignOut?: () => void;
		signOutAction?: string | null;
	} = $props();

	let navigationOpen = $state(false);

	function toggleNavigation() {
		navigationOpen = !navigationOpen;
	}

	function closeNavigation() {
		navigationOpen = false;
	}
</script>

<div class="app-shell" data-brand={brandMode} data-testid="app-shell">
	<Sidebar open={navigationOpen} onclose={closeNavigation} />
	<div
		class="app-shell__mobile-backdrop"
		data-open={navigationOpen}
		aria-hidden="true"
		onclick={closeNavigation}
	></div>
	<div class="app-shell__body">
		<Topbar
			{context}
			{userEmail}
			{onSignOut}
			{signOutAction}
			onToggleNavigation={toggleNavigation}
		/>
		<main class="app-shell__content">
			{@render children?.()}
		</main>
	</div>
	{#if navigationOpen}
		<div class="sr-only">
			<IconButton ariaLabel="Close navigation" onclick={closeNavigation}>
				<X size={18} aria-hidden="true" />
			</IconButton>
		</div>
	{/if}
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
