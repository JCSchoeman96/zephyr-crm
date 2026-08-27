import {
	assert,
	cleanup,
	mustRpc,
	prefix,
	rpc,
	serviceRoleKey,
	serviceRows,
	signIn,
	createUser
} from './p14-test-utils.mjs';

const users = [];
async function expectRpcFailure(name, args, user, label, token = null) {
	const result = await rpc(name, args, undefined, token ?? (await signIn(user)));
	assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
	return result;
}

async function leadById(leadId, user) {
	return (await serviceRows(`/rest/v1/leads?id=eq.${leadId}&select=*`, user))[0];
}

async function quoteById(quoteId, user) {
	return (await serviceRows(`/rest/v1/quotes?id=eq.${quoteId}&select=*`, user))[0];
}

async function caseById(caseId, user) {
	return (await serviceRows(`/rest/v1/fulfilment_cases?id=eq.${caseId}&select=*`, user))[0];
}

async function createDecisionLead(user, label) {
	const externalId = `${prefix}-${label}-lead`;
	const created = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p17-sales-fulfilment-form',
			p_external_submission_id: externalId,
			p_payload: {
				first_name: 'P17',
				last_name: label,
				email: `${externalId}@example.test`,
				phone: '+27820000017',
				message: 'P17 accepted-sale fixture with meaningful enquiry details'
			}
		},
		serviceRoleKey
	);
	const leadId = created.lead_id;
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		const current = await leadById(leadId, user);
		await mustRpc(
			'transition_lead',
			{ p_lead_id: leadId, p_to_stage: stage, p_lock_version: current.lock_version },
			undefined,
			await signIn(user)
		);
	}
	return { id: leadId, externalId };
}

