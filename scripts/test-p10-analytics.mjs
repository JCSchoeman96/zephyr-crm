import { execFileSync } from 'node:child_process';

const root = process.cwd();
const runId = `${Date.now()}`;
const prefix = `p10-${runId}`;
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
	const password = `P10-${runId}-${label}-Password10!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P10 ${label}` }
			})
		},
		serviceRoleKey
	);
	assert(created.response.ok && created.body?.id, `Could not create P10 ${label} user`);
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

async function protectedRows(path, user) {
	const result = await request(path, {}, anonKey, await signIn(user));
	assert(
		result.response.ok,
		`Protected query failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

async function leadById(id, user) {
	const rows = await protectedRows(`/rest/v1/leads?id=eq.${id}&select=*`, user);
	assert(rows.length === 1, `Lead ${id} not found`);
	return rows[0];
}

async function createLead(label, user, attribution = {}) {
	const result = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p10-form',
			p_external_submission_id: `${prefix}-${label}`,
			p_payload: {
				first_name: `P10 ${label}`,
				last_name: 'Fixture',
				email: `${prefix}-${label}@example.test`,
				phone: '+27110000000',
				company: `P10 ${label} Company`,
				message: 'P10 analytics fixture',
				source: attribution.source ?? 'manual',
				utm_source: attribution.utmSource ?? null,
				utm_medium: attribution.utmMedium ?? null,
				utm_campaign: attribution.utmCampaign ?? null
			}
		},
		serviceRoleKey
	);
	assert(result.lead_id, `Could not create Lead ${label}`);
	leadIds.push(result.lead_id);
	return { id: result.lead_id };
}

async function reachDecision(lead, user) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await leadById(lead.id, user);
		await mustRpc(
			'transition_lead',
			{ p_lead_id: lead.id, p_to_stage: stage, p_lock_version: current.lock_version },
			anonKey,
			await signIn(user)
		);
	}
}

async function setAttention(lead, user, attention) {
	const current = await leadById(lead.id, user);
	await mustRpc(
		'set_lead_attention',
		{
			p_lead_id: lead.id,
			p_attention_state: attention,
			p_lock_version: current.lock_version
		},
		anonKey,
		await signIn(user)
	);
}

async function createQuote(lead, user, label, total, status = 'draft', validUntil = null) {
	const saved = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.id,
			p_client_id: null,
			p_subject: `${prefix} ${label} quote`,
			p_introduction: 'P10 fixture',
			p_terms: 'P10 terms',
			p_tax_label: 'VAT',
			p_tax_rate: '0.0000',
			p_valid_until: validUntil ?? dateOffset(30),
			p_currency: 'ZAR',
			p_items: [
				{
					name: `${label} service`,
					quantity: '1.0000',
					unit_price: total.toFixed(2),
					taxable: true
				}
			]
		},
		anonKey,
		await signIn(user)
	);
	if (status === 'draft') return { id: saved.quote_id, total };
	const ready = await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: saved.quote_id, p_lock_version: saved.lock_version },
		anonKey,
		await signIn(user)
	);
	if (status === 'ready') return { id: ready.quote_id, total };
	return { id: ready.quote_id, total };
}

async function sendQuote(quote, user) {
	const rows = await protectedRows(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, user);
	const prepared = await mustRpc(
		'prepare_quote_send',
		{ p_quote_id: quote.id, p_lock_version: rows[0].lock_version },
		anonKey,
		await signIn(user)
	);
	await mustRpc(
		'complete_quote_send',
		{
			p_outbound_message_id: prepared.outbound_message_id,
			p_provider_message_id: `${prefix}-provider-${quote.id}`
		},
		anonKey,
		await signIn(user)
	);
}

async function acceptQuote(quote, user) {
	const rows = await protectedRows(`/rest/v1/quotes?id=eq.${quote.id}&select=*`, user);
	await mustRpc(
		'accept_quote',
		{ p_quote_id: quote.id, p_lock_version: rows[0].lock_version },
		anonKey,
		await signIn(user)
	);
}

async function createTask(lead, user, label, dueAt) {
	return mustRpc(
		'create_task',
		{
			p_lead_id: lead.id,
			p_type: 'custom',
			p_title: `P10 ${label}`,
			p_due_at: dueAt,
			p_assigned_to: user.id
		},
		anonKey,
		await signIn(user)
	);
}

function dateOffset(days) {
	const value = new Date(`${today}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function sql(query) {
	return run('psql', [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function object(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberValue(value) {
	const numeric = Number(value ?? 0);
	return Number.isFinite(numeric) ? numeric : 0;
}

function array(value) {
	return Array.isArray(value) ? value : [];
}

function metricSnapshot(operational, kpis, lost, attribution) {
	return {
		operational: object(operational),
		kpis: object(kpis),
		lost: object(lost),
		attribution: object(attribution)
	};
}

async function dashboard(name, args, user, key = anonKey, token = null) {
	const result = await rpc(name, args, key, token ?? (user ? await signIn(user) : null));
	return { response: result.response, body: result.body };
}

const today = new Date().toISOString().slice(0, 10);
const from = dateOffset(-29);
const range = { p_from: from, p_to: today };

async function readDashboard(user, limit = 50) {
	const [operational, kpis, lost, attribution] = await Promise.all([
		dashboard('dashboard_operational_summary', range, user),
		dashboard('dashboard_sales_kpis', range, user),
		dashboard('dashboard_lost_analysis', { ...range, p_limit: limit }, user),
		dashboard('dashboard_attribution', { ...range, p_limit: limit }, user)
	]);
	for (const result of [operational, kpis, lost, attribution]) {
		assert(result.response.ok, `Dashboard RPC failed: ${JSON.stringify(result.body)}`);
	}
	return metricSnapshot(operational.body, kpis.body, lost.body, attribution.body);
}

function countDelta(after, before, key, section) {
	return numberValue(after[section]?.[key]) - numberValue(before[section]?.[key]);
}

function rowFor(rows, predicate) {
	return array(rows).find((row) => predicate(object(row)));
}

function assertClose(actual, expected, message) {
	assert(
		Math.abs(Number(actual) - Number(expected)) < 0.01,
		`${message}: ${actual} !== ${expected}`
	);
}

function expectedConversion(won, lost) {
	const denominator = won + lost;
	return denominator === 0 ? 0 : Math.round((won * 10000) / denominator) / 100;
}

let passed = 0;
try {
	assert(apiUrl && anonKey && serviceRoleKey && dbUrl, 'Local Supabase status is incomplete');
	const sales = await createUser('sales', 'sales');
	const viewer = await createUser('viewer', 'viewer');
	const before = await readDashboard(sales);

	await createLead('new', sales, { source: 'manual' });
	const waitingUsLead = await createLead('waiting-us', sales, { source: 'website' });
	await setAttention(waitingUsLead, sales, 'waiting_on_us');
	const waitingClientLead = await createLead('waiting-client', sales, { source: 'website' });
	await reachDecision(waitingClientLead, sales);
	await setAttention(waitingClientLead, sales, 'waiting_on_client');
	const overdueLead = await createLead('overdue', sales, { source: 'manual' });
	await createTask(overdueLead, sales, 'overdue', `${dateOffset(-1)}T23:59:00Z`);
	const dueTodayLead = await createLead('due-today', sales, { source: 'manual' });
	await createTask(
		dueTodayLead,
		sales,
		'due today',
		new Date(Date.now() + 5 * 60 * 1000).toISOString()
	);

	const attribution = {
		source: 'google_ads',
		utmSource: 'google',
		utmMedium: 'cpc',
		utmCampaign: 'phase10-fixture'
	};
	const expiringLead = await createLead('expiring', sales, attribution);
	await reachDecision(expiringLead, sales);
	const expiringQuote = await createQuote(expiringLead, sales, 'expiring', 100, 'ready', today);
	await sendQuote(expiringQuote, sales);

	const acceptedLead = await createLead('accepted', sales, attribution);
	await reachDecision(acceptedLead, sales);
	const acceptedQuote = await createQuote(acceptedLead, sales, 'accepted', 200, 'ready', today);
	await sendQuote(acceptedQuote, sales);
	await acceptQuote(acceptedQuote, sales);

	const pipelineLead = await createLead('pipeline', sales, { source: 'referral' });
	await reachDecision(pipelineLead, sales);
	await createQuote(pipelineLead, sales, 'pipeline', 300, 'ready');
	const draftLead = await createLead('draft-only', sales, { source: 'referral' });
	await reachDecision(draftLead, sales);
	await createQuote(draftLead, sales, 'draft-only', 50, 'draft');

	const wonLead = await createLead('won', sales, attribution);
	await reachDecision(wonLead, sales);
	const wonCurrent = await leadById(wonLead.id, sales);
	await mustRpc(
		'convert_lead',
		{ p_lead_id: wonLead.id, p_lock_version: wonCurrent.lock_version },
		anonKey,
		await signIn(sales)
	);

	const lostLead = await createLead('lost', sales, {
		source: 'referral',
		utmSource: 'referral',
		utmMedium: 'partner',
		utmCampaign: 'phase10-loss'
	});
	await reachDecision(lostLead, sales);
	await createQuote(lostLead, sales, 'lost', 125, 'ready');
	const priceReasons = await protectedRows('/rest/v1/lost_reasons?code=eq.price&select=id', sales);
	assert(priceReasons.length === 1, 'Price lost reason fixture is missing');
	const lostCurrent = await leadById(lostLead.id, sales);
	await mustRpc(
		'transition_lead',
		{
			p_lead_id: lostLead.id,
			p_to_stage: 'LOST',
			p_lock_version: lostCurrent.lock_version,
			p_lost_reason_id: priceReasons[0].id
		},
		anonKey,
		await signIn(sales)
	);

	const after = await readDashboard(sales);

	assert(
		countDelta(after, before, 'new_leads', 'operational') === 4,
		'P10-T01 new Lead count did not reconcile'
	);
	assert(
		countDelta(after, before, 'overdue_tasks', 'operational') === 1,
		`P10-T01 overdue Task count did not reconcile: before=${JSON.stringify(before.operational)} after=${JSON.stringify(after.operational)}`
	);
	assert(
		countDelta(after, before, 'due_today', 'operational') === 1,
		'P10-T01 due-today count did not reconcile'
	);
	assert(
		countDelta(after, before, 'waiting_on_us', 'operational') === 1,
		'P10-T01 waiting_on_us count did not reconcile'
	);
	assert(
		countDelta(after, before, 'waiting_on_client', 'operational') === 3,
		'P10-T01 waiting_on_client count did not reconcile'
	);
	assert(
		countDelta(after, before, 'expiring_quotes', 'operational') === 1,
		'P10-T01 expiring Quote count did not reconcile'
	);
	assert(
		countDelta(after, before, 'new_leads', 'kpis') === 11,
		'P10-T01 Lead KPI did not reconcile'
	);
	assert(
		countDelta(after, before, 'quotes_sent', 'kpis') === 2,
		'P10-T01 sent Quote count did not reconcile'
	);
	assertClose(
		countDelta(after, before, 'quote_value', 'kpis'),
		300,
		'P10-T01 quote value did not reconcile'
	);
	assertClose(
		countDelta(after, before, 'accepted_value', 'kpis'),
		200,
		'P10-T01 accepted value did not reconcile'
	);
	assert(
		countDelta(after, before, 'won_leads', 'kpis') === 1,
		'P10-T01 Won count did not reconcile'
	);
	assert(
		countDelta(after, before, 'lost_leads', 'kpis') === 1,
		'P10-T01 Lost count did not reconcile'
	);
	assertClose(
		after.kpis.conversion_rate,
		expectedConversion(numberValue(after.kpis.won_leads), numberValue(after.kpis.lost_leads)),
		'P10-T01 conversion rate did not reconcile'
	);
	assertClose(
		countDelta(after, before, 'pipeline_value', 'kpis'),
		400,
		'P10-T01 pipeline value did not reconcile'
	);
	console.log('P10-T01 metric reconciliation passed');
	passed += 1;

	assertClose(
		numberValue(after.kpis.conversion_rate),
		expectedConversion(numberValue(after.kpis.won_leads), numberValue(after.kpis.lost_leads)),
		'P10-T02 terminal conversion formula'
	);
	const emptyConversion = await dashboard(
		'dashboard_sales_kpis',
		{ p_from: '2099-01-01', p_to: '2099-01-30' },
		sales
	);
	assert(emptyConversion.response.ok, 'P10-T02 empty conversion range failed');
	assertClose(
		numberValue(object(emptyConversion.body).conversion_rate),
		0,
		'P10-T02 zero-denominator conversion formula'
	);
	console.log('P10-T02 conversion rate passed');
	passed += 1;

	assertClose(
		countDelta(after, before, 'pipeline_value', 'kpis'),
		400,
		'P10-T03 eligible pipeline value'
	);
	console.log('P10-T03 pipeline value eligibility passed');
	passed += 1;

	const lostReason = rowFor(after.lost.by_reason, (row) => row.reason_code === 'price');
	assert(lostReason, 'P10-T04 price loss reason row is missing');
	assert(numberValue(lostReason.lost_count) >= 1, 'P10-T04 price loss count is incorrect');
	assert(numberValue(lostReason.lost_value) >= 125, 'P10-T04 price loss value is incorrect');
	console.log('P10-T04 lost analysis passed');
	passed += 1;

	const attributionRow = rowFor(
		after.attribution.rows,
		(row) => row.source_code === 'google_ads' && row.utm_campaign === 'phase10-fixture'
	);
	assert(attributionRow, 'P10-T05 attribution fixture row is missing');
	assert(
		numberValue(attributionRow.lead_count) >= 3,
		'P10-T05 attribution Lead count is incorrect'
	);
	assert(numberValue(attributionRow.won_count) >= 1, 'P10-T05 attribution Won count is incorrect');
	assert(numberValue(attributionRow.revenue) >= 200, 'P10-T05 attribution revenue is incorrect');
	console.log('P10-T05 attribution passed');
	passed += 1;

	const viewerDashboard = await readDashboard(viewer);
	assert(
		JSON.stringify(viewerDashboard) === JSON.stringify(after),
		'P10-T06 viewer aggregate differs from permitted reporting view'
	);
	const viewerRawFacts = await request(
		'/rest/v1/dashboard_lead_facts?select=id',
		{},
		anonKey,
		await signIn(viewer)
	);
	assert(!viewerRawFacts.response.ok, 'P10-T06 viewer unexpectedly received raw dashboard facts');
	const anonymous = await dashboard('dashboard_sales_kpis', range, null, anonKey, null);
	assert(!anonymous.response.ok, 'P10-T06 anonymous dashboard RPC unexpectedly succeeded');
	console.log('P10-T06 reporting RLS passed');
	passed += 1;

	const overlong = await dashboard(
		'dashboard_sales_kpis',
		{ p_from: '2024-01-01', p_to: today },
		sales
	);
	assert(!overlong.response.ok, 'P10-T07 overlong dashboard date range unexpectedly succeeded');
	const boundedLost = await dashboard('dashboard_lost_analysis', { ...range, p_limit: 1 }, sales);
	const boundedAttribution = await dashboard(
		'dashboard_attribution',
		{ ...range, p_limit: 1 },
		sales
	);
	assert(
		array(object(boundedLost.body).by_reason).length <= 1,
		'P10-T07 lost analysis exceeded limit'
	);
	assert(
		array(object(boundedAttribution.body).rows).length <= 1,
		'P10-T07 attribution exceeded limit'
	);
	assert(
		!Array.isArray(boundedAttribution.body),
		'P10-T07 dashboard returned an unbounded raw dataset'
	);
	console.log('P10-T07 bounded reporting passed');
	passed += 1;

	const planOutput = sql(
		`set statement_timeout = '250ms'; explain (analyze, format json) select public.dashboard_sales_kpis(${sqlLiteral(from)}, ${sqlLiteral(today)});`
	);
	const planStart = planOutput.indexOf('[');
	assert(planStart >= 0, 'P10-T08 did not return an execution plan');
	const executionPlan = JSON.parse(planOutput.slice(planStart))[0];
	assert(
		Number(executionPlan['Execution Time']) < 250,
		`P10-T08 dashboard RPC exceeded 250ms: ${executionPlan['Execution Time']}ms`
	);
	const indexCount = Number(
		sql(
			"select count(*) from pg_indexes where schemaname = 'public' and indexname in ('leads_dashboard_created_stage_idx', 'quotes_dashboard_sent_idx', 'quotes_dashboard_accepted_idx');"
		)
	);
	assert(indexCount === 3, 'P10-T08 measured dashboard indexes are missing');
	console.log(`P10-T08 representative performance passed (${executionPlan['Execution Time']}ms)`);
	passed += 1;
} finally {
	try {
		const leadFilter = sqlLiteral(`${prefix}-%`);
		sql(
			`delete from public.tasks where lead_id in (select id from public.leads where external_submission_id like ${leadFilter}) or quote_id in (select id from public.quotes where lead_id in (select id from public.leads where external_submission_id like ${leadFilter})); delete from public.quote_items where quote_id in (select id from public.quotes where lead_id in (select id from public.leads where external_submission_id like ${leadFilter})); delete from public.quotes where lead_id in (select id from public.leads where external_submission_id like ${leadFilter}); delete from public.client_contacts where client_id in (select id from public.clients where source_lead_id in (select id from public.leads where external_submission_id like ${leadFilter})); delete from public.clients where source_lead_id in (select id from public.leads where external_submission_id like ${leadFilter}); delete from public.leads where external_submission_id like ${leadFilter}; delete from public.inbound_submissions where external_submission_id like ${leadFilter};`
		);
	} catch {
		// A disposable local reset remains the recovery path for an interrupted fixture run.
	}
	for (const user of users) {
		await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }, serviceRoleKey).catch(
			() => {}
		);
	}
}

if (passed !== 8) throw new Error(`P10 focused test suite stopped after ${passed} tests`);
console.log(`P10 focused analytics tests passed (${passed} tests)`);
