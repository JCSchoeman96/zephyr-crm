import { execFileSync, spawn } from 'node:child_process';

const root = process.cwd();
const runId = `${Date.now()}`;
const prefix = `p6-${runId}`;
const appUrl = 'http://127.0.0.1:4178';
let app;
let cookie = '';
const users = [];
const leadIds = [];

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...options
	}).trim();
}

function statusEnv() {
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

const local = statusEnv();
const apiUrl = local.API_URL;
const anonKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const serviceRoleKey = local.SERVICE_ROLE_KEY;
const dbUrl = local.DB_URL;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function sql(query) {
	return run('psql', [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

async function parseBody(response) {
	const text = await response.text();
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
	return { response, body: await parseBody(response) };
}

async function rpc(name, args, key = anonKey, token = null) {
	return request(
		`/rest/v1/rpc/${name}`,
		{ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) },
		key,
		token
	);
}

async function mustRpc(name, args, key = anonKey, token = null) {
	const result = await rpc(name, args, key, token);
	assert(
		result.response.ok,
		`RPC ${name} failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

async function expectRpcFailure(name, args, key, token, label) {
	const result = await rpc(name, args, key, token);
	assert(!result.response.ok, `${label} unexpectedly succeeded`);
	return result.body;
}

async function createUser(role, label) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P6-${runId}-${label}-Password9!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P6 ${label}` }
			})
		},
		serviceRoleKey
	);
	assert(created.response.ok && created.body?.id, `Could not create P6 ${label} user`);
	const user = { id: created.body.id, email, password, role, label, token: null };
	await mustRpc(
		'provision_invited_profile',
		{ p_user_id: user.id, p_role: role, p_status: 'active' },
		serviceRoleKey
	);
	users.push(user);
	return user;
}

async function signIn(user) {
	if (user.token) return user.token;
	const result = await request(
		'/auth/v1/token?grant_type=password',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: user.email, password: user.password })
		},
		anonKey
	);
	assert(result.response.ok && result.body?.access_token, `Could not sign in P6 ${user.label}`);
	user.token = result.body.access_token;
	return user.token;
}

async function rest(path, init = {}, user = users[0]) {
	const result = await request(path, init, anonKey, user ? await signIn(user) : null);
	assert(
		result.response.ok,
		`REST ${init.method ?? 'GET'} ${path} failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

async function leadById(id, user) {
	const rows = await rest(`/rest/v1/leads?id=eq.${id}&select=*`, {}, user);
	assert(rows.length === 1, `Lead ${id} was not found`);
	return rows[0];
}

async function activitiesForLead(id, user) {
	return rest(`/rest/v1/activities?lead_id=eq.${id}&select=*&order=occurred_at.asc`, {}, user);
}

async function createLead(label, user, overrides = {}) {
	const externalId = `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
	const payload = {
		first_name: `P6 ${label}`,
		last_name: 'Lead',
		email: `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}@example.test`,
		message: `P6 test lead ${label}`,
		...overrides
	};
	const result = await mustRpc(
		'ingest_bricks_lead',
		{ p_form_id: 'contact-form', p_external_submission_id: externalId, p_payload: payload },
		serviceRoleKey
	);
	assert(result.duplicate === false && result.lead_id, `Could not create ${label} test Lead`);
	leadIds.push(result.lead_id);
	return { id: result.lead_id, externalId, payload, user };
}

async function transition(lead, toStage, user) {
	const current = await leadById(lead.id, user);
	return mustRpc(
		'transition_lead',
		{ p_lead_id: lead.id, p_to_stage: toStage, p_lock_version: current.lock_version },
		anonKey,
		await signIn(user)
	);
}

async function reachDecision(lead, user) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION'])
		await transition(lead, stage, user);
}