async function createSentQuote(lead, user, label) {
	const draft = await mustRpc(
		'create_minimal_quote',
		{
			p_lead_id: lead.id,
			p_subject: `P17 ${label} quote`,
			p_item_name: `P17 ${label} installation`,
			p_quantity: '1',
			p_unit_price: '1250.00',
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

async function createSalesTask(lead, user, label) {
	return mustRpc(
		'create_task',
		{
			p_lead_id: lead.id,
			p_type: 'custom',
			p_title: `P17 ${label}`,
			p_description: 'Obsolete Sales work fixture',
			p_due_at: '2099-01-01T09:00:00Z',
			p_assigned_to: user.id
		},
		undefined,
		await signIn(user)
	);
}

async function acceptedJourney(sales) {
	const lead = await createDecisionLead(sales, 'accepted');
	const sent = await createSentQuote(lead, sales, 'accepted');
	const obsoleteTask = await createSalesTask(lead, sales, 'obsolete follow-up');
	const accepted = await mustRpc(
		'accept_quote',
		{
			p_quote_id: sent.id,
			p_lock_version: sent.lock_version,
			p_acceptance_source: 'customer_email',
			p_acceptance_evidence: 'Customer approved the sent Quote by email.'
		},
		undefined,
		await signIn(sales)
	);
	assert(accepted.status === 'accepted', 'Atomic acceptance did not accept the Quote');
	assert(
		accepted.client_id && accepted.fulfilment_case_id,
		'Atomic acceptance omitted handoff IDs'
	);
	assert(accepted.planning_task_id, 'Atomic acceptance omitted planning Task evidence');

	const acceptedQuote = await quoteById(sent.id, sales);
	const wonLead = await leadById(lead.id, sales);
	const clients = await serviceRows(
		`/rest/v1/clients?source_lead_id=eq.${lead.id}&select=*`,
		sales
	);
	const contacts = await serviceRows(
		`/rest/v1/client_contacts?client_id=eq.${accepted.client_id}&select=*`,
		sales
	);
	const fulfilment = await caseById(accepted.fulfilment_case_id, sales);
	const milestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${accepted.fulfilment_case_id}&select=*`,
		sales
	);
	const tasks = await serviceRows(`/rest/v1/tasks?lead_id=eq.${lead.id}&select=*`, sales);
	const activities = await serviceRows(
		`/rest/v1/activities?lead_id=eq.${lead.id}&select=event_type`,
		sales
	);
	assert(
		acceptedQuote.status === 'accepted' &&
			acceptedQuote.client_id === accepted.client_id &&
			acceptedQuote.acceptance_source === 'customer_email' &&
			acceptedQuote.acceptance_evidence.includes('approved'),
		'Accepted Quote evidence or Client link was not persisted'
	);
	assert(
		wonLead.pipeline_stage === 'WON' &&
			wonLead.attention_state === 'none' &&
			wonLead.converted_client_id === accepted.client_id,
		'Atomic acceptance did not win and link the Lead'
	);
	assert(
		clients.length === 1 &&
			contacts.filter((contact) => contact.status === 'active' && contact.is_primary).length === 1,
		'Atomic acceptance created an invalid Client or primary Contact set'
	);
	assert(
		fulfilment.status === 'open' &&
			fulfilment.client_id === accepted.client_id &&
			fulfilment.lead_id === lead.id &&
			fulfilment.accepted_quote_id === sent.id &&
			milestones.length === 2 &&
			milestones.every((milestone) => milestone.status === 'not_due'),
		'Atomic acceptance did not create the expected open case and milestones'
	);
	const planningTask = tasks.find((task) => task.id === accepted.planning_task_id);
	const cancelledTask = tasks.find((task) => task.id === obsoleteTask.task_id);
	assert(
		planningTask?.type === 'plan_fulfilment' &&
			planningTask.fulfilment_case_id === accepted.fulfilment_case_id &&
			planningTask.client_id === accepted.client_id &&
			planningTask.lead_id === lead.id &&
			cancelledTask?.status === 'cancelled',
		'Atomic acceptance did not close Sales work and create planning work'
	);
	const eventTypes = new Set(activities.map((activity) => activity.event_type));
	for (const event of [
		'quote_accepted',
		'client_created',
		'lead_won',
		'fulfilment_created',
		'task_created'
	]) {
		assert(eventTypes.has(event), `Atomic acceptance omitted ${event} Activity evidence`);
	}

	const repeated = await mustRpc(
		'accept_quote',
		{
			p_quote_id: sent.id,
			p_lock_version: accepted.lock_version,
			p_acceptance_source: 'customer_email',
			p_acceptance_evidence: 'Retry of the same customer acceptance.'
		},
		undefined,
		await signIn(sales)
	);
	assert(
		repeated.idempotent === true &&
			repeated.fulfilment_case_id === accepted.fulfilment_case_id &&
			repeated.planning_task_id === accepted.planning_task_id,
		'Repeated acceptance did not return the existing handoff'
	);
	assert(
		(
			await serviceRows(
				`/rest/v1/fulfilment_cases?accepted_quote_id=eq.${sent.id}&select=id`,
				sales
			)
		).length === 1 &&
			(await serviceRows(`/rest/v1/clients?source_lead_id=eq.${lead.id}&select=id`, sales))
				.length === 1 &&
			(
				await serviceRows(
					`/rest/v1/tasks?fulfilment_case_id=eq.${accepted.fulfilment_case_id}&type=eq.plan_fulfilment&select=id`,
					sales
				)
			).length === 1,
		'Repeated acceptance duplicated handoff rows'
	);

	const caseRow = await caseById(accepted.fulfilment_case_id, sales);
	const step = await mustRpc(
		'create_fulfilment_step',
		{
			p_fulfilment_case_id: caseRow.id,
			p_type: 'installation',
			p_lock_version: caseRow.lock_version,
			p_notes: 'P17 local installation journey'
		},
		undefined,
		await signIn(sales)
	);
	const stepRow = (
		await serviceRows(`/rest/v1/fulfilment_steps?id=eq.${step.step_id}&select=*`, sales)
	)[0];
	const scheduled = await mustRpc(
		'schedule_fulfilment_step',
		{
			p_step_id: step.step_id,
			p_lock_version: stepRow.lock_version,
			p_scheduled_for: '2099-02-01T09:00:00Z'
		},
		undefined,
		await signIn(sales)
	);
	const scheduledRow = (
		await serviceRows(`/rest/v1/fulfilment_steps?id=eq.${step.step_id}&select=*`, sales)
	)[0];
	assert(
		scheduled.status === 'scheduled' && scheduledRow.scheduled_for,
		'Installation was not scheduled'
	);
	const completedStep = await mustRpc(
		'complete_fulfilment_step',
		{ p_step_id: step.step_id, p_lock_version: scheduledRow.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(completedStep.status === 'completed', 'Installation was not completed');

	let currentMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseRow.id}&select=*`,
		sales
	);
	const deposit = currentMilestones.find((milestone) => milestone.type === 'deposit');
	await mustRpc(
		'request_payment_milestone',
		{ p_payment_milestone_id: deposit.id, p_lock_version: deposit.lock_version },
		undefined,
		await signIn(sales)
	);
	currentMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseRow.id}&select=*`,
		sales
	);
	const awaitingDeposit = currentMilestones.find((milestone) => milestone.type === 'deposit');
	await mustRpc(
		'record_payment_received',
		{
			p_payment_milestone_id: awaitingDeposit.id,
			p_lock_version: awaitingDeposit.lock_version,
			p_note: 'Deposit received in P17 tracer'
		},
		undefined,
		await signIn(sales)
	);
	currentMilestones = await serviceRows(
		`/rest/v1/payment_milestones?fulfilment_case_id=eq.${caseRow.id}&select=*`,
		sales
	);
	const currentFinal = currentMilestones.find((milestone) => milestone.type === 'final_balance');
	await mustRpc(
		'mark_payment_not_required',
		{
			p_payment_milestone_id: currentFinal.id,
			p_lock_version: currentFinal.lock_version,
			p_note: 'No final balance due in P17 tracer'
		},
		undefined,
		await signIn(sales)
	);
	const finalCase = await caseById(caseRow.id, sales);
	const completedCase = await mustRpc(
		'complete_fulfilment',
		{ p_fulfilment_case_id: finalCase.id, p_lock_version: finalCase.lock_version },
		undefined,
		await signIn(sales)
	);
	const repeatedCompletion = await mustRpc(
		'complete_fulfilment',
		{ p_fulfilment_case_id: finalCase.id, p_lock_version: completedCase.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(completedCase.status === 'completed', 'Complete tracer journey did not complete the case');
	assert(repeatedCompletion.idempotent === true, 'Case completion retry was not idempotent');
	console.log('P17-T01 atomic acceptance and P17-T04 complete tracer journey passed');
}

async function revisionContract(sales) {
	const lead = await createDecisionLead(sales, 'revision');
	const sent = await createSentQuote(lead, sales, 'revision');
	const sourceBefore = await quoteById(sent.id, sales);
	const revised = await mustRpc(
		'revise_quote',
		{ p_quote_id: sent.id, p_lock_version: sourceBefore.lock_version },
		undefined,
		await signIn(sales)
	);
	const sourceAfter = await quoteById(sent.id, sales);
	const draft = await quoteById(revised.quote_id, sales);
	const revisedLead = await leadById(lead.id, sales);
	const preparationTasks = await serviceRows(
		`/rest/v1/tasks?lead_id=eq.${lead.id}&type=eq.prepare_quote&status=eq.open&select=*`,
		sales
	);
	assert(
		sourceAfter.status === 'sent' &&
			sourceAfter.subject === sourceBefore.subject &&
			draft.status === 'draft' &&
			draft.supersedes_quote_id === sent.id &&
			draft.revision_number === sourceBefore.revision_number + 1,
		'Quote adjustment did not preserve the sent revision'
	);
	assert(
		revisedLead.pipeline_stage === 'PROPOSAL' &&
			revisedLead.attention_state === 'waiting_on_us' &&
			preparationTasks.length === 1 &&
			preparationTasks[0].quote_id === draft.id,
		'Quote adjustment did not return the Lead to Proposal with planning work'
	);
	const ready = await mustRpc(
		'mark_quote_ready',
		{ p_quote_id: draft.id, p_lock_version: draft.lock_version },
		undefined,
		await signIn(sales)
	);
	const prepared = await mustRpc(
		'prepare_quote_send',
		{ p_quote_id: draft.id, p_lock_version: ready.lock_version },
		undefined,
		await signIn(sales)
	);
	await mustRpc(
		'complete_quote_send',
		{
			p_outbound_message_id: prepared.outbound_message_id,
			p_provider_message_id: `${prefix}-revision-provider-${draft.id}`
		},
		undefined,
		await signIn(sales)
	);
	const resent = await quoteById(draft.id, sales);
	const superseded = await quoteById(sent.id, sales);
	const resentLead = await leadById(lead.id, sales);
	assert(
		resent.status === 'sent' &&
			superseded.status === 'superseded' &&
			resentLead.pipeline_stage === 'DECISION' &&
			resentLead.attention_state === 'waiting_on_client',
		'Re-sending a revised Quote did not supersede only the prior sent revision'
	);
	console.log('P17-T02 quote revision handback passed');
}

async function declineContract(sales) {
	const lead = await createDecisionLead(sales, 'decline');
	const sent = await createSentQuote(lead, sales, 'decline');
	const obsoleteTask = await createSalesTask(lead, sales, 'decline obsolete work');
	const reasons = await serviceRows('/rest/v1/lost_reasons?code=eq.price&select=id', sales);
	assert(reasons.length === 1, 'P17 decline fixture requires the price LostReason');
	const before = await leadById(lead.id, sales);
	await expectRpcFailure(
		'decline_quote',
		{
			p_quote_id: sent.id,
			p_lock_version: sent.lock_version,
			p_lost_reason_id: '00000000-0000-0000-0000-000000000000',
			p_lost_notes: ''
		},
		sales,
		'invalid Quote decline evidence'
	);
	assert(
		(await quoteById(sent.id, sales)).status === 'sent' &&
			(await leadById(lead.id, sales)).pipeline_stage === 'DECISION',
		'Invalid Quote decline partially committed'
	);
	const declined = await mustRpc(
		'decline_quote',
		{
			p_quote_id: sent.id,
			p_lock_version: sent.lock_version,
			p_lost_reason_id: reasons[0].id,
			p_lost_notes: 'Customer selected a lower-cost alternative.'
		},
		undefined,
		await signIn(sales)
	);
	const declinedQuote = await quoteById(sent.id, sales);
	const lostLead = await leadById(lead.id, sales);
	const tasks = await serviceRows(`/rest/v1/tasks?lead_id=eq.${lead.id}&select=*`, sales);
	const activities = await serviceRows(
		`/rest/v1/activities?lead_id=eq.${lead.id}&select=event_type`,
		sales
	);
	const events = new Set(activities.map((activity) => activity.event_type));
	assert(
		declined.status === 'declined' &&
			declinedQuote.status === 'declined' &&
			lostLead.pipeline_stage === 'LOST' &&
			lostLead.attention_state === 'none' &&
			lostLead.lost_reason_id === reasons[0].id &&
			lostLead.lost_notes.includes('lower-cost') &&
			tasks.find((task) => task.id === obsoleteTask.task_id)?.status === 'cancelled',
		'Definitive Quote decline did not close the Quote, Lead, and Sales work'
	);
	assert(
		events.has('quote_declined') && events.has('lead_lost'),
		'Definitive Quote decline omitted Quote/Lead Activity evidence'
	);
	assert(before.pipeline_stage === 'DECISION', 'Decline fixture did not begin at Decision');
	console.log('P17-T03 quote decline closure passed');
}

async function guardContract(sales, viewer) {
	const lead = await createDecisionLead(sales, 'guards');
	const sent = await createSentQuote(lead, sales, 'guards');
	await expectRpcFailure(
		'accept_quote',
		{
			p_quote_id: sent.id,
			p_lock_version: sent.lock_version,
			p_acceptance_source: 'viewer',
			p_acceptance_evidence: 'Viewer must not accept a sale.'
		},
		viewer,
		'viewer Quote acceptance'
	);
	assert(
		(await quoteById(sent.id, sales)).status === 'sent',
		'Unauthorized acceptance changed Quote state'
	);

	const newerDraft = await mustRpc(
		'revise_quote',
		{ p_quote_id: sent.id, p_lock_version: sent.lock_version },
		undefined,
		await signIn(sales)
	);
	await expectRpcFailure(
		'accept_quote',
		{
			p_quote_id: sent.id,
			p_lock_version: sent.lock_version,
			p_acceptance_source: 'customer_email',
			p_acceptance_evidence: 'The stale sent revision must be rejected.'
		},
		sales,
		'stale sent revision acceptance'
	);
	assert(
		(await quoteById(sent.id, sales)).status === 'sent' &&
			(await quoteById(newerDraft.quote_id, sales)).status === 'draft',
		'Stale sent revision acceptance changed Quote state'
	);
	console.log('P17 acceptance authorization and current-revision guards passed');
}

async function main() {
	const sales = await createUser('sales', 'p17-sales');
	const viewer = await createUser('viewer', 'p17-viewer');
	users.push(sales, viewer);
	await acceptedJourney(sales);
	await revisionContract(sales);
	await declineContract(sales);
	await guardContract(sales, viewer);
	console.log('P17 focused Sales-to-Fulfilment tests passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
