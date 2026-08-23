begin;

-- RH02 keeps ordinary CRM CRUD available while moving workflow, provenance,
-- automation, provider, and system-evidence state behind trusted boundaries.

create or replace function private.guard_lead_initial_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin')
		or (select auth.role()) = 'service_role' then
		return new;
	end if;

	if new.pipeline_stage is distinct from 'NEW'
		or new.attention_state is distinct from 'none'
		or new.assigned_to is not null
		or new.lost_reason_id is not null
		or new.lost_notes is not null
		or new.converted_client_id is not null
		or new.last_activity_at is not null
		or new.lock_version is distinct from 1
		or new.paused_at is not null
		or new.pause_reason is not null
		or new.resume_at is not null then
		raise exception using errcode = '42501', message = 'Lead initial workflow state requires a trusted action';
	end if;
	new.created_at := now();
	new.updated_at := new.created_at;

	return new;
end;
$$;

drop trigger if exists leads_protected_insert on public.leads;
create trigger leads_protected_insert
before insert on public.leads
for each row execute function private.guard_lead_initial_state();

create or replace function private.guard_client_provenance()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin')
		or (select auth.role()) = 'service_role' then
		return new;
	end if;

	if tg_op = 'INSERT' then
		if new.source_lead_id is not null or new.converted_at is not null then
			raise exception using errcode = '42501', message = 'Client conversion provenance requires a trusted action';
		end if;
	elsif new.source_lead_id is distinct from old.source_lead_id
		or new.converted_at is distinct from old.converted_at then
		raise exception using errcode = '42501', message = 'Client conversion provenance requires a trusted action';
	end if;

	return new;
end;
$$;

drop trigger if exists clients_provenance_protection on public.clients;
create trigger clients_provenance_protection
before insert or update on public.clients
for each row execute function private.guard_client_provenance();

create or replace function private.enforce_task_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
		or (select auth.role()) = 'service_role';
begin
	if tg_op = 'INSERT' then
		if not v_trusted then
			if new.created_by is null then
				new.created_by := (select auth.uid());
			elsif new.created_by is distinct from (select auth.uid()) then
				raise exception using errcode = '42501', message = 'Task creator is derived from the authenticated actor';
			end if;
			if new.automation_key is not null
				or new.reminder_status is distinct from 'pending'
				or new.reminder_claim_id is not null
				or new.reminder_claimed_at is not null
				or new.reminder_attempt_count is distinct from 0
				or new.reminder_last_error is not null
				or new.reminder_outbound_message_id is not null
				or new.notification_sent_at is not null
				or new.lock_version is distinct from 1 then
				raise exception using errcode = '42501', message = 'Task automation and reminder fields require a trusted action';
			end if;
		end if;
		if new.status <> 'open' then
			raise exception using errcode = '22023', message = 'New Tasks must start open';
		end if;
		new.completed_at = null;
		new.cancelled_at = null;
		new.reminder_status = 'pending';
		new.reminder_claim_id = null;
		new.reminder_claimed_at = null;
		return new;
	end if;

	if old.status in ('completed', 'cancelled') then
		raise exception using errcode = '55000', message = 'Completed or cancelled Tasks are immutable';
	end if;
	if new.lock_version <> old.lock_version + 1 then
		raise exception using errcode = '40001', message = 'stale or invalid lock_version for tasks';
	end if;

	if new.status = 'open' then
		new.completed_at = null;
		new.cancelled_at = null;
		if new.reminder_status = 'cancelled' then
			new.reminder_status = 'pending';
		end if;
	elsif new.status = 'completed' then
		new.completed_at = coalesce(new.completed_at, now());
		new.cancelled_at = null;
		new.reminder_status = 'cancelled';
		new.reminder_claim_id = null;
		new.reminder_claimed_at = null;
	elsif new.status = 'cancelled' then
		new.cancelled_at = coalesce(new.cancelled_at, now());
		new.completed_at = null;
		new.reminder_status = 'cancelled';
		new.reminder_claim_id = null;
		new.reminder_claimed_at = null;
	else
		raise exception using errcode = '22023', message = 'Invalid Task status';
	end if;
	return new;
end;
$$;

create or replace function private.guard_task_protected_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin')
		or (select auth.role()) = 'service_role' then
		return new;
	end if;
	if new.status is distinct from old.status
		or new.lock_version is distinct from old.lock_version
		or new.reminder_status is distinct from old.reminder_status
		or new.reminder_claim_id is distinct from old.reminder_claim_id
		or new.reminder_claimed_at is distinct from old.reminder_claimed_at
		or new.reminder_attempt_count is distinct from old.reminder_attempt_count
		or new.reminder_last_error is distinct from old.reminder_last_error
		or new.reminder_outbound_message_id is distinct from old.reminder_outbound_message_id
		or new.notification_sent_at is distinct from old.notification_sent_at
		or new.automation_key is distinct from old.automation_key
		or new.created_by is distinct from old.created_by
		or new.lead_id is distinct from old.lead_id
		or new.client_id is distinct from old.client_id
		or new.quote_id is distinct from old.quote_id then
		raise exception using errcode = '42501', message = 'Task protected fields require a trusted action';
	end if;
	return new;
