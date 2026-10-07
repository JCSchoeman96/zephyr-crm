# Supabase Keepalive Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily Cloudflare Cron Worker that invokes a no-write Supabase function through the anonymous role.

**Architecture:** Keep the scheduled Worker in its own Wrangler project under `workers/supabase-keepalive/`. Add a stable, invoker-rights `public.keepalive()` SQL function that returns `true`, revoke default execution, and grant execution only to `anon`. The Worker sends the existing public publishable key in `apikey`, logs a structured result, and has no public HTTP entry point.

**Tech Stack:** Bun, Wrangler 4, Cloudflare Workers Cron Triggers, Supabase REST RPC, PostgreSQL migrations, Node assert scripts.

---

### Task 1: Write worker and database contract checks

**Files:**
- Create: `scripts/test-supabase-keepalive-worker.mjs`
- Create: `scripts/test-supabase-keepalive-db.mjs`

- [x] **Step 1: Add the Worker behavior check before Worker code**

Create `scripts/test-supabase-keepalive-worker.mjs` with this test:

```js
import assert from 'node:assert/strict';

const workerUrl = new URL('../workers/supabase-keepalive/src/index.ts', import.meta.url);
let module;
try {
	module = await import(workerUrl.href);
} catch (error) {
	if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code)) {
		throw new Error('Keepalive scheduled handler is missing');
	}
	throw error;
}

const scheduled = module.default?.scheduled;
assert.equal(typeof scheduled, 'function', 'Worker must export a scheduled handler');

const env = {
	SUPABASE_URL: 'https://project.example.supabase.co',
	SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
};
const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalError = console.error;
const calls = [];

console.log = () => {};
console.error = () => {};
try {
	globalThis.fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		return new Response('true', {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};
	await scheduled({ cron: '15 4 * * *', scheduledTime: 0 }, env, {});
	assert.equal(calls.length, 1, 'Worker must make one database request');
	assert.equal(calls[0].url, `${env.SUPABASE_URL}/rest/v1/rpc/keepalive`);
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.body, '{}');
	assert.ok(calls[0].init.signal, 'database request must have a timeout');
	const headers = new Headers(calls[0].init.headers);
	assert.equal(headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY);
	assert.equal(headers.get('authorization'), null, 'Worker must not send a service credential');

	globalThis.fetch = async () => new Response('false', { status: 200 });
	await assert.rejects(
		() => scheduled({ cron: '15 4 * * *', scheduledTime: 0 }, env, {}),
		/unexpected response/
	);

	globalThis.fetch = async () => new Response('unavailable', { status: 503 });
	await assert.rejects(
		() => scheduled({ cron: '15 4 * * *', scheduledTime: 0 }, env, {}),
		/HTTP 503/
	);
} finally {
	globalThis.fetch = originalFetch;
	console.log = originalLog;
	console.error = originalError;
}

console.log('Supabase keepalive Worker checks passed');
```

- [x] **Step 2: Run the Worker check to verify the expected failure**

Run: `bun scripts/test-supabase-keepalive-worker.mjs`

Expected: non-zero exit with `Keepalive scheduled handler is missing`.

- [x] **Step 3: Add a local database and API contract check**

