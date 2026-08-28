import { createHash, createHmac } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const runId = `${Date.now()}`;
const prefix = `p8-${runId}`;
const appPort = 4187;
const appUrl = `http://127.0.0.1:${appPort}`;
const providerUrl = 'http://127.0.0.1:4180';
const webhookSecret = `p8-webhook-${runId}`;
const users = [];
const leads = [];
const quoteIds = [];
const documentPaths = [];
let app;
let appCookie = '';
let provider;
let providerMode = 'success';
let providerAttempt = 0;
let lastProviderBody = null;

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

async function serviceRest(path, init = {}) {
	const authenticatedUser = users[0];
	const result = authenticatedUser
		? await request(path, init, anonKey, await signIn(authenticatedUser))
		: await request(path, init, serviceRoleKey, serviceRoleKey);
	assert(
		result.response.ok,
		`Service REST ${init.method ?? 'GET'} ${path} failed (${result.response.status})`
	);
	return result.body;
}

async function createUser(label) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P8-${runId}-${label}-Password9!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P8 ${label}` }
			})
		},
		serviceRoleKey,
		null
	);
	assert(created.response.ok && created.body?.id, `Could not create P8 ${label} user`);
	const user = { id: created.body.id, email, password, token: null };
	await mustRpc(
		'provision_invited_profile',
		{ p_user_id: user.id, p_role: 'sales', p_status: 'active' },
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
	assert(result.response.ok && result.body?.access_token, `Could not sign in ${user.email}`);
	user.token = result.body.access_token;
	return user.token;
}

async function createLead(label) {
	const externalId = `${prefix}-${label}`;
	const result = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p8-quote-form',
			p_external_submission_id: externalId,
			p_payload: {
				first_name: `P8 ${label}`,
				last_name: 'Recipient',
				email: `${prefix}-${label}@example.test`,
				phone: '+27110000000',
				company: `P8 ${label} Company`,
				message: 'P8 communications fixture'
			}
		},
		serviceRoleKey
	);
	assert(result.lead_id, `Could not create P8 ${label} lead`);
	const lead = { id: result.lead_id };
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

async function createReadyQuote(lead, user, label) {
	const saved = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.id,
			p_client_id: null,
			p_subject: `${prefix} ${label} quote`,
			p_introduction: 'Frozen introduction',
			p_terms: 'Payment due within 30 days.',
			p_tax_label: 'VAT',
			p_tax_rate: '15.0000',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [
				{
					name: 'Communications service',
					description: 'Immutable PDF line',
					quantity: '1.0000',
					unit_price: '100.00',
					taxable: true
				}
			]
		},
		anonKey,
		await signIn(user)
	);
	quoteIds.push(saved.quote_id);
	await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: saved.quote_id, p_lock_version: saved.lock_version },
		anonKey,
		await signIn(user)
	);
	return serviceQuote(saved.quote_id);
}

async function serviceQuote(id) {
	const rows = await serviceRest(`/rest/v1/quotes?id=eq.${id}&select=*`);
	assert(rows.length === 1, `Quote ${id} not found`);
	return rows[0];
}

async function appJson(path, init = {}) {
	const response = await fetch(`${appUrl}${path}`, {
		...init,
		headers: { cookie: appCookie, ...(init.headers ?? {}) }
	});
	return { response, body: await parseBody(response) };
}

async function loginApp(user) {
	const response = await fetch(`${appUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email: user.email, password: user.password })
	});
	assert(response.status === 303, `App login failed (${response.status})`);
	const cookies =
		typeof response.headers.getSetCookie === 'function'
			? response.headers.getSetCookie()
			: [response.headers.get('set-cookie') ?? ''];
	appCookie = cookies
		.map((value) => value.split(';', 1)[0])
		.filter(Boolean)
		.join('; ');
	assert(appCookie, 'App login did not return a session cookie');
}

async function waitFor(url) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// SvelteKit is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

