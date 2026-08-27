import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import {
	assert,
	authenticated,
	apiUrl,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRoleKey,
	serviceRows,
	signIn,
	sql,
	sqlLiteral
} from './p14-test-utils.mjs';

const users = [];
const createdLeadIds = [];

function localJwtSecret() {
	const output = execFileSync('bunx', ['supabase', 'status', '-o', 'env'], {
		cwd: process.cwd(),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
	const values = Object.fromEntries(
		output
			.trim()
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
	return values.JWT_SECRET;
}

function aal2Token(userId) {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
		aud: 'authenticated',
		role: 'authenticated',
		sub: userId,
		aal: 'aal2',
		session_id: `${prefix}-${userId}`,
		iat: now,
		exp: now + 600
	})}`;
	return `${unsigned}.${createHmac('sha256', localJwtSecret()).update(unsigned).digest('base64url')}`;
}

async function expectRpcFailure(name, args, user, label, token = null) {
	const result = await rpc(name, args, undefined, token ?? (await signIn(user)));
	assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
	return result;
}

async function leadById(id, user) {
	return (await serviceRows(`/rest/v1/leads?id=eq.${id}&select=*`, user))[0];
}

async function quoteById(id, user) {
	return (await serviceRows(`/rest/v1/quotes?id=eq.${id}&select=*`, user))[0];
}

async function createLead(user, label, payload = {}) {
	const externalId = `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
	const result = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'v140-review-form',
			p_external_submission_id: externalId,
			p_payload: {
				first_name: 'Review',
				last_name: label,
				email: `${externalId}@example.test`,
				phone: '+27820000140',
				message: 'Review fixture with meaningful enquiry details',
				...payload
			}
		},
		serviceRoleKey
	);
	createdLeadIds.push(result.lead_id);
	return { id: result.lead_id, externalId };
}

async function moveToDecision(lead, user) {
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await leadById(lead.id, user);
		await mustRpc(
			'transition_lead',
			{ p_lead_id: lead.id, p_to_stage: stage, p_lock_version: current.lock_version },
			undefined,
			await signIn(user)
		);
	}
}

async function createSentQuote(lead, user, label) {
	const draft = await mustRpc(
		'create_minimal_quote',
		{
			p_lead_id: lead.id,
			p_subject: `Review ${label} quote`,
			p_item_name: `Review ${label} work`,
			p_quantity: '1',
			p_unit_price: '140.00',
			p_tax_rate: '15'
		},
		undefined,
		await signIn(user)
	);
	const prepared = await mustRpc(
		'prepare_quote_send',
		{ p_quote_id: draft.quote_id, p_lock_version: draft.lock_version },
		undefined,
		await signIn(user)
	);
	await mustRpc(
		'complete_quote_send',
		{
			p_outbound_message_id: prepared.outbound_message_id,
			p_provider_message_id: `${prefix}-provider-${draft.quote_id}`
		},
		undefined,
		await signIn(user)
	);
	return quoteById(draft.quote_id, user);
}

async function testLegacyAcceptanceRequiresHandoff(sales) {
	const lead = await createLead(sales, 'legacy-accept');
	await moveToDecision(lead, sales);
	const quote = await createSentQuote(lead, sales, 'legacy-accept');
	const accepted = await mustRpc(
		'accept_quote',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(accepted.fulfilment_case_id, 'Two-argument acceptance returned no FulfilmentCase');
	assert(accepted.client_id, 'Two-argument acceptance returned no Client');
	assert(accepted.planning_task_id, 'Two-argument acceptance returned no planning Task');
	const cases = await serviceRows(
		`/rest/v1/fulfilment_cases?accepted_quote_id=eq.${quote.id}&select=id`,
		sales
	);
	assert(cases.length === 1, 'Two-argument acceptance did not create exactly one case');
	console.log('P0-01 legacy acceptance handoff passed');
}

async function testLegacyDeclineIsNotAQuoteOnlyMutation(sales) {
	const lead = await createLead(sales, 'legacy-decline');
	await moveToDecision(lead, sales);
	const quote = await createSentQuote(lead, sales, 'legacy-decline');
	await expectRpcFailure(
		'decline_quote',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version },
		sales,
		'Two-argument decline'
	);
	const unchangedQuote = await quoteById(quote.id, sales);
	const unchangedLead = await leadById(lead.id, sales);
	assert(unchangedQuote.status === 'sent', 'Rejected legacy decline changed Quote state');
	assert(unchangedLead.pipeline_stage === 'DECISION', 'Rejected legacy decline changed Lead state');
	console.log('P0-02 legacy decline boundary passed');
}

async function testGenericQuoteTerminalTransitionIsPrivate(sales) {
	const lead = await createLead(sales, 'generic-quote');
	await moveToDecision(lead, sales);
	const quote = await createSentQuote(lead, sales, 'generic-quote');
	await expectRpcFailure(
		'transition_quote_status',
		{ p_quote_id: quote.id, p_lock_version: quote.lock_version, p_to_status: 'accepted' },
		sales,
		'Authenticated generic Quote acceptance'
	);
	assert(
		(await quoteById(quote.id, sales)).status === 'sent',
		'Private generic transition changed Quote'
	);
	console.log('P0-02 generic Quote transition boundary passed');
}

