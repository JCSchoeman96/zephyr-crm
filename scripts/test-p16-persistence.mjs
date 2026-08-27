import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
	assert,
	authenticated,
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

function expectSqlCount(query, expected, label) {
	const actual = Number(sql(query));
	assert(actual === expected, `${label}: expected ${expected}, received ${actual}`);
}

function sqlScalar(query) {
	return sql(query)
		.split(/\r?\n/)
		.find((line) => line.length > 0 && !/^\w+(?: \d+)+$/.test(line));
}

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

async function schemaContract() {
	const foundationMigration = readFileSync(
		'supabase/migrations/20260826200602_v140_fulfilment_persistence_foundation.sql',
		'utf8'
	);
	assert(
		(foundationMigration.match(/^begin;$/gm) ?? []).length === 1 &&
			(foundationMigration.match(/^commit;$/gm) ?? []).length === 1,
		'P16 foundation migration must apply atomically in one transaction'
	);
	expectSqlCount(
		`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('fulfilment_cases', 'fulfilment_steps', 'payment_milestones') and c.relkind = 'r'`,
		3,
		'fulfilment tables'
	);
	expectSqlCount(
		`select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'leads' and column_name in ('qualification_notes', 'qualification_started_at', 'qualified_at')) or (table_name = 'tasks' and column_name = 'fulfilment_case_id') or (table_name = 'activities' and column_name = 'fulfilment_case_id'))`,
		5,
		'additive lineage and qualification columns'
	);
	expectSqlCount(
		`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fulfilment_cases' and column_name = any(array['id', 'fulfilment_number', 'client_id', 'lead_id', 'accepted_quote_id', 'status', 'created_at', 'updated_at', 'completed_at', 'cancelled_at', 'cancel_reason', 'lock_version'])`,
		12,
		'FulfilmentCase fields'
	);
	expectSqlCount(
		`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fulfilment_steps' and column_name = any(array['id', 'fulfilment_case_id', 'type', 'status', 'scheduled_for', 'completed_at', 'tracking_reference', 'notes', 'created_at', 'updated_at', 'lock_version'])`,
		11,
		'FulfilmentStep fields'
	);
	expectSqlCount(
		`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'payment_milestones' and column_name = any(array['id', 'fulfilment_case_id', 'type', 'status', 'requested_at', 'received_at', 'received_recorded_by', 'note', 'created_at', 'updated_at', 'lock_version'])`,
		11,
		'PaymentMilestone fields'
	);
	expectSqlCount(
		`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('fulfilment_cases', 'fulfilment_steps', 'payment_milestones') and c.relrowsecurity`,
		3,
		'fulfilment RLS'
	);
	expectSqlCount(
		`select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name in ('fulfilment_cases', 'fulfilment_steps', 'payment_milestones') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')`,
		0,
		'raw fulfilment writes'
	);
	expectSqlCount(
		`select count(*) from pg_indexes where schemaname = 'public' and indexname in ('fulfilment_cases_accepted_quote_unique', 'fulfilment_steps_active_type_unique', 'payment_milestones_case_type_unique')`,
		3,
		'fulfilment uniqueness indexes'
	);
	expectSqlCount(
		`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any(array['start_lead_qualification', 'ready_lead_for_quote', 'create_fulfilment_case_for_accepted_quote', 'create_fulfilment_step', 'schedule_fulfilment_step', 'reschedule_fulfilment_step', 'complete_fulfilment_step', 'cancel_fulfilment_step', 'request_payment_milestone', 'record_payment_received', 'mark_payment_not_required', 'correct_payment_milestone', 'complete_fulfilment', 'cancel_fulfilment'])`,
		14,
		'P16 trusted actions'
	);
}

