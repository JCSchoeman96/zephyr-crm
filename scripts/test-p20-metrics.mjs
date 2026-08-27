import assert from 'node:assert/strict';

import {
	assert as contractAssert,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRows,
	signIn,
	sql,
	sqlLiteral
} from './p14-test-utils.mjs';

const users = [];

function dateOnly(value) {
	return value.toISOString().slice(0, 10);
}

function dateOffset(date, days) {
	const value = new Date(`${date}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return dateOnly(value);
}

function isoHoursAgo(hours) {
	return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

const metricToday = dateOnly(new Date());
// Include a small UTC cushion so canonical now()-based transitions remain in
// the event window even when the test crosses UTC midnight. Snapshot metrics
// are independent of this range.
const metricRange = { from: dateOffset(metricToday, -2), to: metricToday };
const acceptedSentAt = isoHoursAgo(2);
const declinedSentAt = isoHoursAgo(3);

const metricFields = [
	'new_enquiries_waiting',
	'qualification_backlog',
	'quotes_needing_preparation',
	'quotes_awaiting_decision',
	'average_quote_response_hours',
	'accepted_value',
	'open_fulfilments',
	'upcoming_installations',
	'awaiting_dispatch',
	'awaiting_collection',
	'payments_awaiting_follow_up',
	'completed_fulfilments'
];

function sqlScalar(query) {
	const output = sql(query).trim();
	return (
		output
			.split(/\r?\n/)
			.filter((line) => !/^\w+(?: \d+)+$/.test(line))
			.at(-1)
			?.trim() ?? ''
	);
}

function quote(value) {
	return sqlLiteral(value);
}

function createLead(label, stage, createdAt) {
	const safeLabel = `${prefix}-p20-${label}`;
	return sqlScalar(`
		insert into public.leads (
			first_name, last_name, email, phone, message, external_submission_id,
			pipeline_stage, created_at, last_activity_at
		)
		values (
			'P20', ${quote(label)}, ${quote(`${safeLabel}@example.test`)},
			'+27820000020', 'P20 analytics reconciliation fixture',
			${quote(`${safeLabel}-lead`)}, ${quote(stage)},
			${quote(createdAt)}::timestamptz, ${quote(createdAt)}::timestamptz
		)
		returning id
	`);
}

function createQuote({ label, leadId, createdBy, clientId = null, total = '100.00', createdAt }) {
	const quoteId = sqlScalar(`
		insert into public.quotes (
			lead_id, client_id, status, subject, valid_until, quote_snapshot,
			subtotal, tax_amount, total, created_by, created_at
		)
		values (
			${quote(leadId)}::uuid, ${clientId ? `${quote(clientId)}::uuid` : 'null'},
			'draft', ${quote(`P20 ${label} quote`)}, '2098-02-28', '{}'::jsonb,
			${quote(total)}::numeric, 0, ${quote(total)}::numeric,
			${quote(createdBy)}::uuid, ${quote(createdAt)}::timestamptz
		)
		returning id
	`);
	sql(`
		insert into public.quote_items (
			quote_id, position, name, quantity, unit_price, line_subtotal
		)
		values (
			${quote(quoteId)}::uuid, 1, ${quote(`P20 ${label} service`)},
			1, ${quote(total)}::numeric, ${quote(total)}::numeric
		)
	`);
	return quoteId;
}

function makeSentQuote({ label, leadId, createdBy, total, createdAt, sentAt }) {
	const quoteId = createQuote({ label, leadId, createdBy, total, createdAt });
	sql(`
		update public.quotes
		set status = 'ready', ready_at = ${quote(sentAt)}::timestamptz,
			lock_version = lock_version + 1
		where id = ${quote(quoteId)}::uuid;
		update public.quotes
		set status = 'sent', sent_at = ${quote(sentAt)}::timestamptz,
			lock_version = lock_version + 1
		where id = ${quote(quoteId)}::uuid
	`);
	return quoteId;
}

async function createAcceptedFixture(label, createdBy, sales, timestamps) {
	const leadId = createLead(label, 'DECISION', timestamps.createdAt);
	const quoteId = createQuote({
		label,
		leadId,
		createdBy,
		total: timestamps.total,
		createdAt: timestamps.createdAt
	});
	sql(`
		update public.quotes
		set status = 'ready', ready_at = ${quote(timestamps.sentAt)}::timestamptz,
			lock_version = lock_version + 1
		where id = ${quote(quoteId)}::uuid;
		update public.quotes
		set status = 'sent', sent_at = ${quote(timestamps.sentAt)}::timestamptz,
			lock_version = lock_version + 1
		where id = ${quote(quoteId)}::uuid;
	`);
	const sentRow = await row(`/rest/v1/quotes?id=eq.${quoteId}&select=*`, sales);
	const accepted = await mustRpc(
		'accept_quote',
		{
			p_quote_id: quoteId,
			p_lock_version: sentRow.lock_version,
			p_acceptance_source: 'customer_email',
			p_acceptance_evidence: 'P20 deterministic CRM acceptance evidence'
		},
		undefined,
		await signIn(sales)
	);
	contractAssert(
		accepted.status === 'accepted' && accepted.client_id && accepted.fulfilment_case_id,
		'P20 canonical Quote acceptance did not create the expected handoff'
	);
	return {
		leadId,
		clientId: accepted.client_id,
		quoteId,
		fulfilmentCaseId: accepted.fulfilment_case_id
	};
}

function createPipelineFixture(label, stage, createdBy, createdAt) {
	const leadId = createLead(label, stage, createdAt);
	if (stage === 'PROPOSAL') {
		return { leadId, quoteId: createQuote({ label, leadId, createdBy, createdAt }) };
	}
	if (stage !== 'DECISION') return { leadId };
	return {
		leadId,
		quoteId: makeSentQuote({
			label,
			leadId,
			createdBy,
			total: '750.00',
			createdAt,
			sentAt: acceptedSentAt
		})
	};
}

async function row(path, user) {
	const rows = await serviceRows(path, user);
	contractAssert(rows.length === 1, `Expected one row for ${path}`);
	return rows[0];
}

async function readMetrics(user, range = metricRange) {
	const result = await rpc(
		'dashboard_sales_fulfilment_metrics',
		{ p_from: range.from, p_to: range.to },
		undefined,
		await signIn(user)
	);
	contractAssert(result.response.ok, `Metrics RPC failed: ${JSON.stringify(result.body)}`);
	return result.body;
}

async function createOpenFulfilment(fixture, sales) {
	const caseId = fixture.fulfilmentCaseId;
	contractAssert(caseId, 'P20 canonical acceptance did not provide a FulfilmentCase');
	let currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
	const installation = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'installation',
			p_lock_version: currentCase.lock_version,
			p_notes: 'P20 scheduled installation'
		},
		undefined,
		await signIn(sales)
	);
	let installationRow = await row(
		`/rest/v1/fulfilment_steps?id=eq.${installation.step_id}&select=*`,
		sales
	);
	await mustRpc(
		'schedule_fulfilment_step',
		{
			p_step_id: installation.step_id,
			p_lock_version: installationRow.lock_version,
			p_scheduled_for: isoHoursAgo(1)
		},
		undefined,
		await signIn(sales)
	);

	currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
	const courier = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'courier',
			p_lock_version: currentCase.lock_version
		},
		undefined,
		await signIn(sales)
	);

	currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
	const pickup = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'pickup',
			p_lock_version: currentCase.lock_version
		},
		undefined,
		await signIn(sales)
	);
	const pickupRow = await row(`/rest/v1/fulfilment_steps?id=eq.${pickup.step_id}&select=*`, sales);
	await mustRpc(
		'ready_fulfilment_step',
		{
			p_step_id: pickup.step_id,
			p_lock_version: pickupRow.lock_version,
			p_notes: 'P20 ready for collection'
		},
		undefined,
		await signIn(sales)
	);

	let milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	const deposit = milestones.find((milestone) => milestone.type === 'deposit');
	contractAssert(deposit, 'P20 open fixture is missing its deposit milestone');
	await mustRpc(
		'request_payment_milestone',
		{ p_payment_milestone_id: deposit.id, p_lock_version: deposit.lock_version },
		undefined,
		await signIn(sales)
	);
	const followUp = await mustRpc(
		'create_task',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'payment_follow_up',
			p_title: 'P20 payment evidence follow-up',
			p_due_at: '2020-01-01T09:00:00Z'
		},
		undefined,
		await signIn(sales)
	);

	milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	contractAssert(
		milestones.some((milestone) => milestone.id === deposit.id && milestone.status === 'awaiting'),
		'P20 payment fixture did not remain awaiting'
	);
	contractAssert(followUp.task_id, 'P20 payment follow-up Task was not created');
	return {
		caseId,
		installationId: installation.step_id,
		courierId: courier.step_id,
		pickupId: pickup.step_id,
		depositId: deposit.id,
		taskId: followUp.task_id
	};
}

async function createCompletedFulfilment(fixture, sales) {
	const caseId = fixture.fulfilmentCaseId;
	contractAssert(caseId, 'P20 canonical acceptance did not provide a FulfilmentCase');
	let currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
	const installation = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseId,
			p_type: 'installation',
			p_lock_version: currentCase.lock_version
		},
		undefined,
		await signIn(sales)
	);
	let installationRow = await row(
		`/rest/v1/fulfilment_steps?id=eq.${installation.step_id}&select=*`,
		sales
	);
	await mustRpc(
		'schedule_fulfilment_step',
		{
			p_step_id: installation.step_id,
			p_lock_version: installationRow.lock_version,
			p_scheduled_for: isoHoursAgo(1)
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

	let milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	let deposit = milestones.find((milestone) => milestone.type === 'deposit');
	let finalBalance = milestones.find((milestone) => milestone.type === 'final_balance');
	contractAssert(deposit && finalBalance, 'P20 completed fixture is missing payment milestones');
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
	deposit = milestones.find((milestone) => milestone.type === 'deposit');
	await mustRpc(
		'record_payment_received',
		{
			p_payment_milestone_id: deposit.id,
			p_lock_version: deposit.lock_version,
			p_note: 'P20 CRM evidence'
		},
		undefined,
		await signIn(sales)
	);
	milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseId}&select=*`,
		sales
	);
	finalBalance = milestones.find((milestone) => milestone.type === 'final_balance');
	await mustRpc(
		'mark_payment_not_required',
		{
			p_payment_milestone_id: finalBalance.id,
			p_lock_version: finalBalance.lock_version,
			p_note: 'P20 fixture has no final balance'
		},
		undefined,
		await signIn(sales)
	);
	currentCase = await row(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, sales);
	const completed = await mustRpc(
		'complete_fulfilment',
		{ p_fulfilment_case_id: caseId, p_lock_version: currentCase.lock_version },
		undefined,
		await signIn(sales)
	);
	contractAssert(completed.status === 'completed', 'P20 completed fixture did not complete');
	return { caseId };
}

