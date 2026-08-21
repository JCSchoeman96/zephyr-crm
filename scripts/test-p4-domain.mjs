import { execFileSync } from 'node:child_process';

const root = process.cwd();
const runId = `${Date.now()}`;
const email = `p4-domain-${runId}@example.test`;
const password = `P4-${runId}-DomainPassword9!`;
let userId;
let leadId;
let lostLeadId;
let clientId;

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
let accessToken;

async function parseResponse(response) {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function request(path, init = {}, key = anonKey, token = accessToken) {
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			apikey: key,
			Authorization: `Bearer ${token ?? key}`,
			...(init.headers ?? {})
		}
	});
	const body = await parseResponse(response);
	if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status})`);
	return body;
}

async function rpc(name, args, key = anonKey, token = accessToken) {
	return request(
		`/rest/v1/rpc/${name}`,
		{ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) },
		key,
		token
	);
}

async function main() {
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: 'P4 Domain Test' }
			})
		},
		serviceRoleKey,
		null
	);
	userId = created.id;
	await rpc(
		'provision_invited_profile',
		{ p_user_id: userId, p_role: 'sales', p_status: 'active' },
		serviceRoleKey,
		null
	);

	const session = await request(
		'/auth/v1/token?grant_type=password',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password })
		},
		anonKey,
		null
	);
	accessToken = session.access_token;

	const payload = {
		first_name: 'Ada',
		last_name: 'Tracer',
		email: 'ada.tracer@example.test',
		phone: '+27110000000',
		company: 'Tracer Works',
		message: 'Please quote for a small project.',
		source: 'bricks'
	};
	const intake = await rpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'contact-form',
			p_external_submission_id: `submission-${runId}`,
			p_payload: payload
		},
		serviceRoleKey,
		null
	);
	leadId = intake.lead_id;
	if (intake.duplicate || !leadId) throw new Error('Initial intake did not create a Lead');
	const duplicate = await rpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'contact-form',
			p_external_submission_id: `submission-${runId}`,
			p_payload: payload
		},
		serviceRoleKey,
		null
	);
	if (!duplicate.duplicate || duplicate.lead_id !== leadId)
		throw new Error('Intake retry was not idempotent');

	let lead = (await request(`/rest/v1/leads?id=eq.${leadId}&select=*`))[0];
	let result = await rpc('transition_lead', {
		p_lead_id: leadId,
		p_to_stage: 'QUALIFICATION',
		p_lock_version: lead.lock_version
	});
	if (result.pipeline_stage !== 'QUALIFICATION') throw new Error('Qualification transition failed');
	lead = (await request(`/rest/v1/leads?id=eq.${leadId}&select=*`))[0];
	result = await rpc('transition_lead', {
		p_lead_id: leadId,
		p_to_stage: 'PROPOSAL',
		p_lock_version: lead.lock_version
	});
	if (result.pipeline_stage !== 'PROPOSAL') throw new Error('Proposal transition failed');

	const quote = await rpc('create_minimal_quote', {
		p_lead_id: leadId,
		p_subject: 'Tracer bullet quote',
		p_item_name: 'Implementation',
		p_quantity: 2,
		p_unit_price: 1250,
		p_tax_rate: 15
	});
	if (quote.status !== 'ready' || quote.total !== 2875)
		throw new Error('Minimal quote totals or state are incorrect');
	const prepared = await rpc('prepare_quote_send', {
		p_quote_id: quote.quote_id,
		p_lock_version: quote.lock_version
	});
	if (!prepared.outbound_message_id || prepared.in_flight)
		throw new Error('Quote send preparation failed');
	const completed = await rpc('complete_quote_send', {
		p_outbound_message_id: prepared.outbound_message_id,
		p_provider_message_id: `provider-${runId}`
	});
	if (!completed.task_id) throw new Error('Quote send did not create a follow-up task');

	lead = (await request(`/rest/v1/leads?id=eq.${leadId}&select=*`))[0];
	if (lead.pipeline_stage !== 'DECISION' || lead.attention_state !== 'waiting_on_client')
		throw new Error('Quote send did not set Decision/waiting_on_client');
	const won = await rpc('convert_lead', { p_lead_id: leadId, p_lock_version: lead.lock_version });
	clientId = won.client_id;
	if (!clientId || won.idempotent) throw new Error('Lead conversion did not create a Client');
	const client = (await request(`/rest/v1/clients?id=eq.${clientId}&select=*`))[0];
	if (client.source_lead_id !== leadId) throw new Error('Client is not linked to source Lead');

	const lostIntake = await rpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'contact-form',
			p_external_submission_id: `lost-${runId}`,
			p_payload: { ...payload, email: 'lost@example.test' }
		},
		serviceRoleKey,
		null
	);
	lostLeadId = lostIntake.lead_id;
	const lostLead = (await request(`/rest/v1/leads?id=eq.${lostLeadId}&select=*`))[0];
	const lostReason = (await request('/rest/v1/lost_reasons?code=eq.price&select=id'))[0];
	const lost = await rpc('transition_lead', {
		p_lead_id: lostLeadId,
		p_to_stage: 'LOST',
		p_lock_version: lostLead.lock_version,
		p_lost_reason_id: lostReason.id,
		p_lost_notes: ''
	});
	if (lost.pipeline_stage !== 'LOST') throw new Error('Lost path did not persist');

	console.log(
		'P4 domain contract passed: idempotent Bricks intake, legal Lead path, Quote totals, SendPulse acknowledgement persistence, follow-up Task, Won conversion, and Lost validation.'
	);
}

try {
	await main();
} finally {
	if (clientId)
		await request(
			`/rest/v1/clients?id=eq.${clientId}`,
			{ method: 'DELETE' },
			serviceRoleKey,
			null
		).catch(() => {});
	if (leadId)
		await request(
			`/rest/v1/leads?id=eq.${leadId}`,
			{ method: 'DELETE' },
			serviceRoleKey,
			null
		).catch(() => {});
	if (lostLeadId)
		await request(
			`/rest/v1/leads?id=eq.${lostLeadId}`,
			{ method: 'DELETE' },
			serviceRoleKey,
			null
		).catch(() => {});
	if (userId) {
		await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
			method: 'DELETE',
			headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
		}).catch(() => {});
	}
}
