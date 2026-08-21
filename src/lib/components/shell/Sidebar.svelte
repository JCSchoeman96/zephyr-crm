<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		BarChart3,
		CheckSquare,
		FileText,
		LayoutDashboard,
		Settings,
		Users,
		UserRound
	} from 'lucide-svelte';

	type NavIcon = typeof LayoutDashboard;
	type NavItem = { label: string; href: string; icon: NavIcon };
	type NavGroup = { id: string; label: string; items: NavItem[] };

	const navigation: NavGroup[] = [
		{
			id: 'dashboard',
			label: '',
			items: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard }]
		},
		{
			id: 'sales',
			label: 'Sales',
			items: [
				{ label: 'Leads', href: '/leads', icon: UserRound },
				{ label: 'Quotes', href: '/quotes', icon: FileText },
				{ label: 'Clients', href: '/clients', icon: Users },
				{ label: 'Tasks', href: '/tasks', icon: CheckSquare }
			]
		},
		{
			id: 'insights',
			label: 'Insights',
			items: [{ label: 'Reports', href: '/reports', icon: BarChart3 }]
		},
		{
			id: 'administration',
			label: 'Administration',
			items: [{ label: 'Settings', href: '/settings', icon: Settings }]
		}
	];

	let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();

	function closeOnMobile() {
		onclose?.();
	}

	function resolveNavigationPath(path: string) {
		// Feature routes are introduced in later phases; resolve still applies the configured base path.
		return resolve(path as '/');
	}
</script>

<aside class="app-shell__sidebar" data-open={open} aria-label="Sidebar navigation">
	<a class="app-shell__brand" href={resolve('/')} onclick={closeOnMobile}>
		<span class="app-shell__brand-mark" aria-hidden="true">Z</span>
		<span>Zephyr CRM</span>
	</a>
	<nav class="app-shell__navigation" aria-label="Primary navigation">
		{#each navigation as group (group.id)}
			<div class="app-shell__navigation-group">
				{#if group.label}<p class="app-shell__navigation-label">{group.label}</p>{/if}
				{#each group.items as item (item.href)}
					{@const Icon = item.icon}
					<a
						class="app-shell__navigation-link"
						href={resolveNavigationPath(item.href)}
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
