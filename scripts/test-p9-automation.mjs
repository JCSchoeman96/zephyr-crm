import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';

const root = process.cwd();
const runId = `${Date.now()}`;
const prefix = `p9-${runId}`;
const appUrl = 'http://127.0.0.1:4181';
const providerUrl = 'http://127.0.0.1:4182';
const cronSecret = `p9-cron-${runId}`;
const users = [];
const leadIds = [];
let app;
let provider;
let providerMode = 'success';
let providerSendCount = 0;

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...options
	}).trim();
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
const dbUrl = local.DB_URL;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function parseBody(response) {
	const body = await response.text();
	if (!body) return null;
	try {
		return JSON.parse(body);
	} catch {
		return body;
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
		`${name} failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

async function createUser(label, role) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P9-${runId}-${label}-Password9!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P9 ${label}` }
			})
		},
		serviceRoleKey
	);
	assert(created.response.ok && created.body?.id, `Could not create P9 ${label} user`);
	const user = { id: created.body.id, email, password, token: null };
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
	assert(result.response.ok && result.body?.access_token, `Could not sign in ${user.email}`);
	user.token = result.body.access_token;
	return user.token;
}

async function serviceRows(path) {
	const authenticatedUser = users[0];
	assert(authenticatedUser, 'An authenticated fixture user is required for protected reads');
	const result = await request(path, {}, anonKey, await signIn(authenticatedUser));
	assert(
		result.response.ok,
		`Service query failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

async function createLead(label, user = null) {
	const result = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p9-form',
			p_external_submission_id: `${prefix}-${label}`,
			p_payload: {
				first_name: `P9 ${label}`,
				last_name: 'Fixture',
				email: `${prefix}-${label}@example.test`,
				phone: '+27110000000',
				company: `P9 ${label} Company`,
				message: 'P9 automation fixture'
			}
		},
		serviceRoleKey
	);
	assert(result.lead_id, `Could not create Lead ${label}`);
	leadIds.push(result.lead_id);
	if (user) {
		const lead = await leadById(result.lead_id);
		await mustRpc(
			'assign_lead',
			{ p_lead_id: lead.id, p_assigned_to: user.id, p_lock_version: lead.lock_version },
			anonKey,
			await signIn(user)
		);
	}
	return { id: result.lead_id };
}

async function leadById(id) {
	const rows = await serviceRows(`/rest/v1/leads?id=eq.${id}&select=*`);
	assert(rows.length === 1, `Lead ${id} not found`);
	return rows[0];
}

async function reachDecision(lead, user) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await leadById(lead.id);
		await mustRpc(
			'transition_lead',
			{ p_lead_id: lead.id, p_to_stage: stage, p_lock_version: current.lock_version },
			anonKey,
			await signIn(user)
		);
	}
}

async function createReadyQuote(lead, user, label, validUntil = '2099-12-31') {
	const token = await signIn(user);
	const saved = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.id,
			p_client_id: null,
			p_subject: `${prefix} ${label} quote`,
			p_introduction: 'P9 fixture',
			p_terms: 'P9 terms',
			p_tax_label: 'VAT',
			p_tax_rate: '15.0000',
			p_valid_until: validUntil,
			p_currency: 'ZAR',
			p_items: [
				{ name: 'Automation service', quantity: '1.0000', unit_price: '100.00', taxable: true }
			]
		},
		anonKey,
		token
	);
	await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: saved.quote_id, p_lock_version: saved.lock_version },
		anonKey,
		token
	);
	return saved.quote_id;
}

async function sendQuote(quoteId, user) {
	const quoteRows = await serviceRows(`/rest/v1/quotes?id=eq.${quoteId}&select=*`);
	const prepared = await mustRpc(
		'prepare_quote_send',
		{ p_quote_id: quoteId, p_lock_version: quoteRows[0].lock_version },
		anonKey,
		await signIn(user)
	);
	return mustRpc(
		'complete_quote_send',
		{
			p_outbound_message_id: prepared.outbound_message_id,
			p_provider_message_id: `${prefix}-quote-provider-${quoteId}`
		},
		anonKey,
		await signIn(user)
	);
}

async function createTask(lead, user, label, dueAt) {
	const result = await mustRpc(
		'create_task',
		{
			p_lead_id: lead.id,
			p_type: 'custom',
			p_title: `P9 ${label}`,
			p_due_at: dueAt,
			p_assigned_to: user.id
		},
		anonKey,
		await signIn(user)
	);
	const rows = await serviceRows(`/rest/v1/tasks?id=eq.${result.task_id}&select=*`);
	assert(rows.length === 1, `Task ${result.task_id} not found`);
	return rows[0];
}

async function taskById(id) {
	const rows = await serviceRows(`/rest/v1/tasks?id=eq.${id}&select=*`);
	assert(rows.length === 1, `Task ${id} not found`);
	return rows[0];
}

async function queueTaskById(id) {
	const rows = await serviceRows(`/rest/v1/task_work_queue?id=eq.${id}&select=*`);
	assert(rows.length === 1, `Queue Task ${id} not found`);
	return rows[0];
}

async function taskActivities(id) {
	return serviceRows(
		`/rest/v1/activities?task_id=eq.${id}&select=event_type&order=occurred_at.asc`
	);
}

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function sql(query) {
	return run('psql', [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function startProvider() {
	provider = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		if (request.url === '/oauth/access_token') {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ access_token: `${prefix}-provider-token` }));
			return;
		}
		if (request.url === '/smtp/emails') {
			providerSendCount += 1;
			if (providerMode === 'failure') {
				response.writeHead(502, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ result: false, error: 'P9 deterministic provider failure' }));
				return;
			}
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(
				JSON.stringify({ result: true, id: `${prefix}-reminder-provider-${providerSendCount}` })
			);
			return;
		}
		response.writeHead(404);
		response.end();
	});
	return new Promise((resolve) => provider.listen(4182, '127.0.0.1', resolve));
}

async function waitFor(url) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// The local app is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function startApp() {
	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4181'], {
		cwd: root,
		stdio: 'ignore',
		env: {
			...process.env,
			NO_COLOR: '1',
			PUBLIC_SUPABASE_URL: apiUrl,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
			PUBLIC_SITE_URL: appUrl,
			SUPABASE_URL: apiUrl,
			SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
			AUTOMATION_CRON_SECRET: cronSecret,
			SENDPULSE_CLIENT_ID: 'p9-client',
			SENDPULSE_CLIENT_SECRET: 'p9-secret',
			SENDPULSE_API_BASE_URL: providerUrl,
			SENDPULSE_SENDER_EMAIL: 'sales@example.test',
			SENDPULSE_SENDER_NAME: 'Zephyr P9'
		}
	});
	await waitFor(`${appUrl}/login`);
}

async function runScheduler(runIdOverride = crypto.randomUUID()) {
	const runIdValue =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runIdOverride)
			? runIdOverride
			: crypto.randomUUID();
	const response = await fetch(`${appUrl}/api/automation/process-reminders`, {
		method: 'POST',
		headers: { authorization: `Bearer ${cronSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify({ run_id: runIdValue, limit: 50 })
	});
	return { response, body: await parseBody(response) };
}

