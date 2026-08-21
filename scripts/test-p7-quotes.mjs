import { execFileSync, spawn } from 'node:child_process';

const root = process.cwd();
const runId = `${Date.now()}`;
const prefix = `p7-${runId}`;
const appUrl = 'http://127.0.0.1:4179';
const users = [];
const leads = [];
const quoteIds = [];
const clientIds = [];
let app;
let appCookie = '';
let originalCompanyIdentity;

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

function decimal(value) {
	const [whole, fraction = ''] = String(value).split('.');
	return `${whole}.${(fraction + '00').slice(0, 2)}`;
}

function sql(query) {
	return run('psql', [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function expectSqlFailure(query, label) {
	try {
		sql(query);
	} catch {
		return;
	}
	throw new Error(`${label} unexpectedly succeeded`);
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

async function serviceRest(path, init = {}) {
	const result = await request(path, init, anonKey, users[0] ? await signIn(users[0]) : null);
	assert(
		result.response.ok,
		`Service REST ${init.method ?? 'GET'} ${path} failed (${result.response.status})`
	);
	return result.body;
}

async function expectRestFailure(path, init, user, label) {
	const result = await request(path, init, anonKey, await signIn(user));
	assert(!result.response.ok, `${label} unexpectedly succeeded`);
}

async function createUser(role, label) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P7-${runId}-${label}-Password9!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P7 ${label}` }
			})
		},
		serviceRoleKey,
		null
	);
	assert(created.response.ok && created.body?.id, `Could not create P7 ${label} user`);
	const user = { id: created.body.id, email, password, role, token: null };
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
		anonKey,
		null
	);
	assert(
		result.response.ok && result.body?.access_token,
		`Could not sign in P7 user ${user.email}`
	);
	user.token = result.body.access_token;
	return user.token;
}

async function createLead(label, user) {
	const externalId = `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
	const result = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p7-quote-form',
			p_external_submission_id: externalId,
			p_payload: {
				first_name: `P7 ${label}`,
				last_name: 'Quote Lead',
				email: `${prefix}-${label}@example.test`,
				company: `P7 ${label} Company`,
				message: 'Quote domain acceptance fixture'
			}
		},
		serviceRoleKey
	);
	assert(result.lead_id, `Could not create P7 ${label} lead`);
	const lead = { id: result.lead_id, externalId, user };
	leads.push(lead);
	return lead;
}

async function leadById(id) {
	const rows = await serviceRest(`/rest/v1/leads?id=eq.${id}&select=*`);
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

async function quoteById(id) {
	const rows = await serviceRest(`/rest/v1/quotes?id=eq.${id}&select=*`);
	assert(rows.length === 1, `Quote ${id} not found`);
	return rows[0];
}

async function itemsByQuote(id) {
	return serviceRest(`/rest/v1/quote_items?quote_id=eq.${id}&select=*&order=position.asc`);
}

function draftItems(overrides = {}) {
	return [
		{
			name: 'Exact service',
			description: 'Decimal fixture',
			quantity: '0.3333',
			unit_price: '10.01',
			taxable: true,
			...overrides
		}
	];
}

async function saveDraft(lead, user, subject, items, options = {}) {
	const result = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: options.quoteId ?? null,
			p_lock_version: options.lockVersion ?? null,
			p_lead_id: lead.id,
			p_client_id: options.clientId ?? null,
			p_subject: subject,
			p_introduction: options.introduction ?? null,
			p_terms: options.terms ?? 'Payment due within 30 days.',
			p_tax_label: options.taxLabel ?? 'VAT',
			p_tax_rate: options.taxRate ?? '15.125',
			p_valid_until: options.validUntil === undefined ? '2099-12-31' : options.validUntil,
			p_currency: 'ZAR',
			p_items: items
		},
		anonKey,
		await signIn(user)
	);
	if (result.quote_id && !quoteIds.includes(result.quote_id)) quoteIds.push(result.quote_id);
	return result;
}

async function readyQuote(id, lockVersion, user) {
	return mustRpc(
		'mark_quote_ready',
		{ p_quote_id: id, p_lock_version: lockVersion },
		anonKey,
		await signIn(user)
	);
}