function startProvider() {
	provider = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const body = Buffer.concat(chunks).toString('utf8');
		if (request.url === '/oauth/access_token') {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ access_token: 'p8-contract-token' }));
			return;
		}
		if (request.url === '/smtp/emails') {
			providerAttempt += 1;
			lastProviderBody = JSON.parse(body);
			if (providerMode === 'unknown') {
				request.socket.destroy();
				return;
			}
			if (providerMode === 'failure') {
				response.writeHead(502, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ result: false, error: 'deterministic provider failure' }));
				return;
			}
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ result: true, id: `${prefix}-provider-${providerAttempt}` }));
			return;
		}
		response.writeHead(404);
		response.end();
	});
	return new Promise((resolve) => provider.listen(4180, '127.0.0.1', resolve));
}

async function startApp() {
	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(appPort)], {
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
			SENDPULSE_CLIENT_ID: 'p8-client',
			SENDPULSE_CLIENT_SECRET: 'p8-secret',
			SENDPULSE_API_BASE_URL: providerUrl,
			SENDPULSE_SENDER_EMAIL: 'sales@example.test',
			SENDPULSE_SENDER_NAME: 'Zephyr P8',
			SENDPULSE_WEBHOOK_SECRET: webhookSecret,
			ZEPHYR_TEST_FAIL_QUOTE_FINALIZATION_ONCE: '1'
		}
	});
	await waitFor(`${appUrl}/login`);
}

async function stopApp() {
	if (!app || app.exitCode !== null) return;
	const process = app;
	app = undefined;
	await new Promise((resolve) => {
		const timeout = setTimeout(() => {
			process.kill('SIGKILL');
			resolve();
		}, 5000);
		process.once('exit', () => {
			clearTimeout(timeout);
			resolve();
		});
		process.kill('SIGTERM');
	});
}

async function sendQuoteThroughApp(quote) {
	return appJson(`/api/quotes/${quote.id}/send`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ lock_version: quote.lock_version })
	});
}

async function messagesFor(quoteId) {
	return serviceRest(
		`/rest/v1/outbound_messages?quote_id=eq.${quoteId}&select=*&order=created_at.asc`
	);
}

async function signedWebhook(payload) {
	const body = JSON.stringify(payload);
	const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');
	return appJson('/api/webhooks/sendpulse', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-sendpulse-signature': signature },
		body
	});
}

