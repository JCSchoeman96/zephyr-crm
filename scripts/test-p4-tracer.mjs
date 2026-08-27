import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const root = process.cwd();
const runId = `${Date.now()}`;
const email = `p4-tracer-${runId}@example.test`;
const password = `P4-${runId}-TracerPassword9!`;
const appUrl = 'http://127.0.0.1:4175';
const providerUrl = 'http://127.0.0.1:4176';
const bricksSecret = `p4-bricks-secret-${runId}`;
let userId;
let leadId;
let lostLeadId;
let clientId;
let app;
let provider;

function run(command, args) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
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
let cookie = '';

async function bodyJson(response) {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function waitFor(url) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// Local server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function authAdmin(path, init = {}) {
	const response = await fetch(`${apiUrl}/auth/v1/admin${path}`, {
		...init,
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			...(init.headers ?? {})
		}
	});
	const body = await bodyJson(response);
	if (!response.ok) throw new Error(`Auth admin request failed (${response.status})`);
	return body;
}

async function rest(path, init = {}) {
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			...(init.headers ?? {})
		}
	});
	if (!response.ok) throw new Error(`REST cleanup/query failed (${response.status})`);
	return bodyJson(response);
}

async function postForm(path, values) {
	const response = await fetch(`${appUrl}${path}`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(values)
	});
	if (response.status !== 303) {
		const body = await response.text();
		throw new Error(`Form ${path} failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
	}
	return response;
}

async function getPage(path) {
	const response = await fetch(`${appUrl}${path}`, { headers: { cookie } });
	if (!response.ok) throw new Error(`Page ${path} failed with HTTP ${response.status}`);
	return response.text();
}

function hiddenValue(html, name, occurrence = 0) {
	const matches = [...html.matchAll(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'g'))];
	const value = matches[occurrence]?.[1];
	if (!value) throw new Error(`Could not find hidden ${name} in page response`);
	return value;
}

function optionValue(html, selectName) {
	const select = html.match(new RegExp(`name="${selectName}"[\\s\\S]*?</select>`))?.[0] ?? '';
	const value = (select || html).match(/value="([0-9a-f-]{36})"[^>]*>Price<\/option>/)?.[1];
	if (!value) throw new Error('Could not find seeded Price lost reason');
	return value;
}

function startProvider() {
	return new Promise((resolve) => {
		provider = createServer(async (request, response) => {
			let body = '';
			for await (const chunk of request) body += chunk;
			response.setHeader('content-type', 'application/json');
			if (request.url === '/oauth/access_token') {
				response.end(JSON.stringify({ access_token: 'p4-provider-contract-token' }));
				return;
			}
			if (request.url === '/smtp/emails' && body.includes('Tracer bullet quote')) {
				response.end(JSON.stringify({ result: true, id: `provider-message-${runId}` }));
				return;
			}
			response.statusCode = 422;
			response.end(JSON.stringify({ result: false }));
		});
		provider.listen(4176, '127.0.0.1', resolve);
	});
}

async function main() {
	if (!fs.existsSync('supabase/functions/ingest-bricks-lead/index.ts'))
		throw new Error('Bricks Edge Function boundary is missing');
	await startProvider();
	const created = await authAdmin('/users', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: 'P4 Tracer Test' }
		})
	});
	userId = created.id;

	const provision = await fetch(`${apiUrl}/rest/v1/rpc/provision_invited_profile`, {
		method: 'POST',
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ p_user_id: userId, p_role: 'sales', p_status: 'active' })
	});
	if (!provision.ok) throw new Error('Trusted profile provisioning failed');

	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4175'], {
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
			BRICKS_FORM_ID: 'contact-form',
			SENDPULSE_CLIENT_ID: 'p4-contract-client',
			SENDPULSE_CLIENT_SECRET: 'p4-contract-secret',
			SENDPULSE_API_BASE_URL: providerUrl,
			SENDPULSE_SENDER_EMAIL: 'crm@example.test',
			SENDPULSE_SENDER_NAME: 'Zephyr CRM'
		}
	});
	await waitFor(`${appUrl}/login`);

	const login = await fetch(`${appUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email, password })
	});
	if (login.status !== 303) throw new Error(`Tracer user login failed (HTTP ${login.status})`);
	cookie = login.headers
		.getSetCookie()
		.map((value) => value.split(';', 1)[0])
		.join('; ');
	if (!cookie) throw new Error('Tracer login did not return a session cookie');

	const payload = {
		form_id: 'contact-form',
		external_submission_id: randomUUID(),
		first_name: 'Ada',
		last_name: 'Tracer',
		email: 'ada.tracer@example.test',
		phone: '+27110000000',
		company: 'Tracer Works',
		message: 'Please quote for a small project.',
		source: 'bricks'
	};
	const intake = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const intakeBody = await bodyJson(intake);
	if (intake.status !== 201 || intakeBody.duplicate || !intakeBody.lead_id)
		throw new Error('Bricks intake did not create one Lead');
	leadId = intakeBody.lead_id;
	const duplicate = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	const duplicateBody = await bodyJson(duplicate);
	if (duplicate.status !== 200 || !duplicateBody.duplicate || duplicateBody.lead_id !== leadId)
		throw new Error('Bricks retry created a duplicate Lead');

	const leadsPage = await getPage('/leads');
	if (!leadsPage.includes('Ada Tracer'))
		throw new Error('Authenticated staff cannot see the new Lead');
	let detail = await getPage(`/leads/${leadId}`);
	let lock = hiddenValue(detail, 'lock_version');
	await postForm(`/leads/${leadId}?/qualify`, { lock_version: lock });
	detail = await getPage(`/leads/${leadId}`);
	lock = hiddenValue(detail, 'lock_version');
	await postForm(`/leads/${leadId}?/proposal`, { lock_version: lock });
	await postForm(`/leads/${leadId}?/createQuote`, {
		subject: 'Tracer bullet quote',
		item_name: 'Implementation',
		quantity: '2',
		unit_price: '1250',
		tax_rate: '15'
	});

	detail = await getPage(`/leads/${leadId}`);
	const quoteId = hiddenValue(detail, 'quote_id');
	const quoteLock = hiddenValue(detail, 'lock_version', 1);
	await postForm(`/leads/${leadId}?/sendQuote`, { quote_id: quoteId, lock_version: quoteLock });
	detail = await getPage(`/leads/${leadId}`);
	if (
		!detail.includes('Submitted') ||
		!detail.includes('waiting_on_client') ||
		!detail.includes('Follow-up task created')
	) {
		throw new Error('SendPulse contract did not complete the Quote → Task workflow');
	}
	const sentQuoteLock = hiddenValue(detail, 'lock_version', 1);
	await postForm(`/quotes/${quoteId}?/accept`, {
		lock_version: sentQuoteLock,
		acceptance_source: 'tracer_test',
		acceptance_evidence: 'Customer accepted the quote during the tracer journey.'
	});
	detail = await getPage(`/leads/${leadId}`);
	if (!detail.includes('Customer confirmed') || !detail.includes('Fulfilment'))
		throw new Error('Quote acceptance did not create/link the customer and Fulfilment case');
	const clientsPage = await getPage('/clients');
	clientId = clientsPage.match(/href="(?:\.\/|\/)clients\/([0-9a-f-]{36})"/i)?.[1];
	if (!clientId) throw new Error('Won conversion did not expose the created Client link');

	const lostPayload = {
		...payload,
		external_submission_id: randomUUID(),
		email: 'lost.tracer@example.test'
	};
	const lostIntakeResponse = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bricksSecret}`, 'content-type': 'application/json' },
		body: JSON.stringify(lostPayload)
	});
	lostLeadId = (await bodyJson(lostIntakeResponse)).lead_id;
	detail = await getPage(`/leads/${lostLeadId}`);
	const lostLock = hiddenValue(detail, 'lock_version');
	const lostReasonId = optionValue(detail, 'lost_reason_id');
	const invalidLost = await fetch(`${appUrl}/leads/${lostLeadId}?/lost`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ lock_version: lostLock, lost_reason_id: '' })
	});
	await invalidLost.arrayBuffer();
	if (invalidLost.status !== 422)
		throw new Error(`Lost transition without reason was accepted (HTTP ${invalidLost.status})`);
	await postForm(`/leads/${lostLeadId}?/lost`, {
		lock_version: lostLock,
		lost_reason_id: lostReasonId,
		lost_notes: ''
	});
	const lostDetail = await getPage(`/leads/${lostLeadId}`);
	if (!lostDetail.includes('Not proceeding'))
		throw new Error('Lost transition with reason did not persist');

	console.log(
		'P4 tracer bullet passed: authenticated Bricks intake, retry idempotency, Lead visibility, legal qualification, Quote creation, SendPulse adapter contract, follow-up Task, Quote acceptance/customer conversion, and Lost validation.'
	);
}

async function stopApp() {
	if (!app || app.exitCode !== null) {
		app = null;
		return;
	}
	const process = app;
	app = null;
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

async function stopProvider() {
	if (!provider) return;
	const server = provider;
	provider = null;
	if (!server.listening) return;
	await new Promise((resolve) => server.close(resolve));
}

try {
	await main();
} finally {
	await stopApp();
	await stopProvider();
	if (clientId)
		await rest(`/rest/v1/clients?id=eq.${clientId}`, { method: 'DELETE' }).catch(() => {});
	if (leadId) await rest(`/rest/v1/leads?id=eq.${leadId}`, { method: 'DELETE' }).catch(() => {});
	if (lostLeadId)
		await rest(`/rest/v1/leads?id=eq.${lostLeadId}`, { method: 'DELETE' }).catch(() => {});
	if (userId) await authAdmin(`/users/${userId}`, { method: 'DELETE' }).catch(() => {});
}