end;
$$;

-- The public task action is an ordinary staff action. Automation keys are
-- created only by the trusted automation/domain functions below the Data API.
create or replace function public.create_task(
	p_lead_id uuid default null,
	p_client_id uuid default null,
	p_quote_id uuid default null,
	p_type text default 'custom',
	p_title text default null,
	p_description text default null,
	p_assigned_to uuid default null,
	p_due_at timestamptz default null,
	p_automation_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
	v_parent_count integer;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_automation_key is not null then
		raise exception using errcode = '42501', message = 'Automation keys require a trusted action';
	end if;
	if p_type not in ('review_lead', 'call_client', 'prepare_quote', 'send_quote', 'follow_up', 'confirm_acceptance', 'custom') then
		raise exception using errcode = '22023', message = 'Invalid Task type';
	end if;
	if length(trim(coalesce(p_title, ''))) = 0 then
		raise exception using errcode = '22023', message = 'Task title is required';
	end if;
	v_parent_count := (p_lead_id is not null)::integer + (p_client_id is not null)::integer + (p_quote_id is not null)::integer;
	if v_parent_count = 0 then
		raise exception using errcode = '23514', message = 'Task requires a Lead, Client, or Quote';
	end if;
	if v_parent_count > 1 and p_quote_id is null then
		raise exception using errcode = '23514', message = 'A Task may have one direct parent unless it is Quote-linked';
	end if;
	if p_assigned_to is not null and not exists (
		select 1 from public.profiles where id = p_assigned_to and status = 'active' and role in ('owner', 'admin', 'sales')
	) then
		raise exception using errcode = '22023', message = 'Task assignee must be an active CRM user';
	end if;

	insert into public.tasks (
		lead_id, client_id, quote_id, type, title, description, assigned_to, due_at, created_by
	)
	values (
		p_lead_id, p_client_id, p_quote_id, p_type, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
		p_assigned_to, p_due_at, (select auth.uid())
	)
	returning * into v_task;
	return jsonb_build_object('task_id', v_task.id, 'lock_version', v_task.lock_version, 'idempotent', false);
end;
$$;

-- Provider messages and system Activities are evidence, not browser-editable
-- business rows. Their existing trusted SECURITY DEFINER actions remain able
-- to write them as the database owner.
revoke insert, update on table public.outbound_messages from authenticated;
revoke insert on table public.activities from authenticated;

drop policy if exists activities_insert_crm_roles on public.activities;
drop policy if exists outbound_messages_insert_crm_roles on public.outbound_messages;
drop policy if exists outbound_messages_update_crm_roles on public.outbound_messages;

create or replace function public.add_activity_note(
	p_lead_id uuid default null,
	p_client_id uuid default null,
	p_quote_id uuid default null,
	p_task_id uuid default null,
	p_outbound_message_id uuid default null,
	p_summary text default null,
	p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_target_count integer;
	v_activity public.activities%rowtype;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'Active CRM staff role required';
	end if;
	if length(trim(coalesce(p_summary, ''))) = 0 or length(p_summary) > 2000 then
		raise exception using errcode = '22023', message = 'Activity note summary must be between 1 and 2000 characters';
	end if;
	if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) <> 'object' or length(p_metadata::text) > 10000 then
		raise exception using errcode = '22023', message = 'Activity note metadata must be a bounded JSON object';
	end if;
	v_target_count := (p_lead_id is not null)::integer
		+ (p_client_id is not null)::integer
		+ (p_quote_id is not null)::integer
		+ (p_task_id is not null)::integer
		+ (p_outbound_message_id is not null)::integer;
	if v_target_count <> 1 then
		raise exception using errcode = '22023', message = 'Activity note requires exactly one target';
	end if;
	if p_lead_id is not null and not exists (select 1 from public.leads where id = p_lead_id) then
		raise exception using errcode = 'P0002', message = 'Lead target not found';
	elsif p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id) then
		raise exception using errcode = 'P0002', message = 'Client target not found';
	elsif p_quote_id is not null and not exists (select 1 from public.quotes where id = p_quote_id) then
		raise exception using errcode = 'P0002', message = 'Quote target not found';
	elsif p_task_id is not null and not exists (select 1 from public.tasks where id = p_task_id) then
		raise exception using errcode = 'P0002', message = 'Task target not found';
	elsif p_outbound_message_id is not null and not exists (select 1 from public.outbound_messages where id = p_outbound_message_id) then
		raise exception using errcode = 'P0002', message = 'Outbound message target not found';
	end if;

	insert into public.activities (
		lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary
	)
	values (
		p_lead_id, p_client_id, p_quote_id, p_task_id, p_outbound_message_id,
		v_actor, 'note_added', p_metadata, trim(p_summary)
	)
	returning * into v_activity;
	return jsonb_build_object('activity_id', v_activity.id, 'event_type', v_activity.event_type);
end;
$$;

revoke all on function public.add_activity_note(uuid, uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_activity_note(uuid, uuid, uuid, uuid, uuid, text, jsonb) to authenticated;

commit;
