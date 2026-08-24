<script lang="ts">
	import { resolve } from '$app/paths';
	import { Menu, UserCircle } from '@lucide/svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	let {
		context = 'Workspace',
		onToggleNavigation,
		navigationOpen = false,
		userEmail = null,
		onSignOut,
		signOutAction = null
	}: {
		context?: string;
		onToggleNavigation?: () => void;
		navigationOpen?: boolean;
		userEmail?: string | null;
		onSignOut?: () => void;
		signOutAction?: string | null;
	} = $props();
</script>

<header class="app-shell__topbar">
	<div class="app-shell__topbar-start">
		<div class="app-shell__mobile-menu">
			<IconButton
				ariaLabel={navigationOpen ? 'Close navigation' : 'Open navigation'}
				aria-expanded={navigationOpen}
				aria-controls="primary-navigation"
				onclick={onToggleNavigation}
			>
				<Menu size={19} aria-hidden="true" />
			</IconButton>
		</div>
		<span class="app-shell__topbar-context">{context}</span>
	</div>
	<div class="app-shell__topbar-actions">
		{#if userEmail}
			<span class="app-shell__topbar-context" title={userEmail}>{userEmail}</span>
			{#if onSignOut}
				<button class="app-shell__sign-out" type="button" onclick={() => onSignOut?.()}
					>Sign out</button
				>
			{:else if signOutAction}
				<form method="POST" action={signOutAction}>
					<button class="app-shell__sign-out" type="submit">Sign out</button>
				</form>
			{/if}
		{:else}
			<span class="app-shell__topbar-context">Staff workspace</span>
			<a class="app-shell__sign-in" href={resolve('/login')}>Sign in</a>
		{/if}
		{#if userEmail}<UserCircle size={21} aria-hidden="true" />{/if}
	</div>
</header>
