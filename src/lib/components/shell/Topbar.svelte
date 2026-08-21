<script lang="ts">
	import { Menu, UserCircle } from 'lucide-svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	let {
		context = 'Workspace',
		onToggleNavigation
	}: { context?: string; onToggleNavigation?: () => void } = $props();
</script>

<header class="app-shell__topbar">
	<div class="app-shell__topbar-start">
		<div class="app-shell__mobile-menu">
			<IconButton ariaLabel="Open navigation" onclick={onToggleNavigation}>
				<Menu size={19} aria-hidden="true" />
			</IconButton>
		</div>
		<span class="app-shell__topbar-context">{context}</span>
	</div>
	<div class="app-shell__topbar-actions">
		<span class="app-shell__topbar-context">Staff workspace</span>
		<IconButton ariaLabel="Open profile menu">
			<UserCircle size={21} aria-hidden="true" />
		</IconButton>
	</div>
</header>
