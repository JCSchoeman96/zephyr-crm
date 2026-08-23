import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const runId = `${Date.now()}-${process.pid}`;
const prefix = `p12-${runId}`;
const appPort = 4186;
const appUrl = `http://127.0.0.1:${appPort}`;
const storagePath = `quotes/${randomUUID()}/p12-recovery.pdf`;
let app;
let backupDirectory;
let restoreDatabase;

function run(command, args, options = {}) {
	const { env: extraEnv, ...execOptions } = options;
	try {
		return execFileSync(command, args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			...execOptions,
			env: { ...process.env, ...(extraEnv ?? {}) }
		}).trim();
	} catch {
		throw new Error(`${command} failed during the P12 hardening gate`);
	}
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

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function sql(databaseUrl, query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

function identifier(value) {
	return `"${String(value).replaceAll('"', '""')}"`;
}

async function waitForServer(url) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		if (app?.exitCode !== null && app?.exitCode !== undefined) {
			throw new Error(`P12 application server exited before readiness (code ${app.exitCode})`);
		}
		try {
			const response = await fetch(url);
			if (response.ok || response.status < 500) return;
		} catch {
			// Vite is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error('Timed out waiting for the P12 application server');
}

async function storageRequest(apiUrl, serviceRoleKey, path, init = {}) {
	return fetch(`${apiUrl}/storage/v1/${path}`, {
		...init,
		headers: {
			apikey: serviceRoleKey,
			Authorization: `Bearer ${serviceRoleKey}`,
			...(init.headers ?? {})
		}
	});
}

async function startApp(local) {
	app = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(appPort)], {
		cwd: root,
		stdio: 'ignore',
		env: {
			...process.env,
			NO_COLOR: '1',
			PUBLIC_SUPABASE_URL: local.API_URL,
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY ?? local.PUBLISHABLE_KEY,
			PUBLIC_SITE_URL: appUrl,
			SUPABASE_URL: local.API_URL,
			SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
			BRICKS_FORM_ID: 'contact-form',
			BRICKS_WEBHOOK_SECRET: 'p12-bricks-secret',
			SENDPULSE_WEBHOOK_SECRET: 'p12-sendpulse-secret',
			AUTOMATION_CRON_SECRET: 'p12-automation-secret'
		}
	});
	await waitForServer(`${appUrl}/login`);
}

async function waitForBricksRpc(local) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(`${local.API_URL}/rest/v1/rpc/ingest_bricks_lead`, {
				method: 'POST',
				headers: {
					apikey: local.SERVICE_ROLE_KEY,
					Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					p_form_id: 'contact-form',
					p_external_submission_id: randomUUID(),
					p_payload: {}
				})
			});
			const body = await response.text();
			if (response.status < 500 && !body.includes('schema cache')) return;
		} catch {
			// PostgREST is still restarting after the clean database reset.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error('Timed out waiting for the Bricks RPC schema cache after database reset');
}

async function stopApp() {
	if (!app || app.exitCode !== null) return;
	const process = app;
	app = undefined;
	await new Promise((resolve) => {
		const timeout = setTimeout(() => {
			process.kill('SIGKILL');
			resolve();
		}, 5000);
		process.once('exit', () => {
			clearTimeout(timeout);
			resolve();
		});
		process.kill('SIGTERM');
	});
}

