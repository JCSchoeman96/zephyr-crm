import { describe, expect, it } from 'vitest';
import { productStatusLabel, transitionProductStatus, normalizeProductFilters } from './states';

describe('Product lifecycle contract', () => {
	it('allows only the documented lifecycle transitions', () => {
		expect(transitionProductStatus('draft', 'active')).toEqual({ ok: true });
		expect(transitionProductStatus('active', 'inactive')).toEqual({ ok: true });
		expect(transitionProductStatus('inactive', 'active')).toEqual({ ok: true });
		expect(transitionProductStatus('draft', 'archived')).toEqual({ ok: true });
		expect(transitionProductStatus('inactive', 'archived')).toEqual({ ok: true });
		expect(transitionProductStatus('archived', 'inactive')).toEqual({ ok: true });
	});

	it('rejects illegal, repeated, and terminal transitions', () => {
		expect(transitionProductStatus('draft', 'inactive')).toMatchObject({
			ok: false,
			code: 'illegal_transition'
		});
		expect(transitionProductStatus('active', 'archived')).toMatchObject({
			ok: false,
			code: 'illegal_transition'
		});
		expect(transitionProductStatus('archived', 'active')).toMatchObject({
			ok: false,
			code: 'illegal_transition'
		});
		expect(transitionProductStatus('active', 'active')).toMatchObject({
			ok: false,
			code: 'same_state'
		});
	});

	it('normalizes safe catalogue filters and caps pagination', () => {
		expect(
			normalizeProductFilters({
				q: '  screens  ',
				status: 'active',
				kind: 'service',
				categoryId: 'category-1',
				page: '3',
				pageSize: '500'
			})
		).toEqual({
			q: 'screens',
			status: 'active',
			kind: 'service',
			categoryId: 'category-1',
			page: 3,
			pageSize: 50
		});
	});

	it('provides human labels for every persisted Product state', () => {
		expect(productStatusLabel('draft')).toBe('Draft');
		expect(productStatusLabel('active')).toBe('Active');
		expect(productStatusLabel('inactive')).toBe('Inactive');
		expect(productStatusLabel('archived')).toBe('Archived');
	});
});
