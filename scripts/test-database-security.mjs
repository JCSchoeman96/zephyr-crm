import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const runId = `${Date.now()}`;
const testPrefix = `p3-${runId}`;
const createdUsers = [];

function run(command, args) {
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	} catch (error) {
		const stderr = error.stderr?.toString().trim();
		throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`, {
			cause: error
		});
	}
}

function readLocalStatus() {
	const status = run('bunx', ['supabase', 'status', '-o', 'env']);
	return Object.fromEntries(
		status
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				const value = line.slice(separator + 1).replace(/^"(.*)"$/, '$1');
				return [line.slice(0, separator), value];
			})
	);
}

const local = readLocalStatus();
const apiUrl = local.API_URL;
const anonKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const serviceRoleKey = local.SERVICE_ROLE_KEY;
const databaseUrl = local.DB_URL;
const jwtSecret = local.JWT_SECRET;

if (!apiUrl || !anonKey || !serviceRoleKey || !databaseUrl || !jwtSecret) {
	throw new Error(
		'Local Supabase status is missing required test endpoints. Start Supabase first.'
	);
}

function base64Url(value) {
	return Buffer.from(value).toString('base64url');
}

function aal2Token(userId) {
	const now = Math.floor(Date.now() / 1000);
	const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64Url(
		JSON.stringify({
			aud: 'authenticated',
			role: 'authenticated',
			sub: userId,
			aal: 'aal2',
			session_id: `v131-${runId}-${userId}`,
			iat: now,
			exp: now + 600
		})
	);
	const unsigned = `${header}.${payload}`;
	const signature = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
	return `${unsigned}.${signature}`;
}

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function sql(query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

async function request(path, { token = anonKey, method = 'GET', body, admin = false } = {}) {
	const key = admin ? serviceRoleKey : anonKey;
	const response = await fetch(`${apiUrl}${path}`, {
		method,
		headers: {
			apikey: key,
			Authorization: `Bearer ${admin ? serviceRoleKey : token}`,
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
			...(method === 'GET' ? {} : { Prefer: 'return=representation' })
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await response.text();
	let parsed = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		// Keep the response body opaque when it is not JSON.
	}
	return { status: response.status, ok: response.ok, body: parsed };
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertDenied(result, label) {
	const changedRows = Array.isArray(result.body) ? result.body.length : result.ok ? 1 : 0;
	assert(changedRows === 0, `${label} unexpectedly succeeded with HTTP ${result.status}`);
}

async function createUser(label, role) {
	const email = `${testPrefix}-${label}@example.test`;
	const password = `P3-${runId}-${label}-Password9!`;
	const created = await request('/auth/v1/admin/users', {
		method: 'POST',
		admin: true,
		body: { email, password, email_confirm: true, user_metadata: { full_name: `P3 ${label}` } }
	});
	assert(
		created.ok && created.body?.id,
		`Could not create local ${label} test user (HTTP ${created.status}: ${JSON.stringify(created.body)})`
	);
	const id = created.body.id;
	createdUsers.push({ id });
	sql(
		`update public.profiles set role = ${sqlLiteral(role)}, status = 'active' where id = ${sqlLiteral(id)}::uuid;`
	);
	let session;
	for (let attempt = 0; attempt < 6; attempt += 1) {
		session = await request('/auth/v1/token?grant_type=password', {
			method: 'POST',
			body: { email, password }
		});
		if (session.ok && session.body?.access_token) return { id, token: session.body.access_token };
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert(
		false,
		`Could not sign in local ${label} test user (HTTP ${session?.status}: ${JSON.stringify(session?.body)})`
	);
}

async function deleteUsers() {
	for (const { id } of createdUsers) {
		await request(`/auth/v1/admin/users/${id}`, { method: 'DELETE', admin: true });
	}
}

async function main() {
	const signupProbe = await request('/auth/v1/signup', {
		method: 'POST',
		body: { email: `${testPrefix}-signup@example.test`, password: `P3-${runId}-Signup9!` }
	});
	assertDenied(signupProbe, 'public signup');

	const owner = await createUser('owner', 'owner');
	const admin = await createUser('admin', 'admin');
	const sales = await createUser('sales', 'sales');
	const viewer = await createUser('viewer', 'viewer');
	const suspended = await createUser('suspended', 'sales');
	const ownerAal2Token = aal2Token(owner.id);
	const adminAal2Token = aal2Token(admin.id);

	const leadExternalId = `${testPrefix}-lead`;
	const leadPayload = {
		first_name: 'Ada',
		last_name: 'Lovelace',
		email: `${testPrefix}@example.test`,
		pipeline_stage: 'NEW',
		attention_state: 'none',
		external_submission_id: leadExternalId,
		message: 'Security contract fixture'
	};
	const createdLead = await request('/rest/v1/leads', {
		method: 'POST',
		token: sales.token,
		body: leadPayload
	});
	assert(
		createdLead.ok && createdLead.body?.[0]?.id,
		`Sales could not create a lead (${createdLead.status}): ${JSON.stringify(createdLead.body)}`
	);
	const leadId = createdLead.body[0].id;
	const initialLockVersion = createdLead.body[0].lock_version;
	assert(initialLockVersion === 1, 'New leads must start at lock_version 1');
	const normalizedLead = await request('/rest/v1/leads', {
		method: 'POST',
		token: sales.token,
		body: {
			first_name: 'Phone',
			last_name: 'Normalization',
			email: `${testPrefix}-phone@example.test`,
			external_submission_id: `${testPrefix}-phone`,
			phone: '+27 11 000 0002',
			phone_normalized: '+99999999999',
			created_at: '2000-01-01T00:00:00.000Z',
			updated_at: '2000-01-01T00:00:00.000Z'
		}
	});
	assert(
		normalizedLead.ok &&
			normalizedLead.body?.[0]?.phone_normalized === '+27110000002' &&
			!normalizedLead.body[0].created_at.startsWith('2000-') &&
			!normalizedLead.body[0].updated_at.startsWith('2000-'),
		'Server did not derive Lead phone/timestamp fields at the trusted boundary'
	);
	const forgedLeadInsert = await request('/rest/v1/leads', {
		method: 'POST',
		token: sales.token,
		body: {
			...leadPayload,
			external_submission_id: `${testPrefix}-forged-workflow`,
			pipeline_stage: 'WON',
			lock_version: 99,
			paused_at: '2099-01-01T00:00:00.000Z',
			pause_reason: 'forged browser state'
		}
	});
	assertDenied(forgedLeadInsert, 'raw Lead protected-state insert');

	const manualClient = await request('/rest/v1/clients', {
		method: 'POST',
		token: sales.token,
		body: {
			type: 'individual',
			display_name: `${testPrefix} manual client`,
			email: `${testPrefix}-client@example.test`
		}
	});
	assert(
		manualClient.ok && manualClient.body?.[0]?.id,
		`Permitted manual Client creation failed (${manualClient.status})`
	);
	const manualClientId = manualClient.body[0].id;
	assertDenied(
		await request('/rest/v1/clients', {
			method: 'POST',
			token: sales.token,
			body: {
				type: 'individual',
				display_name: 'x'.repeat(241)
			}
		}),
		'oversized Client display name'
	);
	const manualContact = await request('/rest/v1/client_contacts', {
		method: 'POST',
		token: sales.token,
		body: {
			client_id: manualClientId,
			first_name: 'Manual',
			last_name: 'Contact',
			email: `${testPrefix}-contact@example.test`
		}
	});
	assert(
		manualContact.ok && manualContact.body?.[0]?.id,
		`Permitted manual ClientContact creation failed (${manualContact.status})`
	);
	assertDenied(
		await request('/rest/v1/client_contacts', {
			method: 'POST',
			token: sales.token,
			body: {
				client_id: manualClientId,
				first_name: 'x'.repeat(121),
				last_name: 'Contact'
			}
		}),
		'oversized ClientContact first name'
	);
	assertDenied(
		await request('/rest/v1/clients', {
			method: 'POST',
			token: sales.token,
			body: {
				type: 'individual',
				display_name: `${testPrefix} forged conversion`,
				source_lead_id: leadId,
				converted_at: '2099-01-01T00:00:00.000Z'
			}
		}),
		'raw Client conversion-lineage insert'
	);
	assertDenied(
		await request(`/rest/v1/clients?id=eq.${manualClientId}`, {
			method: 'PATCH',
			token: sales.token,
			body: { source_lead_id: leadId, converted_at: '2099-01-01T00:00:00.000Z' }
		}),
		'raw Client conversion-lineage update'
	);

	const manualTask = await request('/rest/v1/tasks', {
		method: 'POST',
		token: sales.token,
		body: { lead_id: leadId, type: 'custom', title: `${testPrefix} manual task` }
	});
	assert(
		manualTask.ok && manualTask.body?.[0]?.id && manualTask.body[0].created_by === sales.id,
		`Permitted manual Task creation did not derive created_by (${manualTask.status})`
	);
	const manualTaskId = manualTask.body[0].id;
	assertDenied(
		await request('/rest/v1/tasks', {
			method: 'POST',
			token: sales.token,
			body: { lead_id: leadId, type: 'custom', title: 'x'.repeat(241) }
		}),
		'oversized Task title'
	);
	assertDenied(
		await request(`/rest/v1/tasks?id=eq.${manualTaskId}`, {
			method: 'PATCH',
			token: sales.token,
			body: { lock_version: 2, reminder_attempt_count: 3 }
		}),
		'raw Task system-field update'
	);
	assertDenied(
		await request('/rest/v1/tasks', {
			method: 'POST',
			token: sales.token,
			body: {
				lead_id: leadId,
				type: 'custom',
				title: `${testPrefix} forged automation`,
				created_by: owner.id,
				automation_key: `${testPrefix}-forged-automation`,
				reminder_status: 'sent',
				reminder_attempt_count: 8
			}
		}),
		'raw Task system-field insert'
	);
	assertDenied(
		await request('/rest/v1/outbound_messages', {
			method: 'POST',
			token: sales.token,
			body: {
				channel: 'email',
				purpose: 'forged',
				delivery_status: 'submitted',
				provider_message_id: `${testPrefix}-provider`,
				recipient_snapshot: { email: 'forged@example.test' }
			}
		}),
		'raw OutboundMessage evidence insert'
	);
	const outboundFixtureId = sql(
		`insert into public.outbound_messages (lead_id, channel, purpose, provider, recipient_snapshot, logical_key) values (${sqlLiteral(leadId)}::uuid, 'email', 'security_fixture', 'sendpulse', '{}'::jsonb, ${sqlLiteral(`${testPrefix}-outbound`)} ) returning id;`
	);
	assertDenied(
		await request(`/rest/v1/outbound_messages?id=eq.${outboundFixtureId}`, {
			method: 'PATCH',
			token: sales.token,
			body: { delivery_status: 'submitted', provider_message_id: `${testPrefix}-patched` }
		}),
		'raw OutboundMessage evidence update'
	);
	assertDenied(
		await request('/rest/v1/activities', {
			method: 'POST',
			token: sales.token,
			body: {
				lead_id: leadId,
				actor_id: sales.id,
				event_type: 'lead_won',
				summary: 'forged system event'
			}
		}),
		'raw system Activity insert'
	);
	const noteActivity = await request('/rest/v1/rpc/add_activity_note', {
		method: 'POST',
		token: sales.token,
		body: {
			p_lead_id: leadId,
			p_summary: 'Permitted staff note',
			p_metadata: { source: 'security-test' }
		}
	});
	assert(noteActivity.ok, 'Narrow add_activity_note action did not allow a staff note');

	const anonymousRead = await request(
		`/rest/v1/leads?select=id&external_submission_id=eq.${encodeURIComponent(leadExternalId)}`
	);
	assert(
		!anonymousRead.ok || !anonymousRead.body?.some((row) => row.id === leadId),
		'Anonymous request could read a protected lead'
	);
	assertDenied(
		await request('/rest/v1/leads', { method: 'POST', body: leadPayload }),
		'anonymous lead insert'
	);
	assertDenied(
		await request(`/rest/v1/leads?id=eq.${leadId}`, {
			method: 'PATCH',
			body: { first_name: 'Anonymous', lock_version: 2 }
		}),
		'anonymous lead update'
	);
	assertDenied(
		await request(`/rest/v1/leads?id=eq.${leadId}`, { method: 'DELETE' }),
		'anonymous lead delete'
	);

	const viewerRead = await request(
		`/rest/v1/leads?select=id&external_submission_id=eq.${encodeURIComponent(leadExternalId)}`,
		{ token: viewer.token }
	);
	assert(
		viewerRead.ok && viewerRead.body?.some((row) => row.id === leadId),
		'Viewer cannot read leads'
	);
	assertDenied(
		await request('/rest/v1/leads', {
			method: 'POST',
			token: viewer.token,
			body: { ...leadPayload, external_submission_id: `${testPrefix}-viewer` }
		}),
		'viewer lead insert'
	);
	assertDenied(
		await request(`/rest/v1/leads?id=eq.${leadId}`, {
			method: 'PATCH',
			token: viewer.token,
			body: { first_name: 'Viewer', lock_version: 2 }
		}),
		'viewer lead update'
	);

	const salesUpdate = await request(`/rest/v1/leads?id=eq.${leadId}`, {
		method: 'PATCH',
		token: sales.token,
		body: { first_name: 'Grace', lock_version: initialLockVersion + 1 }
	});
	assertDenied(salesUpdate, 'direct Lead update without a trusted action');
	assertDenied(
		await request(`/rest/v1/leads?id=eq.${leadId}`, {
			method: 'PATCH',
			token: sales.token,
			body: { first_name: 'Stale write', lock_version: initialLockVersion + 1 }
		}),
		'stale lead update'
	);

	const settingKey = `${testPrefix.replaceAll('-', '_')}_setting`;
	const adminSetting = await request('/rest/v1/app_settings', {
		method: 'POST',
		token: admin.token,
		body: {
			setting_key: settingKey,
			setting_value: { enabled: true },
			description: 'P3 test setting'
		}
	});
	assertDenied(adminSetting, 'direct app setting creation without trusted action');
	const adminAal1SettingRpc = await request('/rest/v1/rpc/set_app_setting', {
		method: 'POST',
		token: admin.token,
		body: {
			p_setting_key: settingKey,
			p_setting_value: { enabled: true },
			p_description: 'AAL1 must be denied'
		}
	});
	assertDenied(adminAal1SettingRpc, 'AAL1 admin configuration action');
	const adminSettingRpc = await request('/rest/v1/rpc/set_app_setting', {
		method: 'POST',
		token: adminAal2Token,
		body: {
			p_setting_key: settingKey,
			p_setting_value: { enabled: true },
			p_description: 'P3 test setting'
		}
	});
	assert(
		adminSettingRpc.ok,
		`AAL2 admin could not create an app setting through trusted action (HTTP ${adminSettingRpc.status}: ${JSON.stringify(adminSettingRpc.body)})`
	);
	const salesSetting = await request(`/rest/v1/app_settings?setting_key=eq.${settingKey}`, {
		method: 'PATCH',
		token: sales.token,
		body: { setting_value: { enabled: false } }
	});
	assertDenied(salesSetting, 'sales setting update');
	const adminSettingUpdate = await request(`/rest/v1/app_settings?setting_key=eq.${settingKey}`, {
		method: 'PATCH',
		token: admin.token,
		body: { setting_value: { enabled: false } }
	});
	assertDenied(adminSettingUpdate, 'direct app setting update without trusted action');
	const adminSettingRpcUpdate = await request('/rest/v1/rpc/set_app_setting', {
		method: 'POST',
		token: adminAal2Token,
		body: {
			p_setting_key: settingKey,
			p_setting_value: { enabled: false },
			p_description: 'P3 test setting updated'
		}
	});
	assert(
		adminSettingRpcUpdate.ok,
		'AAL2 admin could not update an app setting through trusted action'
	);

	const adminProfileUpdate = await request(`/rest/v1/profiles?id=eq.${sales.id}`, {
		method: 'PATCH',
		token: admin.token,
		body: { full_name: 'Sales Updated by Admin' }
	});
	assert(adminProfileUpdate.ok, 'Admin cannot update the permitted profile fields');
	assertDenied(
		await request(`/rest/v1/profiles?id=eq.${viewer.id}`, {
			method: 'PATCH',
			token: admin.token,
			body: { role: 'owner' }
		}),
		'admin role escalation'
	);
	const ownerRoleUpdate = await request(`/rest/v1/profiles?id=eq.${viewer.id}`, {
		method: 'PATCH',
		token: owner.token,
		body: { role: 'sales' }
	});
	assertDenied(ownerRoleUpdate, 'direct owner profile role update without trusted action');
	const ownerAal1RoleRpc = await request('/rest/v1/rpc/set_profile_access', {
		method: 'POST',
		token: owner.token,
		body: {
			p_user_id: viewer.id,
			p_role: 'sales',
			p_status: 'active',
			p_reason: 'AAL1 must be denied'
		}
	});
	assertDenied(ownerAal1RoleRpc, 'AAL1 owner profile administration');
	const ownerRoleRpc = await request('/rest/v1/rpc/set_profile_access', {
		method: 'POST',
		token: ownerAal2Token,
		body: {
			p_user_id: viewer.id,
			p_role: 'sales',
			p_status: 'active',
			p_reason: 'v1.3.1 security fixture'
		}
	});
	assert(ownerRoleRpc.ok, 'AAL2 owner could not administer profile roles through trusted action');
	const ownerRoleReset = await request('/rest/v1/rpc/set_profile_access', {
		method: 'POST',
		token: ownerAal2Token,
		body: {
			p_user_id: viewer.id,
			p_role: 'viewer',
			p_status: 'active',
			p_reason: 'restore fixture'
		}
	});
	assert(ownerRoleReset.ok, 'AAL2 owner could not restore profile role');

	assertDenied(
		await request('/rest/v1/leads', {
			method: 'POST',
			token: sales.token,
			body: {
				...leadPayload,
				pipeline_stage: 'BROKEN',
				external_submission_id: `${testPrefix}-invalid-stage`
			}
		}),
		'invalid pipeline stage'
	);
	assertDenied(
		await request('/rest/v1/tasks', {
			method: 'POST',
			token: sales.token,
			body: { title: 'Orphan task', status: 'open', type: 'custom' }
		}),
		'orphan task relationship'
	);

	sql(
		`update public.profiles set status = 'suspended' where id = ${sqlLiteral(suspended.id)}::uuid;`
	);
	const suspendedRead = await request('/rest/v1/leads?select=id', { token: suspended.token });
	assert(
		!suspendedRead.ok || suspendedRead.body?.length === 0,
		'Suspended user retained CRM access'
	);
	assertDenied(
		await request(`/rest/v1/leads?id=eq.${leadId}`, {
			method: 'PATCH',
			token: suspended.token,
			body: { first_name: 'Suspended', lock_version: 3 }
		}),
		'suspended lead update'
	);

	const protectedTables = sql(`
		select count(*)
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public'
		  and c.relname in ('profiles', 'app_settings', 'lead_sources', 'lost_reasons', 'leads', 'clients', 'client_contacts', 'quotes', 'quote_items', 'tasks', 'activities', 'outbound_messages', 'message_events', 'inbound_submissions')
		  and c.relrowsecurity;
	`);
	assert(Number(protectedTables) === 14, 'Every exposed P3 business table must have RLS enabled');
	const lockColumns = sql(`
		select count(*)
		from information_schema.columns
		where table_schema = 'public' and column_name = 'lock_version' and table_name in ('leads', 'quotes');
	`);
	assert(Number(lockColumns) === 2, 'Leads and quotes must have optimistic lock_version columns');

	console.log(
		'Database security contract passed: anonymous denial, role boundaries, suspension, constraints, RLS, and optimistic locking.'
	);
}

try {
	await main();
} finally {
	try {
		sql(
			`delete from public.outbound_messages where logical_key like ${sqlLiteral(`${testPrefix}%`)}; delete from public.clients where display_name like ${sqlLiteral(`${testPrefix}%`)}; delete from public.leads where external_submission_id like ${sqlLiteral(`${testPrefix}%`)}; delete from public.app_settings where setting_key like ${sqlLiteral(`${testPrefix}%`)};`
		);
	} catch {
		// Preserve the original test failure; the next deterministic reset removes test rows.
	}
	await deleteUsers();
}
