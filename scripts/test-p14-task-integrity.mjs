import {
	assert,
	authenticated,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	rpc,
	serviceRows,
	serviceRoleKey,
	signIn
} from './p14-test-utils.mjs';

const users = [];

async function leadAtDecision(user, label) {
	const created = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p14-task-form',
			p_external_submission_id: `${prefix}-${label}`,
			p_payload: {
				first_name: 'Task',
				last_name: label,
				email: `${prefix}-${label}@example.test`,
				message: 'Task relationship fixture'
			}
		},
		serviceRoleKey,
		serviceRoleKey
	);
	let lead = (await serviceRows(`/rest/v1/leads?id=eq.${created.lead_id}&select=*`, user))[0];
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		await mustRpc(
			'transition_lead',
			{ p_lead_id: lead.id, p_to_stage: stage, p_lock_version: lead.lock_version },
			undefined,
			await signIn(user)
		);
		lead = (await serviceRows(`/rest/v1/leads?id=eq.${lead.id}&select=*`, user))[0];
	}
	return lead;
}

async function convert(user, lead) {
	return mustRpc(
		'convert_lead',
		{ p_lead_id: lead.id, p_lock_version: lead.lock_version },
		undefined,
		await signIn(user)
	);
}

async function main() {
	const owner = await createUser('owner', 'task-owner');
	const sales = await createUser('sales', 'task-sales');
	users.push(owner, sales);
	const lead = await leadAtDecision(sales, 'primary');
	const quote = await mustRpc(
		'save_quote_draft',
		{
			p_quote_id: null,
			p_lock_version: null,
			p_lead_id: lead.id,
			p_client_id: null,
			p_subject: `${prefix} quote`,
			p_introduction: 'Task quote fixture',
			p_terms: 'Task terms',
			p_tax_label: 'VAT',
			p_tax_rate: '15.0000',
			p_valid_until: '2099-12-31',
			p_currency: 'ZAR',
			p_items: [{ name: 'Task item', quantity: '1.0000', unit_price: '100.00', taxable: true }]
		},
		undefined,
		await signIn(sales)
	);
	const refreshedLead = (await serviceRows(`/rest/v1/leads?id=eq.${lead.id}&select=*`, sales))[0];
	const conversion = await convert(sales, refreshedLead);
	const clientId = conversion.client_id;
	const otherLead = await leadAtDecision(sales, 'other');
	const otherClient = (await convert(sales, otherLead)).client_id;

	const quoteTask = await mustRpc(
		'create_task',
		{ p_quote_id: quote.quote_id, p_type: 'follow_up', p_title: `${prefix} quote context` },
		undefined,
		await signIn(sales)
	);
	const quoteTaskRow = (
		await serviceRows(`/rest/v1/tasks?id=eq.${quoteTask.task_id}&select=*`, sales)
	)[0];
	assert(
		quoteTaskRow.quote_id === quote.quote_id &&
			quoteTaskRow.lead_id === lead.id &&
			quoteTaskRow.client_id === clientId,
		'Quote Task did not derive authoritative Lead/Client context'
	);

	const leadTask = await mustRpc(
		'create_task',
		{ p_lead_id: otherLead.id, p_type: 'custom', p_title: `${prefix} lead context` },
		undefined,
		await signIn(sales)
	);
	const clientTask = await mustRpc(
		'create_task',
		{ p_client_id: otherClient, p_type: 'call_client', p_title: `${prefix} client context` },
		undefined,
		await signIn(sales)
	);
	assert(leadTask.task_id && clientTask.task_id, 'Lead-only or Client-only Task creation failed');

	const mismatchedLead = await rpc(
		'create_task',
		{
			p_quote_id: quote.quote_id,
			p_lead_id: otherLead.id,
			p_type: 'custom',
			p_title: `${prefix} mismatched lead`
		},
		undefined,
		await signIn(sales)
	);
	assert(!mismatchedLead.response.ok, 'Quote Task accepted an unrelated Lead');
	const mismatchedClient = await rpc(
		'create_task',
		{
			p_quote_id: quote.quote_id,
			p_client_id: otherClient,
			p_type: 'custom',
			p_title: `${prefix} mismatched client`
		},
		undefined,
		await signIn(sales)
	);
	assert(!mismatchedClient.response.ok, 'Quote Task accepted an unrelated Client');
	const multipleDirect = await rpc(
		'create_task',
		{
			p_lead_id: lead.id,
			p_client_id: otherClient,
			p_type: 'custom',
			p_title: `${prefix} multiple parent`
		},
		undefined,
		await signIn(sales)
	);
	assert(!multipleDirect.response.ok, 'Task accepted multiple direct parents without a Quote');

	const rawInsert = await authenticated(
		'/rest/v1/tasks',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lead_id: lead.id, type: 'custom', title: `${prefix} raw insert` })
		},
		sales
	);
	assert(!rawInsert.response.ok, 'Raw Task INSERT bypassed create_task');
	const rawUpdate = await authenticated(
		`/rest/v1/tasks?id=eq.${quoteTask.task_id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client_id: otherClient })
		},
		sales
	);
	assert(!rawUpdate.response.ok, 'Raw Task relationship UPDATE bypassed trusted mutation');
	const rawLifecycle = await authenticated(
		`/rest/v1/tasks?id=eq.${quoteTask.task_id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'completed', lock_version: quoteTaskRow.lock_version + 1 })
		},
		sales
	);
	assert(!rawLifecycle.response.ok, 'Raw Task lifecycle UPDATE bypassed complete_task');

	const taskView = await serviceRows(
		`/rest/v1/task_work_queue?id=eq.${quoteTask.task_id}&select=*`,
		sales
	);
	assert(taskView[0]?.quote_id === quote.quote_id, 'Task work queue lost Quote context');
	console.log('P14-T29 Task relationship and context integrity passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
