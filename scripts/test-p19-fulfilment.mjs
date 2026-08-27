import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

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

function createAcceptedFixture(label, createdBy) {
	const safeLabel = `${prefix}-${label}`;
	const leadId = sqlScalar(
		`insert into public.leads (first_name, last_name, email, phone, message, external_submission_id) values ('P19', ${sqlLiteral(label)}, ${sqlLiteral(`${safeLabel}@example.test`)}, '+27820000001', 'P19 fulfilment workflow fixture', ${sqlLiteral(`${safeLabel}-lead`)}) returning id`
	);
	const clientId = sqlScalar(
		`insert into public.clients (type, display_name, email, phone, source_lead_id, converted_at) values ('individual', ${sqlLiteral(`P19 ${label}`)}, ${sqlLiteral(`${safeLabel}@example.test`)}, '+27820000001', ${sqlLiteral(leadId)}::uuid, now()) returning id`
	);
	sql(
		`update public.leads set pipeline_stage = 'WON', converted_client_id = ${sqlLiteral(clientId)}::uuid, lock_version = lock_version + 1 where id = ${sqlLiteral(leadId)}::uuid`
	);
	const quoteId = sqlScalar(
		`insert into public.quotes (lead_id, client_id, status, subject, valid_until, quote_snapshot, created_by) values (${sqlLiteral(leadId)}::uuid, ${sqlLiteral(clientId)}::uuid, 'draft', ${sqlLiteral(`P19 ${label} quote`)}, current_date + 30, '{}'::jsonb, ${sqlLiteral(createdBy)}::uuid) returning id`
	);
	sql(
		`insert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal) values (${sqlLiteral(quoteId)}::uuid, 1, 'P19 service', 1, 100, 100); update public.quotes set status = 'ready', ready_at = now(), lock_version = lock_version + 1 where id = ${sqlLiteral(quoteId)}::uuid; update public.quotes set status = 'sent', sent_at = now(), lock_version = lock_version + 1 where id = ${sqlLiteral(quoteId)}::uuid; update public.quotes set status = 'accepted', accepted_at = now(), accepted_by = ${sqlLiteral(createdBy)}::uuid, acceptance_source = 'p19-contract', acceptance_evidence = 'local workflow fixture', lock_version = lock_version + 1 where id = ${sqlLiteral(quoteId)}::uuid;`
	);
	return { leadId, clientId, quoteId };
}

async function row(path, user) {
	return (await serviceRows(path, user))[0];
}