function createAcceptedFixture(label, createdBy) {
	const safeLabel = `${prefix}-${label}`;
	const leadId = sqlScalar(
		`insert into public.leads (first_name, last_name, email, phone, message, external_submission_id) values ('P16', ${sqlLiteral(label)}, ${sqlLiteral(`${safeLabel}@example.test`)}, '+27820000001', 'P16 accepted sale fixture', ${sqlLiteral(`${safeLabel}-lead`)}) returning id`
	);
	const clientId = sqlScalar(
		`insert into public.clients (type, display_name, email, phone, source_lead_id, converted_at) values ('individual', ${sqlLiteral(`P16 ${label}`)}, ${sqlLiteral(`${safeLabel}@example.test`)}, '+27820000001', ${sqlLiteral(leadId)}::uuid, now()) returning id`
	);
	sql(
		`update public.leads set pipeline_stage = 'WON', converted_client_id = ${sqlLiteral(clientId)}::uuid, lock_version = lock_version + 1 where id = ${sqlLiteral(leadId)}::uuid`
	);
	const quoteId = sqlScalar(
		`insert into public.quotes (lead_id, client_id, status, subject, valid_until, quote_snapshot, created_by) values (${sqlLiteral(leadId)}::uuid, ${sqlLiteral(clientId)}::uuid, 'draft', ${sqlLiteral(`P16 ${label} quote`)}, current_date + 30, '{}'::jsonb, ${sqlLiteral(createdBy)}::uuid) returning id`
	);
	sql(
		`insert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal) values (${sqlLiteral(quoteId)}::uuid, 1, 'P16 item', 1, 100, 100); update public.quotes set status = 'ready', ready_at = now(), lock_version = lock_version + 1 where id = ${sqlLiteral(quoteId)}::uuid; update public.quotes set status = 'sent', sent_at = now(), lock_version = lock_version + 1 where id = ${sqlLiteral(quoteId)}::uuid; update public.quotes set status = 'accepted', accepted_at = now(), accepted_by = ${sqlLiteral(createdBy)}::uuid, acceptance_source = 'p16-contract', acceptance_evidence = 'local contract fixture', lock_version = lock_version + 1 where id = ${sqlLiteral(quoteId)}::uuid;`
	);
	return { leadId, clientId, quoteId };
}

