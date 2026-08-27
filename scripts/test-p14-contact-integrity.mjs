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

async function convertedClient(user) {
	const lead = await mustRpc(
		'ingest_bricks_lead',
		{
			p_form_id: 'p14-contact-form',
			p_external_submission_id: `${prefix}-contact-lead`,
			p_payload: {
				first_name: 'Contact',
				last_name: 'Owner',
				email: `${prefix}-contact@example.test`,
				phone: '+27 11 555 0201',
				message: 'Contact integrity fixture with meaningful enquiry information'
			}
		},
		serviceRoleKey,
		serviceRoleKey
	);
	let row = (await serviceRows(`/rest/v1/leads?id=eq.${lead.lead_id}&select=*`, user))[0];
	for (const stage of ['QUALIFICATION', 'PROPOSAL', 'DECISION']) {
		await mustRpc(
			'transition_lead',
			{ p_lead_id: row.id, p_to_stage: stage, p_lock_version: row.lock_version },
			undefined,
			await signIn(user)
		);
		row = (await serviceRows(`/rest/v1/leads?id=eq.${row.id}&select=*`, user))[0];
	}
	const conversion = await mustRpc(
		'convert_lead',
		{ p_lead_id: row.id, p_lock_version: row.lock_version },
		undefined,
		await signIn(user)
	);
	return conversion.client_id;
}

async function contacts(clientId, user) {
	return serviceRows(
		`/rest/v1/client_contacts?client_id=eq.${clientId}&select=*&order=created_at.asc`,
		user
	);
}

