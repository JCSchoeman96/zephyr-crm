import { describe, expect, it } from 'vitest';
import { navigationForRole, navigationDestination } from './navigation';

describe('guided workflow navigation', () => {
	it.each(['owner', 'admin', 'sales', 'viewer'])(
		'shows five business destinations for %s',
		(role) => {
			const groups = navigationForRole(role);
			expect(groups[0].items.map(({ label, href }) => [label, href])).toEqual([
				['Home', '/'],
				['Sales', '/sales'],
				['Customers', '/clients'],
				['Fulfilment', '/fulfilment'],
				['Reports', '/reports']
			]);
			expect(
				groups
					.flatMap((group) => group.items)
					.some((item) =>
						[
							'/tasks',
							'/quotes',
							'/leads',
							'/sales/enquiries',
							'/sales/qualification',
							'/sales/proposals',
							'/sales/decisions'
						].includes(item.href)
					)
			).toBe(false);
		}
	);

	it.each(['owner', 'admin'])('keeps configuration and diagnostics visible to %s', (role) => {
		expect(navigationForRole(role)[1].items.map((item) => item.href)).toEqual([
			'/products',
			'/settings',
			'/operations'
		]);
	});

	it.each(['sales', 'viewer', null])('does not grant administrative navigation to %s', (role) => {
		expect(navigationForRole(role)[1].items.map((item) => item.href)).toEqual(['/products']);
	});

	it.each([
		['/', '/'],
		['/sales', '/sales'],
		['/sales/decisions', '/sales'],
		['/leads/123', '/sales'],
		['/quotes/new', '/sales'],
		['/quotes/123', '/sales'],
		['/clients/123', '/clients'],
		['/fulfilment/123', '/fulfilment'],
		['/products/123', '/products'],
		['/settings', '/settings'],
		['/reports', '/reports'],
		['/operations', '/operations'],
		['/tasks', '/'],
		['/salesperson', null]
	])('maps %s to its business destination', (pathname, destination) => {
		expect(navigationDestination(pathname)).toBe(destination);
	});
});
