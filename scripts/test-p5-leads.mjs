import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';

const root = process.cwd();
const runId = `${Date.now()}`;
const appUrl = 'http://127.0.0.1:4177';
const bricksSecret = `p5-bricks-secret-${runId}`;
const prefix = `p5-${runId}`;
const planPrefix = `${prefix}-plan`;
let app;
let cookie = '';
const users = [];

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
const jwtSecret = local.JWT_SECRET;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function aal2Token(userId) {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
		aud: 'authenticated',
		role: 'authenticated',
		sub: userId,
		aal: 'aal2',
		session_id: `p5-${runId}-${userId}`,
		iat: now,
		exp: now + 600
	})}`;
	return `${unsigned}.${createHmac('sha256', jwtSecret).update(unsigned).digest('base64url')}`;
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
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(args)
		},
		key,
		token
	);
}

async function mustRpc(name, args, key = anonKey, token = null) {
	const result = await rpc(name, args, key, token);
	if (!result.response.ok)
		throw new Error(
			`RPC ${name} failed (${result.response.status}): ${JSON.stringify(result.body)}`
		);
	return result.body;
}

async function expectRpcFailure(name, args, key, token, label) {
	const result = await rpc(name, args, key, token);
	assert(!result.response.ok, `${label} unexpectedly succeeded`);
	return result.body;
}

async function rest(path, init = {}, user = users[0]) {
	const token = user ? await signIn(user) : null;
	const result = await request(path, init, anonKey, token);
	if (!result.response.ok)
		throw new Error(
			`REST ${init.method ?? 'GET'} ${path} failed (${result.response.status}): ${JSON.stringify(result.body)}`
		);
	return result.body;
}

async function createUser(role, label) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P5-${runId}-${label}-Password9!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P5 ${label}` }
			})
		},
		serviceRoleKey,
		null
	);
	if (!created.response.ok) throw new Error(`Could not create P5 ${label} user`);
	const user = { id: created.body.id, email, password, role, label, token: null };
	await mustRpc(
		'provision_invited_profile',
		{ p_user_id: user.id, p_role: role, p_status: 'active' },
		serviceRoleKey,
		null
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
		anonKey,
		null
	);
	if (!result.response.ok) throw new Error(`Could not sign in P5 ${user.label}`);
	user.token = result.body.access_token;
	return user.token;
}

async function leadById(id) {
	const rows = await rest(`/rest/v1/leads?id=eq.${id}&select=*`);
	assert(rows.length === 1, `Lead ${id} was not found`);
	return rows[0];
}

async function activitiesForLead(id) {
	return rest(`/rest/v1/activities?lead_id=eq.${id}&select=*&order=occurred_at.desc`);
}

