<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	let {
		brandMode = $bindable('default'),
		children,
		context = 'Workspace',
		userEmail = null,
		userRole = null,
		onSignOut,
		signOutAction = null
	}: {
		brandMode?: 'default' | 'alternate';
		children?: Snippet;
		context?: string;
		userEmail?: string | null;
		userRole?: string | null;
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

	const brandStyle = [
		`--client-brand-primary: ${publicClientConfiguration.brand.colors.primary}`,
		`--client-brand-primary-strong: ${publicClientConfiguration.brand.colors.primaryStrong}`,
		`--client-brand-accent: ${publicClientConfiguration.brand.colors.accent}`
	].join(';');
</script>

<div class="app-shell" style={brandStyle} data-brand={brandMode} data-testid="app-shell">
	<Sidebar open={navigationOpen} {userRole} onclose={closeNavigation} />
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
