import { execFileSync, spawn } from 'node:child_process';

const root = process.cwd();
const runId = `${Date.now()}`;
const email = `p3-auth-${runId}@example.test`;
const password = `P3-${runId}-AuthPassword9!`;
let userId;
let server;

function run(command, args) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
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

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

async function waitForServer(url) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The Vite server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error('Timed out waiting for the local Auth session test server.');
}

const local = statusEnv();
const apiUrl = local.API_URL;
const anonKey = local.ANON_KEY ?? local.PUBLISHABLE_KEY;
const serviceRoleKey = local.SERVICE_ROLE_KEY;
const databaseUrl = local.DB_URL;
const appUrl = 'http://127.0.0.1:4174';

async function main() {
	const created = await fetch(`${apiUrl}/auth/v1/admin/users`, {
		method: 'POST',
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: 'P3 Auth Test' }
		})
	});
	const createdBody = await created.json();
	if (!created.ok || !createdBody.id)
		throw new Error('Could not create the local Auth session test user.');
	userId = createdBody.id;

	run('psql', [
		databaseUrl,
		'-X',
		'-v',
		'ON_ERROR_STOP=1',
		'-At',
		'-c',
		`update public.profiles set role = 'sales', status = 'active' where id = ${sqlLiteral(userId)}::uuid;`
	]);

	server = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4174'], {
		cwd: root,
		stdio: 'ignore',
		env: {
			...process.env,
			NO_COLOR: '1',
			PUBLIC_SUPABASE_URL: apiUrl,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
			PUBLIC_SITE_URL: appUrl
		}
	});
	await waitForServer(`${appUrl}/login`);

	const response = await fetch(`${appUrl}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email, password })
	});
	if (response.status !== 303 || response.headers.get('location') !== '/') {
		const responseBody = await response.text();
		throw new Error(
			`Server Auth form did not redirect an active invited user (HTTP ${response.status}, content-type ${response.headers.get('content-type') ?? 'unknown'}): ${responseBody.slice(0, 300)}`
		);
	}
	if (response.headers.getSetCookie().length === 0) {
		throw new Error('Server Auth form did not return a session cookie.');
	}

	console.log(
		'Auth session contract passed: active invited user signs in through the server action and receives a session cookie.'
	);
}

try {
	await main();
} finally {
	if (server) server.kill('SIGTERM');
	if (userId) {
		await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
			method: 'DELETE',
			headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
		});
	}
}