function assertDelta(before, after, field, expected) {
	const delta = Number(after[field]) - Number(before[field]);
	assert.equal(delta, expected, `${field} changed by ${delta}; expected ${expected}`);
}

async function main() {
	const owner = await createUser('owner', 'p20-owner');
	const sales = await createUser('sales', 'p20-sales');
	const viewer = await createUser('viewer', 'p20-viewer');
	users.push(owner, sales, viewer);

	try {
		const before = await readMetrics(sales);
		const newFixture = createPipelineFixture('new-enquiry', 'NEW', owner.id, isoHoursAgo(8));
		const qualificationFixture = createPipelineFixture(
			'qualification',
			'QUALIFICATION',
			owner.id,
			isoHoursAgo(7)
		);
		const proposalFixture = createPipelineFixture('proposal', 'PROPOSAL', owner.id, isoHoursAgo(6));
		const decisionFixture = createPipelineFixture('decision', 'DECISION', owner.id, isoHoursAgo(5));
		const acceptedFixture = await createAcceptedFixture('accepted', owner.id, sales, {
			createdAt: isoHoursAgo(4),
			sentAt: acceptedSentAt,
			total: '1250.00'
		});
		const declinedLeadId = createLead('declined', 'DECISION', isoHoursAgo(4));
		const declinedQuoteId = makeSentQuote({
			label: 'declined',
			leadId: declinedLeadId,
			createdBy: owner.id,
			total: '450.00',
			createdAt: isoHoursAgo(4),
			sentAt: declinedSentAt
		});
		const declinedRow = await row(`/rest/v1/quotes?id=eq.${declinedQuoteId}&select=*`, sales);
		const lostReasonId = sqlScalar(
			'select id from public.lost_reasons where active order by sort_order, id limit 1'
		);
		contractAssert(lostReasonId, 'P20 declined fixture needs an active Lost reason');
		await mustRpc(
			'decline_quote',
			{
				p_quote_id: declinedQuoteId,
				p_lock_version: declinedRow.lock_version,
				p_lost_reason_id: lostReasonId,
				p_lost_notes: 'P20 response-time fixture'
			},
			undefined,
			await signIn(sales)
		);

		const openFulfilment = await createOpenFulfilment(acceptedFixture, sales);
		const completedFixture = await createAcceptedFixture('completed', owner.id, sales, {
			createdAt: isoHoursAgo(4),
			sentAt: acceptedSentAt,
			total: '999.00'
		});
		// Keep the completed sale's canonical acceptance outside this event window
		// while preserving the real accept_quote transition and handoff evidence.
		sql(`
			update public.quotes
			set accepted_at = ${quote(`${dateOffset(metricToday, -3)}T23:00:00Z`)}::timestamptz,
				lock_version = lock_version + 1
			where id = ${quote(completedFixture.quoteId)}::uuid
		`);
		const completedFulfilment = await createCompletedFulfilment(completedFixture, sales);

		const after = await readMetrics(sales);
		for (const field of metricFields)
			contractAssert(field in after, `Metric field ${field} is missing`);
		assert.equal(after.date_from, metricRange.from);
		assert.equal(after.date_to, metricRange.to);
		assertDelta(before, after, 'new_enquiries_waiting', 1);
		assertDelta(before, after, 'qualification_backlog', 1);
		assertDelta(before, after, 'quotes_needing_preparation', 1);
		assertDelta(before, after, 'quotes_awaiting_decision', 1);
		assertDelta(before, after, 'open_fulfilments', 1);
		assertDelta(before, after, 'upcoming_installations', 1);
		assertDelta(before, after, 'awaiting_dispatch', 1);
		assertDelta(before, after, 'awaiting_collection', 1);
		assertDelta(before, after, 'payments_awaiting_follow_up', 1);
		assertDelta(before, after, 'completed_fulfilments', 1);
		assert.ok(
			Math.abs(Number(after.average_quote_response_hours) - 2.5) < 0.1,
			`average quote response time was ${after.average_quote_response_hours}; expected approximately 2.5 hours`
		);
		assert.equal(Number(after.accepted_value) - Number(before.accepted_value), 1250);

		const anonymous = await rpc('dashboard_sales_fulfilment_metrics', {
			p_from: metricRange.from,
			p_to: metricRange.to
		});
		contractAssert(!anonymous.response.ok, 'Anonymous metrics RPC access was not denied');
		const viewerMetrics = await readMetrics(viewer);
		for (const field of metricFields) assert.equal(viewerMetrics[field], after[field]);
		const invalidRange = await rpc(
			'dashboard_sales_fulfilment_metrics',
			{
				p_from: dateOffset(metricToday, 1),
				p_to: dateOffset(metricToday, 1)
			},
			undefined,
			await signIn(sales)
		);
		contractAssert(!invalidRange.response.ok, 'Future metrics range was accepted');

		const steps = await serviceRows(
			`/rest/v1/fulfilment_steps?fulfilment_case_id=eq.${openFulfilment.caseId}&select=type,status,scheduled_for`,
			sales
		);
		assert.equal(steps.length, 3, 'P20 open Fulfilment detail must contain exactly three steps');
		assert.deepEqual(
			steps.map((step) => [step.type, step.status]),
			[
				['installation', 'scheduled'],
				['courier', 'awaiting_dispatch'],
				['pickup', 'ready_for_collection']
			]
		);
		const installationDetail = steps.find((step) => step.type === 'installation');
		assert.ok(
			installationDetail?.scheduled_for,
			'Scheduled installation has no scheduled_for value'
		);
		assert.ok(
			new Date(installationDetail.scheduled_for) >= new Date(`${metricRange.from}T00:00:00Z`) &&
				new Date(installationDetail.scheduled_for) <
					new Date(`${dateOffset(metricRange.to, 1)}T00:00:00Z`),
			'Scheduled installation is outside the selected UTC event window'
		);
		const payments = await serviceRows(
			`/rest/v1/payment_milestones?fulfilment_case_id=eq.${openFulfilment.caseId}&select=type,status`,
			sales
		);
		assert.equal(
			payments.length,
			2,
			'P20 open Fulfilment detail must contain exactly two payment milestones'
		);
		assert.deepEqual(
			payments
				.map((payment) => [payment.type, payment.status])
				.sort((left, right) => left[0].localeCompare(right[0])),
			[
				['deposit', 'awaiting'],
				['final_balance', 'not_due']
			]
		);
		const tasks = await serviceRows(
			`/rest/v1/tasks?fulfilment_case_id=eq.${openFulfilment.caseId}&select=id,type,status,due_at`,
			sales
		);
		assert.equal(
			tasks.length,
			2,
			'P20 open Fulfilment detail must contain planning and follow-up Tasks'
		);
		contractAssert(
			tasks.some(
				(task) =>
					task.id === openFulfilment.taskId &&
					task.type === 'payment_follow_up' &&
					task.status === 'open'
			) && tasks.some((task) => task.type === 'plan_fulfilment' && task.status === 'open'),
			'Payment follow-up Task is not visible in the canonical detail rows'
		);
		const activities = await serviceRows(
			`/rest/v1/activities?fulfilment_case_id=eq.${openFulfilment.caseId}&select=event_type`,
			sales
		);
		const activityTypes = new Set(activities.map((activity) => activity.event_type));
		for (const eventType of [
			'fulfilment_created',
			'fulfilment_step_created',
			'fulfilment_step_scheduled',
			'fulfilment_step_ready_for_collection',
			'payment_milestone_requested',
			'payment_follow_up_created'
		]) {
			contractAssert(activityTypes.has(eventType), `P20 Activity evidence is missing ${eventType}`);
		}

		const indexDefinitions = new Map(
			sql(`
				select indexname || '|' || indexdef
				from pg_indexes
				where schemaname = 'public'
					and indexname in (
						'quotes_dashboard_current_actionable_idx',
						'fulfilment_steps_dashboard_metrics_idx',
						'fulfilment_cases_dashboard_completed_idx',
						'payment_milestones_dashboard_awaiting_idx',
						'quotes_dashboard_declined_idx'
					)
			`)
				.split(/\r?\n/)
				.filter(Boolean)
				.map((line) => {
					const separator = line.indexOf('|');
					return [line.slice(0, separator), line.slice(separator + 1)];
				})
		);
		const expectedIndexes = {
			quotes_dashboard_current_actionable_idx: [
				'lead_id',
				'status',
				'created_at',
				'revision_number',
				'id'
			],
			fulfilment_steps_dashboard_metrics_idx: [
				'type',
				'status',
				'scheduled_for',
				'fulfilment_case_id',
				'id'
			],
			fulfilment_cases_dashboard_completed_idx: ['completed_at', 'id'],
			payment_milestones_dashboard_awaiting_idx: ['status', 'fulfilment_case_id', 'id'],
			quotes_dashboard_declined_idx: ['declined_at', 'base_quote_number', 'revision_number', 'id']
		};
		for (const [indexName, columns] of Object.entries(expectedIndexes)) {
			const definition = indexDefinitions.get(indexName);
			contractAssert(definition, `Metrics index ${indexName} is missing`);
			for (const column of columns)
				contractAssert(definition.includes(column), `${indexName} omits ${column}`);
		}
		const grantCount = Number(
			sql(`
				select count(*)
				from information_schema.routine_privileges
				where routine_schema = 'public'
					and routine_name = 'dashboard_sales_fulfilment_metrics'
					and grantee = 'authenticated'
					and privilege_type = 'EXECUTE'
			`)
		);
		assert.equal(grantCount, 1);
		contractAssert(
			newFixture.leadId &&
				qualificationFixture.leadId &&
				proposalFixture.quoteId &&
				decisionFixture.quoteId,
			'Sales fixtures were not created'
		);
		contractAssert(completedFulfilment.caseId, 'Completed Fulfilment fixture was not created');
		console.log('P20-T01 deterministic Sales and Fulfilment metrics reconciliation passed');
	} finally {
		await cleanup(users);
	}
}

await main();