async function qualificationContract(sales) {
	const created = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p16-qualification-form',
			p_external_submission_id: `${prefix}-qualification`,
			p_payload: {
				first_name: 'P16',
				last_name: 'Qualification',
				email: `${prefix}-qualification@example.test`,
				message: 'Meaningful enquiry information'
			}
		},
		serviceRoleKey,
		serviceRoleKey
	);
	let lead = (await serviceRows(`/rest/v1/leads?id=eq.${created.lead_id}&select=*`, sales))[0];
	const started = await mustRpc(
		'start_lead_qualification',
		{
			p_lead_id: lead.id,
			p_lock_version: lead.lock_version,
			p_qualification_notes: 'Initial qualification notes'
		},
		undefined,
		await signIn(sales)
	);
	lead = (await serviceRows(`/rest/v1/leads?id=eq.${lead.id}&select=*`, sales))[0];
	assert(
		started.pipeline_stage === 'QUALIFICATION' && lead.qualification_started_at,
		'qualification start evidence missing'
	);
	const ready = await mustRpc(
		'ready_lead_for_quote',
		{ p_lead_id: lead.id, p_lock_version: lead.lock_version },
		undefined,
		await signIn(sales)
	);
	lead = (await serviceRows(`/rest/v1/leads?id=eq.${lead.id}&select=*`, sales))[0];
	assert(
		ready.pipeline_stage === 'PROPOSAL' && lead.qualified_at,
		'qualification completion evidence missing'
	);
	const raw = await authenticated(
		`/rest/v1/leads?id=eq.${lead.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: { qualification_notes: 'untrusted overwrite', lock_version: lead.lock_version }
		},
		sales
	);
	assert(!raw.response.ok, 'raw qualification evidence update bypassed trusted action');
}

async function fulfilmentContract(owner, sales, viewer) {
	const fixture = createAcceptedFixture('primary', owner.id);
	const created = await mustRpc(
		'create_fulfilment_case_for_accepted_quote',
		{ p_quote_id: fixture.quoteId },
		serviceRoleKey,
		serviceRoleKey
	);
	const caseId = created.fulfilment_case_id;
	assert(caseId && created.idempotent === false, 'accepted Quote did not create a FulfilmentCase');
	let fulfilment = (
		await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales)
	)[0];
	assert(
		fulfilment.client_id === fixture.clientId &&
			fulfilment.lead_id === fixture.leadId &&
			fulfilment.accepted_quote_id === fixture.quoteId &&
			fulfilment.status === 'open' &&
			fulfilment.lock_version === 1,
		'FulfilmentCase lineage or initial lock is incorrect'
	);
	const repeated = await mustRpc(
		'create_fulfilment_case_for_accepted_quote',
		{ p_quote_id: fixture.quoteId },
		serviceRoleKey,
		serviceRoleKey
	);
	assert(
		repeated.fulfilment_case_id === caseId && repeated.idempotent === true,
		'repeated case creation was not idempotent'
	);

	const rawCase = await authenticated(
		'/rest/v1/fulfilment_cases',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: {
				client_id: fixture.clientId,
				lead_id: fixture.leadId,
				accepted_quote_id: fixture.quoteId,
				status: 'open'
			}
		},
		sales
	);
	assert(!rawCase.response.ok, 'raw FulfilmentCase INSERT bypassed trusted creation');
	const rawActivity = await authenticated(
		'/rest/v1/activities',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: {
				fulfilment_case_id: caseId,
				actor_id: sales.id,
				event_type: 'bypass',
				summary: 'untrusted fulfilment activity'
			}
		},
		sales
	);
	assert(!rawActivity.response.ok, 'raw Fulfilment Activity INSERT bypassed trusted evidence');

	const rawViewer = await serviceRows(
		`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=id,status`,
		viewer
	);
	assert(rawViewer.length === 1, 'active viewer cannot read FulfilmentCase');
	await expectRpcFailure(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'installation',
			p_lock_version: fulfilment.lock_version
		},
		viewer,
		'viewer FulfilmentStep creation'
	);

	let task = await mustRpc(
		'create_task',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'plan_fulfilment',
			p_title: `${prefix} plan fulfilment`
		},
		undefined,
		await signIn(sales)
	);
	const taskRow = (await serviceRows(`/rest/v1/tasks?id=eq.${task.task_id}&select=*`, sales))[0];
	assert(
		taskRow.fulfilment_case_id === caseId &&
			taskRow.client_id === fixture.clientId &&
			taskRow.lead_id === fixture.leadId &&
			taskRow.quote_id === fixture.quoteId,
		'Fulfilment Task lineage was not derived from the case'
	);
	await expectRpcFailure(
		'create_task',
		{
			p_fulfilment_case_id: caseId,
			p_client_id: '00000000-0000-0000-0000-000000000001',
			p_type: 'custom',
			p_title: `${prefix} mismatched fulfilment task`
		},
		sales,
		'mismatched Fulfilment Task lineage'
	);
	const rawTask = await authenticated(
		`/rest/v1/tasks?id=eq.${task.task_id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: { fulfilment_case_id: null }
		},
		sales
	);
	assert(!rawTask.response.ok, 'raw Fulfilment Task lineage update bypassed trusted action');

	fulfilment = (await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales))[0];
	const step = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'installation',
			p_lock_version: fulfilment.lock_version,
			p_notes: 'Installation fixture'
		},
		undefined,
		await signIn(sales)
	);
	await expectRpcFailure(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'installation',
			p_lock_version: step.fulfilment_case_lock_version
		},
		sales,
		'duplicate active installation step'
	);
	let stepRow = (
		await serviceRows(`/rest/v1/fulfilment_steps?id=eq.${step.step_id}&select=*`, sales)
	)[0];
	await expectRpcFailure(
		'schedule_fulfilment_step',
		{ p_step_id: step.step_id, p_lock_version: 999, p_scheduled_for: '2099-01-01T09:00:00Z' },
		sales,
		'stale FulfilmentStep schedule'
	);
	await mustRpc(
		'schedule_fulfilment_step',
		{
			p_step_id: step.step_id,
			p_lock_version: stepRow.lock_version,
			p_scheduled_for: '2099-01-01T09:00:00Z'
		},
		undefined,
		await signIn(sales)
	);
	stepRow = (
		await serviceRows(`/rest/v1/fulfilment_steps?id=eq.${step.step_id}&select=*`, sales)
	)[0];
	await mustRpc(
		'reschedule_fulfilment_step',
		{
			p_step_id: step.step_id,
			p_lock_version: stepRow.lock_version,
			p_scheduled_for: '2099-01-02T09:00:00Z'
		},
		undefined,
		await signIn(sales)
	);
	stepRow = (
		await serviceRows(`/rest/v1/fulfilment_steps?id=eq.${step.step_id}&select=*`, sales)
	)[0];
	await mustRpc(
		'complete_fulfilment_step',
		{ p_step_id: step.step_id, p_lock_version: stepRow.lock_version },
		undefined,
		await signIn(sales)
	);

	let milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	assert(
		milestones.length === 2 && milestones.every((milestone) => milestone.status === 'not_due'),
		'case did not create exactly two not-due payment milestones'
	);
	const deposit = milestones.find((milestone) => milestone.type === 'deposit');
	await mustRpc(
		'request_payment_milestone',
		{ p_payment_milestone_id: deposit.id, p_lock_version: deposit.lock_version },
		undefined,
		await signIn(sales)
	);
	milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	let currentDeposit = milestones.find((milestone) => milestone.type === 'deposit');
	assert(
		currentDeposit.status === 'awaiting',
		'payment request did not move milestone to awaiting'
	);
	await mustRpc(
		'record_payment_received',
		{
			p_payment_milestone_id: currentDeposit.id,
			p_lock_version: currentDeposit.lock_version,
			p_note: 'Recorded locally'
		},
		undefined,
		await signIn(sales)
	);
	milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	const receivedDeposit = milestones.find((milestone) => milestone.type === 'deposit');
	assert(
		receivedDeposit.status === 'received' &&
			receivedDeposit.received_recorded_by === sales.id &&
			receivedDeposit.received_at,
		'payment receipt evidence missing'
	);
	const currentFinal = milestones.find((milestone) => milestone.type === 'final_balance');
	await mustRpc(
		'mark_payment_not_required',
		{
			p_payment_milestone_id: currentFinal.id,
			p_lock_version: currentFinal.lock_version,
			p_note: 'No final balance due'
		},
		undefined,
		await signIn(sales)
	);

	fulfilment = (await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales))[0];
	const completed = await mustRpc(
		'complete_fulfilment',
		{ p_fulfilment_case_id: caseId, p_lock_version: fulfilment.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(
		completed.status === 'completed',
		'FulfilmentCase did not complete after all guards passed'
	);
	const repeatedCompletion = await mustRpc(
		'complete_fulfilment',
		{ p_fulfilment_case_id: caseId, p_lock_version: completed.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(
		repeatedCompletion.idempotent === true,
		'repeated FulfilmentCase completion was not idempotent'
	);

	const activities = await serviceRows(
		`/rest/v1/activities?fulfilment_case_id=eq.${caseId}&select=event_type,summary`,
		sales
	);
	const events = new Set(activities.map((activity) => activity.event_type));
	for (const event of [
		'fulfilment_created',
		'fulfilment_step_created',
		'fulfilment_step_scheduled',
		'fulfilment_step_rescheduled',
		'fulfilment_step_completed',
		'payment_milestone_requested',
		'payment_milestone_received',
		'payment_milestone_marked_not_required',
		'fulfilment_completed',
		'task_created'
	]) {
		assert(events.has(event), `missing transactional Activity event ${event}`);
	}

	const guardFixture = createAcceptedFixture('guards', owner.id);
	const guardCaseResult = await mustRpc(
		'create_fulfilment_case_for_accepted_quote',
		{ p_quote_id: guardFixture.quoteId },
		serviceRoleKey,
		serviceRoleKey
	);
	const guardCaseId = guardCaseResult.fulfilment_case_id;
	let guardCase;
	let guardMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${guardCaseId}&select=*`,
		sales
	);
	const guardDeposit = guardMilestones.find((milestone) => milestone.type === 'deposit');
	await mustRpc(
		'request_payment_milestone',
		{ p_payment_milestone_id: guardDeposit.id, p_lock_version: guardDeposit.lock_version },
		undefined,
		await signIn(sales)
	);
	guardMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${guardCaseId}&select=*`,
		sales
	);
	const requestedDeposit = guardMilestones.find((milestone) => milestone.type === 'deposit');
	await mustRpc(
		'record_payment_received',
		{ p_payment_milestone_id: requestedDeposit.id, p_lock_version: requestedDeposit.lock_version },
		undefined,
		await signIn(sales)
	);
	guardMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${guardCaseId}&select=*`,
		sales
	);
	const receivedGuardDeposit = guardMilestones.find((milestone) => milestone.type === 'deposit');
	await expectRpcFailure(
		'correct_payment_milestone',
		{
			p_payment_milestone_id: receivedGuardDeposit.id,
			p_lock_version: receivedGuardDeposit.lock_version,
			p_status: 'not_required',
			p_reason: 'Sales cannot correct evidence'
		},
		sales,
		'sales payment correction'
	);
	const ownerCorrection = await mustRpc(
		'correct_payment_milestone',
		{
			p_payment_milestone_id: receivedGuardDeposit.id,
			p_lock_version: receivedGuardDeposit.lock_version,
			p_status: 'not_required',
			p_reason: 'Owner corrected local evidence'
		},
		undefined,
		aal2Token(owner.id)
	);
	assert(ownerCorrection.status === 'not_required', 'privileged payment correction did not apply');
	const correctionActivities = await serviceRows(
		`/rest/v1/activities?fulfilment_case_id=eq.${guardCaseId}&event_type=eq.payment_milestone_corrected&select=*`,
		owner
	);
	assert(correctionActivities.length === 1, 'payment correction did not append Activity');
	const auditEvents = sql(
		`select count(*) from public.security_audit_events where action = 'payment_milestone_corrected' and target_id = ${sqlLiteral(receivedGuardDeposit.id)}`
	);
	assert(Number(auditEvents) === 1, 'payment correction did not append security audit evidence');
	guardMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${guardCaseId}&select=*`,
		sales
	);
	for (const milestone of guardMilestones) {
		if (milestone.status === 'not_due') {
			await mustRpc(
				'mark_payment_not_required',
				{
					p_payment_milestone_id: milestone.id,
					p_lock_version: milestone.lock_version,
					p_note: 'Guard fixture'
				},
				undefined,
				await signIn(sales)
			);
		}
	}
	guardCase = (
		await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${guardCaseId}&select=*`, sales)
	)[0];
	await expectRpcFailure(
		'complete_fulfilment',
		{ p_fulfilment_case_id: guardCaseId, p_lock_version: guardCase.lock_version },
		sales,
		'completion without a successful step'
	);
	guardCase = (
		await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${guardCaseId}&select=*`, sales)
	)[0];
	const cancelledStep = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: guardCaseId,
			p_type: 'installation',
			p_lock_version: guardCase.lock_version
		},
		undefined,
		await signIn(sales)
	);
	const cancelledStepRow = (
		await serviceRows(`/rest/v1/fulfilment_steps?id=eq.${cancelledStep.step_id}&select=*`, sales)
	)[0];
	await mustRpc(
		'cancel_fulfilment_step',
		{
			p_step_id: cancelledStep.step_id,
			p_lock_version: cancelledStepRow.lock_version,
			p_reason: 'Guard fixture cancellation'
		},
		undefined,
		await signIn(sales)
	);
	guardCase = (
		await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${guardCaseId}&select=*`, sales)
	)[0];
	await expectRpcFailure(
		'complete_fulfilment',
		{ p_fulfilment_case_id: guardCaseId, p_lock_version: guardCase.lock_version },
		sales,
		'completion with only cancelled steps'
	);
	guardCase = (
		await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${guardCaseId}&select=*`, sales)
	)[0];
	await expectRpcFailure(
		'cancel_fulfilment',
		{
			p_fulfilment_case_id: guardCaseId,
			p_lock_version: guardCase.lock_version,
			p_reason: 'Sales cannot cancel'
		},
		sales,
		'sales case cancellation'
	);
	const cancelled = await mustRpc(
		'cancel_fulfilment',
		{
			p_fulfilment_case_id: guardCaseId,
			p_lock_version: guardCase.lock_version,
			p_reason: 'Owner cancelled local fixture'
		},
		undefined,
		aal2Token(owner.id)
	);
	assert(cancelled.status === 'cancelled', 'Owner/Admin cancellation did not apply');
}

async function main() {
	await schemaContract();
	const owner = await createUser('owner', 'p16-owner');
	const sales = await createUser('sales', 'p16-sales');
	const viewer = await createUser('viewer', 'p16-viewer');
	users.push(owner, sales, viewer);
	await qualificationContract(sales);
	await fulfilmentContract(owner, sales, viewer);
	console.log('P16-T01 additive schema, P16-T02 lineage, and P16-T03 trusted actions passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