async function sendQuote(id, user) {
	const quote = await quoteById(id);
	const prepared = await mustRpc(
		'prepare_quote_send',
		{ p_quote_id: id, p_lock_version: quote.lock_version },
		anonKey,
		await signIn(user)
	);
	const completed = await mustRpc(
		'complete_quote_send',
		{
			p_outbound_message_id: prepared.outbound_message_id,
			p_provider_message_id: `${prefix}-provider-${id}`
		},
		anonKey,
		await signIn(user)
	);
	assert(completed.idempotent === false, 'First quote send unexpectedly reported idempotent');
	return quoteById(id);
}

async function createClient() {
	const created = await serviceRest('/rest/v1/clients', {
		method: 'POST',
		headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
		body: JSON.stringify({
			type: 'company',
			display_name: `${prefix} Client`,
			company_name: `${prefix} Client`,
			status: 'active'
		})
	});
	const id = created[0]?.id;
	assert(id, 'Could not create P7 client fixture');
	clientIds.push(id);
	return id;
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
	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4179'], {
		cwd: root,
		stdio: 'ignore',
		env: {
			...process.env,
			NO_COLOR: '1',
			PUBLIC_SUPABASE_URL: apiUrl,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
			PUBLIC_SITE_URL: appUrl
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
	assert(response.status === 303, `P7 app login failed (${response.status})`);
	const cookies =
		typeof response.headers.getSetCookie === 'function'
			? response.headers.getSetCookie()
			: [response.headers.get('set-cookie') ?? ''];
	appCookie = cookies
		.map((value) => value.split(';', 1)[0])
		.filter(Boolean)
		.join('; ');
	assert(appCookie, 'P7 app login did not return a session cookie');
}

async function postStaleBrowserSave(lead, quote, staleLock) {
	const body = new URLSearchParams({
		quote_id: quote.id,
		lock_version: String(staleLock),
		lead_id: lead.id,
		client_id: '',
		subject: quote.subject,
		introduction: quote.introduction ?? '',
		terms: quote.terms ?? '',
		tax_label: quote.tax_label ?? 'VAT',
		tax_rate: String(quote.tax_rate),
		valid_until: quote.valid_until ?? '2099-12-31',
		currency: quote.currency,
		items: JSON.stringify(draftItems({ quantity: '1', unit_price: '100.00' }))
	});
	const response = await fetch(`${appUrl}/quotes/${quote.id}?/save`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			cookie: appCookie,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body
	});
	const html = await response.text();
	if (response.status !== 422 || !html.includes('Stale quote lock_version')) {
		const marker = html.indexOf('Stale');
		throw new Error(
			`Browser stale edit did not show a visible conflict (status ${response.status}, marker ${marker}, excerpt ${html.slice(Math.max(0, marker - 180), marker + 240)})`
		);
	}
}

async function testIndexes(leadId, clientId, readyQuoteId) {
	const plans = [
		[
			'quotes_lead_status_idx',
			sql(
				`set enable_seqscan=off; explain (costs off) select * from public.quotes where lead_id = '${leadId}' and status = 'draft' order by updated_at desc, id`
			)
		],
		[
			'quotes_client_status_idx',
			sql(
				`set enable_seqscan=off; explain (costs off) select * from public.quotes where client_id = '${clientId}' and status = 'draft' order by updated_at desc, id`
			)
		],
		[
			'quotes_status_valid_until_idx',
			sql(
				"set enable_seqscan=off; explain (costs off) select * from public.quotes where status = 'ready' and valid_until >= current_date order by valid_until"
			)
		],
		[
			'quotes_number_revision_idx',
			sql(
				'set enable_seqscan=off; explain (costs off) select * from public.quotes where base_quote_number > 0 order by base_quote_number, revision_number desc'
			)
		],
		[
			'quote_items_quote_id_idx',
			sql(
				`set enable_seqscan=off; explain (costs off) select * from public.quote_items where quote_id = '${readyQuoteId}' order by position`
			)
		]
	];
	for (const [index, plan] of plans)
		assert(plan.includes(index), `${index} was not used:\n${plan}`);
}