async function main() {
	const owner = await createUser('owner', 'p19-owner');
	const sales = await createUser('sales', 'p19-sales');
	const viewer = await createUser('viewer', 'p19-viewer');
	users.push(owner, sales, viewer);

	try {
		const fixture = createAcceptedFixture('primary', owner.id);
		const createdCase = await mustRpc(
			'create_fulfilment_case_for_accepted_quote',
			{ p_quote_id: fixture.quoteId },
			serviceRoleKey,
			serviceRoleKey
		);
		const caseId = createdCase.fulfilment_case_id;
		assert(caseId && createdCase.idempotent === false, 'P19 fixture case was not created');

		const viewerRead = await serviceRows(
			`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=id,status`,
			viewer
		);
		assert(viewerRead.length === 1, 'Viewer cannot read the P19 FulfilmentCase');
		await expectRpcFailure(
			'create_fulfilment_step',
			{ p_fulfilment_case_id: caseId, p_type: 'installation', p_lock_version: 1 },
			viewer,
			'viewer FulfilmentStep creation'
		);
		const rawStep = await authenticated(
			'/rest/v1/fulfilment_steps',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: { fulfilment_case_id: caseId, type: 'installation', status: 'awaiting_schedule' }
			},
			sales
		);
		assert(!rawStep.response.ok, 'Raw FulfilmentStep INSERT bypassed the trusted boundary');

		let currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
		const installation = await mustRpc(
			'create_fulfilment_step',
			{
				p_fulfilment_case_id: caseId,
				p_type: 'installation',
				p_lock_version: currentCase.lock_version,
				p_notes: 'P19 installation'
			},
			undefined,
			await signIn(sales)
		);
		let installationRow = await row(
			`/rest/v1/fulfilment_steps?id=eq.${installation.step_id}&select=*`,
			sales
		);
		await expectRpcFailure(
			'schedule_fulfilment_step',
			{
				p_step_id: installation.step_id,
				p_lock_version: 999,
				p_scheduled_for: '2099-01-01T09:00:00Z'
			},
			sales,
			'stale installation schedule'
		);
		await mustRpc(
			'schedule_fulfilment_step',
			{
				p_step_id: installation.step_id,
				p_lock_version: installationRow.lock_version,
				p_scheduled_for: '2099-01-01T09:00:00Z'
			},
			undefined,
			await signIn(sales)
		);
		installationRow = await row(
			`/rest/v1/fulfilment_steps?id=eq.${installation.step_id}&select=*`,
			sales
		);
		await mustRpc(
			'reschedule_fulfilment_step',
			{
				p_step_id: installation.step_id,
				p_lock_version: installationRow.lock_version,
				p_scheduled_for: '2099-01-02T09:00:00Z'
			},
			undefined,
			await signIn(sales)
		);
		installationRow = await row(
			`/rest/v1/fulfilment_steps?id=eq.${installation.step_id}&select=*`,
			sales
		);
		await mustRpc(
			'complete_fulfilment_step',
			{ p_step_id: installation.step_id, p_lock_version: installationRow.lock_version },
			undefined,
			await signIn(sales)
		);

		currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
		const courier = await mustRpc(
			'create_fulfilment_step',
			{ p_fulfilment_case_id: caseId, p_type: 'courier', p_lock_version: currentCase.lock_version },
			undefined,
			await signIn(sales)
		);
		let courierRow = await row(
			`/rest/v1/fulfilment_steps?id=eq.${courier.step_id}&select=*`,
			sales
		);
		await expectRpcFailure(
			'dispatch_fulfilment_step',
			{ p_step_id: courier.step_id, p_lock_version: 999 },
			sales,
			'stale courier dispatch'
		);
		const dispatched = await mustRpc(
			'dispatch_fulfilment_step',
			{
				p_step_id: courier.step_id,
				p_lock_version: courierRow.lock_version,
				p_tracking_reference: 'P19-TRACK-001',
				p_notes: 'Handed to courier'
			},
			undefined,
			await signIn(sales)
		);
		assert(dispatched.status === 'dispatched', 'Courier dispatch did not transition the step');
		courierRow = await row(`/rest/v1/fulfilment_steps?id=eq.${courier.step_id}&select=*`, sales);
		assert(
			courierRow.tracking_reference === 'P19-TRACK-001',
			'Courier tracking evidence was not stored'
		);
		await mustRpc(
			'complete_fulfilment_step',
			{ p_step_id: courier.step_id, p_lock_version: courierRow.lock_version },
			undefined,
			await signIn(sales)
		);

		currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
		const pickup = await mustRpc(
			'create_fulfilment_step',
			{ p_fulfilment_case_id: caseId, p_type: 'pickup', p_lock_version: currentCase.lock_version },
			undefined,
			await signIn(sales)
		);
		let pickupRow = await row(`/rest/v1/fulfilment_steps?id=eq.${pickup.step_id}&select=*`, sales);
		const ready = await mustRpc(
			'ready_fulfilment_step',
			{
				p_step_id: pickup.step_id,
				p_lock_version: pickupRow.lock_version,
				p_notes: 'Packed and ready'
			},
			undefined,
			await signIn(sales)
		);
		assert(ready.status === 'ready_for_collection', 'Pickup readiness did not transition the step');
		pickupRow = await row(`/rest/v1/fulfilment_steps?id=eq.${pickup.step_id}&select=*`, sales);
		await mustRpc(
			'complete_fulfilment_step',
			{ p_step_id: pickup.step_id, p_lock_version: pickupRow.lock_version },
			undefined,
			await signIn(sales)
		);

		let milestones = await serviceRows(
			`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
			sales
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
		const awaitingDeposit = milestones.find((milestone) => milestone.type === 'deposit');
		assert(
			awaitingDeposit.status === 'awaiting',
			'Deposit request did not preserve awaiting evidence'
		);
		await mustRpc(
			'record_payment_received',
			{
				p_payment_milestone_id: awaitingDeposit.id,
				p_lock_version: awaitingDeposit.lock_version,
				p_note: 'Recorded by P19 operator'
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
			'Deposit receipt actor/time evidence is incomplete'
		);
		const currentFinal = milestones.find((milestone) => milestone.type === 'final_balance');
		await mustRpc(
			'mark_payment_not_required',
			{
				p_payment_milestone_id: currentFinal.id,
				p_lock_version: currentFinal.lock_version,
				p_note: 'No final balance due in this fixture'
			},
			undefined,
			await signIn(sales)
		);
		const followUp = await mustRpc(
			'create_task',
			{
				p_fulfilment_case_id: caseId,
				p_type: 'payment_follow_up',
				p_title: 'Confirm recorded deposit evidence',
				p_due_at: '2026-08-01T09:00:00Z'
			},
			undefined,
			await signIn(sales)
		);
		const followUpRow = (
			await serviceRows(`/rest/v1/tasks?id=eq.${followUp.task_id}&select=quote_id`, sales)
		)[0];
		assert(
			followUpRow.quote_id === fixture.quoteId,
			'Fulfilment payment follow-up did not inherit the accepted Quote lineage'
		);
		const repeatedFollowUp = await mustRpc(
			'create_task',
			{
				p_fulfilment_case_id: caseId,
				p_type: 'payment_follow_up',
				p_title: 'Duplicate follow-up should reuse the open Task'
			},
			undefined,
			await signIn(sales)
		);
		assert(
			followUp.task_id === repeatedFollowUp.task_id && repeatedFollowUp.idempotent === true,
			'Payment follow-up was not deterministically reused'
		);
		const followUpPayment = (
			await serviceRows(
				`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&type=eq.final_balance&select=status`,
				sales
			)
		)[0];
		assert(followUpPayment.status === 'not_required', 'Payment follow-up changed milestone status');

		currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
		const completed = await mustRpc(
			'complete_fulfilment',
			{ p_fulfilment_case_id: caseId, p_lock_version: currentCase.lock_version },
			undefined,
			await signIn(sales)
		);
		assert(completed.status === 'completed', 'P19 case completion guard did not pass');

		const activities = await serviceRows(
			`/rest/v1/activities?fulfilment_case_id=eq.${caseId}&select=event_type`,
			sales
		);
		const events = new Set(activities.map((activity) => activity.event_type));
		for (const event of [
			'fulfilment_step_dispatched',
			'fulfilment_step_ready_for_collection',
			'payment_follow_up_created',
			'fulfilment_completed'
		]) {
			assert(events.has(event), `P19 workflow is missing Activity event ${event}`);
		}

		const correctionFixture = createAcceptedFixture('correction', owner.id);
		const correctionCase = await mustRpc(
			'create_fulfilment_case_for_accepted_quote',
			{ p_quote_id: correctionFixture.quoteId },
			serviceRoleKey,
			serviceRoleKey
		);
		let correctionMilestone = (
			await serviceRows(
				`/rest/v1/payment_milestones?fulfilment_case_id=eq.${correctionCase.fulfilment_case_id}&type=eq.deposit&select=*`,
				sales
			)
		)[0];
		await mustRpc(
			'request_payment_milestone',
			{
				p_payment_milestone_id: correctionMilestone.id,
				p_lock_version: correctionMilestone.lock_version
			},
			undefined,
			await signIn(sales)
		);
		correctionMilestone = (
			await serviceRows(
				`/rest/v1/payment_milestones?id=eq.${correctionMilestone.id}&select=*`,
				sales
			)
		)[0];
		await mustRpc(
			'record_payment_received',
			{
				p_payment_milestone_id: correctionMilestone.id,
				p_lock_version: correctionMilestone.lock_version
			},
			undefined,
			await signIn(sales)
		);
		correctionMilestone = (
			await serviceRows(
				`/rest/v1/payment_milestones?id=eq.${correctionMilestone.id}&select=*`,
				sales
			)
		)[0];
		await expectRpcFailure(
			'correct_payment_milestone',
			{
				p_payment_milestone_id: correctionMilestone.id,
				p_lock_version: correctionMilestone.lock_version,
				p_status: 'not_required',
				p_reason: 'AAL1 must be denied'
			},
			owner,
			'AAL1 payment correction'
		);
		const correction = await mustRpc(
			'correct_payment_milestone',
			{
				p_payment_milestone_id: correctionMilestone.id,
				p_lock_version: correctionMilestone.lock_version,
				p_status: 'not_required',
				p_reason: 'Corrected local CRM evidence'
			},
			undefined,
			aal2Token(owner.id)
		);
		assert(correction.status === 'not_required', 'AAL2 payment correction did not apply');

		const cancellationFixture = createAcceptedFixture('cancellation', owner.id);
		const cancellationCase = await mustRpc(
			'create_fulfilment_case_for_accepted_quote',
			{ p_quote_id: cancellationFixture.quoteId },
			serviceRoleKey,
			serviceRoleKey
		);
		await expectRpcFailure(
			'cancel_fulfilment',
			{
				p_fulfilment_case_id: cancellationCase.fulfilment_case_id,
				p_lock_version: cancellationCase.lock_version,
				p_reason: 'AAL1 must be denied'
			},
			owner,
			'AAL1 FulfilmentCase cancellation'
		);
		const cancelled = await mustRpc(
			'cancel_fulfilment',
			{
				p_fulfilment_case_id: cancellationCase.fulfilment_case_id,
				p_lock_version: cancellationCase.lock_version,
				p_reason: 'Customer cancelled before work began'
			},
			undefined,
			aal2Token(owner.id)
		);
		assert(cancelled.status === 'cancelled', 'AAL2 FulfilmentCase cancellation did not apply');

		const grantCount = Number(
			sql(
				`select count(*) from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('dispatch_fulfilment_step', 'ready_fulfilment_step') and grantee = 'authenticated' and privilege_type = 'EXECUTE'`
			)
		);
		assert(grantCount === 2, 'P19 trusted workflow actions are not granted to authenticated users');
		console.log('P19-T03 through P19-T06 trusted fulfilment workflow contracts passed');
	} finally {
		await cleanup(users);
	}
}

await main();