async function testReopenRequiresAal2(owner) {
	const lead = await createLead(owner, 'reopen-aal2');
	const current = await leadById(lead.id, owner);
	const reason = (await serviceRows('/rest/v1/lost_reasons?code=eq.price&select=id', owner))[0];
	await mustRpc(
		'transition_lead',
		{
			p_lead_id: lead.id,
			p_to_stage: 'LOST',
			p_lock_version: current.lock_version,
			p_lost_reason_id: reason.id,
			p_lost_notes: 'Review reopen fixture'
		},
		undefined,
		await signIn(owner)
	);
	const lost = await leadById(lead.id, owner);
	const beforeAudit = Number(
		sql(
			`select count(*) from public.security_audit_events where target_type = 'lead' and target_id = ${sqlLiteral(lead.id)}`
		)
	);
	await expectRpcFailure(
		'reopen_lead',
		{ p_lead_id: lead.id, p_lock_version: lost.lock_version, p_reason: 'Review AAL2 boundary' },
		owner,
		'AAL1 reopen',
		await signIn(owner)
	);
	assert(
		(await leadById(lead.id, owner)).pipeline_stage === 'LOST',
		'AAL1 reopen changed Lead state'
	);
	const reopened = await mustRpc(
		'reopen_lead',
		{ p_lead_id: lead.id, p_lock_version: lost.lock_version, p_reason: 'Review AAL2 boundary' },
		undefined,
		aal2Token(owner.id)
	);
	assert(reopened.pipeline_stage === 'QUALIFICATION', 'AAL2 reopen did not reopen Lead');
	const afterAudit = Number(
		sql(
			`select count(*) from public.security_audit_events where target_type = 'lead' and target_id = ${sqlLiteral(lead.id)}`
		)
	);
	assert(afterAudit === beforeAudit + 1, 'AAL2 reopen did not write a security audit event');
	console.log('P0-03 reopen AAL2 and audit boundary passed');
}

async function testQualificationInsertAndTransitionGuards(sales) {
	const raw = await authenticated(
		'/rest/v1/leads',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
			body: JSON.stringify({
				first_name: 'Forged',
				last_name: 'Qualification',
				email: `${prefix}-forged@example.test`,
				message: 'Raw insert fixture',
				qualification_notes: 'forged qualification evidence',
				qualification_started_at: new Date().toISOString(),
				qualified_at: new Date().toISOString()
			})
		},
		sales
	);
	assert(!raw.response.ok, 'Raw Lead INSERT accepted qualification evidence');

	const incomplete = await createLead(sales, 'incomplete-qualification', {
		email: null,
		phone: null,
		message: null
	});
	const started = await leadById(incomplete.id, sales);
	await mustRpc(
		'transition_lead',
		{ p_lead_id: incomplete.id, p_to_stage: 'QUALIFICATION', p_lock_version: started.lock_version },
		undefined,
		await signIn(sales)
	);
	const qualification = await leadById(incomplete.id, sales);
	await expectRpcFailure(
		'transition_lead',
		{
			p_lead_id: incomplete.id,
			p_to_stage: 'PROPOSAL',
			p_lock_version: qualification.lock_version
		},
		sales,
		'Qualification transition without evidence'
	);
	assert(
		(await leadById(incomplete.id, sales)).pipeline_stage === 'QUALIFICATION',
		'Qualification transition without evidence changed Lead state'
	);
	console.log('P0-04 qualification provenance and P1-02 transition guards passed');
}

async function testCompatibilityConversionAudit(sales) {
	const lead = await createLead(sales, 'compatibility-conversion');
	await moveToDecision(lead, sales);
	const before = Number(
		sql(
			`select count(*) from public.security_audit_events where target_type = 'lead' and target_id = ${sqlLiteral(lead.id)} and action = 'lead_converted_compatibility'`
		)
	);
	await mustRpc(
		'convert_lead',
		{ p_lead_id: lead.id, p_lock_version: (await leadById(lead.id, sales)).lock_version },
		undefined,
		await signIn(sales)
	);
	const after = Number(
		sql(
			`select count(*) from public.security_audit_events where target_type = 'lead' and target_id = ${sqlLiteral(lead.id)} and action = 'lead_converted_compatibility'`
		)
	);
	assert(after === before + 1, 'Compatibility conversion did not record security audit evidence');
	console.log('P1-01 compatibility conversion policy and audit passed');
}

function testRealtimePublication() {
	const published = sql(
		"select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename"
	)
		.split('\n')
		.filter(Boolean);
	for (const table of [
		'activities',
		'fulfilment_cases',
		'fulfilment_steps',
		'payment_milestones',
		'quotes',
		'tasks'
	]) {
		assert(published.includes(table), `Realtime publication is missing ${table}`);
	}
	console.log('P1-07 Realtime publication coverage passed');
}

try {
	const owner = await createUser('owner', 'review-owner');
	const sales = await createUser('sales', 'review-sales');
	users.push(owner, sales);
	await testLegacyAcceptanceRequiresHandoff(sales);
	await testLegacyDeclineIsNotAQuoteOnlyMutation(sales);
	await testGenericQuoteTerminalTransitionIsPrivate(sales);
	await testReopenRequiresAal2(owner);
	await testQualificationInsertAndTransitionGuards(sales);
	await testCompatibilityConversionAudit(sales);
	testRealtimePublication();
	console.log('v1.4 review hardening contract passed');
} finally {
	for (const id of createdLeadIds) {
		await fetch(`${apiUrl}/rest/v1/leads?id=eq.${id}`, {
			method: 'DELETE',
			headers: {
				apikey: serviceRoleKey,
				Authorization: `Bearer ${serviceRoleKey}`
			}
		}).catch(() => {});
	}
	await cleanup(users);
}