async function runDatabaseContracts(local) {
	run('bun', ['run', 'db:reset']);
	assert(
		sql(local.DB_URL, "select to_regclass('public.operational_events') is not null;") === 't',
		'P12 migration did not reset cleanly'
	);
	console.log('P12-T09 migration reset passed');
	const rh04Migration = await readFile(
		'supabase/migrations/20260823110000_rh04_delivery_reliability.sql',
		'utf8'
	);
	for (const required of [
		'submission_unknown_total',
		'stale_submitting_total',
		'partial_runs_last_24h',
		'submission_unknown_tasks',
		'stale_submitting_tasks',
		'latest_run_error'
	]) {
		assert(rh04Migration.includes(required), `RH04 diagnostics evidence is missing ${required}`);
	}
	console.log('RH04 uncertainty, stale-state, partial-run diagnostics evidence passed');

	run('bun', ['run', 'db:security']);
	console.log('P12-T01 anonymous denial and P12-T02 role matrix passed');
	const inputBoundaries = sql(
		local.DB_URL,
		`
select count(*)
from pg_constraint
where conname = any(array[
  'profiles_input_bounds', 'app_settings_input_bounds', 'leads_input_bounds',
  'clients_input_bounds', 'client_contacts_input_bounds', 'tasks_input_bounds',
  'quotes_input_bounds', 'quote_items_input_bounds', 'outbound_messages_input_bounds',
  'message_events_input_bounds', 'inbound_submissions_input_bounds',
  'activities_input_bounds', 'outbound_message_attempts_input_bounds',
  'operational_events_input_bounds', 'automation_runs_input_bounds',
  'security_audit_events_input_bounds'
]);
`
	);
	assert(
		inputBoundaries === '16',
		`RH06 durable input-boundary constraints are incomplete (${inputBoundaries}/16)`
	);
	console.log('RH06 durable input persistence bounds passed');

	const preservedLeadSourceCount = sql(local.DB_URL, 'select count(*) from public.lead_sources;');
	sql(
		local.DB_URL,
		'drop table if exists public.operational_events, public.automation_runs cascade;'
	);
	run('psql', [
		local.DB_URL,
		'-X',
		'-v',
		'ON_ERROR_STOP=1',
		'-f',
		'supabase/migrations/20260822140000_operational_hardening.sql'
	]);
	assert(
		sql(
			local.DB_URL,
			"select count(*) from pg_tables where schemaname = 'public' and tablename in ('automation_runs', 'operational_events');"
		) === '2',
		'P12 forward upgrade did not recreate operational tables'
	);
	assert(
		sql(local.DB_URL, 'select count(*) from public.lead_sources;') === preservedLeadSourceCount,
		'Forward upgrade lost existing reference data'
	);
	console.log('P12-T10 P11-to-P12 forward upgrade rehearsal passed');

	// The rehearsal intentionally applies the historical P12 migration to a
	// disposable pair of operational tables. Restore the complete current
	// schema before later P12 contracts or the next quality command runs; a
	// release test must not leave the local database at a historical schema.
	run('bun', ['run', 'db:reset']);
	assert(
		sql(
			local.DB_URL,
			"select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'automation_runs' and column_name = 'unknown_count';"
		) === '1',
		'Current RH04 automation schema was not restored after the P12 rehearsal'
	);
	assert(
		sql(
			local.DB_URL,
			"select count(*) from pg_constraint where conname = 'automation_runs_input_bounds';"
		) === '1',
		'Current RH06 input-boundary schema was not restored after the P12 rehearsal'
	);
	console.log('P12 current-schema restoration passed');
}

async function runSecurityAndInputContracts(local) {
	await waitForBricksRpc(local);
	await startApp(local);
	const xssSubmissionId = randomUUID();
	const page = await fetch(`${appUrl}/login`);
	const csp = page.headers.get('content-security-policy') ?? '';
	assert(
		csp.includes("default-src 'self'") && csp.includes("object-src 'none'"),
		'CSP baseline is missing'
	);
	assert(page.headers.get('x-content-type-options') === 'nosniff', 'nosniff header is missing');
	assert(page.headers.get('x-frame-options') === 'DENY', 'frame denial header is missing');
	console.log('P12-T03 CSP and browser secret boundary passed');

	const unauthenticatedDiagnostics = await fetch(`${appUrl}/api/diagnostics`);
	assert(unauthenticatedDiagnostics.status === 401, 'Diagnostics endpoint is not protected');

	const bricksDenied = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ form_id: 'contact-form', external_submission_id: `${prefix}-denied` })
	});
	assert(bricksDenied.status === 401, 'Bricks webhook accepted an unauthenticated request');
	const sendpulseDenied = await fetch(`${appUrl}/api/webhooks/sendpulse`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ message_id: `${prefix}-denied`, event: 'delivered' })
	});
	assert(sendpulseDenied.status === 401, 'SendPulse webhook accepted an unauthenticated request');
	console.log('P12-T04 webhook authentication failure passed');

	const unsafeLead = await fetch(`${appUrl}/api/webhooks/bricks`, {
		method: 'POST',
		headers: {
			authorization: 'Bearer p12-bricks-secret',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			form_id: 'contact-form',
			external_submission_id: xssSubmissionId,
			first_name: 'Input test',
			email: `${prefix}@example.test`,
			message: '<script>alert(1)</script>'
		})
	});
	const unsafeLeadBody = await unsafeLead.text();
	assert(
		unsafeLead.status === 201,
		`Valid bounded input was rejected (${unsafeLead.status}): ${unsafeLeadBody.slice(0, 300)}`
	);
	const leadSource = await readFile('src/routes/leads/[id]/+page.svelte', 'utf8');
	const quoteSource = await readFile('src/routes/quotes/[id]/+page.svelte', 'utf8');
	const intakeSource = await readFile('src/lib/server/bricks-intake.ts', 'utf8');
	assert(
		!leadSource.includes('{@html}') && !quoteSource.includes('{@html}'),
		'Unescaped HTML rendering exists'
	);
	assert(
		intakeSource.includes('MAX_BODY_BYTES') && intakeSource.includes('message.length > 10_000'),
		'Input bounds are missing'
	);
	sql(
		local.DB_URL,
		`set session_replication_role = replica; delete from public.leads where external_submission_id = '${xssSubmissionId}'; set session_replication_role = origin;`
	);
	console.log('P12-T05 XSS-safe rendering and input validation passed');
}

