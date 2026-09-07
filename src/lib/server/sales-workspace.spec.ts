import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { loadSalesWorkspace } from './sales-workspace';

function fixture(rows: unknown[] = []) {
	const requests: URL[] = [];
	const client = createClient('http://127.0.0.1:54321', 'unit-test', {
		auth: { persistSession: false },
		global: {
			fetch: async (input) => {
				requests.push(new URL(String(input)));
				return Response.json(rows);
			}
		}
	});
	return { client, requests };
}

it.each([
	['new', 'NEW'],
	['reviewing', 'QUALIFICATION'],
	['quote', 'PROPOSAL'],
	['waiting', 'DECISION']
])('selects only %s work on the server', async (view, stage) => {
	const { client, requests } = fixture();
	await loadSalesWorkspace(client, new URLSearchParams({ view }));
	expect(requests).toHaveLength(1);
	expect(requests[0].searchParams.get('pipeline_stage')).toBe(`eq.${stage}`);
	expect(requests[0].searchParams.get('limit')).toBe('51');
	expect(requests[0].searchParams.get('select')).not.toContain('*');
});

it('defaults to deterministic unpaused attention work, oldest activity first', async () => {
	const { client, requests } = fixture();
	const result = await loadSalesWorkspace(client, new URLSearchParams());
	expect(result.view).toBe('attention');
	expect(requests[0].searchParams.get('attention_state')).toBe('eq.waiting_on_us');
	expect(requests[0].searchParams.get('paused_at')).toBe('is.null');
	expect(requests[0].searchParams.get('order')).toContain('last_activity_at.asc');
	expect(requests[0].searchParams.get('order')).toContain('id.asc');
});

it('uses a sentinel and bounded next page instead of loading every queue', async () => {
	const { client, requests } = fixture(Array.from({ length: 51 }, (_, i) => ({ id: String(i) })));
	const result = await loadSalesWorkspace(client, new URLSearchParams({ view: 'all', page: '2' }));
	expect(result.rows).toHaveLength(50);
	expect(result.hasMore).toBe(true);
	expect(requests[0].searchParams.get('offset')).toBe('50');
	expect(requests).toHaveLength(1);
});
