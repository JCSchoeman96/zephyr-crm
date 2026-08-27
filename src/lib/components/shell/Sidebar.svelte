<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		CheckSquare,
		FileText,
		LayoutDashboard,
		Activity,
		Users,
		UserRound
	} from '@lucide/svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	type NavIcon = typeof LayoutDashboard;
	type NavItem = { label: string; href: string; icon: NavIcon; adminOnly?: boolean };
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
				{ label: 'All enquiries', href: '/leads', icon: UserRound },
				{ label: 'New Enquiries', href: '/sales/enquiries', icon: UserRound },
				{ label: 'Qualification', href: '/sales/qualification', icon: CheckSquare },
				{ label: 'Quotes to Prepare', href: '/sales/proposals', icon: FileText },
				{ label: 'Awaiting Feedback', href: '/sales/decisions', icon: Activity },
				{ label: 'Quotes', href: '/quotes', icon: FileText }
			]
		},
		{
			id: 'fulfilment',
			label: 'Fulfilment',
			items: [{ label: 'Fulfilment', href: '/fulfilment', icon: Activity }]
		},
		{
			id: 'customers',
			label: 'Customers',
			items: [{ label: 'Clients', href: '/clients', icon: Users }]
		},
		{
			id: 'work',
			label: 'Work',
			items: [{ label: 'Tasks', href: '/tasks', icon: CheckSquare }]
		},
		{
			id: 'administration',
			label: 'Administration',
			items: [{ label: 'Operations', href: '/operations', icon: Activity, adminOnly: true }]
		}
	];

	let {
		open = false,
		userRole = null,
		onclose
	}: {
		open?: boolean;
		userRole?: string | null;
		onclose?: () => void;
	} = $props();
	const canViewOperations = $derived(userRole === 'owner' || userRole === 'admin');

	function closeOnMobile() {
		onclose?.();
	}

	function resolveNavigationPath(path: string) {
		// Feature routes are introduced in later phases; resolve still applies the configured base path.
		return resolve(path as '/');
	}

	function isCurrentNavigationItem(path: string) {
		const resolvedPath = resolveNavigationPath(path);
		return (
			page.url.pathname === resolvedPath ||
			(resolvedPath !== resolve('/') && page.url.pathname.startsWith(`${resolvedPath}/`))
		);
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
				{#each group.items.filter((item) => !item.adminOnly || canViewOperations) as item (item.href)}
					{@const Icon = item.icon}
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