async function createLead(label, overrides = {}) {
	const externalId = `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
	const payload = {
		first_name: `P5 ${label}`,
		last_name: 'Lead',
		email: `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}@example.test`,
		company: `Zephyr ${label}`,
		message: `P5 test lead ${label}`,
		source: 'bricks',
		...overrides
	};
	const result = await mustRpc(
		'ingest_bricks_lead',
		{ p_form_id: 'contact-form', p_external_submission_id: externalId, p_payload: payload },
		serviceRoleKey,
		null
	);
	assert(result.duplicate === false && result.lead_id, `Could not create ${label} test Lead`);
	return { id: result.lead_id, externalId, payload };
}

async function transition(lead, toStage, user, extra = {}) {
	const current = await leadById(lead.id);
	return mustRpc(
		'transition_lead',
		{ p_lead_id: lead.id, p_to_stage: toStage, p_lock_version: current.lock_version, ...extra },
		anonKey,
		await signIn(user)
	);
}

async function reachStage(lead, stage, user) {
	const path = {
		QUALIFICATION: ['QUALIFICATION'],
		PROPOSAL: ['QUALIFICATION', 'PROPOSAL'],
		DECISION: ['QUALIFICATION', 'PROPOSAL', 'DECISION']
	}[stage];
	assert(path, `Unsupported test stage ${stage}`);
	for (const nextStage of path) await transition(lead, nextStage, user);
}

async function setAttention(
	lead,
	state,
	user,
	reason = undefined,
	resumeAt = undefined,
	lock = undefined
) {
	const current = await leadById(lead.id);
	return mustRpc(
		'set_lead_attention',
		{
			p_lead_id: lead.id,
			p_attention_state: state,
			p_reason: reason,
			p_resume_at: resumeAt,
			p_lock_version: lock ?? current.lock_version
		},
		anonKey,
		await signIn(user)
	);
}

async function pauseLead(lead, user, reason, resumeAt) {
	const current = await leadById(lead.id);
	return mustRpc(
		'pause_lead',
		{
			p_lead_id: lead.id,
			p_reason: reason,
			p_resume_at: resumeAt,
			p_lock_version: current.lock_version
		},
		anonKey,
		await signIn(user)
	);
}

async function resumeLead(lead, user) {
	const current = await leadById(lead.id);
	return mustRpc(
		'resume_lead',
		{ p_lead_id: lead.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(user)
	);
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
	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4177'], {
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
			BRICKS_WEBHOOK_SECRET: bricksSecret,
			BRICKS_FORM_ID: 'contact-form'
		}
	});
	await waitFor(`${appUrl}/login`);
}

async function stopApp() {
	if (!app) return;
	app.kill('SIGTERM');
	app = null;
}

async function appRequest(path, init = {}) {
	return fetch(`${appUrl}${path}`, {
		...init,
		headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) }
	});
}

async function appJson(path, init = {}) {
	const response = await appRequest(path, init);
	return { response, body: await parseBody(response) };
}

async function loginApp(user) {
	const response = await fetch(`${appUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email: user.email, password: user.password })
	});
	assert(response.status === 303, `P5 app login failed (${response.status})`);
	const cookies =
		typeof response.headers.getSetCookie === 'function'
			? response.headers.getSetCookie()
			: [response.headers.get('set-cookie') ?? ''];
	cookie = cookies
		.map((value) => value.split(';', 1)[0])
		.filter(Boolean)
		.join('; ');
	assert(cookie, 'P5 app login did not return a session cookie');
}

