import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...options
	}).trim();
}

function localValues() {
	return Object.fromEntries(
		run('bunx', ['supabase', 'status', '-o', 'env'])
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const separator = line.indexOf('=');
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"(.*)"$/, '$1')];
			})
	);
}

const local = localValues();
const apiUrl = new URL(local.API_URL);
const dbUrl = new URL(local.DB_URL);
assert.ok(['localhost', '127.0.0.1'].includes(apiUrl.hostname), 'Supabase API must be local');
assert.ok(['localhost', '127.0.0.1'].includes(dbUrl.hostname), 'Postgres must be local');
const databasePassword = decodeURIComponent(dbUrl.password);
dbUrl.password = '';
const publishableKey = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
assert.ok(publishableKey, 'local Supabase publishable or anon key is required');

const databaseContract = run(
	'psql',
	[
		dbUrl.toString(),
		'-X',
		'-v',
		'ON_ERROR_STOP=1',
		'-At',
		'-c',
		`select coalesce((
		select case when p.prorettype = 'boolean'::regtype
			and l.lanname = 'sql'
			and p.provolatile = 's'
			and not p.prosecdef
			and p.proconfig @> array['search_path=pg_catalog']::text[]
			and lower(regexp_replace(p.prosrc, '[[:space:]]+', '', 'g')) = 'selecttrue;'
			and has_function_privilege('anon', p.oid, 'EXECUTE')
			and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
			and not has_function_privilege('service_role', p.oid, 'EXECUTE')
			and not has_table_privilege('anon', 'public.clients', 'SELECT')
		then 'ok' else 'bad' end
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		join pg_language l on l.oid = p.prolang
		where n.nspname = 'public' and p.proname = 'keepalive' and p.pronargs = 0
		), 'missing');`
	],
	{ env: { ...process.env, PGPASSWORD: databasePassword } }
);
if (databaseContract === 'missing') throw new Error('keepalive function is not installed');
assert.equal(databaseContract, 'ok', `keepalive database contract failed: ${databaseContract}`);

const response = await fetch(new URL('/rest/v1/rpc/keepalive', apiUrl), {
	method: 'POST',
	headers: { apikey: publishableKey, 'content-type': 'application/json' },
	body: '{}'
});
assert.equal(response.status, 200, `keepalive RPC returned HTTP ${response.status}`);
assert.equal(await response.json(), true, 'keepalive RPC must return JSON true');

console.log('Supabase keepalive database contract passed');
