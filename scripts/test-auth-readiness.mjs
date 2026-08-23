import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const runId = `${Date.now()}`;
const email = `rh06-auth-${runId}@example.test`;
const password = `RH06-${runId}-OwnerPassword9!`;
let userId;

function run(command, args) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
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

function sql(databaseUrl, query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function base32Decode(secret) {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	const normalized = secret.toUpperCase().replaceAll('=', '').replaceAll(' ', '');
	let buffer = 0;
	let bits = 0;
	const bytes = [];
	for (const character of normalized) {
		const value = alphabet.indexOf(character);
		if (value < 0) throw new Error('TOTP secret contains an unsupported character');
		buffer = (buffer << 5) | value;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((buffer >>> bits) & 0xff);
		}
	}
	return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
	const counter = Math.floor(timestamp / 1000 / 30);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeBigUInt64BE(BigInt(counter));
	const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	const code =
		((digest[offset] & 0x7f) << 24) |
		((digest[offset + 1] & 0xff) << 16) |
		((digest[offset + 2] & 0xff) << 8) |
		(digest[offset + 3] & 0xff);
	return String(code % 1_000_000).padStart(6, '0');
}

async function adminRequest(local, path, init = {}) {
	const response = await fetch(`${local.API_URL}/auth/v1/admin${path}`, {
		...init,
		headers: {
			apikey: local.SERVICE_ROLE_KEY,
			Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
			'content-type': 'application/json',
			...(init.headers ?? {})
		}
	});
	const body = await response.json().catch(() => ({}));
	return { response, body };
}

async function main() {
	const config = await readFile('supabase/config.toml', 'utf8');
	const operations = await readFile('docs/OPERATIONS.md', 'utf8');
	const pilot = await readFile('docs/PILOT_READINESS.md', 'utf8');

	assert(
		config.includes('enable_signup = false'),
		'project-level public signup must remain disabled'
	);
	assert(
		config.includes('minimum_password_length = 12'),
		'Auth password minimum must be at least 12'
	);
	assert(
		config.includes('password_requirements = "lower_upper_letters_digits_symbols"'),
		'Auth password requirements must use the strongest supported local policy'
	);
	assert(
		config.includes('secure_password_change = true'),
		'secure password changes must be enabled'
	);
	assert(config.includes('enroll_enabled = true'), 'TOTP enrollment must be enabled');
	assert(config.includes('verify_enabled = true'), 'TOTP verification must be enabled');
	for (const required of [
		'mfa_reenrollment_required',
		'password_reset_or_reinvite_required',
		'Owner/Admin',
		'AAL2'
	]) {
		assert(
			operations.includes(required) || pilot.includes(required),
			`pilot Auth documentation is missing ${required}`
		);
	}

	const local = statusEnv();
	assert(
		local.API_URL && local.ANON_KEY && local.SERVICE_ROLE_KEY && local.DB_URL,
		'local Supabase status is incomplete'
	);

	const created = await adminRequest(local, '/users', {
		method: 'POST',
		body: JSON.stringify({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: 'RH06 Auth readiness' }
		})
	});
	assert(
		created.response.ok && created.body.id,
		'could not create the disposable Auth readiness user'
	);
	userId = created.body.id;
	sql(
		local.DB_URL,
		`update public.profiles set role = 'owner', status = 'active' where id = ${sqlLiteral(userId)}::uuid;`
	);

	const client = createClient(local.API_URL, local.ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	const signedIn = await client.auth.signInWithPassword({ email, password });
	assert(
		signedIn.data.session && !signedIn.error,
		`AAL1 sign-in failed: ${signedIn.error?.message ?? 'unknown error'}`
	);

	const aal1 = await client.auth.mfa.getAuthenticatorAssuranceLevel();
	assert(aal1.data?.currentLevel === 'aal1', 'fresh Owner session did not start at AAL1');
	const denied = await client.rpc('set_app_setting', {
		p_setting_key: 'rh06_auth_readiness',
		p_setting_value: { aal: 'aal1' },
		p_description: 'RH06 AAL1 denial probe'
	});
	assert(denied.error, 'AAL1 Owner session executed an AAL2-protected action');

	const enrolled = await client.auth.mfa.enroll({
		factorType: 'totp',
		friendlyName: 'RH06 local test'
	});
	assert(
		enrolled.data?.id && enrolled.data.totp?.secret,
		`TOTP enrollment failed: ${enrolled.error?.message ?? 'unknown error'}`
	);
	const verified = await client.auth.mfa.challengeAndVerify({
		factorId: enrolled.data.id,
		code: totp(enrolled.data.totp.secret)
	});
	assert(
		verified.data?.access_token && !verified.error,
		`TOTP verification failed: ${verified.error?.message ?? 'unknown error'}`
	);

	const aal2 = await client.auth.mfa.getAuthenticatorAssuranceLevel();
	assert(aal2.data?.currentLevel === 'aal2', 'verified TOTP session did not reach AAL2');
	const allowed = await client.rpc('set_app_setting', {
		p_setting_key: 'rh06_auth_readiness',
		p_setting_value: { aal: 'aal2' },
		p_description: 'RH06 AAL2 success probe'
	});
	assert(
		!allowed.error,
		`AAL2 Owner session could not execute the protected action: ${allowed.error?.message ?? 'unknown error'}`
	);

	const signedOut = await client.auth.signOut();
	assert(!signedOut.error, `Auth logout failed: ${signedOut.error?.message ?? 'unknown error'}`);
	const afterLogout = await client.auth.getSession();
	assert(!afterLogout.data.session, 'logout left an active local Auth session');

	console.log(
		'RH06 Auth readiness passed: invitation-only AAL1 denial, TOTP enrollment/verification to AAL2, protected action success, and logout.'
	);
}

try {
	await main();
} finally {
	if (userId) {
		const local = statusEnv();
		sql(local.DB_URL, `delete from public.app_settings where setting_key = 'rh06_auth_readiness';`);
		await adminRequest(local, `/${userId}`, { method: 'DELETE' });
	}
}