async function convert(lead, user) {
	const current = await leadById(lead.id, user);
	return mustRpc(
		'convert_lead',
		{ p_lead_id: lead.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(user)
	);
}

async function addHistoryAndTask(lead, user) {
	const note = await mustRpc(
		'add_activity_note',
		{
			p_lead_id: lead.id,
			p_summary: 'P6 historical activity',
			p_metadata: { test: 'p6-history' }
		},
		anonKey,
		await signIn(user)
	);
	assert(note.activity_id, 'Trusted activity note action did not return an Activity');
	const created = await mustRpc(
		'create_task',
		{
			p_lead_id: lead.id,
			p_type: 'follow_up',
			p_title: 'P6 open conversion task'
		},
		anonKey,
		await signIn(user)
	);
	assert(created.task_id, 'Could not create conversion task fixture');
	return created.task_id;
}

async function createFailureTrigger() {
	sql(`
		create or replace function private.p6_abort_after_lead_won()
		returns trigger
		language plpgsql
		set search_path = pg_catalog, public
		as $$
		begin
			if new.event_type = 'lead_won' then
				raise exception using errcode = 'P0001', message = 'P6 forced conversion failure';
			end if;
			return new;
		end;
		$$;
		drop trigger if exists p6_abort_conversion on public.activities;
		create trigger p6_abort_conversion
		after insert on public.activities
		for each row execute function private.p6_abort_after_lead_won();
	`);
}

function dropFailureTrigger() {
	try {
		sql(
			'drop trigger if exists p6_abort_conversion on public.activities; drop function if exists private.p6_abort_after_lead_won();'
		);
	} catch {
		// Best-effort cleanup is repeated from the final cleanup path.
	}
}

async function waitFor(url) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The local SvelteKit process is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function startApp() {
	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4178'], {
		cwd: root,
		stdio: 'ignore',
		env: {
			...process.env,
			NO_COLOR: '1',
			PUBLIC_SUPABASE_URL: apiUrl,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
			PUBLIC_SITE_URL: appUrl,
			SUPABASE_URL: apiUrl,
			SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
		}
	});
	await waitFor(`${appUrl}/login`);
}

async function stopApp() {
	if (!app) return;
	app.kill('SIGTERM');
	app = null;
}

