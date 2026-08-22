-- Phase 12: redacted operational evidence for diagnostics and recovery rehearsal.

begin;

create table public.automation_runs (
	run_id uuid primary key,
	status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	created_tasks integer not null default 0 check (created_tasks >= 0),
	expired_quotes integer not null default 0 check (expired_quotes >= 0),
	claims_count integer not null default 0 check (claims_count >= 0),
	sent_count integer not null default 0 check (sent_count >= 0),
	failed_count integer not null default 0 check (failed_count >= 0),
	error_message text
);

create table public.operational_events (
	id uuid primary key default gen_random_uuid(),
	severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
	source text not null check (length(trim(source)) > 0),
	event_type text not null check (length(trim(event_type)) > 0),
	message text not null check (length(trim(message)) > 0),
	metadata jsonb not null default '{}'::jsonb,
	occurred_at timestamptz not null default now(),
	created_at timestamptz not null default now()
);

create index automation_runs_started_idx on public.automation_runs (started_at desc);
create index automation_runs_status_idx on public.automation_runs (status, started_at desc);
create index operational_events_occurred_idx on public.operational_events (occurred_at desc);
create index operational_events_severity_idx on public.operational_events (severity, occurred_at desc);

create or replace function private.prevent_operational_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	raise exception using errcode = '55000', message = 'Operational events are append-only';
end;
$$;

drop trigger if exists operational_events_append_only on public.operational_events;
create trigger operational_events_append_only
before update or delete on public.operational_events
for each row execute function private.prevent_operational_event_mutation();

alter table public.automation_runs enable row level security;
alter table public.operational_events enable row level security;
revoke all on table public.automation_runs, public.operational_events from public, anon;
grant select on table public.automation_runs, public.operational_events to authenticated;
grant insert, update on table public.automation_runs to service_role;
grant insert on table public.operational_events to service_role;

create policy automation_runs_select_admin
on public.automation_runs for select to authenticated
using ((select private.has_any_role(array['owner', 'admin']::text[])));

create policy operational_events_select_admin
on public.operational_events for select to authenticated
using ((select private.has_any_role(array['owner', 'admin']::text[])));

create or replace function public.operational_diagnostics()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_recent_errors jsonb;
begin
	if not (select private.has_any_role(array['owner', 'admin']::text[])) then
		raise exception using errcode = '42501', message = 'Owner or Admin role required';
	end if;

	select coalesce(
		jsonb_agg(
			jsonb_build_object(
				'severity', event.severity,
				'source', event.source,
				'event_type', event.event_type,
				'message', event.message,
				'occurred_at', event.occurred_at
				)
			order by event.occurred_at desc
		),
		'[]'::jsonb
	)
	into v_recent_errors
	from (
		select severity, source, event_type, message, occurred_at
		from public.operational_events
		where severity in ('error', 'critical')
		order by occurred_at desc
		limit 20
	) event;

	return jsonb_build_object(
		'generated_at', now(),
		'bricks', jsonb_build_object(
			'last_success_at', (select max(processed_at) from public.inbound_submissions where source = 'bricks' and intake_state = 'accepted'),
			'last_failure_at', (select max(received_at) from public.inbound_submissions where source = 'bricks' and intake_state in ('rejected', 'failed')),
			'failed_last_24h', (select count(*) from public.inbound_submissions where source = 'bricks' and intake_state in ('rejected', 'failed') and received_at >= now() - interval '24 hours')
		),
		'sendpulse', jsonb_build_object(
			'last_send_at', (select max(submitted_at) from public.outbound_messages where provider = 'sendpulse' and submitted_at is not null),
			'last_webhook_at', (select max(created_at) from public.message_events),
			'failed_outbound_last_24h', (select count(*) from public.outbound_messages where provider = 'sendpulse' and delivery_status = 'failed' and updated_at >= now() - interval '24 hours'),
			'failed_outbound_total', (select count(*) from public.outbound_messages where provider = 'sendpulse' and delivery_status = 'failed')
		),
		'reminders', jsonb_build_object(
			'last_run_at', (select max(started_at) from public.automation_runs),
			'last_run_status', (select status from public.automation_runs order by started_at desc limit 1),
			'failed_last_24h', (select count(*) from public.automation_runs where status = 'failed' and started_at >= now() - interval '24 hours'),
			'failed_tasks_last_24h', (select count(*) from public.tasks where reminder_status = 'failed' and updated_at >= now() - interval '24 hours')
		),
		'critical_errors', v_recent_errors
	);
end;
$$;

revoke all on function public.operational_diagnostics() from public, anon;
grant execute on function public.operational_diagnostics() to authenticated;

commit;