async function cleanup() {
	try {
		sql(
			`delete from public.quotes where lead_id in (select id from public.leads where external_submission_id like ${sqlLiteral(`${prefix}-%`)}); delete from public.leads where external_submission_id like ${sqlLiteral(`${prefix}-%`)}; delete from public.inbound_submissions where external_submission_id like ${sqlLiteral(`${prefix}-%`)};`
		);
	} catch {
		// The next disposable local reset remains the recovery path for interrupted runs.
	}
	for (const user of users) {
		await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }, serviceRoleKey).catch(
			() => {}
		);
	}
}

let passed = 0;
try {
	assert(apiUrl && anonKey && serviceRoleKey && dbUrl, 'Local Supabase status is incomplete');
	const sales = await createUser('sales', 'sales');
	const viewer = await createUser('viewer', 'viewer');

	const quoteLead = await createLead('follow-up', sales);
	await reachDecision(quoteLead, sales);
	const quoteId = await createReadyQuote(quoteLead, sales, 'follow-up');
	const sent = await sendQuote(quoteId, sales);
	const followUps = await serviceRows(
		`/rest/v1/tasks?quote_id=eq.${quoteId}&type=eq.follow_up&select=*`
	);
	assert(
		followUps.length === 1 && followUps[0].automation_key === `quote-follow-up:${quoteId}`,
		'Quote send did not create exactly one configured follow-up Task'
	);
	assert(String(sent.task_id) === followUps[0].id, 'Quote send returned the wrong follow-up Task');
	console.log('P9-T01 quote follow-up passed');
	passed += 1;

	const overdueLead = await createLead('derived-overdue', sales);
	const oldDue = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	let task = await createTask(overdueLead, sales, 'derived overdue', oldDue);
	let queueTask = await queueTaskById(task.id);
	assert(
		queueTask.is_overdue === true && queueTask.status === 'open',
		'Open past-due Task was not derived as overdue'
	);
	const beforePipeline = (await leadById(overdueLead.id)).pipeline_stage;
	await mustRpc(
		'complete_task',
		{ p_task_id: task.id, p_lock_version: task.lock_version },
		anonKey,
		await signIn(sales)
	);
	queueTask = await queueTaskById(task.id);
	assert(
		queueTask.status === 'completed' && queueTask.is_overdue === false,
		'Completed Task retained derived overdue state'
	);
	assert(
		(await leadById(overdueLead.id)).pipeline_stage === beforePipeline,
		'Completing a Task changed Lead pipeline'
	);
	task = await createTask(overdueLead, sales, 'reschedule overdue', oldDue);
	await mustRpc(
		'reschedule_task',
		{
			p_task_id: task.id,
			p_lock_version: task.lock_version,
			p_due_at: new Date(Date.now() + 86400000).toISOString()
		},
		anonKey,
		await signIn(sales)
	);
	queueTask = await queueTaskById(task.id);
	assert(queueTask.is_overdue === false, 'Rescheduled Task retained derived overdue state');
	assert(
		(await taskActivities(task.id)).some((activity) => activity.event_type === 'task_rescheduled'),
		'Reschedule Activity was not recorded'
	);
	console.log('P9-T02 derived overdue passed');
	passed += 1;

	await startProvider();
	await startApp();
	const schedulerLead = await createLead('scheduler', sales);
	const dueTask = await createTask(schedulerLead, sales, 'scheduler happy path', oldDue);
	const beforeProviderCount = providerSendCount;
	const happy = await runScheduler(`${prefix}-happy`);
	assert(happy.response.ok, `Scheduler happy path failed: ${JSON.stringify(happy.body)}`);
	assert(
		happy.body?.outcomes?.some(
			(outcome) => outcome.task_id === dueTask.id && outcome.status === 'sent'
		),
		'Scheduler did not process due Task'
	);
	let processedTask = await taskById(dueTask.id);
	assert(
		processedTask.reminder_status === 'sent' && providerSendCount === beforeProviderCount + 1,
		'Scheduler did not persist one reminder submission'
	);
	console.log('P9-T03 Cron happy path passed');
	passed += 1;

	const overlapLead = await createLead('overlap', sales);
	const overlapTask = await createTask(overlapLead, sales, 'overlapping processor', oldDue);
	const overlapBefore = providerSendCount;
	const overlapRuns = await Promise.all([
		runScheduler(`${prefix}-overlap-a`),
		runScheduler(`${prefix}-overlap-b`)
	]);
	assert(
		overlapRuns.every((run) => run.response.ok),
		'Overlapping scheduler runs failed'
	);
	assert(
		providerSendCount === overlapBefore + 1,
		'Overlapping processors sent duplicate reminders'
	);
	const overlapMessages = await serviceRows(
		`/rest/v1/outbound_messages?task_id=eq.${overlapTask.id}&purpose=eq.task_reminder&select=*`
	);
	assert(overlapMessages.length === 1, 'Overlapping processors created duplicate reminder intents');
	console.log('P9-T04 overlapping processors passed');
	passed += 1;

	const retryLead = await createLead('retry', sales);
	const retryTask = await createTask(retryLead, sales, 'retry provider failure', oldDue);
	providerMode = 'failure';
	const failedRun = await runScheduler(`${prefix}-retry-a`);
	assert(failedRun.response.ok, 'Provider failure scheduler run did not return a durable failure');
	let retryState = await taskById(retryTask.id);
	assert(
		retryState.reminder_status === 'failed',
		'Provider failure did not mark Task reminder failed'
	);
	let retryMessages = await serviceRows(
		`/rest/v1/outbound_messages?task_id=eq.${retryTask.id}&purpose=eq.task_reminder&select=*`
	);
	assert(
		retryMessages.length === 1 && retryMessages[0].delivery_status === 'failed',
		'Provider failure did not preserve one failed OutboundMessage'
	);
	providerMode = 'success';
	const retryRun = await runScheduler(`${prefix}-retry-b`);
	assert(retryRun.response.ok, 'Provider retry scheduler run failed');
	retryState = await taskById(retryTask.id);
	retryMessages = await serviceRows(
		`/rest/v1/outbound_messages?task_id=eq.${retryTask.id}&purpose=eq.task_reminder&select=*`
	);
	assert(
		retryState.reminder_status === 'sent' &&
			retryMessages.length === 1 &&
			retryMessages[0].attempt_count === 2,
		'Provider retry did not reuse one OutboundMessage safely'
	);
	console.log('P9-T05 retry safety passed');
	passed += 1;

	const staleLead = await createLead('stale', sales);
	const freshLead = await createLead('fresh', sales);
	await reachDecision(staleLead, sales);
	sql(
		`update public.leads set created_at = now() - interval '30 days', last_activity_at = now() - interval '30 days', lock_version = lock_version + 1 where id = ${sqlLiteral(staleLead.id)}::uuid; update public.leads set created_at = now(), last_activity_at = now(), lock_version = lock_version + 1 where id = ${sqlLiteral(freshLead.id)}::uuid;`
	);
	await runScheduler(`${prefix}-aging`);
	const staleTasks = (
		await serviceRows(`/rest/v1/tasks?lead_id=eq.${staleLead.id}&select=automation_key`)
	).filter((task) => task.automation_key?.startsWith('stale-opportunity:'));
	const freshTasks = (
		await serviceRows(`/rest/v1/tasks?lead_id=eq.${freshLead.id}&select=automation_key`)
	).filter((task) => task.automation_key?.startsWith('stale-opportunity:'));
	assert(
		staleTasks.length === 1 && freshTasks.length === 0,
		'Stale opportunity rule selected the wrong Leads'
	);
	console.log('P9-T06 stale opportunity rule passed');
	passed += 1;

	const quoteStatuses = {};
	const expiryDate = new Date().toISOString().slice(0, 10);
	for (const [label, terminal] of [
		['eligible', null],
		['accepted', 'accept_quote'],
		['declined', 'decline_quote'],
		['cancelled', 'cancel_quote'],
		['superseded', 'supersede_quote']
	]) {
		const lead = await createLead(`expiry-${label}`, sales);
		await reachDecision(lead, sales);
		const id = await createReadyQuote(lead, sales, `expiry-${label}`, expiryDate);
		await sendQuote(id, sales);
		if (terminal) {
			const current = (await serviceRows(`/rest/v1/quotes?id=eq.${id}&select=lock_version`))[0];
			await mustRpc(
				terminal,
				{ p_quote_id: id, p_lock_version: current.lock_version },
				anonKey,
				await signIn(sales)
			);
		}
		quoteStatuses[label] = id;
	}
	await runScheduler(`${prefix}-expiry`);
	const eligibleQuote = (
		await serviceRows(`/rest/v1/quotes?id=eq.${quoteStatuses.eligible}&select=status`)
	)[0];
	assert(eligibleQuote.status === 'expired', 'Eligible sent Quote did not expire');
	for (const label of ['accepted', 'declined', 'cancelled', 'superseded']) {
		const row = (
			await serviceRows(`/rest/v1/quotes?id=eq.${quoteStatuses[label]}&select=status`)
		)[0];
		assert(row.status === label, `${label} Quote was incorrectly expired`);
	}
	console.log('P9-T07 quote expiry rule passed');
	passed += 1;

	const wonLead = await createLead('won-cleanup', sales);
	await reachDecision(wonLead, sales);
	const wonTask = await createTask(
		wonLead,
		sales,
		'won obsolete task',
		new Date(Date.now() + 86400000).toISOString()
	);
	const wonBefore = await leadById(wonLead.id);
	await mustRpc(
		'convert_lead',
		{ p_lead_id: wonLead.id, p_lock_version: wonBefore.lock_version },
		anonKey,
		await signIn(sales)
	);
	assert(
		(await taskById(wonTask.id)).status === 'cancelled',
		'Won transition did not cancel obsolete Task'
	);
	assert(
		(await taskActivities(wonTask.id)).filter(
			(activity) => activity.event_type === 'task_cancelled'
		).length === 1,
		'Won cleanup duplicated cancellation Activity'
	);
	const lostLead = await createLead('lost-cleanup', sales);
	const lostTask = await createTask(
		lostLead,
		sales,
		'lost obsolete task',
		new Date(Date.now() + 86400000).toISOString()
	);
	const lostBefore = await leadById(lostLead.id);
	const reasons = await serviceRows('/rest/v1/lost_reasons?code=eq.price&select=id');
	await mustRpc(
		'transition_lead',
		{
			p_lead_id: lostLead.id,
			p_to_stage: 'LOST',
			p_lock_version: lostBefore.lock_version,
			p_lost_reason_id: reasons[0].id,
			p_lost_notes: null
		},
		anonKey,
		await signIn(sales)
	);
	assert(
		(await taskById(lostTask.id)).status === 'cancelled',
		'Lost transition did not cancel obsolete Task'
	);
	assert(
		(await taskActivities(lostTask.id)).filter(
			(activity) => activity.event_type === 'task_cancelled'
		).length === 1,
		'Lost cleanup duplicated cancellation Activity'
	);
	console.log('P9-T08 Won/Lost cleanup passed');
	passed += 1;

	const permissionLead = await createLead('permissions', sales);
	const permissionTask = await createTask(
		permissionLead,
		sales,
		'permission task',
		new Date(Date.now() + 86400000).toISOString()
	);
	const viewerAttempt = await rpc(
		'complete_task',
		{ p_task_id: permissionTask.id, p_lock_version: permissionTask.lock_version },
		anonKey,
		await signIn(viewer)
	);
	assert(!viewerAttempt.response.ok, 'Viewer was allowed to mutate a Task');
	await mustRpc(
		'complete_task',
		{ p_task_id: permissionTask.id, p_lock_version: permissionTask.lock_version },
		anonKey,
		await signIn(sales)
	);
	assert(
		(await taskById(permissionTask.id)).status === 'completed',
		'Permitted staff could not complete assigned Task'
	);
	console.log('P9-T09 Task permissions passed');
	passed += 1;
} finally {
	if (app) app.kill('SIGTERM');
	if (provider) await new Promise((resolve) => provider.close(resolve));
	await cleanup();
}

assert(passed === 9, `Expected 9 focused P9 tests, received ${passed}`);
console.log(
	`P9 focused automation tests passed (${passed} tests; P9-T10 is the project quality gate)`
);
