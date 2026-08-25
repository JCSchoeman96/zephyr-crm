import {
	assert,
	authenticated,
	cleanup,
	createUser,
	mustRpc,
	prefix,
	serviceRows,
	serviceRoleKey,
	signIn,
	rpc
} from './p14-test-utils.mjs';

const users = [];

async function createLead(user, label) {
	const result = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p14-client-form',
			p_external_submission_id: `${prefix}-${label}`,
			p_payload: {
				first_name: 'Client',
				last_name: label,
				email: `${prefix}-${label}@example.test`,
				phone: '+27 11 555 0101',
				company: `${prefix} Company`,
				message: 'P14 client lifecycle fixture'
			}
		},
		serviceRoleKey,
		serviceRoleKey
	);
	let lead = (await serviceRows(`/rest/v1/leads?id=eq.${result.lead_id}&select=*`, user))[0];
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		await mustRpc(
			'transition_lead',
			{ p_lead_id: lead.id, p_to_stage: stage, p_lock_version: lead.lock_version },
			undefined,
			await signIn(user)
		);
		lead = (await serviceRows(`/rest/v1/leads?id=eq.${lead.id}&select=*`, user))[0];
	}
	const conversion = await mustRpc(
		'convert_lead',
		{ p_lead_id: lead.id, p_lock_version: lead.lock_version },
		undefined,
		await signIn(user)
	);
	return { lead, clientId: conversion.client_id };
}

async function client(clientId, user) {
	return (await serviceRows(`/rest/v1/clients?id=eq.${clientId}&select=*`, user))[0];
}

async function main() {
	const owner = await createUser('owner', 'client-owner');
	const sales = await createUser('sales', 'client-sales');
	const viewer = await createUser('viewer', 'client-viewer');
	users.push(owner, sales, viewer);

	const fixture = await createLead(sales, 'lifecycle');
	let current = await client(fixture.clientId, sales);
	assert(current.lock_version === 1, 'Converted Client must start at lock_version 1');
	assert(
		current.phone_normalized === '+27115550101',
		'Client phone was not normalized at conversion'
	);

	const updated = await mustRpc(
		'update_client_details',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_type: 'company',
			p_display_name: `${prefix} Maintained`,
			p_company_name: `${prefix} Maintained Ltd`,
			p_email: `${prefix}@example.test`,
			p_phone: '+27 11 555 0102',
			p_tax_number: 'TAX-14',
			p_registration_number: 'REG-14',
			p_billing_address_line_1: '1 P14 Street',
			p_billing_city: 'Johannesburg',
			p_billing_country: 'ZA'
		},
		undefined,
		await signIn(sales)
	);
	assert(updated.lock_version === 2, 'Client maintenance did not advance lock_version');
	current = await client(current.id, sales);
	assert(current.phone_normalized === '+27115550102', 'Client phone update did not re-normalize');
	assert(
		current.company_name === `${prefix} Maintained Ltd`,
		'Client company update was not persisted'
	);

	const stale = await rpc(
		'update_client_details',
		{
			p_client_id: current.id,
			p_lock_version: 1,
			p_type: 'company',
			p_display_name: 'Stale write',
			p_company_name: 'Stale Company'
		},
		undefined,
		await signIn(sales)
	);
	assert(!stale.response.ok, 'Stale Client maintenance unexpectedly succeeded');

	const invalidCompany = await rpc(
		'update_client_details',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_type: 'company',
			p_display_name: 'Missing company'
		},
		undefined,
		await signIn(sales)
	);
	assert(!invalidCompany.response.ok, 'Company Client without company_name was accepted');
	const invalidIndividual = await rpc(
		'update_client_details',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_type: 'individual',
			p_display_name: 'Hybrid',
			p_company_name: 'Should fail'
		},
		undefined,
		await signIn(sales)
	);
	assert(!invalidIndividual.response.ok, 'Individual Client with company_name was accepted');

	const directPatch = await authenticated(
		`/rest/v1/clients?id=eq.${current.id}`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'archived' })
		},
		sales
	);
	assert(!directPatch.response.ok, 'Raw Client status PATCH bypassed trusted action');

	const work = await mustRpc(
		'create_task',
		{ p_client_id: current.id, p_type: 'follow_up', p_title: `${prefix} active client work` },
		undefined,
		await signIn(sales)
	);
	current = await client(current.id, sales);
	const salesArchive = await rpc(
		'set_client_status',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_status: 'archived',
			p_reason: 'Sales attempt'
		},
		undefined,
		await signIn(sales)
	);
	assert(!salesArchive.response.ok, 'Sales archive unexpectedly succeeded');

	const taskRows = await serviceRows(`/rest/v1/tasks?id=eq.${work.task_id}&select=*`, owner);
	await mustRpc(
		'cancel_task',
		{ p_task_id: work.task_id, p_lock_version: taskRows[0].lock_version },
		undefined,
		await signIn(owner)
	);
	current = await client(current.id, owner);
	const archived = await mustRpc(
		'set_client_status',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_status: 'archived',
			p_reason: 'No active work'
		},
		undefined,
		await signIn(owner)
	);
	assert(
		archived.status === 'archived' && archived.lock_version === current.lock_version + 1,
		'Owner archive failed'
	);
	current = await client(current.id, owner);
	const archivedEdit = await rpc(
		'update_client_details',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_type: 'company',
			p_display_name: 'Archived edit',
			p_company_name: 'Nope'
		},
		undefined,
		await signIn(sales)
	);
	assert(!archivedEdit.response.ok, 'Archived Client remained editable');
	const directActiveRestore = await rpc(
		'set_client_status',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_status: 'active',
			p_reason: 'Wrong direct restore'
		},
		undefined,
		await signIn(owner)
	);
	assert(!directActiveRestore.response.ok, 'Archived Client restored directly to active');
	const restored = await mustRpc(
		'set_client_status',
		{
			p_client_id: current.id,
			p_lock_version: current.lock_version,
			p_status: 'inactive',
			p_reason: 'P14 restore'
		},
		undefined,
		await signIn(owner)
	);
	assert(restored.status === 'inactive', 'Owner restore did not return Client to inactive');

	const activities = await serviceRows(
		`/rest/v1/activities?client_id=eq.${current.id}&event_type=in.(client_updated,client_archived,client_restored)&select=event_type`,
		owner
	);
	assert(
		activities.some((row) => row.event_type === 'client_archived'),
		'Client archive Activity is missing'
	);
	assert(
		activities.some((row) => row.event_type === 'client_restored'),
		'Client restore Activity is missing'
	);
	console.log('P14-T27 Client lifecycle and maintenance integrity passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