async function cleanup() {
	for (const path of documentPaths) {
		await fetch(`${apiUrl}/storage/v1/object/quote-documents/${path}`, {
			method: 'DELETE',
			headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
		}).catch(() => {});
	}
	try {
		run('psql', [
			dbUrl,
			'-X',
			'-v',
			'ON_ERROR_STOP=1',
			'-c',
			`delete from public.outbound_messages where lead_id in (select id from public.leads where external_submission_id like '${prefix}-%'); do $$ begin loop delete from public.quotes q where q.lead_id in (select id from public.leads where external_submission_id like '${prefix}-%') and not exists (select 1 from public.quotes child where child.supersedes_quote_id = q.id); exit when not found; end loop; end $$; delete from public.leads where external_submission_id like '${prefix}-%'; delete from public.inbound_submissions where external_submission_id like '${prefix}-%';`
		]);
	} catch {
		// The next local reset remains the recovery path for an interrupted test.
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

let passed = 0;
try {
	const user = await createUser('sales');
	const finalizationLead = await createLead('finalization-failure');
	await reachDecision(finalizationLead, user);
	const finalizationQuote = await createReadyQuote(finalizationLead, user, 'finalization-failure');
	const firstLead = await createLead('delivery');
	await reachDecision(firstLead, user);
	const firstQuote = await createReadyQuote(firstLead, user, 'delivery');
	const frozenRecipient = firstQuote.quote_snapshot?.recipient;
	run('psql', [
		dbUrl,
		'-X',
		'-v',
		'ON_ERROR_STOP=1',
		'-c',
		`update public.leads set first_name = 'Redirected', last_name = 'Lead', email = '${prefix}-redirected@example.test', lock_version = lock_version + 1 where id = '${firstLead.id}';`
	]);
	assert(frozenRecipient?.email, 'Ready Quote did not capture a recipient snapshot');
	await startProvider();
	await startApp();
	await loginApp(user);

	const finalizationFailure = await sendQuoteThroughApp(finalizationQuote);
	assert(
		!finalizationFailure.response.ok &&
			String(finalizationFailure.body?.error).toLowerCase().includes('reconciliation'),
		'Provider success followed by quote finalization failure was not reported as reconciliation-required'
	);
	let finalizationMessages = await messagesFor(finalizationQuote.id);
	assert(
		finalizationMessages.length === 1 &&
			finalizationMessages[0].delivery_status === 'submission_unknown' &&
			finalizationMessages[0].provider_message_id,
		'Provider identity was not retained after quote finalization failure'
	);
	const providerCallsAfterFinalizationFailure = providerAttempt;
	const blockedFinalizationRetry = await sendQuoteThroughApp(
		await serviceQuote(finalizationQuote.id)
	);
	assert(!blockedFinalizationRetry.response.ok, 'Quote finalization uncertainty was retryable');
	assert(
		providerAttempt === providerCallsAfterFinalizationFailure,
		'Quote finalization retry called SendPulse a second time'
	);
	const finalizationReconciled = await mustRpc(
		'reconcile_quote_submission',
		{
			p_logical_key: finalizationMessages[0].logical_key,
			p_provider_message_id: finalizationMessages[0].provider_message_id
		},
		serviceRoleKey
	);
	assert(
		finalizationReconciled?.provider_message_id === finalizationMessages[0].provider_message_id,
		'Quote finalization reconciliation did not preserve provider identity'
	);
	finalizationMessages = await messagesFor(finalizationQuote.id);
	const finalizationActivities = await serviceRest(
		`/rest/v1/activities?quote_id=eq.${finalizationQuote.id}&event_type=eq.quote_sent&select=id`
	);
	const finalizationTasks = await serviceRest(
		`/rest/v1/tasks?quote_id=eq.${finalizationQuote.id}&type=eq.follow_up&select=id`
	);
	assert(
		finalizationMessages.length === 1 &&
			finalizationMessages[0].delivery_status === 'submitted' &&
			(await serviceQuote(finalizationQuote.id)).status === 'sent' &&
			finalizationActivities.length === 1 &&
			finalizationTasks.length === 1,
		'Quote finalization reconciliation duplicated or omitted downstream state'
	);
	console.log('RH04 quote provider-success/finalization-failure reconciliation passed');
	passed += 1;

	const send = await sendQuoteThroughApp(firstQuote);
	assert(
		send.response.ok,
		`P8 send success failed (${send.response.status}): ${JSON.stringify(send.body)}`
	);
	let currentQuote = await serviceQuote(firstQuote.id);
	let firstMessages = await messagesFor(firstQuote.id);
	assert(firstMessages.length === 1, 'Send did not create exactly one OutboundMessage');
	assert(
		firstMessages[0].delivery_status === 'submitted',
		'Provider acceptance was not mapped to Submitted'
	);
	assert(firstMessages[0].provider_message_id, 'Provider message ID was not persisted');
	assert(currentQuote.status === 'sent', 'Successful send did not transition Quote to sent');
	assert(
		lastProviderBody?.email?.attachments?.[0]?.content,
		'SendPulse request did not include the frozen PDF'
	);
	assert(
		lastProviderBody.email.to?.[0]?.email === currentQuote.quote_snapshot?.recipient?.email,
		'SendPulse recipient did not match the frozen current Quote revision'
	);
	assert(
		lastProviderBody.email.text?.includes(`Revision ${currentQuote.revision_number}`),
		'Branded Quote plain-text email was not submitted'
	);
	assert(
		lastProviderBody.email.html?.includes('max-width:600px') &&
			lastProviderBody.email.html?.includes(`Revision ${currentQuote.revision_number}`),
		'Responsive branded Quote HTML was not submitted'
	);
	assert(
		!JSON.stringify(lastProviderBody.email).includes('quote-documents') &&
			!JSON.stringify(lastProviderBody.email).includes('internal_notes'),
		'Quote email exposed private Storage or internal-note data'
	);
	assert(
		currentQuote.document_path && currentQuote.document_hash && currentQuote.document_generated_at,
		'Document metadata is incomplete'
	);
	documentPaths.push(currentQuote.document_path);
	const artifact = await fetch(
		`${apiUrl}/storage/v1/object/quote-documents/${currentQuote.document_path}`
	);
	assert(!artifact.ok, 'Anonymous Storage access to a quote document was allowed');
	const authorizedDocument = await fetch(`${appUrl}/api/quotes/${firstQuote.id}/document`, {
		headers: { cookie: appCookie }
	});
	assert(
		authorizedDocument.ok &&
			(authorizedDocument.headers.get('content-type') ?? '').includes('application/pdf'),
		'Authorized document retrieval failed'
	);
	const documentBytes = new Uint8Array(await authorizedDocument.arrayBuffer());
	const documentHash = createHash('sha256').update(documentBytes).digest('hex');
	assert(
		documentHash === currentQuote.document_hash,
		'Stored document hash does not match the private artifact'
	);
	const attachmentBytes = Buffer.from(lastProviderBody.email.attachments[0].content, 'base64');
	assert(
		createHash('sha256').update(attachmentBytes).digest('hex') === currentQuote.document_hash,
		'SendPulse received bytes that differ from the privately stored PDF'
	);
	assert(
		currentQuote.document_mime_type === 'application/pdf' &&
			currentQuote.document_template_version === 'professional-v2' &&
			currentQuote.document_generator_version === 'quote-pdf-v2.1.0',
		'New Quote document provenance is incomplete or does not identify Template v2'
	);
	assert(
		Object.prototype.hasOwnProperty.call(currentQuote.quote_snapshot ?? {}, 'bank_details'),
		'Ready Quote did not freeze bank details for document generation'
	);
	console.log('P8-T01 document determinism and stored hash passed');
	console.log('P8-T02 private storage passed');
	console.log('P25-T03 Template v2 private attachment provenance passed');
	passed += 2;

	const tampered = await request(
		`/rest/v1/quotes?id=eq.${firstQuote.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: JSON.stringify({ document_path: 'quotes/tampered.pdf', document_hash: '0'.repeat(64) })
		},
		serviceRoleKey,
		serviceRoleKey
	);
	assert(!tampered.response.ok, 'Sent Quote document metadata was mutable');
	console.log('P8-T03 document immutability passed');
	passed += 1;

	console.log('P8-T04 send success and Submitted state passed');
	passed += 1;

	const failureLead = await createLead('retry');
	await reachDecision(failureLead, user);
	let retryQuote = await createReadyQuote(failureLead, user, 'retry');
	providerMode = 'failure';
	const failure = await sendQuoteThroughApp(retryQuote);
	assert(!failure.response.ok, 'Deterministic SendPulse failure unexpectedly succeeded');
	let retryMessages = await messagesFor(retryQuote.id);
	assert(
		retryMessages.length === 1 && retryMessages[0].delivery_status === 'failed',
		'Provider failure was not recorded as Failed'
	);
	assert(
		(await serviceQuote(retryQuote.id)).status === 'ready',
		'Failed send falsely marked the Quote sent'
	);
	providerMode = 'success';
	retryQuote = await serviceQuote(retryQuote.id);
	const retry = await sendQuoteThroughApp(retryQuote);
	assert(retry.response.ok, `Failed-send retry did not succeed (${retry.response.status})`);
	retryMessages = await messagesFor(retryQuote.id);
	assert(
		retryMessages.length === 1 && retryMessages[0].attempt_count === 2,
		'Retry created a duplicate outbound message or did not increment the attempt'
	);
	const retryActivities = await serviceRest(
		`/rest/v1/activities?quote_id=eq.${retryQuote.id}&event_type=eq.quote_sent&select=id`
	);
	const retryTasks = await serviceRest(
		`/rest/v1/tasks?quote_id=eq.${retryQuote.id}&type=eq.follow_up&select=id`
	);
	assert(retryActivities.length === 1 && retryTasks.length === 1, 'Retry duplicated CRM state');
	console.log('P8-T05 send failure passed');
	console.log('P8-T06 safe retry passed');
	passed += 2;

	const providerMessageId = firstMessages[0].provider_message_id;
	const webhookBody = JSON.stringify({
		message_id: providerMessageId,
		event: 'delivered',
		event_id: `${prefix}-boundary`
	});
	const webhookSignature = createHmac('sha256', webhookSecret).update(webhookBody).digest('hex');
	const rejectedWebhook = await appJson('/api/webhooks/sendpulse', {
		method: 'POST',
		headers: { 'content-type': 'text/plain', 'x-sendpulse-signature': webhookSignature },
		body: webhookBody
	});
	const wrongSignature = await appJson('/api/webhooks/sendpulse', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-sendpulse-signature': '00' },
		body: webhookBody
	});
	assert(
		rejectedWebhook.response.status === 415 && wrongSignature.response.status === 401,
		'SendPulse webhook did not enforce content type and signature boundaries'
	);
	console.log('P8-T16 webhook defense-in-depth passed');
	passed += 1;

	const deliveredPayload = {
		event_id: `${prefix}-delivery`,
		message_id: providerMessageId,
		event: 'delivered',
		timestamp: '2099-01-01T00:00:00.000Z'
	};
	let webhook = await signedWebhook(deliveredPayload);
	assert(webhook.response.ok, `Delivery webhook failed (${webhook.response.status})`);
	firstMessages = await messagesFor(firstQuote.id);
	assert(
		firstMessages[0].delivery_status === 'delivered',
		'Delivery webhook did not transition the message'
	);
	let events = await serviceRest(
		`/rest/v1/message_events?outbound_message_id=eq.${firstMessages[0].id}&select=*`
	);
	let deliveryActivities = await serviceRest(
		`/rest/v1/activities?outbound_message_id=eq.${firstMessages[0].id}&event_type=eq.quote_email_delivered&select=id`
	);
	assert(
		events.length === 1 && deliveryActivities.length === 1,
		'Delivery webhook did not append one event and activity'
	);
	webhook = await signedWebhook(deliveredPayload);
	assert(
		webhook.response.ok && webhook.body?.results?.[0]?.idempotent === true,
		'Duplicate delivery webhook was not idempotent'
	);
	events = await serviceRest(
		`/rest/v1/message_events?outbound_message_id=eq.${firstMessages[0].id}&select=id`
	);
	deliveryActivities = await serviceRest(
		`/rest/v1/activities?outbound_message_id=eq.${firstMessages[0].id}&event_type=eq.quote_email_delivered&select=id`
	);
	assert(
		events.length === 1 && deliveryActivities.length === 1,
		'Duplicate webhook appended duplicate business evidence'
	);
	console.log('P8-T07 delivery webhook passed');
	console.log('P8-T08 webhook deduplication passed');
	passed += 2;

	await signedWebhook({
		event_id: `${prefix}-open`,
		message_id: providerMessageId,
		event: 'open',
		timestamp: '2099-01-01T00:01:00.000Z'
	});
	await signedWebhook({
		event_id: `${prefix}-click`,
		message_id: providerMessageId,
		event: 'click',
		timestamp: '2099-01-01T00:02:00.000Z'
	});
	firstMessages = await messagesFor(firstQuote.id);
	events = await serviceRest(
		`/rest/v1/message_events?outbound_message_id=eq.${firstMessages[0].id}&select=id,event_type`
	);
	deliveryActivities = await serviceRest(
		`/rest/v1/activities?outbound_message_id=eq.${firstMessages[0].id}&event_type=eq.quote_email_delivered&select=id`
	);
	assert(
		firstMessages[0].delivery_status === 'delivered' &&
			events.length === 3 &&
			deliveryActivities.length === 1,
		'Open/click events changed delivery semantics'
	);
	console.log('P8-T09 open/click engagement semantics passed');
	passed += 1;

	const authDocs = readFileSync('docs/EMAIL_AUTH_READINESS.md', 'utf8');
	assert(
		authDocs.includes('SPF') &&
			authDocs.includes('DKIM') &&
			authDocs.includes('DMARC') &&
			authDocs.includes('live DNS'),
		'Email authentication readiness contract is incomplete'
	);
	console.log('P8-T10 sender-domain authentication readiness passed');
	passed += 1;

	const uncertainLead = await createLead('uncertain');
	await reachDecision(uncertainLead, user);
	const uncertainQuote = await createReadyQuote(uncertainLead, user, 'uncertain');
	providerMode = 'unknown';
	const uncertainSend = await sendQuoteThroughApp(uncertainQuote);
	assert(!uncertainSend.response.ok, 'Lost provider acknowledgement unexpectedly succeeded');
	let uncertainMessages = await messagesFor(uncertainQuote.id);
	assert(
		uncertainMessages.length === 1 && uncertainMessages[0].delivery_status === 'submission_unknown',
		'Lost provider acknowledgement was not persisted as submission_unknown'
	);
	assert(
		(await serviceQuote(uncertainQuote.id)).status === 'ready',
		'Uncertain send changed Quote state'
	);
	const attemptsBeforeBlockedRetry = providerAttempt;
	providerMode = 'success';
	const blockedRetry = await sendQuoteThroughApp(await serviceQuote(uncertainQuote.id));
	assert(!blockedRetry.response.ok, 'Uncertain submission was retried automatically');
	assert(
		providerAttempt === attemptsBeforeBlockedRetry,
		'Blocked uncertainty retry called the provider'
	);
	console.log('P8-T12 ambiguous provider outcome and controlled retry passed');
	passed += 1;

	const logicalKey = uncertainMessages[0].logical_key;
	const reconciled = await mustRpc(
		'reconcile_quote_submission',
		{ p_logical_key: logicalKey, p_provider_message_id: `${prefix}-reconciled-provider` },
		serviceRoleKey
	);
	assert(
		reconciled?.provider_message_id === `${prefix}-reconciled-provider`,
		'Provider reconciliation did not map the ID'
	);
	uncertainMessages = await messagesFor(uncertainQuote.id);
	assert(
		uncertainMessages.length === 1 &&
			uncertainMessages[0].delivery_status === 'submitted' &&
			(await serviceQuote(uncertainQuote.id)).status === 'sent',
		'Reconciliation did not complete the uncertain Quote send'
	);
	console.log('P8-T14 provider reconciliation passed');
	passed += 1;

	const hardBouncePayload = {
		event_id: `${prefix}-hard-bounce`,
		message_id: `${prefix}-reconciled-provider`,
		event: 'hard_bounce',
		timestamp: '2099-01-01T00:03:00.000Z'
	};
	let hardBounce = await signedWebhook(hardBouncePayload);
	assert(
		hardBounce.response.ok,
		`Hard bounce webhook failed (${hardBounce.response.status}): ${JSON.stringify(hardBounce.body)}`
	);
	const bouncedLead = await leadById(uncertainLead.id);
	assert(
		bouncedLead.attention_state === 'waiting_on_us',
		'Hard bounce did not return attention to waiting_on_us'
	);
	uncertainMessages = await messagesFor(uncertainQuote.id);
	assert(
		uncertainMessages[0].delivery_status === 'bounced',
		'Hard bounce did not mark message bounced'
	);
	let remediationTasks = await serviceRest(
		`/rest/v1/tasks?automation_key=eq.${encodeURIComponent(`hard-bounce:${uncertainMessages[0].id}`)}&select=id`
	);
	assert(remediationTasks.length === 1, 'Hard bounce did not create exactly one corrective Task');
	hardBounce = await signedWebhook(hardBouncePayload);
	assert(
		hardBounce.response.ok && hardBounce.body?.results?.[0]?.idempotent === true,
		'Hard bounce replay was not idempotent'
	);
	remediationTasks = await serviceRest(
		`/rest/v1/tasks?automation_key=eq.${encodeURIComponent(`hard-bounce:${uncertainMessages[0].id}`)}&select=id`
	);
	assert(remediationTasks.length === 1, 'Hard bounce replay duplicated corrective Task');
	console.log('P8-T18 hard-bounce remediation and idempotency passed');
	passed += 1;
} finally {
	await stopApp();
	if (provider) await new Promise((resolve) => provider.close(resolve));
	await cleanup();
}

assert(passed === 15, `Expected 15 P8 focused tests, received ${passed}`);
console.log(
	`P8 focused integration tests passed (${passed} tests; P8-T11/P8-T13/P8-T15/P8-T17 are covered by adjacent unit/security gates)`
);
