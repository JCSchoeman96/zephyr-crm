import { describe, expect, it } from 'vitest';
import { normalizeLeadQuery } from './query';

describe('lead query contract', () => {
	it('normalizes bounded pagination and rejects unsupported sorting', () => {
		expect(
			normalizeLeadQuery({ page: '0', pageSize: '999', sort: 'created_at', direction: 'asc' })
		).toEqual({
			page: 1,
			pageSize: 50,
			sort: 'created_at',
			direction: 'asc'
		});
		expect(normalizeLeadQuery({ page: '2', pageSize: '25', sort: 'email' }).sort).toBe(
			'updated_at'
		);
	});
});
