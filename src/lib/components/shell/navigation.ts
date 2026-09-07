export type NavigationItem = {
	label: string;
	href: string;
	icon:
		'home' | 'sales' | 'customers' | 'fulfilment' | 'reports' | 'products' | 'settings' | 'health';
};

export function navigationForRole(role: string | null) {
	const work: NavigationItem[] = [
		{ label: 'Home', href: '/', icon: 'home' },
		{ label: 'Sales', href: '/sales', icon: 'sales' },
		{ label: 'Customers', href: '/clients', icon: 'customers' },
		{ label: 'Fulfilment', href: '/fulfilment', icon: 'fulfilment' },
		{ label: 'Reports', href: '/reports', icon: 'reports' }
	];
	const administration: NavigationItem[] = [
		{ label: 'Products', href: '/products', icon: 'products' }
	];
	if (role === 'owner' || role === 'admin') {
		administration.push(
			{ label: 'Settings', href: '/settings', icon: 'settings' },
			{ label: 'System Health', href: '/operations', icon: 'health' }
		);
	}
	return [
		{ id: 'work', label: '', items: work },
		{ id: 'administration', label: 'Administration', items: administration }
	];
}

export function navigationDestination(pathname: string): string | null {
	const section = pathname.split('/')[1];
	if (!section || section === 'tasks') return '/';
	if (['sales', 'leads', 'quotes'].includes(section)) return '/sales';
	if (
		['clients', 'fulfilment', 'products', 'settings', 'operations', 'reports'].includes(section)
	) {
		return `/${section}`;
	}
	return null;
}
