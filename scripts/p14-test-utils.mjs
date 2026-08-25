import { execFileSync } from 'node:child_process';

const root = process.cwd();

function run(command, args) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 16 * 1024 * 1024
	}).trim();
}

function statusEnv() {
	const output = run('bunx', ['supabase', 'status', '-o', 'env']);
	return Object.fromEntries(
		output
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
}

const local = statusEnv();
export const apiUrl = local.API_URL;
export const anonKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
export const serviceRoleKey = local.SERVICE_ROLE_KEY;
export const databaseUrl = local.DB_URL;
export const runId = `${Date.now()}-${process.pid}`;
export const prefix = `p14-${runId}`;

export function assert(condition, message) {
	if (!condition) throw new Error(message);
}

export function sql(query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

export function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

async function parseBody(response) {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export async function request(path, init = {}, key = anonKey, token = null) {
	const response = await fetch(`${apiUrl}${path}`, {
		...init,
		headers: {
			apikey: key,
			Authorization: `Bearer ${token ?? key}`,
			...(init.headers ?? {})
		}
	});
	return { response, body: await parseBody(response) };
}

export async function rpc(name, args, key = anonKey, token = null) {
	return request(
		`/rest/v1/rpc/${name}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(args)
		},
		key,
		token
	);
}

export async function mustRpc(name, args, key = anonKey, token = null) {
	const result = await rpc(name, args, key, token);
	assert(
		result.response.ok,
		`RPC ${name} failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

export async function createUser(role, label) {
	const email = `${prefix}-${label}@example.test`;
	const password = `P14-${runId}-${label}-Password9!`;
	const created = await request(
		'/auth/v1/admin/users',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: { full_name: `P14 ${label}` }
			})
		},
		serviceRoleKey
	);
	assert(created.response.ok && created.body?.id, `Could not create P14 ${label} user`);
	await mustRpc(
		'provision_invited_profile',
		{ p_user_id: created.body.id, p_role: role, p_status: 'active' },
		serviceRoleKey
	);
	return { id: created.body.id, email, password, role, token: null };
}

export async function signIn(user) {
	if (user.token) return user.token;
	const result = await request(
		'/auth/v1/token?grant_type=password',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: user.email, password: user.password })
		},
		anonKey
	);
	assert(result.response.ok && result.body?.access_token, `Could not sign in ${user.email}`);
	user.token = result.body.access_token;
	return user.token;
}

export async function authenticated(path, init = {}, user) {
	return request(path, init, anonKey, await signIn(user));
}

export async function serviceRows(path, user = null) {
	const token = user ? await signIn(user) : serviceRoleKey;
	const key = user ? anonKey : serviceRoleKey;
	const result = await request(path, {}, key, token);
	assert(
		result.response.ok,
		`Protected read failed (${result.response.status}): ${JSON.stringify(result.body)}`
	);
	return result.body;
}

export function assertDenied(result, label) {
	const changedRows = Array.isArray(result.body) ? result.body.length : result.response.ok ? 1 : 0;
	assert(changedRows === 0, `${label} unexpectedly succeeded (${result.response.status})`);
}

export async function deleteUser(user) {
	await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }, serviceRoleKey);
}

export async function cleanup(users = []) {
	// Activity is intentionally append-only. Test identities are unique, so the
	// safe cleanup boundary is deleting only the disposable Auth users; the
	// scoped synthetic business rows remain harmless until the next local reset.
	for (const user of users) await deleteUser(user);
}