async function loginApp(user) {
	const response = await fetch(`${appUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email: user.email, password: user.password })
	});
	assert(response.status === 303, `P6 app login failed (${response.status})`);
	const cookies =
		typeof response.headers.getSetCookie === 'function'
			? response.headers.getSetCookie()
			: [response.headers.get('set-cookie') ?? ''];
	cookie = cookies
		.map((value) => value.split(';', 1)[0])
		.filter(Boolean)
		.join('; ');
	assert(cookie, 'P6 app login did not return a session cookie');
}

async function appPage(path) {
	const response = await fetch(`${appUrl}${path}`, { headers: { cookie } });
	const body = await response.text();
	assert(response.ok, `P6 app page ${path} failed (${response.status})`);
	return body
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

async function testIndividualConversion(sales) {
	const lead = await createLead('individual', sales, {
		first_name: 'Grace',
		last_name: 'Hopper',
		phone: '+27110000001'
	});
	await reachDecision(lead, sales);
	await addHistoryAndTask(lead, sales);
	const result = await convert(lead, sales);
	assert(
		result.idempotent === false && result.client_id && result.contact_id,
		'Individual conversion did not return Client/contact'
	);
	const clients = await rest(`/rest/v1/clients?id=eq.${result.client_id}&select=*`, {}, sales);
	const contacts = await rest(
		`/rest/v1/client_contacts?client_id=eq.${result.client_id}&select=*`,
		{},
		sales
	);
	assert(
		clients.length === 1 && clients[0].type === 'individual',
		'Individual conversion created the wrong Client type'
	);
	assert(clients[0].company_name === null, 'Individual Client unexpectedly has a company name');
	assert(
		contacts.length === 1 && contacts[0].is_primary,
		'Individual conversion did not create one primary contact'
	);
	assert(
		contacts[0].first_name === 'Grace' && contacts[0].last_name === 'Hopper',
		'Individual contact data was not copied'
	);
	console.log('P6-T01 individual conversion passed');
	return { lead, result, client: clients[0] };
}

async function testCompanyConversion(sales) {
	const lead = await createLead('company', sales, {
		first_name: 'Katherine',
		last_name: 'Johnson',
		company: 'Orbital Works',
		email: `${prefix}-company@example.test`
	});
	await reachDecision(lead, sales);
	const result = await convert(lead, sales);
	const clients = await rest(`/rest/v1/clients?id=eq.${result.client_id}&select=*`, {}, sales);
	const contacts = await rest(
		`/rest/v1/client_contacts?client_id=eq.${result.client_id}&select=*`,
		{},
		sales
	);
	assert(
		clients.length === 1 && clients[0].type === 'company',
		'Company conversion created the wrong Client type'
	);
	assert(clients[0].company_name === 'Orbital Works', 'Company name was not copied');
	assert(
		contacts.length === 1 && contacts[0].is_primary,
		'Company conversion did not create a primary contact'
	);
	console.log('P6-T02 company conversion passed');
	return { lead, result, client: clients[0] };
}

async function testRetry(company, sales) {
	const first = await convert(company.lead, sales);
	const second = await convert(company.lead, sales);
	const clients = await rest(
		`/rest/v1/clients?source_lead_id=eq.${company.lead.id}&select=id`,
		{},
		sales
	);
	const contacts = await rest(
		`/rest/v1/client_contacts?client_id=eq.${company.result.client_id}&select=id`,
		{},
		sales
	);
	assert(
		first.client_id === company.result.client_id && second.client_id === first.client_id,
		'Retry did not reuse the original Client'
	);
	assert(second.idempotent === true, 'Repeated conversion did not report idempotent result');
	assert(
		clients.length === 1 && contacts.length === 1,
		'Retry created duplicate Client/contact rows'
	);
	console.log('P6-T03 conversion retry passed');
}

async function testAtomicRollback(sales) {
	const lead = await createLead('rollback', sales, {
		first_name: 'Rollback',
		last_name: 'Fixture'
	});
	await reachDecision(lead, sales);
	const taskId = await addHistoryAndTask(lead, sales);
	const before = await leadById(lead.id, sales);
	const beforeActivities = await activitiesForLead(lead.id, sales);
	await createFailureTrigger();
	try {
		await expectRpcFailure(
			'convert_lead',
			{ p_lead_id: lead.id, p_lock_version: before.lock_version },
			anonKey,
			await signIn(sales),
			'forced mid-conversion failure'
		);
	} finally {
		dropFailureTrigger();
	}
	const after = await leadById(lead.id, sales);
	const clients = await rest(`/rest/v1/clients?source_lead_id=eq.${lead.id}&select=id`, {}, sales);
	const contacts = await rest(
		'/rest/v1/client_contacts?select=id&first_name=eq.Rollback',
		{},
		sales
	);
	const tasks = await rest(`/rest/v1/tasks?id=eq.${taskId}&select=status`, {}, sales);
	const afterActivities = await activitiesForLead(lead.id, sales);
	assert(
		after.pipeline_stage === 'DECISION' && after.converted_client_id === null,
		'Rollback changed Lead conversion state'
	);
	assert(after.lock_version === before.lock_version, 'Rollback changed Lead lock_version');
	assert(clients.length === 0 && contacts.length === 0, 'Rollback left Client/contact rows behind');
	assert(tasks.length === 1 && tasks[0].status === 'open', 'Rollback did not restore open Tasks');
	assert(afterActivities.length === beforeActivities.length, 'Rollback left Activity rows behind');
	console.log('P6-T04 atomic rollback passed');
}

async function testPrimaryInvariant(company, sales) {
	const extra = await mustRpc(
		'create_client_contact',
		{
			p_client_id: company.result.client_id,
			p_first_name: 'Additional',
			p_last_name: 'Contact',
			p_is_primary: false
		},
		anonKey,
		await signIn(sales)
	);
	assert(extra.contact_id, 'Could not create an additional non-primary contact');
	const duplicate = await request(
		'/rest/v1/client_contacts',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_id: company.result.client_id,
				first_name: 'Conflicting',
				last_name: 'Primary',
				is_primary: true
			})
		},
		anonKey,
		await signIn(sales)
	);
	assert(!duplicate.response.ok, 'A second primary contact was accepted');
	await mustRpc(
		'set_primary_client_contact',
		{ p_contact_id: extra.contact_id, p_lock_version: extra.lock_version },
		anonKey,
		await signIn(sales)
	);
	const contacts = await rest(
		`/rest/v1/client_contacts?client_id=eq.${company.result.client_id}&select=is_primary`,
		{},
		sales
	);
	assert(
		contacts.length === 2 && contacts.filter((contact) => contact.is_primary).length === 1,
		'Primary contact invariant is not enforced'
	);
	console.log('P6-T05 primary contact invariant passed');
}

async function testUnauthorizedConversion(sales, viewer) {
	const lead = await createLead('unauthorized', sales);
	await reachDecision(lead, sales);
	const current = await leadById(lead.id, sales);
	await expectRpcFailure(
		'convert_lead',
		{ p_lead_id: lead.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(viewer),
		'Viewer conversion'
	);
	const unchanged = await leadById(lead.id, sales);
	assert(
		unchanged.pipeline_stage === 'DECISION' && unchanged.converted_client_id === null,
		'Unauthorized conversion changed the Lead'
	);
	console.log('P6-T06 unauthorized conversion passed');
}

async function testHistoricalPreservation(individual, sales) {
	const leadActivities = await activitiesForLead(individual.lead.id, sales);
	const clientActivities = await rest(
		`/rest/v1/activities?client_id=eq.${individual.result.client_id}&select=*`,
		{},
		sales
	);
	assert(
		leadActivities.some((activity) => activity.event_type === 'note_added'),
		'Original Lead Activity was not preserved'
	);
	assert(
		leadActivities.some((activity) => activity.event_type === 'lead_won'),
		'Lead won Activity is missing'
	);
	assert(
		clientActivities.some((activity) => activity.event_type === 'client_created'),
		'Client-created Activity is missing'
	);
	const lead = await leadById(individual.lead.id, sales);
	assert(
		lead.converted_client_id === individual.result.client_id,
		'Client does not link back to original Lead'
	);
	console.log('P6-T07 historical preservation passed');
}

async function testNoEmailOnlyDedupe(sales) {
	const email = `${prefix}-shared@example.test`;
	const first = await createLead('shared-one', sales, {
		first_name: 'Shared',
		last_name: 'One',
		email
	});
	const second = await createLead('shared-two', sales, {
		first_name: 'Shared',
		last_name: 'Two',
		email
	});
	await reachDecision(first, sales);
	await reachDecision(second, sales);
	const firstResult = await convert(first, sales);
	const secondResult = await convert(second, sales);
	assert(firstResult.client_id !== secondResult.client_id, 'Distinct same-email Leads were merged');
	const clients = await rest(
		`/rest/v1/clients?id=in.(${firstResult.client_id},${secondResult.client_id})&select=id,source_lead_id`,
		{},
		sales
	);
	assert(clients.length === 2, 'Same-email conversion did not create two Clients');
	console.log('P6-T08 no email-only dedupe passed');
}

async function testClientUi(individual, company, sales) {
	await startApp();
	await loginApp(sales);
	const list = await appPage('/clients');
	assert(
		list.includes('Grace Hopper') && list.includes('Orbital Works'),
		'Client list does not render converted Clients'
	);
	assert(
		list.includes('Source enquiry'),
		'Client list does not expose source enquiry history links'
	);
	const detail = await appPage(`/clients/${individual.result.client_id}`);
	assert(
		detail.includes('Grace Hopper') && detail.includes('P6 historical activity'),
		'Client detail does not render identity/history'
	);
	assert(
		detail.includes('Primary') && detail.includes('Source enquiry'),
		'Client detail does not render contact/source evidence'
	);
}

async function cleanup() {
	await stopApp();
	dropFailureTrigger();
	try {
		if (dbUrl) {
			sql(`
				delete from public.clients
				where source_lead_id in (select id from public.leads where external_submission_id like '${prefix}-%');
				delete from public.inbound_submissions
				where source = 'bricks' and external_submission_id like '${prefix}-%';
				delete from public.leads
				where external_submission_id like '${prefix}-%';
			`);
		}
	} catch {
		// Namespaced local fixtures are safe to leave for a subsequent reset.
	}
	for (const user of users) {
		await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }, serviceRoleKey).catch(
			() => {}
		);
	}
}

async function main() {
	assert(apiUrl && anonKey && serviceRoleKey && dbUrl, 'Local Supabase status is incomplete');
	const sales = await createUser('sales', 'sales');
	const viewer = await createUser('viewer', 'viewer');
	const individual = await testIndividualConversion(sales);
	const company = await testCompanyConversion(sales);
	await testRetry(company, sales);
	await testAtomicRollback(sales);
	await testPrimaryInvariant(company, sales);
	await testUnauthorizedConversion(sales, viewer);
	await testHistoricalPreservation(individual, sales);
	await testNoEmailOnlyDedupe(sales);
	await testClientUi(individual, company, sales);
	console.log('P6-T09 project quality gate delegated to bun run quality');
	console.log(
		'P6 Client/contact contract passed: conversion, rollback, primary semantics, authorization, history, dedupe and UI verified.'
	);
}

try {
	await main();
} finally {
	await cleanup();
}
