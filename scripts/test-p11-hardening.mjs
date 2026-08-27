import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const runId = `${Date.now()}`;
const prefix = `p11-${runId}`;
const users = [];

function run(command, args, options = {}) {
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			...options
		}).trim();
	} catch (error) {
		const stderr = error.stderr?.toString().trim();
		throw new Error(`${command} failed${stderr ? `: ${stderr}` : ''}`, {
			cause: error
		});
	}
}

function localStatus() {
	const output = run('bunx', ['supabase', 'status', '-o', 'env']);
	return Object.fromEntries(
		output
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
}

const local = localStatus();
const apiUrl = local.API_URL;
const anonKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const serviceRoleKey = local.SERVICE_ROLE_KEY;
const databaseUrl = local.DB_URL;

if (!apiUrl || !anonKey || !serviceRoleKey || !databaseUrl) {
	throw new Error('Local Supabase status is missing a required Phase 11 test endpoint.');
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function read(path) {
	return readFileSync(path, 'utf8');
}

function sql(query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function explainExecutionTime(query) {
	const output = sql(`set statement_timeout = '250ms'; explain (analyze, format json) ${query};`);
	const start = output.indexOf('[');
	assert(start >= 0, `No execution plan returned for ${query}`);
	const plan = JSON.parse(output.slice(start))[0];
	return Number(plan['Execution Time']);
}

function parseBody(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function request(path, init = {}, key = anonKey, token = null) {
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			apikey: key,
			Authorization: `Bearer ${token ?? key}`,
			...(init.headers ?? {})
		}
	});
	return { response, body: parseBody(await response.text()) };
}

async function rpc(name, args, key = anonKey, token = null) {
	return request(
		`/rest/v1/rpc/${name}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(args)
		},
		key,
		token
	);
}

function expectBounded(file, labels) {
	const content = read(file);
	for (const label of labels) {
		assert(content.includes(label), `${file} is missing the bounded ${label} path`);
	}
	assert(content.includes('.limit(') || content.includes('.range('), `${file} has no list bound`);
}

function runStaticGates() {
	const boundedRoutes = {
		'src/routes/leads/+page.server.ts': ['.range('],
		'src/routes/clients/+page.server.ts': ['.range('],
		'src/routes/quotes/+page.server.ts': ['.range('],
		// Tasks now use the shared queue helper and offset-based pagination. The
		// route's range is the bounded query boundary; the helper trims the
		// inclusive response to the canonical 50-row page.
		'src/routes/tasks/+page.server.ts': ['.range('],
		'src/routes/leads/[id]/+page.server.ts': [
			".from('quotes')",
			".from('tasks')",
			".from('activities')",
			".from('lost_reasons')",
			'.limit(100)'
		],
		'src/routes/clients/[id]/+page.server.ts': [
			".from('client_contacts')",
			".from('activities')",
			'.limit(100)'
		],
		'src/routes/quotes/[id]/+page.server.ts': [
			".from('quote_items')",
			".from('activities')",
			".from('outbound_messages')",
			'.limit(50)',
			'.limit(10)'
		]
	};
	for (const [file, labels] of Object.entries(boundedRoutes)) expectBounded(file, labels);
	console.log('P11-T01 no unbounded lists passed');

	const sourceFiles = Object.keys(boundedRoutes).concat([
		'src/lib/realtime/RealtimeStatus.svelte',
		'src/lib/server/action-errors.ts',
		'src/lib/components/shell/AppShell.svelte',
		'src/lib/components/shell/Sidebar.svelte',
		'src/lib/components/shell/Topbar.svelte'
	]);
	const source = sourceFiles.map(read).join('\n');
	assert(!/setInterval\s*\(/.test(source), 'High-frequency interval polling exists in source');
	assert(
		!/\b(localStorage|sessionStorage|indexedDB)\b/.test(source),
		'CRM data uses browser storage'
	);
	console.log('P11-T04 no polling regression passed');
	console.log('P11-T06 browser storage audit passed');

	const realtime = read('src/lib/realtime/RealtimeStatus.svelte');
	assert(realtime.includes("'postgres_changes'"), 'Realtime postgres_changes listener is missing');
	assert(realtime.includes('invalidateAll'), 'Realtime events do not revalidate server truth');
	assert(realtime.includes('removeChannel'), 'Realtime channel cleanup is missing');
	const migration = read('supabase/migrations/20260822130000_selective_realtime.sql');
	assert(
		migration.includes("array['leads', 'tasks', 'quotes']"),
		'Realtime selection is not explicit'
	);
	assert(
		!migration.includes("'profiles'") && !migration.includes("'activities'"),
		'Realtime scope is too broad'
	);
	console.log('P11 selective Realtime source gate passed');

	const conflict = read('src/lib/server/action-errors.ts');
	assert(
		conflict.includes('Conflict: this record changed elsewhere in another session'),
		'Conflict copy is missing'
	);
	assert(
		read('src/routes/leads/[id]/+page.server.ts').includes('actionFailureDetails'),
		'Lead conflict status is not wired'
	);
	assert(
		read('src/routes/quotes/[id]/+page.server.ts').includes('actionFailureDetails'),
		'Quote conflict status is not wired'
	);
	assert(
		read('src/routes/leads/[id]/+page.svelte').includes('Conflict — reload before saving'),
		'Lead conflict UI is missing'
	);
	assert(
		read('src/routes/quotes/[id]/+page.svelte').includes('Conflict — reload before saving'),
		'Quote conflict UI is missing'
	);
	console.log('P11-T05 conflict UX source gate passed');

	const appShell = read('src/lib/components/shell/AppShell.svelte');
	const sidebar = read('src/lib/components/shell/Sidebar.svelte');
	const topbar = read('src/lib/components/shell/Topbar.svelte');
	assert(
		appShell.includes('{navigationOpen}') || appShell.includes('navigationOpen={navigationOpen}'),
		'Navigation state is not passed to Topbar'
	);
	assert(
		topbar.includes('aria-expanded={navigationOpen}'),
		'Navigation trigger lacks aria-expanded'
	);
	assert(
		topbar.includes('aria-controls="primary-navigation"'),
		'Navigation trigger lacks aria-controls'
	);
	assert(sidebar.includes('id="primary-navigation"'), 'Navigation landmark lacks a stable id');
	assert(
		sidebar.includes("aria-current={isCurrentNavigationItem(item.href) ? 'page' : undefined}"),
		'Active navigation lacks aria-current'
	);
	console.log('P11-T07 responsive and P11-T08 accessibility source gates passed');
}

function createRealtimeClient() {
	return createClient(apiUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

async function createUser(label) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P11-${runId}-${label}-Password11!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P11 ${label}` }
			})
		},
		serviceRoleKey
	);
	assert(created.response.ok && created.body?.id, `Could not create P11 ${label} user`);
	const provisioned = await rpc(
		'provision_invited_profile',
		{ p_user_id: created.body.id, p_role: 'sales', p_status: 'active' },
		serviceRoleKey,
		serviceRoleKey
	);
	assert(provisioned.response.ok, `Could not provision P11 ${label} profile`);
	const client = createRealtimeClient();
	const signedIn = await client.auth.signInWithPassword({ email, password });
	assert(signedIn.data.session && !signedIn.error, `Could not sign in P11 ${label}`);
	client.realtime.setAuth(signedIn.data.session.access_token);
	const user = { id: created.body.id, email, password, client };
	users.push(user);
	return user;
}

