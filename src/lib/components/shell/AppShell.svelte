<script lang="ts">
	import type { Snippet } from 'svelte';
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
			{navigationOpen}
			onToggleNavigation={toggleNavigation}
		/>
		<main class="app-shell__content">
			{@render children?.()}
		</main>
	</div>
</div>