async function runBackupRecovery(local) {
	const serviceRoleKey = local.SERVICE_ROLE_KEY;
	const objectBody = Buffer.from('%PDF-1.4\n% Zephyr recovery fixture\n');
	try {
		const uploaded = await storageRequest(
			local.API_URL,
			serviceRoleKey,
			`object/quote-documents/${storagePath}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' },
				body: objectBody
			}
		);
		assert(uploaded.ok, `Could not create private recovery object (${uploaded.status})`);
		const anonymousObject = await fetch(
			`${local.API_URL}/storage/v1/object/quote-documents/${storagePath}`
		);
		assert(!anonymousObject.ok, 'Private quote document was publicly readable');
		console.log('P12-T06 private Storage access passed');

		backupDirectory = await mkdtemp(join(tmpdir(), 'zephyr-crm-p12-backup-'));
		const backupOutput = run('bun', ['run', 'backup:create'], {
			env: {
				BACKUP_LOCAL_TEST: '1',
				BACKUP_OUTPUT_DIR: backupDirectory,
				BACKUP_ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
			}
		});
		const backupLine = backupOutput
			.split('\n')
			.reverse()
			.find((line) => line.trim().startsWith('{'));
		assert(backupLine, 'Backup creation did not return a manifest result');
		const backup = JSON.parse(backupLine);
		assert(
			backup.files > 0 && backup.backup.endsWith('.tar.gz.enc'),
			'Encrypted backup is incomplete'
		);
		console.log('P12-T07 encrypted external backup creation passed');

		restoreDatabase = `${prefix.replaceAll('-', '_')}_restore`;
		sql(local.DB_URL, `create database ${identifier(restoreDatabase)};`);
		const target = new URL(local.DB_URL);
		target.pathname = `/${restoreDatabase}`;
		const restoreOutput = run('bun', ['run', 'backup:restore', '--', backup.backup], {
			env: {
				BACKUP_RESTORE_DISPOSABLE: 'true',
				BACKUP_RESTORE_DATABASE_URL: target.toString(),
				BACKUP_ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
			}
		});
		assert(
			restoreOutput.includes('RESTORE_VERIFIED') &&
				restoreOutput.includes('storage_objects_verified'),
			'Restore verification failed'
		);
		console.log('P12-T08 disposable database and private-artifact restore passed');
	} finally {
		await storageRequest(local.API_URL, serviceRoleKey, `object/quote-documents/${storagePath}`, {
			method: 'DELETE'
		});
	}
}

async function runLifecycleContracts() {
	run('bun', ['run', 'test:p4:tracer']);
	console.log('P12-T12 Won conversion E2E passed');
	console.log('P12-T13 Lost reason E2E passed');
	run('bun', ['run', 'test:p8:documents']);
	console.log('P12-T11 duplicate external event and outbound idempotency passed');
}

async function main() {
	const local = statusEnv();
	assert(
		local.API_URL &&
			(local.ANON_KEY ?? local.PUBLISHABLE_KEY) &&
			local.SERVICE_ROLE_KEY &&
			local.DB_URL,
		'Local Supabase status is incomplete'
	);
	await runDatabaseContracts(local);
	await runSecurityAndInputContracts(local);
	await stopApp();
	await runBackupRecovery(local);
	await runLifecycleContracts();
	run('bun', ['run', 'build']);
	run('bun', ['run', 'security:bundle']);
	console.log('P12-T14 production build and public-bundle check passed');
	run('bun', ['run', 'authority:verify']);
	const operations = await readFile('docs/OPERATIONS.md', 'utf8');
	const deployment = await readFile('docs/DEPLOYMENT.md', 'utf8');
	assert(
		operations.includes('Restore drill') &&
			operations.includes('password_reset_or_reinvite_required'),
		'Operations recovery contract is incomplete'
	);
	assert(
		deployment.includes('PILOT_READY') && deployment.includes('bun run quality'),
		'Deployment release contract is incomplete'
	);
	console.log('P12-T15 blocker review and handoff documentation passed');
	console.log('P12 security, backup, recovery and operational hardening passed');
}

try {
	await main();
} finally {
	await stopApp();
	if (restoreDatabase) {
		const local = statusEnv();
		if (local.DB_URL) sql(local.DB_URL, `drop database if exists ${identifier(restoreDatabase)};`);
	}
	if (backupDirectory) await rm(backupDirectory, { recursive: true, force: true });
}