async function createLead() {
	const result = await rpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p11-form',
			p_external_submission_id: `${prefix}-lead`,
			p_payload: {
				first_name: 'P11',
				last_name: 'Realtime',
				email: `${prefix}@example.test`,
				phone: '+27110000000',
				company: 'P11 Fixture Company',
				message: 'Phase 11 Realtime fixture'
			}
		},
		serviceRoleKey,
		serviceRoleKey
	);
	assert(
		result.response.ok && result.body?.lead_id,
		`Could not create Realtime Lead: ${JSON.stringify(result.body)}`
	);
	return result.body.lead_id;
}

async function readLead(client, leadId) {
	const result = await client
		.from('leads')
		.select('id,lock_version,attention_state')
		.eq('id', leadId)
		.single();
	assert(
		!result.error && result.data,
		`Could not read Realtime Lead: ${result.error?.message ?? 'empty result'}`
	);
	return result.data;
}

async function subscribeToLead(client, label, leadId, required) {
	let events = 0;
	let status = 'CONNECTING';
	const channel = client.channel(`p11-${label}-${runId}`);
	channel.on(
		'postgres_changes',
		{ event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${leadId}` },
		() => {
			events += 1;
		}
	);
	await new Promise((resolve) => {
		const timeout = setTimeout(resolve, 4000);
		channel.subscribe((nextStatus) => {
			status = nextStatus;
			if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(nextStatus)) {
				clearTimeout(timeout);
				resolve();
			}
		});
	});
	if (required)
		assert(status === 'SUBSCRIBED', `${label} Realtime subscription ended as ${status}`);
	return {
		channel,
		get events() {
			return events;
		},
		status
	};
}

async function waitForEvent(subscription, timeoutMs = 4000) {
	const started = Date.now();
	while (subscription.events === 0 && Date.now() - started < timeoutMs) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return Date.now() - started;
}

async function allowLocalRealtimeCdcToSettle() {
	// The local Realtime service starts its tenant CDC stream lazily on the first
	// authenticated channel. Give that stream a bounded startup window before
	// issuing the mutation used by the cross-user integration assertion.
	await new Promise((resolve) => setTimeout(resolve, 8000));
}

async function runRealtimeGates() {
	const observer = await createUser('observer');
	const mutator = await createUser('mutator');
	const anonymous = createRealtimeClient();
	const leadId = await createLead();
	const initial = await readLead(observer.client, leadId);
	const permitted = await subscribeToLead(observer.client, 'permitted', leadId, true);
	const unauthorized = await subscribeToLead(anonymous, 'anonymous', leadId, false);
	await allowLocalRealtimeCdcToSettle();

	const changed = await mutator.client.rpc('set_lead_attention', {
		p_lead_id: leadId,
		p_attention_state: 'waiting_on_us',
		p_reason: 'Phase 11 Realtime test',
		p_resume_at: null,
		p_lock_version: initial.lock_version
	});
	assert(
		!changed.error,
		`Permitted Lead mutation failed: ${changed.error?.message ?? 'unknown error'}`
	);
	const refreshLatency = await waitForEvent(permitted);
	assert(permitted.events > 0, 'Permitted User A did not receive User B Lead update');
	await new Promise((resolve) => setTimeout(resolve, 1200));
	assert(unauthorized.events === 0, 'Anonymous subscriber received protected Lead data');
	assert(
		refreshLatency < 4000,
		`Permitted Realtime update exceeded 4 seconds: ${refreshLatency}ms`
	);
	console.log('P11-T02 Realtime RLS passed');
	console.log(`P11-T03 cross-user update passed (${refreshLatency}ms, no polling)`);

	const stale = await observer.client.rpc('set_lead_attention', {
		p_lead_id: leadId,
		p_attention_state: 'waiting_on_client',
		p_reason: 'stale attempt',
		p_resume_at: null,
		p_lock_version: initial.lock_version
	});
	assert(stale.error, 'Stale Lead mutation unexpectedly succeeded');
	const current = await readLead(observer.client, leadId);
	assert(current.attention_state === 'waiting_on_us', 'Stale mutation overwrote newer Lead state');
	assert(
		current.lock_version > initial.lock_version,
		'Permitted mutation did not advance lock_version'
	);
	console.log('P11 concurrency preservation integration passed');

	for (const client of [observer.client, mutator.client, anonymous]) {
		for (const channel of client.realtime.getChannels()) channel.teardown();
		void client.realtime.disconnect();
	}
}

function runPerformanceGate() {
	const queries = [
		[
			'Leads index',
			'select id, first_name, last_name, pipeline_stage from public.leads order by created_at desc limit 25'
		],
		[
			'Clients index',
			'select id, display_name, company_name, status from public.clients order by created_at desc limit 25'
		],
		[
			'Quotes index',
			'select id, quote_number, status, total from public.quotes order by created_at desc limit 25'
		],
		[
			'Tasks index',
			"select * from public.task_work_queue where status = 'open' order by due_at asc nulls last, created_at desc limit 50"
		],
		[
			'Activity detail',
			'select id, event_type, summary from public.activities order by occurred_at desc limit 100'
		],
		['Dashboard aggregate', 'select public.dashboard_sales_kpis(current_date - 29, current_date)']
	];
	for (const [label, query] of queries) {
		const executionTime = explainExecutionTime(query);
		assert(executionTime < 250, `${label} exceeded 250 ms: ${executionTime} ms`);
	}
	console.log('P11-T09 performance budget passed (<250ms representative local plans)');
}

runStaticGates();
runPerformanceGate();

try {
	await runRealtimeGates();
} finally {
	for (const user of users) {
		await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }, serviceRoleKey).catch(
			() => {}
		);
	}
}

console.log('P11 focused hardening tests passed (T01–T09; T07/T08 browser gates run by test:e2e)');
process.exit(0);
