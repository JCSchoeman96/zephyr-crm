import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { defaultClientConfiguration } from '$lib/config/client-config';
import { localCalendarDayBounds } from '$lib/time/zoned-datetime';
import { load as loadHome } from '../../routes/+page.server';
import { load as loadReports } from '../../routes/reports/+page.server';
import { load as loadTasks } from '../../routes/tasks/+page.server';
import { load as loadQuotes } from '../../routes/quotes/+page.server';

function fixture(role = 'viewer', failTasks = false) {
	const requests: { url: URL; method: string }[] = [];
	const supabase = createClient('http://127.0.0.1:54321', 'local-unit-fixture', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const method = init?.method ?? 'GET';
				requests.push({ url, method });
				if (
					failTasks &&
					(url.pathname.endsWith('/tasks') || url.pathname.endsWith('/task_work_queue'))
				) {
					return Response.json({ message: 'Unavailable', code: 'XX000' }, { status: 500 });
				}
				if (method === 'HEAD') return new Response(null, { headers: { 'content-range': '0-0/7' } });
				if (url.pathname.endsWith('/dashboard_sales_kpis'))
					return Response.json({ new_leads: 12, accepted_value: 1234.5 });
				if (url.pathname.endsWith('/dashboard_sales_fulfilment_metrics'))
					return Response.json({ open_fulfilments: 3 });
				if (url.pathname.includes('/rpc/')) return Response.json({});
				return Response.json([]);
			}
		}
	});
	const profile = { id: 'staff', role, status: 'active' };
	const event = {
		url: new URL('http://localhost/?from=2026-01-01&to=2026-01-31'),
		locals: { supabase, getAuthState: async () => ({ user: { id: 'staff' }, profile }) }
	};
	return { event, requests, profile };
}

describe('Home and Reports presentation boundary', () => {
	it('opens only follow-ups due today from the Home link', async () => {
		const { event, requests } = fixture();
		event.url.searchParams.set('due', 'today');
		const before = Date.now();
		await loadTasks(event as never);
		const after = Date.now();
		const request = requests.find(({ url }) => url.pathname.endsWith('/task_work_queue'));
		const dueAt = request?.url.searchParams.getAll('due_at') ?? [];
		expect(dueAt).toHaveLength(2);
		const startIso = dueAt[0]!.slice(4);
		const endIso = dueAt[1]!.slice(3);
		const candidates = [before, after].map((ms) =>
			localCalendarDayBounds(defaultClientConfiguration.locale.timezone, new Date(ms))
		);
		expect(
			candidates.some((bounds) => bounds.startIso === startIso && bounds.endIso === endIso)
		).toBe(true);
		expect(startIso.endsWith('Z')).toBe(true);
		expect(endIso.endsWith('Z')).toBe(true);
	});

	it('counts Home due-today work with configured timezone bounds', async () => {
		const { event, requests } = fixture();
		const before = Date.now();
		await loadHome(event as never);
		const after = Date.now();
		const dueRequest = requests.find(
			({ url, method }) =>
				method === 'HEAD' &&
				url.pathname.endsWith('/tasks') &&
				url.searchParams.getAll('due_at').length === 2
		);
		const dueAt = dueRequest?.url.searchParams.getAll('due_at') ?? [];
		expect(dueAt).toHaveLength(2);
		const startIso = dueAt[0]!.slice(4);
		const endIso = dueAt[1]!.slice(3);
		const candidates = [before, after].map((ms) =>
			localCalendarDayBounds(defaultClientConfiguration.locale.timezone, new Date(ms))
		);
		expect(
			candidates.some((bounds) => bounds.startIso === startIso && bounds.endIso === endIso)
		).toBe(true);
	});

	it('opens sent Quotes in the Home expiry window', async () => {
		const { event, requests } = fixture();
		event.url.searchParams.set('expiring', 'soon');
		event.url.searchParams.set('status', 'sent');
		await loadQuotes(event as never);
		const request = requests.find(({ url }) => url.pathname.endsWith('/quotes'));
		expect(request?.url.searchParams.get('status')).toBe('eq.sent');
		expect(request?.url.searchParams.getAll('valid_until')).toEqual([
			expect.stringMatching(/^gte\.\d{4}-\d{2}-\d{2}$/),
			expect.stringMatching(/^lte\.\d{4}-\d{2}-\d{2}$/)
		]);
	});
	it('loads bounded operational work on Home without management analytics', async () => {
		const { event, requests } = fixture();
		await loadHome(event as never);
		expect(requests.filter(({ url }) => url.pathname.includes('/rpc/dashboard_'))).toHaveLength(0);
		const rows = requests.filter(({ method }) => method === 'GET');
		expect(rows.length).toBeGreaterThan(0);
		for (const { url } of rows) {
			expect(Number(url.searchParams.get('limit'))).toBeGreaterThan(0);
			expect(Number(url.searchParams.get('limit'))).toBeLessThanOrEqual(10);
			expect(url.searchParams.get('select')).not.toBe('*');
		}
	});

	it.each(['owner', 'admin', 'sales', 'viewer'])(
		'retains analytics access for %s',
		async (role) => {
			const { event, requests, profile } = fixture(role);
			const result = (await loadReports(event as never)) as {
				profile: unknown;
				kpis: { leads: number; acceptedValue: number };
				metrics: { openFulfilments: number };
			};
			expect(result.profile).toEqual(profile);
			expect(result.kpis.leads).toBe(12);
			expect(result.kpis.acceptedValue).toBe(1234.5);
			expect(result.metrics.openFulfilments).toBe(3);
			expect(requests.some(({ url }) => url.pathname.endsWith('/dashboard_attribution'))).toBe(
				true
			);
		}
	);

	it('fails closed when operational work is unavailable', async () => {
		const { event } = fixture('sales', true);
		await expect(loadHome(event as never)).rejects.toBeDefined();
	});
});