Create `scripts/test-supabase-keepalive-db.mjs` with these local-only assertions:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function run(command, args) {
	return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
const publishableKey = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
assert.ok(publishableKey, 'local Supabase publishable or anon key is required');

const databaseContract = run('psql', [
	local.DB_URL,
	'-X',
	'-v',
	'ON_ERROR_STOP=1',
	'-At',
	'-c',
	`select coalesce((
		select case when p.prorettype = 'boolean'::regtype
			and p.provolatile = 's'
			and not p.prosecdef
			and p.proconfig @> array['search_path=pg_catalog']::text[]
			and has_function_privilege('anon', p.oid, 'EXECUTE')
			and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
			and not has_function_privilege('service_role', p.oid, 'EXECUTE')
			and not has_table_privilege('anon', 'public.clients', 'SELECT')
		then 'ok' else 'bad' end
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'keepalive' and p.pronargs = 0
	), 'missing');`
]);
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
```

- [x] **Step 4: Start and reset only the local Supabase stack, then verify the database check fails before the migration exists**

Run:

```sh
bun run db:start
bun run db:reset
bun scripts/test-supabase-keepalive-db.mjs
```

Expected: the database check exits non-zero with `keepalive function is not installed`. Do not use `supabase db push` or any remote project command.

### Task 2: Add the no-write database function and scheduled Worker

**Files:**
- Create: `supabase/migrations/20261007100000_supabase_keepalive.sql`
- Create: `workers/supabase-keepalive/src/index.ts`
- Modify: `src/lib/types/database.ts` (generated public function type)

- [x] **Step 1: Add the forward-only migration**

Use this SQL:

```sql
begin;

create function public.keepalive()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
	select true;
$function$;

revoke all on function public.keepalive() from public, anon, authenticated, service_role;
grant execute on function public.keepalive() to anon;

commit;
```

- [x] **Step 2: Add the Worker handler**

Generate the Worker environment declarations from the dedicated Wrangler config in Task 3. Implement this handler using the generated `KeepaliveWorkerEnv` and repository Workers runtime declarations:

```ts
export default {
	async scheduled(controller: ScheduledController, env: KeepaliveWorkerEnv): Promise<void> {
		const event = {
			cron: controller.cron,
			scheduledTime: new Date(controller.scheduledTime).toISOString()
		};

		try {
			const baseUrl = new URL(env.SUPABASE_URL);
			if (baseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
				throw new Error('Supabase URL must use HTTPS');
			}

			const response = await fetch(new URL('/rest/v1/rpc/keepalive', baseUrl), {
				method: 'POST',
				headers: {
					apikey: env.SUPABASE_PUBLISHABLE_KEY,
					'content-type': 'application/json'
				},
				body: '{}',
				signal: AbortSignal.timeout(10_000)
			});
			if (!response.ok) throw new Error(`Supabase keepalive returned HTTP ${response.status}`);
			if ((await response.json()) !== true) {
				throw new Error('Supabase keepalive returned an unexpected response');
			}

			console.log(JSON.stringify({ event: 'supabase_keepalive_succeeded', ...event }));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error(JSON.stringify({ event: 'supabase_keepalive_failed', error: message, ...event }));
			throw error;
		}
	}
} satisfies ExportedHandler<KeepaliveWorkerEnv>;
```

- [x] **Step 3: Run the Worker behavior check**

Run: `bun scripts/test-supabase-keepalive-worker.mjs`

Expected: `Supabase keepalive Worker checks passed`.

- [x] **Step 4: Reset local Supabase and run the database contract check**

Run:

```sh
bun run db:reset
bun scripts/test-supabase-keepalive-db.mjs
```

Expected: `Supabase keepalive database contract passed`.

### Task 3: Add isolated Cloudflare configuration, scripts, and operator notes

**Files:**
- Create: `workers/supabase-keepalive/wrangler.jsonc`
- Create: `workers/supabase-keepalive/worker-configuration.d.ts` (generated)
- Create: `tsconfig.keepalive.json`
- Modify: `package.json`
- Modify: `docs/OPERATIONS.md`

- [x] **Step 1: Add the dedicated Wrangler config**

Create `workers/supabase-keepalive/wrangler.jsonc` with schema path `../../node_modules/wrangler/config-schema.json`, Worker name `zephyr-supabase-keepalive`, main path `src/index.ts`, compatibility date `2026-10-07`, and Cron expression `15 4 * * *`. Copy `SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` values from the root `wrangler.jsonc` into non-secret Worker vars named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Enable Workers logs and traces with full head sampling because this job runs once daily.

- [x] **Step 2: Generate dedicated Worker types and add package scripts**

Run: `bun run wrangler types workers/supabase-keepalive/worker-configuration.d.ts --config workers/supabase-keepalive/wrangler.jsonc --env-interface KeepaliveWorkerEnv --include-runtime=false`

Add these scripts to `package.json` and preserve the frozen exact dependency versions and `bun.lock`:

```json
{
	"test:keepalive:worker": "bun scripts/test-supabase-keepalive-worker.mjs",
	"test:keepalive:db": "bun scripts/test-supabase-keepalive-db.mjs",
	"keepalive:types": "wrangler types workers/supabase-keepalive/worker-configuration.d.ts --config workers/supabase-keepalive/wrangler.jsonc --env-interface KeepaliveWorkerEnv --include-runtime=false",
	"keepalive:types:check": "bun run keepalive:types && wrangler types workers/supabase-keepalive/worker-configuration.d.ts --config workers/supabase-keepalive/wrangler.jsonc --env-interface KeepaliveWorkerEnv --include-runtime=false --check",
	"keepalive:check": "bun run gen && bun run keepalive:types && tsc --noEmit --project tsconfig.keepalive.json",
	"keepalive:dry-run": "wrangler deploy --dry-run --config workers/supabase-keepalive/wrangler.jsonc"
}
```

Add `bun run keepalive:check` to the project `check` command so the separate Worker source is checked with the generated runtime and environment types.

- [x] **Step 3: Document operation and the Free Plan limit**

Add a `Supabase keepalive` subsection to `docs/OPERATIONS.md`. State the 04:15 UTC schedule, explain that hosted migration application must precede deployment, document `bun run keepalive:dry-run` and `bun run wrangler deploy --config workers/supabase-keepalive/wrangler.jsonc`, and state that this is best-effort for Free Plan activity. Do not deploy or apply the hosted migration.

- [x] **Step 4: Run focused validation and inspect the final diff**

Run:

```sh
bun run test:keepalive:worker
bun run test:keepalive:db
bun run db:test
bun run db:types:check
bun run keepalive:types
bun run keepalive:types:check
bun run keepalive:check
bun run keepalive:dry-run
bun run check
bun run lint
bun run format:check
bun run diff:check
```

Expected: every command exits zero; the dry run packages `zephyr-supabase-keepalive` without deploying it; `bun.lock` remains unchanged. Run `bun run db:stop` after local database validation. Inspect `git diff --check`, `git diff --stat`, and the final diff. Commit only explicit files owned by this feature after checking the staged diff.

## Self-review

- The Worker schedule, least-privilege RPC, no-service-role boundary, structured logs, HTTPS requirement, failure handling, local validation, and no-deployment limit map to Tasks 1–3.
- The migration and Worker source are created only after their focused check exists and has failed for the missing feature.
- Type names consistently use `KeepaliveWorkerEnv`; the same name is generated by Wrangler and referenced in the handler.
- No package dependency, remote database mutation, or deployment is part of the plan.