async function renderedText(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function leadRowCount(html) {
	return (html.match(/<a class="lead-link/g) ?? []).length;
}

async function webhook(payload, bodyOverride = null) {
	return appJson('/api/webhooks/bricks', {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: bodyOverride ?? JSON.stringify(payload)
	});
}

function sql(statement) {
	return run('psql', [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c', statement]);
}

function explain(statement) {
	return sql(`set enable_seqscan = off; explain (costs off) ${statement}`);
}

async function testPipelineMatrix(sales) {
	const matrix = await createLead('matrix');
	await expectRpcFailure(
		'transition_lead',
		{ p_lead_id: matrix.id, p_to_stage: 'PROPOSAL', p_lock_version: 1 },
		anonKey,
		await signIn(sales),
		'NEW to PROPOSAL transition'
	);
	await reachStage(matrix, 'DECISION', sales);
	await transition(matrix, 'PROPOSAL', sales);
	await transition(matrix, 'DECISION', sales);
	const won = await mustRpc(
		'convert_lead',
		{ p_lead_id: matrix.id, p_lock_version: (await leadById(matrix.id)).lock_version },
		anonKey,
		await signIn(sales)
	);
	assert(won.client_id, 'DECISION to WON conversion did not create a Client');
	await expectRpcFailure(
		'transition_lead',
		{
			p_lead_id: matrix.id,
			p_to_stage: 'QUALIFICATION',
			p_lock_version: (await leadById(matrix.id)).lock_version
		},
		anonKey,
		await signIn(sales),
		'WON to QUALIFICATION transition'
	);

	for (const stage of ['NEW', 'QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const lost = await createLead(`matrix-lost-${stage}`);
		if (stage !== 'NEW') await reachStage(lost, stage, sales);
		const current = await leadById(lost.id);
		const reason = (await rest('/rest/v1/lost_reasons?code=eq.price&select=id'))[0];
		const result = await mustRpc(
			'transition_lead',
			{
				p_lead_id: lost.id,
				p_to_stage: 'LOST',
				p_lock_version: current.lock_version,
				p_lost_reason_id: reason.id,
				p_lost_notes: ''
			},
			anonKey,
			await signIn(sales)
		);
		assert(result.pipeline_stage === 'LOST', `Could not transition ${stage} to LOST`);
		await expectRpcFailure(
			'transition_lead',
			{
				p_lead_id: lost.id,
				p_to_stage: 'QUALIFICATION',
				p_lock_version: (await leadById(lost.id)).lock_version
			},
			anonKey,
			await signIn(sales),
			'LOST to QUALIFICATION transition'
		);
	}
	console.log('P5-T01 pipeline transition matrix passed');
}

async function testAttention(sales) {
	const lead = await createLead('attention');
	await reachStage(lead, 'PROPOSAL', sales);
	await setAttention(lead, 'waiting_on_client', sales);
	let current = await leadById(lead.id);
	assert(
		current.pipeline_stage === 'PROPOSAL' && current.attention_state === 'waiting_on_client',
		'Attention changed pipeline position'
	);
	await pauseLead(lead, sales, 'Waiting for budget approval', '2030-01-01T09:00:00Z');
	current = await leadById(lead.id);
	assert(
		current.pipeline_stage === 'PROPOSAL' &&
			current.attention_state === 'waiting_on_client' &&
			current.paused_at &&
			current.pause_reason === 'Waiting for budget approval' &&
			current.resume_at,
		'Pause did not remain orthogonal to pipeline and attention'
	);
	await expectRpcFailure(
		'pause_lead',
		{ p_lead_id: lead.id, p_reason: '', p_lock_version: current.lock_version },
		anonKey,
		await signIn(sales),
		'pause without a reason'
	);
	await setAttention(lead, 'none', sales);
	current = await leadById(lead.id);
	assert(
		current.attention_state === 'none' && current.paused_at && current.pause_reason,
		'Clearing attention incorrectly cleared pause metadata'
	);
	await resumeLead(lead, sales);
	current = await leadById(lead.id);
	assert(
		!current.paused_at && !current.pause_reason && !current.resume_at,
		'Resume did not clear pause facts'
	);
	console.log('P5-T02 attention independence passed');
}

async function testLostAndReopen(sales, owner) {
	const lead = await createLead('reopen');
	const reason = (await rest('/rest/v1/lost_reasons?code=eq.price&select=id'))[0];
	await expectRpcFailure(
		'transition_lead',
		{ p_lead_id: lead.id, p_to_stage: 'LOST', p_lock_version: 1 },
		anonKey,
		await signIn(sales),
		'LOST without a reason'
	);
	const other = (await rest('/rest/v1/lost_reasons?code=eq.other&select=id'))[0];
	await expectRpcFailure(
		'transition_lead',
		{
			p_lead_id: lead.id,
			p_to_stage: 'LOST',
			p_lock_version: 1,
			p_lost_reason_id: other.id,
			p_lost_notes: ''
		},
		anonKey,
		await signIn(sales),
		'LOST with other reason and no notes'
	);
	await mustRpc(
		'transition_lead',
		{
			p_lead_id: lead.id,
			p_to_stage: 'LOST',
			p_lock_version: 1,
			p_lost_reason_id: reason.id,
			p_lost_notes: ''
		},
		anonKey,
		await signIn(sales)
	);
	let current = await leadById(lead.id);
	assert(
		current.pipeline_stage === 'LOST' && current.lost_reason_id === reason.id,
		'Lost metadata did not persist'
	);
	await expectRpcFailure(
		'reopen_lead',
		{ p_lead_id: lead.id, p_lock_version: current.lock_version, p_reason: 'Sales cannot reopen' },
		anonKey,
		await signIn(sales),
		'sales reopen authorization'
	);
	const reopened = await mustRpc(
		'reopen_lead',
		{
			p_lead_id: lead.id,
			p_lock_version: current.lock_version,
			p_reason: 'Customer asked us to revisit the opportunity'
		},
		anonKey,
		aal2Token(owner.id)
	);
	current = await leadById(lead.id);
	assert(
		reopened.pipeline_stage === 'QUALIFICATION',
		'Owner reopen did not return lead to Qualification'
	);
	assert(
		current.pipeline_stage === 'QUALIFICATION' &&
			current.lost_reason_id === null &&
			current.last_activity_at,
		'Reopen did not clear lost metadata'
	);
	const activities = await activitiesForLead(lead.id);
	assert(
		activities.some((activity) => activity.event_type === 'lead_reopened'),
		'Reopen did not append Activity'
	);
	console.log('P5-T03 lost reason and P5-T04 reopen control passed');
}

async function testWebhookValidationAndIdempotency() {
	const unauthorized = await appJson('/api/webhooks/bricks', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}'
	});
	assert(unauthorized.response.status === 401, 'Webhook accepted a request without authorization');
	const malformed = await webhook({}, '{');
	assert(malformed.response.status === 400, 'Malformed JSON was not rejected');
	const oversized = await webhook({}, 'x'.repeat(64 * 1024 + 1));
	assert(oversized.response.status === 413, 'Oversized webhook was not rejected');

	const unknownExternal = `${prefix}-unknown-form`;
	const unknown = await webhook({
		form_id: 'unknown-form',
		external_submission_id: unknownExternal,
		first_name: 'Unknown',
		email: `${prefix}-unknown@example.test`
	});
	assert(unknown.response.status === 422, 'Unknown Bricks form was accepted');
	const unknownInbound = await rest(
		`/rest/v1/inbound_submissions?source=eq.bricks&external_submission_id=eq.${unknownExternal}&select=*`
	);
	assert(
		unknownInbound.length === 1 && unknownInbound[0].intake_state === 'rejected',
		'Unknown form rejection was not recorded'
	);

	const invalidEmailExternal = `${prefix}-invalid-email`;
	const invalidEmail = await webhook({
		form_id: 'contact-form',
		external_submission_id: invalidEmailExternal,
		first_name: 'Invalid',
		email: 'not-an-email'
	});
	assert(invalidEmail.response.status === 422, 'Invalid email was not rejected');
	const invalidInbound = await rest(
		`/rest/v1/inbound_submissions?source=eq.bricks&external_submission_id=eq.${invalidEmailExternal}&select=*`
	);
	assert(
		invalidInbound.length === 1 && invalidInbound[0].intake_state === 'rejected',
		'Invalid payload rejection was not recorded'
	);

	const acceptedExternal = `${prefix}-accepted`;
	const acceptedPayload = {
		form_id: 'contact-form',
		external_submission_id: acceptedExternal,
		first_name: 'Accepted',
		last_name: 'Submission',
		email: `${prefix}-accepted@example.test`,
		message: 'A valid P5 enquiry'
	};
	const accepted = await webhook(acceptedPayload);
	assert(
		accepted.response.status === 201 && accepted.body.lead_id,
		'Valid webhook did not create a Lead'
	);
	const duplicate = await webhook(acceptedPayload);
	assert(
		duplicate.response.status === 200 &&
			duplicate.body.duplicate &&
			duplicate.body.lead_id === accepted.body.lead_id,
		'Webhook retry was not idempotent'
	);
	const inbound = await rest(
		`/rest/v1/inbound_submissions?source=eq.bricks&external_submission_id=eq.${acceptedExternal}&select=*`
	);
	assert(
		inbound.length === 1 &&
			inbound[0].intake_state === 'accepted' &&
			inbound[0].lead_id === accepted.body.lead_id,
		'Accepted inbound record was not durable'
	);
	console.log('P5-T05 webhook validation, P5-T06 idempotency passed');
	return accepted.body.lead_id;
}

async function testRepeatedEnquiry() {
	const email = `${prefix}-repeat@example.test`;
	const first = await webhook({
		form_id: 'contact-form',
		external_submission_id: `${prefix}-repeat-one`,
		first_name: 'Repeat',
		email
	});
	const second = await webhook({
		form_id: 'contact-form',
		external_submission_id: `${prefix}-repeat-two`,
		first_name: 'Repeat',
		email
	});
	assert(
		first.response.status === 201 && second.response.status === 201,
		'Repeated human enquiry was deduplicated unexpectedly'
	);
	assert(first.body.lead_id !== second.body.lead_id, 'Distinct submission IDs shared a Lead');
	const rows = await rest(`/rest/v1/leads?email=eq.${email}&select=id,external_submission_id`);
	assert(rows.length === 2, 'Same-email distinct submissions did not create two Leads');
	console.log('P5-T07 repeated human enquiry passed');
}

async function testPaginationAndSearch(sales) {
	const bulk = await Promise.all(
		Array.from({ length: 60 }, (_, index) =>
			createLead(`bulk-${index}`, {
				first_name: `P5 Bulk ${String(index).padStart(2, '0')}`,
				email: `${prefix}-bulk-${index}@example.test`
			})
		)
	);
	assert(bulk.length === 60, 'Could not create representative pagination data');
	const searchLead = await createLead('search-target', {
		first_name: `P5Needle${runId}`,
		email: `${prefix}-needle@example.test`
	});
	await transition(searchLead, 'QUALIFICATION', sales);
	await setAttention(searchLead, 'waiting_on_us', sales);

	const pageOne = await appRequest('/leads?page=1&page_size=25&sort=created_at&direction=asc');
	const pageOneHtml = await pageOne.text();
	assert(
		pageOne.ok && leadRowCount(pageOneHtml) === 25,
		'Lead list page one was not bounded to 25 rows'
	);
	const pageTwo = await appRequest('/leads?page=2&page_size=25&sort=created_at&direction=asc');
	const pageTwoHtml = await pageTwo.text();
	assert(
		pageTwo.ok && leadRowCount(pageTwoHtml) === 25,
		'Lead list page two was not bounded to 25 rows'
	);
	assert(pageOneHtml !== pageTwoHtml, 'Lead list page boundaries were not stable');
	const capped = await appRequest('/leads?page=1&page_size=999&sort=created_at&direction=asc');
	const cappedHtml = await capped.text();
	assert(capped.ok && leadRowCount(cappedHtml) === 50, 'Lead list ignored the maximum page size');

	const filtered = await appRequest(
		`/leads?q=${encodeURIComponent(`P5Needle${runId}`)}&stage=QUALIFICATION&attention=waiting_on_us&page_size=25`
	);
	const filteredHtml = await filtered.text();
	const filteredText = await renderedText(filteredHtml);
	assert(
		filtered.ok && filteredText.includes(`P5Needle${runId}`),
		'Combined Lead search/filter omitted the matching Lead'
	);
	assert(leadRowCount(filteredHtml) === 1, 'Combined Lead search/filter returned extra records');
	console.log('P5-T08 pagination and P5-T09 search/filter correctness passed');
}

async function testAssignmentAndConcurrency(sales, otherSales, viewer, owner) {
	const assigned = await createLead('assignment');
	let current = await leadById(assigned.id);
	let result = await mustRpc(
		'assign_lead',
		{ p_lead_id: assigned.id, p_assigned_to: sales.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(sales)
	);
	assert(result.assigned_to === sales.id, 'Sales user could not assign a Lead to themselves');
	current = await leadById(assigned.id);
	await expectRpcFailure(
		'assign_lead',
		{ p_lead_id: assigned.id, p_assigned_to: otherSales.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(sales),
		'sales assignment to another user'
	);
	await expectRpcFailure(
		'assign_lead',
		{ p_lead_id: assigned.id, p_assigned_to: viewer.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(viewer),
		'viewer assignment'
	);
	result = await mustRpc(
		'assign_lead',
		{ p_lead_id: assigned.id, p_assigned_to: otherSales.id, p_lock_version: current.lock_version },
		anonKey,
		await signIn(owner)
	);
	assert(result.assigned_to === otherSales.id, 'Owner could not assign an active CRM user');

	const concurrent = await createLead('concurrency');
	current = await leadById(concurrent.id);
	const first = await setAttention(
		concurrent,
		'waiting_on_us',
		sales,
		undefined,
		undefined,
		current.lock_version
	);
	assert(
		first.lock_version > current.lock_version,
		'First concurrent Lead update did not advance the lock'
	);
	await expectRpcFailure(
		'set_lead_attention',
		{
			p_lead_id: concurrent.id,
			p_attention_state: 'waiting_on_client',
			p_lock_version: current.lock_version
		},
		anonKey,
		await signIn(otherSales),
		'stale Lead update'
	);
	console.log('P5-T10 assignment authorization and P5-T11 concurrency passed');
}

async function testIndexes() {
	sql(`
		insert into public.leads (
			external_submission_id, first_name, last_name, email, pipeline_stage,
			attention_state, assigned_to, last_activity_at, created_at, updated_at
		)
		select
			'${planPrefix}-' || series::text,
			'Plan', series::text, '${prefix}-plan@example.test',
			case when series % 3 = 0 then 'NEW' else 'QUALIFICATION' end,
			case when series % 3 = 0 then 'waiting_on_us' else 'none' end,
			'${users[0].id}'::uuid,
			now() - (series || ' minutes')::interval,
			now() - (series || ' minutes')::interval,
			now() - (series || ' minutes')::interval
		from generate_series(1, 400) as series
	`);
	sql('analyze public.leads');
	const updatedPlan = explain('select id from public.leads order by updated_at desc, id limit 25');
	const stagePlan = explain(
		"select id from public.leads where pipeline_stage = 'NEW' order by updated_at desc limit 25"
	);
	const attentionPlan = explain(
		"select id from public.leads where attention_state = 'waiting_on_us' order by updated_at desc limit 25"
	);
	const ownerPlan = explain(
		`select id from public.leads where assigned_to = '${users[0].id}' limit 25`
	);
	const createdPlan = explain('select id from public.leads order by created_at desc, id limit 25');
	const activityPlan = explain(
		'select id from public.leads where last_activity_at is not null order by last_activity_at desc nulls last, id limit 25'
	);
	const externalPlan = explain(
		`select id from public.leads where external_submission_id = '${planPrefix}-1' limit 1`
	);
	assert(
		updatedPlan.includes('leads_updated_at_idx'),
		'Default updated Lead list did not use the updated_at index'
	);
	assert(
		stagePlan.includes('leads_pipeline_stage_idx'),
		'Stage-filtered Lead list did not use the stage index'
	);
	assert(
		attentionPlan.includes('leads_attention_state_idx'),
		'Attention-filtered Lead list did not use the attention index'
	);
	assert(
		ownerPlan.includes('leads_assigned_to_idx'),
		'Owner-filtered Lead list did not use the assignment index'
	);
	assert(
		createdPlan.includes('leads_created_at_idx'),
		'Created-time Lead list did not use the created index'
	);
	assert(
		activityPlan.includes('leads_last_activity_idx'),
		'Last-activity Lead list did not use the last activity index'
	);
	assert(
		externalPlan.includes('leads_external_submission_idx'),
		'External submission lookup did not use the idempotency index'
	);
	console.log('P5-T12 index and query-plan review passed');
}

async function cleanup() {
	await stopApp();
	try {
		if (dbUrl) {
			sql(`
				delete from public.clients
				where id in (
					select converted_client_id
					from public.leads
					where external_submission_id like '${prefix}-%'
						and converted_client_id is not null
				);
				delete from public.inbound_submissions
				where source = 'bricks' and external_submission_id like '${prefix}-%';
				delete from public.leads
				where external_submission_id like '${prefix}-%';
			`);
		}
	} catch {
		// Cleanup is best effort; the test data is uniquely namespaced to this run.
	}
	for (const user of users) {
		await request(
			`/auth/v1/admin/users/${user.id}`,
			{ method: 'DELETE' },
			serviceRoleKey,
			null
		).catch(() => {});
	}
}

async function main() {
	assert(apiUrl && anonKey && serviceRoleKey && dbUrl, 'Local Supabase status is incomplete');
	const sales = await createUser('sales', 'sales');
	const otherSales = await createUser('sales', 'other-sales');
	const viewer = await createUser('viewer', 'viewer');
	const owner = await createUser('owner', 'owner');
	await startApp();
	await loginApp(sales);

	await testPipelineMatrix(sales);
	await testAttention(sales);
	await testLostAndReopen(sales, owner);
	await testWebhookValidationAndIdempotency();
	await testRepeatedEnquiry();
	await testPaginationAndSearch(sales);
	await testAssignmentAndConcurrency(sales, otherSales, viewer, owner);
	await testIndexes();
	console.log(
		'P5 Lead management contract passed: state, attention, intake, idempotency, pagination, search, assignment, concurrency, and indexes.'
	);
}

try {
	await main();
} finally {
	await cleanup();
}