async function main() {
	const sales = await createUser('sales', 'sales');
	const lead = await createLead('lifecycle', sales);
	await reachDecision(lead, sales);
	const clientId = await createClient();

	const exact = await saveDraft(lead, sales, `${prefix} exact`, draftItems(), { clientId });
	const exactRow = await quoteById(exact.quote_id);
	const exactItems = await itemsByQuote(exact.quote_id);
	assert(
		decimal(exactRow.subtotal) === '3.34' &&
			decimal(exactRow.tax_amount) === '0.51' &&
			decimal(exactRow.total) === '3.85',
		'P7 exact server totals are incorrect'
	);
	assert(
		exactItems.length === 1 && decimal(exactItems[0].line_subtotal) === '3.34',
		'P7 exact line subtotal is incorrect'
	);
	console.log('P7-T01 money precision passed');

	const tampered = await saveDraft(
		lead,
		sales,
		`${prefix} tampered`,
		[{ ...draftItems()[0], line_subtotal: '999999.99', subtotal: '999999.99', total: '1' }],
		{ taxRate: '15' }
	);
	const tamperedRow = await quoteById(tampered.quote_id);
	const tamperedItems = await itemsByQuote(tampered.quote_id);
	assert(
		decimal(tamperedRow.subtotal) === '3.34' &&
			decimal(tamperedRow.tax_amount) === '0.50' &&
			decimal(tamperedRow.total) === '3.84' &&
			decimal(tamperedItems[0].line_subtotal) === '3.34',
		'P7 server authority accepted tampered totals'
	);
	console.log('P7-T02 server authority passed');

	const concurrent = await Promise.all(
		Array.from({ length: 12 }, (_, index) =>
			saveDraft(
				lead,
				sales,
				`${prefix} concurrent ${index}`,
				[{ name: `Concurrent ${index}`, quantity: '1', unit_price: '10.00', taxable: true }],
				{ taxRate: '0' }
			)
		)
	);
	const concurrentRows = await serviceRest(
		`/rest/v1/quotes?subject=like.${encodeURIComponent(`${prefix} concurrent`)}*&select=base_quote_number,quote_number,revision_number`
	);
	assert(
		concurrent.length === 12 && concurrentRows.length === 12,
		'Concurrent quote creation count is incorrect'
	);
	assert(
		new Set(concurrentRows.map((row) => row.quote_number)).size === concurrentRows.length,
		'Concurrent quote numbers are duplicated'
	);
	console.log('P7-T03 concurrent numbering passed');

	const stateReady = await saveDraft(
		lead,
		sales,
		`${prefix} state`,
		[{ name: 'State line', quantity: '1', unit_price: '50.00', taxable: true }],
		{ taxRate: '0' }
	);
	await expectRpcFailure(
		'accept_quote',
		{ p_quote_id: stateReady.quote_id, p_lock_version: stateReady.lock_version },
		anonKey,
		await signIn(sales),
		'Draft acceptance'
	);
	const stateReadyResult = await readyQuote(stateReady.quote_id, stateReady.lock_version, sales);
	const stateSent = await sendQuote(stateReady.quote_id, sales);
	const stateAccepted = await mustRpc(
		'accept_quote',
		{ p_quote_id: stateSent.id, p_lock_version: stateSent.lock_version },
		anonKey,
		await signIn(sales)
	);
	const acceptedRow = await quoteById(stateSent.id);
	assert(
		stateReadyResult.status === 'ready' &&
			stateAccepted.status === 'accepted' &&
			acceptedRow.status === 'accepted',
		'Allowed Quote state transitions failed'
	);
	await expectRpcFailure(
		'decline_quote',
		{ p_quote_id: acceptedRow.id, p_lock_version: acceptedRow.lock_version },
		anonKey,
		await signIn(sales),
		'Terminal state transition'
	);
	for (const [suffix, action, expected] of [
		['declined', 'decline_quote', 'declined'],
		['cancelled', 'cancel_quote', 'cancelled'],
		['expired', 'expire_quote', 'expired']
	]) {
		const branchDraft = await saveDraft(
			lead,
			sales,
			`${prefix} ${suffix}`,
			[{ name: `${suffix} line`, quantity: '1', unit_price: '25.00', taxable: true }],
			{ taxRate: '0' }
		);
		await readyQuote(branchDraft.quote_id, branchDraft.lock_version, sales);
		const branchSent = await sendQuote(branchDraft.quote_id, sales);
		const branchResult = await mustRpc(
			action,
			{ p_quote_id: branchSent.id, p_lock_version: branchSent.lock_version },
			anonKey,
			await signIn(sales)
		);
		assert(branchResult.status === expected, `Allowed ${expected} transition failed`);
	}
	console.log('P7-T04 state matrix passed');

	const empty = await saveDraft(lead, sales, `${prefix} empty`, [], { validUntil: null });
	await expectRpcFailure(
		'mark_quote_ready',
		{ p_quote_id: empty.quote_id, p_lock_version: empty.lock_version },
		anonKey,
		await signIn(sales),
		'Ready quote without items'
	);
	const past = await saveDraft(
		lead,
		sales,
		`${prefix} past`,
		[{ name: 'Past', quantity: '1', unit_price: '10.00', taxable: true }],
		{ validUntil: '2000-01-01', taxRate: '0' }
	);
	await expectRpcFailure(
		'mark_quote_ready',
		{ p_quote_id: past.quote_id, p_lock_version: past.lock_version },
		anonKey,
		await signIn(sales),
		'Ready quote with expired validity'
	);
	console.log('P7-T05 ready validation passed');

	const revisionSource = await saveDraft(
		lead,
		sales,
		`${prefix} revision source`,
		[
			{
				name: 'Revision line',
				description: 'Preserve me',
				quantity: '2',
				unit_price: '100.10',
				taxable: true
			}
		],
		{ taxRate: '15', terms: 'Original terms', clientId }
	);
	await readyQuote(revisionSource.quote_id, revisionSource.lock_version, sales);
	const sentSource = await sendQuote(revisionSource.quote_id, sales);
	await expectRestFailure(
		`/rest/v1/quotes?id=eq.${sentSource.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: JSON.stringify({
				subject: 'Tampered subject',
				lock_version: sentSource.lock_version + 1
			})
		},
		sales,
		'Direct sent Quote update'
	);
	await expectRestFailure(
		`/rest/v1/quote_items?quote_id=eq.${sentSource.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: JSON.stringify({ unit_price: '1.00', lock_version: sentSource.lock_version + 1 })
		},
		sales,
		'Direct sent Quote item update'
	);
	await expectRpcFailure(
		'save_quote_draft',
		{
			p_quote_id: sentSource.id,
			p_lock_version: sentSource.lock_version,
			p_lead_id: lead.id,
			p_client_id: clientId,
			p_subject: 'No',
			p_introduction: null,
			p_terms: null,
			p_tax_label: 'VAT',
			p_tax_rate: '0',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [{ name: 'No', quantity: '1', unit_price: '1.00', taxable: true }]
		},
		anonKey,
		await signIn(sales),
		'Sent Quote edit action'
	);
	expectSqlFailure(
		`update public.quotes set subject = 'owner tamper', lock_version = lock_version + 1 where id = '${sentSource.id}'`,
		'Sent Quote owner mutation'
	);
	console.log('P7-T06 sent immutability passed');

	const sourceBeforeSnapshot = await quoteById(sentSource.id);
	originalCompanyIdentity = sql(
		"select setting_value::text from public.app_settings where setting_key = 'company_identity'"
	);
	sql(
		`update public.app_settings set setting_value = '{"name":"P7 changed company"}'::jsonb where setting_key = 'company_identity'`
	);
	const sourceAfterSettings = await quoteById(sentSource.id);
	assert(
		sourceAfterSettings.quote_snapshot.company_identity?.name ===
			JSON.parse(originalCompanyIdentity).name &&
			sourceAfterSettings.quote_snapshot.terms === sourceBeforeSnapshot.quote_snapshot.terms,
		'Historical Quote snapshot changed with current settings'
	);
	sql(
		`update public.app_settings set setting_value = '${originalCompanyIdentity.replaceAll("'", "''")}'::jsonb where setting_key = 'company_identity'`
	);
	originalCompanyIdentity = undefined;
	console.log('P7-T08 historical settings snapshot passed');

	const revision = await mustRpc(
		'revise_quote',
		{ p_quote_id: sentSource.id, p_lock_version: sentSource.lock_version },
		anonKey,
		await signIn(sales)
	);
	const revisionRow = await quoteById(revision.quote_id);
	const revisionItems = await itemsByQuote(revision.quote_id);
	assert(
		revisionRow.status === 'draft' &&
			revisionRow.revision_number === sentSource.revision_number + 1 &&
			revisionRow.base_quote_number === sentSource.base_quote_number &&
			revisionRow.supersedes_quote_id === sentSource.id,
		'Revision metadata is incorrect'
	);
	assert(
		revisionItems.length === 1 &&
			revisionItems[0].description === 'Preserve me' &&
			revisionRow.quote_snapshot.company_identity?.name ===
				sourceBeforeSnapshot.quote_snapshot.company_identity?.name,
		'Revision did not clone snapshot/items'
	);
	const revisionReady = await readyQuote(revision.quote_id, revisionRow.lock_version, sales);
	const revisionSent = await sendQuote(revision.quote_id, sales);
	const superseded = await quoteById(sentSource.id);
	assert(
		revisionReady.status === 'ready' &&
			revisionSent.status === 'sent' &&
			superseded.status === 'superseded',
		'Revision send did not supersede the prior sent Quote'
	);
	console.log('P7-T07 revision cloning passed');

	const conflict = await saveDraft(
		lead,
		sales,
		`${prefix} conflict`,
		[{ name: 'Conflict', quantity: '1', unit_price: '10.00', taxable: true }],
		{ taxRate: '0' }
	);
	const conflictFirst = await saveDraft(
		lead,
		sales,
		`${prefix} conflict updated`,
		[{ name: 'Conflict', quantity: '1', unit_price: '11.00', taxable: true }],
		{ quoteId: conflict.quote_id, lockVersion: conflict.lock_version, taxRate: '0' }
	);
	await expectRpcFailure(
		'save_quote_draft',
		{
			p_quote_id: conflict.quote_id,
			p_lock_version: conflict.lock_version,
			p_lead_id: lead.id,
			p_client_id: null,
			p_subject: `${prefix} stale`,
			p_introduction: null,
			p_terms: null,
			p_tax_label: 'VAT',
			p_tax_rate: '0',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [{ name: 'Conflict', quantity: '1', unit_price: '12.00', taxable: true }]
		},
		anonKey,
		await signIn(sales),
		'Stale Quote edit'
	);
	assert(
		conflictFirst.lock_version > conflict.lock_version,
		'Quote save did not advance lock_version'
	);
	await startApp();
	await loginApp(sales);
	await postStaleBrowserSave(lead, await quoteById(conflict.quote_id), conflict.lock_version);
	await stopApp();
	console.log('P7-T09 optimistic conflict passed');

	const indexReady = await Promise.all(
		concurrent.slice(0, 6).map((quote) => readyQuote(quote.quote_id, quote.lock_version, sales))
	);
	assert(indexReady.length === 6, 'Index fixtures did not become ready');
	await readyQuote(exact.quote_id, exact.lock_version, sales);
	const indexQuote = await quoteById(exact.quote_id);
	await testIndexes(lead.id, clientId, indexQuote.id);
	console.log('P7-T10 quote indexes passed');
	console.log('P7-T11 project quality gate delegated to bun run quality');
}

async function cleanup() {
	await stopApp();
	if (originalCompanyIdentity !== undefined) {
		try {
			sql(
				`update public.app_settings set setting_value = '${originalCompanyIdentity.replaceAll("'", "''")}'::jsonb where setting_key = 'company_identity'`
			);
		} catch {
			// Cleanup is retried by the following local reset or test run.
		}
	}
	try {
		sql(
			`delete from public.outbound_messages where lead_id in (select id from public.leads where external_submission_id like '${prefix}-%'); do $$ begin loop delete from public.quotes q where q.lead_id in (select id from public.leads where external_submission_id like '${prefix}-%') and not exists (select 1 from public.quotes child where child.supersedes_quote_id = q.id); exit when not found; end loop; end $$; delete from public.leads where external_submission_id like '${prefix}-%'; delete from public.inbound_submissions where external_submission_id like '${prefix}-%'; delete from public.clients where display_name like '${prefix}%';`
		);
	} catch {
		// A failing assertion still leaves cleanup best-effort and local-only.
	}
	for (const user of users) {
		try {
			await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }, serviceRoleKey, null);
		} catch {
			// Auth cleanup is best effort after the database fixtures are removed.
		}
	}
}

try {
	await main();
} finally {
	await cleanup();
}
