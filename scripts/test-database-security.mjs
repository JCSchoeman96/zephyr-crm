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

if (!apiUrl || !anonKey || !serviceRoleKey || !databaseUrl) {
	throw new Error(
		'Local Supabase status is missing required test endpoints. Start Supabase first.'
	);
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
	const session = await request('/auth/v1/token?grant_type=password', {
		method: 'POST',
		body: { email, password }
	});
	assert(session.ok && session.body?.access_token, `Could not sign in local ${label} test user`);
	return { id, token: session.body.access_token };
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
	assert(createdLead.ok && createdLead.body?.[0]?.id, 'Sales could not create a lead');
	const leadId = createdLead.body[0].id;
	const initialLockVersion = createdLead.body[0].lock_version;
	assert(initialLockVersion === 1, 'New leads must start at lock_version 1');

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
	assert(salesUpdate.ok, 'Sales could not update an allowed lead field');
	assertDenied(
		await request(`/rest/v1/leads?id=eq.${leadId}`, {
			method: 'PATCH',
			token: sales.token,
			body: { first_name: 'Stale write', lock_version: initialLockVersion + 1 }
		}),
		'stale lead update'
	);

	const settingKey = `${testPrefix}_setting`;
	const adminSetting = await request('/rest/v1/app_settings', {
		method: 'POST',
		token: admin.token,
		body: {
			setting_key: settingKey,
			setting_value: { enabled: true },
			description: 'P3 test setting'
		}
	});
	assert(adminSetting.ok, 'Admin cannot create an app setting');
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
	assert(adminSettingUpdate.ok, 'Admin cannot update an app setting');

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
	assert(ownerRoleUpdate.ok, 'Owner cannot administer profile roles');
	await request(`/rest/v1/profiles?id=eq.${viewer.id}`, {
		method: 'PATCH',
		token: owner.token,
		body: { role: 'viewer' }
	});

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
			`delete from public.leads where external_submission_id like ${sqlLiteral(`${testPrefix}%`)}; delete from public.app_settings where setting_key like ${sqlLiteral(`${testPrefix}%`)};`
		);
	} catch {
		// Preserve the original test failure; the next deterministic reset removes test rows.
	}
	await deleteUsers();
}