async function main() {
	const owner = await createUser('owner', 'contact-owner');
	const sales = await createUser('sales', 'contact-sales');
	const viewer = await createUser('viewer', 'contact-viewer');
	users.push(owner, sales, viewer);
	const clientId = await convertedClient(sales);
	let rows = await contacts(clientId, sales);
	const primary = rows.find((row) => row.is_primary);
	assert(
		primary?.status === 'active' && primary.lock_version === 1,
		'Converted primary contact has invalid lifecycle state'
	);

	const secondary = await mustRpc(
		'create_client_contact',
		{
			p_client_id: clientId,
			p_first_name: 'Second',
			p_last_name: 'Contact',
			p_email: `${prefix}-second@example.test`,
			p_is_primary: false
		},
		undefined,
		await signIn(sales)
	);
	assert(
		secondary.contact_id && secondary.lock_version === 1,
		'Contact creation did not return concurrency state'
	);

	const edited = await mustRpc(
		'update_client_contact',
		{
			p_contact_id: secondary.contact_id,
			p_lock_version: secondary.lock_version,
			p_first_name: 'Edited',
			p_last_name: 'Contact',
			p_job_title: 'Buyer',
			p_phone: '+27 11 555 0202'
		},
		undefined,
		await signIn(sales)
	);
	assert(edited.lock_version === 2, 'Contact edit did not advance lock_version');
	const stale = await rpc(
		'update_client_contact',
		{ p_contact_id: secondary.contact_id, p_lock_version: 1, p_first_name: 'Stale' },
		undefined,
		await signIn(sales)
	);
	assert(!stale.response.ok, 'Stale Contact update unexpectedly succeeded');

	const switched = await mustRpc(
		'set_primary_client_contact',
		{ p_contact_id: secondary.contact_id, p_lock_version: edited.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(switched.contact_id === secondary.contact_id, 'Primary Contact switch failed');
	rows = await contacts(clientId, sales);
	assert(
		rows.filter((row) => row.is_primary).length === 1 &&
			rows.find((row) => row.id === secondary.contact_id)?.is_primary,
		'Primary Contact invariant was not preserved'
	);

	const third = await mustRpc(
		'create_client_contact',
		{ p_client_id: clientId, p_first_name: 'Third', p_last_name: 'Contact', p_is_primary: false },
		undefined,
		await signIn(sales)
	);
	const concurrentSwitches = await Promise.allSettled([
		mustRpc(
			'set_primary_client_contact',
			{ p_contact_id: third.contact_id, p_lock_version: third.lock_version },
			undefined,
			await signIn(sales)
		),
		mustRpc(
			'set_primary_client_contact',
			{ p_contact_id: third.contact_id, p_lock_version: third.lock_version },
			undefined,
			await signIn(sales)
		)
	]);
	assert(
		concurrentSwitches.filter((result) => result.status === 'fulfilled').length === 1 &&
			concurrentSwitches.filter((result) => result.status === 'rejected').length === 1,
		'Concurrent primary switches did not resolve through one Client-first lock boundary'
	);
	const secondaryAfterConcurrency = (await contacts(clientId, sales)).find(
		(row) => row.id === secondary.contact_id
	);
	await mustRpc(
		'set_primary_client_contact',
		{
			p_contact_id: secondary.contact_id,
			p_lock_version: secondaryAfterConcurrency.lock_version
		},
		undefined,
		await signIn(sales)
	);
	const primaryAfterSwitch = (await contacts(clientId, sales)).find((row) => row.is_primary);
	const blockedInactivation = await rpc(
		'set_client_contact_status',
		{
			p_contact_id: primaryAfterSwitch.id,
			p_lock_version: primaryAfterSwitch.lock_version,
			p_status: 'inactive',
			p_reason: 'Has replacement candidate'
		},
		undefined,
		await signIn(sales)
	);
	assert(
		!blockedInactivation.response.ok,
		'Primary Contact was inactivated while another active contact existed'
	);

	const originalRows = (await contacts(clientId, sales)).find((row) => row.id === primary.id);
	await mustRpc(
		'set_client_contact_status',
		{
			p_contact_id: primary.id,
			p_lock_version: originalRows.lock_version,
			p_status: 'inactive',
			p_reason: 'No longer a contact'
		},
		undefined,
		await signIn(sales)
	);
	const thirdRows = (await contacts(clientId, sales)).find((row) => row.id === third.contact_id);
	await mustRpc(
		'set_client_contact_status',
		{
			p_contact_id: third.contact_id,
			p_lock_version: thirdRows.lock_version,
			p_status: 'inactive',
			p_reason: 'No longer a contact'
		},
		undefined,
		await signIn(sales)
	);
	const primaryRows = (await contacts(clientId, sales)).find((row) => row.is_primary);
	const inactivePrimary = await mustRpc(
		'set_client_contact_status',
		{
			p_contact_id: primaryRows.id,
			p_lock_version: primaryRows.lock_version,
			p_status: 'inactive',
			p_reason: 'No active replacement remains'
		},
		undefined,
		await signIn(sales)
	);
	assert(
		inactivePrimary.status === 'inactive',
		'Primary Contact did not transition to inactive when no replacement remained'
	);
	const cannotPromote = await rpc(
		'set_primary_client_contact',
		{ p_contact_id: primaryRows.id, p_lock_version: inactivePrimary.lock_version },
		undefined,
		await signIn(sales)
	);
	assert(!cannotPromote.response.ok, 'Inactive Contact became primary');

	const viewerCreate = await rpc(
		'create_client_contact',
		{ p_client_id: clientId, p_first_name: 'Viewer' },
		undefined,
		await signIn(viewer)
	);
	assert(!viewerCreate.response.ok, 'Viewer created a ClientContact');
	const rawDelete = await authenticated(
		`/rest/v1/client_contacts?id=eq.${secondary.contact_id}`,
		{ method: 'DELETE' },
		sales
	);
	assert(!rawDelete.response.ok, 'Raw ClientContact delete bypassed retention law');

	const clientRow = (await serviceRows(`/rest/v1/clients?id=eq.${clientId}&select=*`, owner))[0];
	await mustRpc(
		'set_client_status',
		{
			p_client_id: clientId,
			p_lock_version: clientRow.lock_version,
			p_status: 'archived',
			p_reason: 'Contact boundary fixture'
		},
		undefined,
		await signIn(owner)
	);
	const archivedMutation = await rpc(
		'create_client_contact',
		{ p_client_id: clientId, p_first_name: 'Archived' },
		undefined,
		await signIn(sales)
	);
	assert(!archivedMutation.response.ok, 'Archived Client accepted a new Contact');

	const activityRows = await serviceRows(
		`/rest/v1/activities?client_id=eq.${clientId}&event_type=in.(client_contact_created,client_contact_updated,client_primary_contact_changed,client_contact_status_changed)&select=event_type`,
		owner
	);
	assert(
		activityRows.some((row) => row.event_type === 'client_contact_created'),
		'Contact create Activity missing'
	);
	assert(
		activityRows.some((row) => row.event_type === 'client_primary_contact_changed'),
		'Primary change Activity missing'
	);
	console.log('P14-T28 ClientContact lifecycle and primary integrity passed');
}

try {
	await main();
} finally {
	await cleanup(users);
}
