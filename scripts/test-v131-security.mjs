import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function run(command, args) {
	return execFileSync(command, args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}

function sql(databaseUrl, query) {
	return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]);
}

const migration = await readFile(
	'supabase/migrations/20260822160000_v131_authority_reconciliation.sql',
	'utf8'
);
const securityDocs = await readFile('docs/SECURITY_MODEL.md', 'utf8');
const config = await readFile('supabase/config.toml', 'utf8');
for (const required of ['SECURITY DEFINER', 'search_path', 'AAL2', 'append-only']) {
	if (!migration.includes(required))
		throw new Error(`v1.3.1 migration security evidence is missing ${required}`);
}
for (const required of ['raw_user_meta_data', 'AAL2', 'append-only', 'SECURITY DEFINER']) {
	if (!securityDocs.includes(required))
		throw new Error(`v1.3.1 security documentation is missing ${required}`);
}
if (!config.includes('enable_signup = false'))
	throw new Error('public signup is not disabled in local Auth configuration');

const status = run('bunx', ['supabase', 'status', '-o', 'env']);
const local = Object.fromEntries(
	status
		.split('\n')
		.filter((line) => line.includes('='))
		.map((line) => {
			const index = line.indexOf('=');
			return [line.slice(0, index), line.slice(index + 1).replace(/^"(.*)"$/, '$1')];
		})
);
if (!local.DB_URL) throw new Error('local Supabase DB_URL is unavailable');

const unsafeDefiners = sql(
	local.DB_URL,
	`
select count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
    where setting like 'search_path=%'
  );
`
);
if (unsafeDefiners !== '0')
	throw new Error(
		`found ${unsafeDefiners} SECURITY DEFINER functions without explicit search_path`
	);

const protectedAnonExecute = sql(
	local.DB_URL,
	`
select count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'set_profile_access','set_app_setting','reopen_lead','set_lead_attention','pause_lead','resume_lead',
    'prepare_quote_send','fail_quote_send','mark_quote_send_unknown','complete_quote_send','reconcile_quote_submission',
    'process_sendpulse_event','save_quote_draft','mark_quote_ready','accept_quote','convert_lead','transition_lead','assign_lead'
  ])
  and has_function_privilege('anon', p.oid, 'EXECUTE');
`
);
if (protectedAnonExecute !== '0')
	throw new Error(`anonymous execute remains on ${protectedAnonExecute} protected functions`);

const serviceOnlyReconciliation = sql(
	local.DB_URL,
	`
select count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'reconcile_quote_submission'
  and has_function_privilege('authenticated', p.oid, 'EXECUTE');
`
);
if (serviceOnlyReconciliation !== '0')
	throw new Error('provider reconciliation is exposed to authenticated browser roles');

const invokerViews = sql(
	local.DB_URL,
	`
select count(*) from pg_class
where relkind = 'v' and relname in ('dashboard_lead_facts','dashboard_quote_facts')
  and reloptions @> array['security_invoker=true']::text[];
`
);
if (invokerViews !== '2')
	throw new Error(`expected two security-invoker analytics views, found ${invokerViews}`);

const auditRls = sql(
	local.DB_URL,
	`
select case when c.relrowsecurity and exists (
  select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'security_audit_events'
) then 'ok' else 'bad' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'security_audit_events';
`
);
if (auditRls !== 'ok') throw new Error('privileged security audit evidence is not RLS-protected');

const exposedRls = sql(
	local.DB_URL,
	`
select count(*)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'profiles','app_settings','lead_sources','lost_reasons','leads','clients',
    'client_contacts','quotes','quote_items','tasks','activities',
    'outbound_messages','message_events','inbound_submissions'
  ])
  and c.relrowsecurity;
`
);
if (exposedRls !== '14')
	throw new Error(`expected RLS on all 14 exposed tables, found ${exposedRls}`);

const directEvidenceWrites = sql(
	local.DB_URL,
	`
select count(*)
from (values
  (has_table_privilege('authenticated', 'public.outbound_messages', 'INSERT')),
  (has_table_privilege('authenticated', 'public.outbound_messages', 'UPDATE')),
  (has_table_privilege('authenticated', 'public.activities', 'INSERT'))
) as grants(granted)
where granted;
`
);
if (directEvidenceWrites !== '0')
	throw new Error('authenticated direct writes remain on trusted evidence tables');

const evidenceInsertPolicies = sql(
	local.DB_URL,
	`
select count(*)
from pg_policies
where schemaname = 'public'
  and ((tablename = 'activities' and cmd = 'INSERT')
    or (tablename = 'outbound_messages' and cmd in ('INSERT', 'UPDATE')));
`
);
if (evidenceInsertPolicies !== '0')
	throw new Error('trusted evidence tables still expose generic mutation policies');

const trustedNoteGrant = sql(
	local.DB_URL,
	`
select case when
  has_function_privilege('authenticated', 'public.add_activity_note(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure, 'EXECUTE')
  and not has_function_privilege('anon', 'public.add_activity_note(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure, 'EXECUTE')
  and not has_function_privilege('public', 'public.add_activity_note(uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure, 'EXECUTE')
then 'ok' else 'bad' end;
`
);
if (trustedNoteGrant !== 'ok') throw new Error('activity note action has an unsafe EXECUTE grant');

const rh04Privileges = sql(
	local.DB_URL,
	`
select case when
  has_function_privilege('authenticated', 'public.record_quote_send_ack(uuid,text,text)'::regprocedure, 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_quote_send_ack(uuid,text,text)'::regprocedure, 'EXECUTE')
  and has_function_privilege('service_role', 'public.prepare_task_reminder(uuid,uuid)'::regprocedure, 'EXECUTE')
  and has_function_privilege('service_role', 'public.start_task_reminder(uuid,uuid)'::regprocedure, 'EXECUTE')
  and has_function_privilege('service_role', 'public.mark_task_reminder_unknown(uuid,uuid,text,text)'::regprocedure, 'EXECUTE')
  and has_function_privilege('service_role', 'public.reconcile_task_reminder(uuid,text)'::regprocedure, 'EXECUTE')
  and has_table_privilege('service_role', 'public.automation_runs', 'SELECT')
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_runs'::regclass
      and conname = 'automation_runs_status_check'
      and pg_get_constraintdef(oid) like '%partial_failure%'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_reminder_status_check'
      and pg_get_constraintdef(oid) like '%submission_unknown%'
  )
then 'ok' else 'bad' end;
`
);
if (rh04Privileges !== 'ok')
	throw new Error('RH04 reminder/reconciliation privileges or state constraints are unsafe');

const boundaryTriggers = sql(
	local.DB_URL,
	`
select count(*)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and t.tgname = any(array[
    'leads_protected_insert','clients_provenance_protection',
    'tasks_enforce_mutation','tasks_protected_fields'
  ]);
`
);
if (boundaryTriggers !== '4')
	throw new Error(`expected four RH02 protected-boundary triggers, found ${boundaryTriggers}`);

console.log(
	'v1.3.1 security evidence passed: RLS/role-status authority, protected evidence boundaries, signup prohibition, hardened definers, restricted EXECUTE, AAL2 contract, audit evidence, and security-invoker analytics.'
);
