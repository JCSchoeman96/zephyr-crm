<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		LayoutDashboard,
		ChartNoAxesCombined,
		Settings,
		Activity,
		Package,
		Users,
		UserRound
	} from '@lucide/svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';
	import { navigationForRole, navigationDestination, type NavigationItem } from './navigation';

	type NavIcon = typeof LayoutDashboard;
	const icons: Record<NavigationItem['icon'], NavIcon> = {
		home: LayoutDashboard,
		sales: UserRound,
		customers: Users,
		fulfilment: Package,
		reports: ChartNoAxesCombined,
		products: Package,
		settings: Settings,
		health: Activity
	};

	let {
		open = false,
		userRole = null,
		onclose
	}: {
		open?: boolean;
		userRole?: string | null;
		onclose?: () => void;
	} = $props();
	const navigation = $derived(navigationForRole(userRole));

	function closeOnMobile() {
		onclose?.();
	}

	function resolveNavigationPath(path: string) {
		return resolve(path as '/');
	}

	function isCurrentNavigationItem(path: string) {
		return navigationDestination(page.url.pathname.slice(base.length)) === path;
	}
</script>

<aside class="app-shell__sidebar" data-open={open} aria-label="Sidebar navigation">
	<a class="app-shell__brand" href={resolve('/')} onclick={closeOnMobile}>
		<span class="app-shell__brand-mark" aria-hidden="true">Z</span>
		<span>{publicClientConfiguration.brand.companyName}</span>
	</a>
	<nav id="primary-navigation" class="app-shell__navigation" aria-label="Primary navigation">
		{#each navigation as group (group.id)}
			<div class="app-shell__navigation-group">
				{#if group.label}<p class="app-shell__navigation-label">{group.label}</p>{/if}
				{#each group.items as item (item.href)}
					{@const Icon = icons[item.icon]}
					<a
						class="app-shell__navigation-link"
						href={resolveNavigationPath(item.href)}
						aria-current={isCurrentNavigationItem(item.href) ? 'page' : undefined}
						onclick={closeOnMobile}
					>
						<Icon size={17} strokeWidth={1.8} aria-hidden="true" />
						<span>{item.label}</span>
					</a>
				{/each}
			</div>
		{/each}
	</nav>
	<p class="app-shell__sidebar-footer">Focused sales workflow</p>
</aside>
