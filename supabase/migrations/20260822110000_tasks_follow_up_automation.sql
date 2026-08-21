-- Phase 9: complete Task lifecycle semantics and duplicate-safe reminders.

alter table public.outbound_messages
	add column if not exists task_id uuid references public.tasks (id) on delete set null;

alter table public.tasks
	add column if not exists lock_version bigint not null default 1,
	add column if not exists automation_key text,
	add column if not exists reminder_status text not null default 'pending',
	add column if not exists reminder_claim_id uuid,
	add column if not exists reminder_claimed_at timestamptz,
	add column if not exists reminder_attempt_count integer not null default 0,
	add column if not exists reminder_last_error text,
	add column if not exists reminder_outbound_message_id uuid references public.outbound_messages (id) on delete set null;

alter table public.tasks
	drop constraint if exists tasks_lock_version_positive,
	drop constraint if exists tasks_reminder_status_check,
	add constraint tasks_lock_version_positive check (lock_version > 0),
	add constraint tasks_reminder_status_check check (
		reminder_status in ('pending', 'sending', 'sent', 'failed', 'cancelled')
	),
	add constraint tasks_reminder_attempt_count_nonnegative check (reminder_attempt_count >= 0);

create unique index if not exists tasks_automation_key_unique
on public.tasks (automation_key)
where automation_key is not null;

create unique index if not exists tasks_quote_follow_up_unique
on public.tasks (quote_id)
where quote_id is not null and type = 'follow_up' and automation_key is null;

create unique index if not exists outbound_task_reminder_unique
on public.outbound_messages (task_id)
where task_id is not null and purpose = 'task_reminder';

create index if not exists tasks_automation_due_idx
on public.tasks (status, reminder_status, due_at, assigned_to)
where status = 'open';

create index if not exists tasks_lead_type_status_idx
on public.tasks (lead_id, type, status, due_at)
where lead_id is not null;

create index if not exists outbound_task_idx
on public.outbound_messages (task_id, created_at desc)
where task_id is not null;

insert into public.app_settings (setting_key, setting_value, description)
values (
	'automation_rules',
	'{
		"new_lead_aging_hours": 24,
		"follow_up_days": 3,
		"stale_opportunity_days": 14,
		"quote_expiry_warning_days": 7,
		"quote_expiry_enabled": true,
		"reminder_claim_timeout_minutes": 15,
		"reminder_batch_size": 50
	}'::jsonb,
	'Server-side Task aging, follow-up, quote-expiry and reminder processing rules'
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
	description = excluded.description;

create or replace function private.enforce_task_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if tg_op = 'INSERT' then
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

create or replace function private.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_event_type text;
	v_summary text;
	v_metadata jsonb;
begin
	if tg_op = 'INSERT' then
		v_event_type := 'task_created';
		v_summary := case when new.type = 'follow_up'
			then 'Follow-up task created'
			else format('Task created: %s', new.title)
		end;
		v_metadata := jsonb_build_object(
			'task_type', new.type,
			'automation_key', new.automation_key,
			'due_at', new.due_at
		);
	elsif old.status = 'open' and new.status = 'completed' then
		v_event_type := 'task_completed';
		v_summary := format('Task completed: %s', new.title);
		v_metadata := jsonb_build_object('task_type', new.type, 'lock_version', new.lock_version);
	elsif old.status = 'open' and new.status = 'cancelled' then
		v_event_type := 'task_cancelled';
		v_summary := format('Task cancelled: %s', new.title);
		v_metadata := jsonb_build_object('task_type', new.type, 'lock_version', new.lock_version);
	elsif old.status = 'open' and new.status = 'open' and new.due_at is distinct from old.due_at then
		v_event_type := 'task_rescheduled';
		v_summary := format('Task rescheduled: %s', new.title);
		v_metadata := jsonb_build_object(
			'task_type', new.type,
			'from_due_at', old.due_at,
			'to_due_at', new.due_at,
			'lock_version', new.lock_version
		);
	else
		return new;
	end if;

	insert into public.activities (
		lead_id,
		client_id,
		quote_id,
		task_id,
		actor_id,
		event_type,
		metadata,
		summary
	)
	values (
		new.lead_id,
		new.client_id,
		new.quote_id,
		new.id,
		auth.uid(),
		v_event_type,
		v_metadata,
		v_summary
	);
	return new;
end;
$$;

drop trigger if exists tasks_enforce_mutation on public.tasks;
create trigger tasks_enforce_mutation
before insert or update on public.tasks
for each row execute function private.enforce_task_mutation();

drop trigger if exists tasks_activity on public.tasks;
create trigger tasks_activity
after insert or update on public.tasks
for each row execute function private.record_task_activity();

create or replace function private.task_actor_can_manage(p_task public.tasks)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
	select (select private.has_any_role(array['owner', 'admin']::text[]))
		or (
			select private.has_any_role(array['sales']::text[])
			and (p_task.assigned_to is null or p_task.assigned_to = (select auth.uid()) or p_task.created_by = (select auth.uid()))
		);
$$;

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
	v_existing public.tasks%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
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
	if p_automation_key is not null then
		select * into v_existing from public.tasks where automation_key = trim(p_automation_key) for update;
		if found then
			return jsonb_build_object('task_id', v_existing.id, 'lock_version', v_existing.lock_version, 'idempotent', true);
		end if;
	end if;

	insert into public.tasks (
		lead_id, client_id, quote_id, type, title, description, assigned_to, due_at, created_by, automation_key
	)
	values (
		p_lead_id, p_client_id, p_quote_id, p_type, trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
		p_assigned_to, p_due_at, auth.uid(), nullif(trim(coalesce(p_automation_key, '')), '')
	)
	returning * into v_task;
	return jsonb_build_object('task_id', v_task.id, 'lock_version', v_task.lock_version, 'idempotent', false);
exception when unique_violation then
	if p_automation_key is not null then
		select * into v_existing from public.tasks where automation_key = trim(p_automation_key);
		if found then
			return jsonb_build_object('task_id', v_existing.id, 'lock_version', v_existing.lock_version, 'idempotent', true);
		end if;
	end if;
	raise;
end;
$$;

create or replace function public.complete_task(p_task_id uuid, p_lock_version bigint)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if not (select private.task_actor_can_manage(v_task)) then
		raise exception using errcode = '42501', message = 'Task management permission required';
	end if;
	if v_task.status <> 'open' then
		return jsonb_build_object('task_id', v_task.id, 'status', v_task.status, 'idempotent', true);
	end if;
	if v_task.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale Task lock_version';
	end if;
	update public.tasks
	set status = 'completed', lock_version = lock_version + 1
	where id = p_task_id and lock_version = p_lock_version;
	select * into v_task from public.tasks where id = p_task_id;
	return jsonb_build_object('task_id', v_task.id, 'status', v_task.status, 'lock_version', v_task.lock_version, 'idempotent', false);
end;
$$;

create or replace function public.reschedule_task(
	p_task_id uuid,
	p_lock_version bigint,
	p_due_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_due_at is null then raise exception using errcode = '22023', message = 'A due date is required'; end if;
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if not (select private.task_actor_can_manage(v_task)) then
		raise exception using errcode = '42501', message = 'Task management permission required';
	end if;
	if v_task.status <> 'open' then
		raise exception using errcode = '55000', message = 'Only open Tasks can be rescheduled';
	end if;
	if v_task.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale Task lock_version';
	end if;
	update public.tasks
	set due_at = p_due_at,
		reminder_status = 'pending',
		reminder_claim_id = null,
		reminder_claimed_at = null,
		reminder_last_error = null,
		notification_sent_at = null,
		lock_version = lock_version + 1
	where id = p_task_id and lock_version = p_lock_version;
	select * into v_task from public.tasks where id = p_task_id;
	return jsonb_build_object('task_id', v_task.id, 'status', v_task.status, 'due_at', v_task.due_at, 'lock_version', v_task.lock_version);
end;
$$;

create or replace function public.cancel_task(p_task_id uuid, p_lock_version bigint)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if not (select private.task_actor_can_manage(v_task)) then
		raise exception using errcode = '42501', message = 'Task management permission required';
	end if;
	if v_task.status <> 'open' then
		return jsonb_build_object('task_id', v_task.id, 'status', v_task.status, 'idempotent', true);
	end if;
	if v_task.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale Task lock_version';
	end if;
	update public.tasks
	set status = 'cancelled', lock_version = lock_version + 1
	where id = p_task_id and lock_version = p_lock_version;
	select * into v_task from public.tasks where id = p_task_id;
	return jsonb_build_object('task_id', v_task.id, 'status', v_task.status, 'lock_version', v_task.lock_version, 'idempotent', false);
end;
$$;

create or replace function public.prepare_task_reminder(p_task_id uuid, p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
	v_message public.outbound_messages%rowtype;
	v_profile public.profiles%rowtype;
	v_timeout integer;
	v_recipient jsonb;
	v_has_message boolean := false;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	if p_run_id is null then raise exception using errcode = '22023', message = 'Reminder run ID is required'; end if;
	select coalesce((setting_value ->> 'reminder_claim_timeout_minutes')::integer, 15)
	into v_timeout from public.app_settings where setting_key = 'automation_rules';
	v_timeout := greatest(1, v_timeout);

	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then return jsonb_build_object('status', 'missing', 'task_id', p_task_id); end if;
	if v_task.status <> 'open' or v_task.due_at is null or v_task.due_at > now() then
		return jsonb_build_object('status', 'not_due', 'task_id', v_task.id);
	end if;
	if v_task.reminder_status = 'sent' and v_task.notification_sent_at is not null then
		return jsonb_build_object('status', 'sent', 'task_id', v_task.id, 'idempotent', true);
	end if;
	if v_task.reminder_status = 'sending'
		and v_task.reminder_claimed_at > now() - make_interval(mins => v_timeout) then
		return jsonb_build_object('status', 'claimed', 'task_id', v_task.id, 'claimed', false);
	end if;
	if v_task.assigned_to is null then
		return jsonb_build_object('status', 'unassigned', 'task_id', v_task.id);
	end if;
	select * into v_profile from public.profiles where id = v_task.assigned_to and status = 'active' for share;
	if not found or length(trim(coalesce(v_profile.email, ''))) = 0 then
		return jsonb_build_object('status', 'unassigned', 'task_id', v_task.id);
	end if;

	select * into v_message
	from public.outbound_messages
	where task_id = v_task.id and purpose = 'task_reminder'
	for update;
	v_has_message := found;
	if found and v_message.delivery_status in ('submitted', 'delivered') and v_message.provider_message_id is not null then
		update public.tasks
		set reminder_status = 'sent',
			notification_sent_at = coalesce(notification_sent_at, v_message.submitted_at, now()),
			reminder_claim_id = null,
			reminder_claimed_at = null,
			reminder_last_error = null,
			reminder_outbound_message_id = v_message.id,
			lock_version = lock_version + 1
		where id = v_task.id;
		return jsonb_build_object(
			'status', 'sent', 'task_id', v_task.id, 'outbound_message_id', v_message.id,
			'provider_message_id', v_message.provider_message_id, 'idempotent', true
		);
	end if;

	update public.tasks
	set reminder_status = 'sending',
		reminder_claim_id = p_run_id,
		reminder_claimed_at = now(),
		reminder_attempt_count = reminder_attempt_count + 1,
		reminder_last_error = null,
		lock_version = lock_version + 1
	where id = v_task.id;

	v_recipient := jsonb_build_object('email', v_profile.email, 'name', v_profile.full_name);
	if v_has_message then
		update public.outbound_messages
		set delivery_status = 'sending',
			attempt_count = attempt_count + 1,
			last_error = null,
			recipient_snapshot = v_recipient,
			subject = format('Task due: %s', v_task.title)
		where id = v_message.id;
	else
		insert into public.outbound_messages (
			task_id, lead_id, client_id, quote_id, channel, purpose, provider,
			recipient_snapshot, subject, delivery_status, attempt_count
		)
		values (
			v_task.id, v_task.lead_id, v_task.client_id, v_task.quote_id, 'email', 'task_reminder', 'sendpulse',
			v_recipient, format('Task due: %s', v_task.title), 'sending', 1
		)
		returning * into v_message;
	end if;

	update public.tasks set reminder_outbound_message_id = v_message.id, lock_version = lock_version + 1 where id = v_task.id;
	return jsonb_build_object(
		'status', 'claimed', 'claimed', true, 'task_id', v_task.id,
		'outbound_message_id', v_message.id, 'recipient', v_recipient,
		'subject', v_message.subject, 'run_id', p_run_id
	);
end;
$$;

create or replace function public.record_task_reminder(
	p_task_id uuid,
	p_run_id uuid,
	p_provider_message_id text default null,
	p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
	v_message public.outbound_messages%rowtype;
	v_error text := left(nullif(trim(coalesce(p_error, '')), ''), 500);
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if v_task.reminder_status = 'sent' and v_task.notification_sent_at is not null then
		return jsonb_build_object('task_id', p_task_id, 'status', 'sent', 'idempotent', true);
	end if;
	if v_task.reminder_claim_id is distinct from p_run_id then
		raise exception using errcode = '40001', message = 'Reminder claim does not belong to this run';
	end if;
	select * into v_message from public.outbound_messages where task_id = p_task_id and purpose = 'task_reminder' for update;
	if not found then raise exception using errcode = 'P0002', message = 'Reminder OutboundMessage not found'; end if;

	if length(trim(coalesce(p_provider_message_id, ''))) > 0 then
		update public.outbound_messages
		set delivery_status = 'submitted',
			provider_message_id = trim(p_provider_message_id),
			submitted_at = coalesce(submitted_at, now()),
			last_error = null
		where id = v_message.id;
		update public.tasks
		set reminder_status = 'sent',
			notification_sent_at = now(),
			reminder_claim_id = null,
			reminder_claimed_at = null,
			reminder_last_error = null,
			reminder_outbound_message_id = v_message.id,
			lock_version = lock_version + 1
		where id = v_task.id;
		insert into public.activities (lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary)
		values (v_task.lead_id, v_task.client_id, v_task.quote_id, v_task.id, v_message.id, null, 'task_reminder_sent', jsonb_build_object('provider_message_id', trim(p_provider_message_id)), 'Task reminder submitted');
		return jsonb_build_object('task_id', p_task_id, 'status', 'sent', 'outbound_message_id', v_message.id, 'idempotent', false);
	end if;

	update public.outbound_messages set delivery_status = 'failed', last_error = coalesce(v_error, 'Reminder provider failed') where id = v_message.id;
	update public.tasks
	set reminder_status = 'failed',
		reminder_claim_id = null,
		reminder_claimed_at = null,
		reminder_last_error = coalesce(v_error, 'Reminder provider failed'),
		lock_version = lock_version + 1
	where id = v_task.id;
	insert into public.activities (lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary)
	values (v_task.lead_id, v_task.client_id, v_task.quote_id, v_task.id, v_message.id, null, 'task_reminder_failed', jsonb_build_object('error', coalesce(v_error, 'Reminder provider failed')), 'Task reminder failed');
	return jsonb_build_object('task_id', p_task_id, 'status', 'failed', 'outbound_message_id', v_message.id, 'idempotent', false);
end;
$$;

create or replace function public.process_reminders(p_run_id uuid, p_limit integer default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_rules jsonb;
	v_lead record;
	v_quote record;
	v_task record;
	v_claim jsonb;
	v_claims jsonb := '[]'::jsonb;
	v_created_tasks integer := 0;
	v_expired_quotes integer := 0;
	v_batch integer;
	v_aging_hours integer;
	v_stale_days integer;
	v_warning_days integer;
	v_default_owner uuid;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	if p_run_id is null then raise exception using errcode = '22023', message = 'Reminder run ID is required'; end if;
	select setting_value into v_rules from public.app_settings where setting_key = 'automation_rules';
	v_rules := coalesce(v_rules, '{}'::jsonb);
	v_batch := least(greatest(coalesce(p_limit, (v_rules ->> 'reminder_batch_size')::integer, 50), 1), 200);
	v_aging_hours := greatest(coalesce((v_rules ->> 'new_lead_aging_hours')::integer, 24), 1);
	v_stale_days := greatest(coalesce((v_rules ->> 'stale_opportunity_days')::integer, 14), 1);
	v_warning_days := greatest(coalesce((v_rules ->> 'quote_expiry_warning_days')::integer, 7), 0);
	select id into v_default_owner from public.profiles where status = 'active' and role in ('owner', 'admin', 'sales') order by case role when 'owner' then 1 when 'admin' then 2 else 3 end, created_at limit 1;

	for v_lead in
		select l.* from public.leads l
		where l.pipeline_stage = 'NEW'
			and l.created_at <= now() - make_interval(hours => v_aging_hours)
			and coalesce(l.last_activity_at, l.created_at) <= now() - make_interval(hours => v_aging_hours)
			and not exists (select 1 from public.tasks t where t.automation_key = 'new-lead-aging:' || l.id::text)
		order by l.created_at
		limit v_batch
	loop
		if v_default_owner is not null then
			insert into public.tasks (lead_id, type, title, description, assigned_to, due_at, created_by, automation_key)
			values (v_lead.id, 'review_lead', 'Review aging new lead', 'A new Lead has not received a qualifying action within the configured threshold.', coalesce(v_lead.assigned_to, v_default_owner), now(), coalesce(v_lead.assigned_to, v_default_owner), 'new-lead-aging:' || v_lead.id::text)
			on conflict (automation_key) where automation_key is not null do nothing;
			if found then v_created_tasks := v_created_tasks + 1; end if;
		end if;
	end loop;

	for v_lead in
		select l.* from public.leads l
		where l.pipeline_stage in ('QUALIFICATION', 'PROPOSAL', 'DECISION')
			and coalesce(l.last_activity_at, l.created_at) <= now() - make_interval(days => v_stale_days)
			and not exists (select 1 from public.tasks t where t.automation_key = 'stale-opportunity:' || l.id::text)
		order by coalesce(l.last_activity_at, l.created_at)
		limit v_batch
	loop
		if v_default_owner is not null then
			insert into public.tasks (lead_id, type, title, description, assigned_to, due_at, created_by, automation_key)
			values (v_lead.id, 'follow_up', 'Review stale opportunity', 'No material Lead activity was recorded within the configured threshold.', coalesce(v_lead.assigned_to, v_default_owner), now(), coalesce(v_lead.assigned_to, v_default_owner), 'stale-opportunity:' || v_lead.id::text)
			on conflict (automation_key) where automation_key is not null do nothing;
			if found then v_created_tasks := v_created_tasks + 1; end if;
		end if;
	end loop;

	if coalesce((v_rules ->> 'quote_expiry_enabled')::boolean, true) then
		for v_quote in
			select q.*, l.assigned_to from public.quotes q join public.leads l on l.id = q.lead_id
			where q.status = 'sent' and q.valid_until <= current_date
			for update of q
		loop
			update public.quotes set status = 'expired', lock_version = lock_version + 1 where id = v_quote.id and status = 'sent';
			if found then
				v_expired_quotes := v_expired_quotes + 1;
				insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
				values (v_quote.lead_id, v_quote.id, null, 'quote_expired', jsonb_build_object('rule', 'quote_expiry'), 'Quote expired by configured validity rule');
			end if;
		end loop;

		for v_quote in
			select q.*, l.assigned_to from public.quotes q join public.leads l on l.id = q.lead_id
			where q.status = 'sent' and q.valid_until >= current_date and q.valid_until <= current_date + v_warning_days
				and not exists (select 1 from public.tasks t where t.automation_key = 'quote-expiry-warning:' || q.id::text)
			limit v_batch
		loop
			if v_default_owner is not null then
				insert into public.tasks (lead_id, quote_id, type, title, description, assigned_to, due_at, created_by, automation_key)
				values (v_quote.lead_id, v_quote.id, 'confirm_acceptance', 'Confirm quote acceptance', 'The sent Quote is approaching its configured validity date.', coalesce(v_quote.assigned_to, v_default_owner), now(), coalesce(v_quote.assigned_to, v_default_owner), 'quote-expiry-warning:' || v_quote.id::text)
				on conflict (automation_key) where automation_key is not null do nothing;
				if found then v_created_tasks := v_created_tasks + 1; end if;
			end if;
		end loop;
	end if;

	for v_task in
		select t.id from public.tasks t
		where t.status = 'open' and t.due_at is not null and t.due_at <= now()
			and t.reminder_status in ('pending', 'failed', 'sending')
		order by t.due_at, t.created_at
		limit v_batch
	loop
		v_claim := public.prepare_task_reminder(v_task.id, p_run_id);
		if v_claim ->> 'status' = 'claimed' and coalesce((v_claim ->> 'claimed')::boolean, false) then
			v_claims := v_claims || jsonb_build_array(v_claim);
		end if;
	end loop;

	return jsonb_build_object(
		'run_id', p_run_id,
		'created_tasks', v_created_tasks,
		'expired_quotes', v_expired_quotes,
		'claims', v_claims
	);
end;
$$;

create or replace view public.task_work_queue
with (security_invoker = true)
as
select
	t.*,
	(t.status = 'open' and t.due_at is not null and t.due_at < now()) as is_overdue,
	(t.status = 'open' and t.due_at is not null and t.due_at <= now()) as is_due,
	case when t.status = 'open' then 'open' else t.status end as derived_state
from public.tasks t;

grant select on public.task_work_queue to authenticated;

revoke all on function public.create_task(uuid, uuid, uuid, text, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.create_task(uuid, uuid, uuid, text, text, text, uuid, timestamptz, text) to authenticated;
revoke all on function public.complete_task(uuid, bigint) from public, anon;
grant execute on function public.complete_task(uuid, bigint) to authenticated;
revoke all on function public.reschedule_task(uuid, bigint, timestamptz) from public, anon;
grant execute on function public.reschedule_task(uuid, bigint, timestamptz) to authenticated;
revoke all on function public.cancel_task(uuid, bigint) from public, anon;
grant execute on function public.cancel_task(uuid, bigint) to authenticated;
revoke all on function public.prepare_task_reminder(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_task_reminder(uuid, uuid) to service_role;
revoke all on function public.record_task_reminder(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_task_reminder(uuid, uuid, text, text) to service_role;
revoke all on function public.process_reminders(uuid, integer) from public, anon, authenticated;
grant execute on function public.process_reminders(uuid, integer) to service_role;

-- Replace the quote-send completion boundary so the follow-up due date is configured,
-- the automation key makes retries idempotent, and Task creation is recorded by the
-- Task activity trigger rather than duplicated by the quote path.
create or replace function public.complete_quote_send(
	p_outbound_message_id uuid,
	p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_task public.tasks%rowtype;
	v_follow_up_days integer;
	v_default_owner uuid;
	v_automation_key text;
	v_pipeline_changed boolean := false;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	if length(trim(coalesce(p_provider_message_id, ''))) = 0 then raise exception using errcode = '22023', message = 'Provider message ID is required'; end if;
	select * into v_message from public.outbound_messages where id = p_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Outbound message not found'; end if;
	if v_message.provider_message_id is not null and v_message.delivery_status in ('submitted', 'delivered') then
		select * into v_task from public.tasks where quote_id = v_message.quote_id and type = 'follow_up' order by created_at limit 1;
		return jsonb_build_object('outbound_message_id', v_message.id, 'provider_message_id', v_message.provider_message_id, 'task_id', v_task.id, 'idempotent', true);
	end if;
	if v_message.delivery_status <> 'sending' then raise exception using errcode = '22023', message = 'Outbound message is not awaiting provider completion'; end if;
	select * into v_quote from public.quotes where id = v_message.quote_id for update;
	select * into v_lead from public.leads where id = v_message.lead_id for update;
	if v_quote.status <> 'ready' then raise exception using errcode = '22023', message = 'Quote is no longer ready to send'; end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then raise exception using errcode = '22023', message = 'Lead is not in a sendable stage'; end if;
	update public.outbound_messages set delivery_status = 'submitted', provider_message_id = trim(p_provider_message_id), submitted_at = now() where id = v_message.id;
	update public.quotes set status = 'sent', sent_at = now(), lock_version = lock_version + 1 where id = v_quote.id and status = 'ready';
	if v_quote.supersedes_quote_id is not null then update public.quotes set status = 'superseded', lock_version = lock_version + 1 where id = v_quote.supersedes_quote_id and status = 'sent'; end if;
	update public.leads set pipeline_stage = 'DECISION', attention_state = 'waiting_on_client', last_activity_at = now(), lock_version = lock_version + 1 where id = v_lead.id;
	v_pipeline_changed := v_lead.pipeline_stage <> 'DECISION';
	insert into public.activities (lead_id, quote_id, outbound_message_id, actor_id, event_type, metadata, summary)
	values (v_lead.id, v_quote.id, v_message.id, auth.uid(), 'quote_sent', jsonb_build_object('provider', 'sendpulse', 'provider_message_id', trim(p_provider_message_id)), 'Quote submitted through SendPulse');
	if v_pipeline_changed then
		insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
		values (v_lead.id, auth.uid(), 'pipeline_changed', jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'DECISION'), 'Lead moved to Decision after quote send');
	end if;
	select coalesce((setting_value ->> 'follow_up_days')::integer, 3) into v_follow_up_days from public.app_settings where setting_key = 'automation_rules';
	v_follow_up_days := greatest(1, v_follow_up_days);
	select id into v_default_owner from public.profiles where status = 'active' and role in ('owner', 'admin', 'sales') order by case role when 'owner' then 1 when 'admin' then 2 else 3 end, created_at limit 1;
	v_automation_key := 'quote-follow-up:' || v_quote.id::text;
	select * into v_task from public.tasks where automation_key = v_automation_key for update;
	if not found then
		insert into public.tasks (lead_id, quote_id, type, title, due_at, assigned_to, created_by, automation_key)
		values (v_lead.id, v_quote.id, 'follow_up', 'Follow up on sent quote', now() + make_interval(days => v_follow_up_days), coalesce(v_lead.assigned_to, v_default_owner), coalesce(v_lead.assigned_to, v_default_owner), v_automation_key)
		returning * into v_task;
	end if;
	return jsonb_build_object('outbound_message_id', v_message.id, 'provider_message_id', trim(p_provider_message_id), 'task_id', v_task.id, 'follow_up_days', v_follow_up_days, 'idempotent', false);
end;
$$;

-- Won/Lost transitions already own the state changes; this replacement adds the
-- required Task lock increment and lets the Task activity trigger record each closure.
create or replace function public.transition_lead(
	p_lead_id uuid,
	p_to_stage text,
	p_lock_version bigint,
	p_lost_reason_id uuid default null,
	p_lost_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_reason_code text;
	v_new_lock bigint;
	v_closed_task_count integer := 0;
	v_closed_task_ids uuid[] := '{}'::uuid[];
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if p_lock_version is distinct from v_lead.lock_version then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	if not ((v_lead.pipeline_stage = 'NEW' and p_to_stage in ('QUALIFICATION', 'LOST')) or (v_lead.pipeline_stage = 'QUALIFICATION' and p_to_stage in ('PROPOSAL', 'LOST')) or (v_lead.pipeline_stage = 'PROPOSAL' and p_to_stage in ('DECISION', 'LOST')) or (v_lead.pipeline_stage = 'DECISION' and p_to_stage in ('PROPOSAL', 'LOST'))) then raise exception using errcode = '22023', message = 'No legal lead pipeline transition'; end if;
	if p_to_stage = 'LOST' then
		select code into v_reason_code from public.lost_reasons where id = p_lost_reason_id and active;
		if v_reason_code is null then raise exception using errcode = '23514', message = 'LOST leads require an active lost reason'; end if;
		if v_reason_code = 'other' and length(trim(coalesce(p_lost_notes, ''))) = 0 then raise exception using errcode = '23514', message = 'The other lost reason requires lost_notes'; end if;
	end if;
	update public.leads set pipeline_stage = p_to_stage, attention_state = 'none', lost_reason_id = case when p_to_stage = 'LOST' then p_lost_reason_id else null end, lost_notes = case when p_to_stage = 'LOST' then nullif(trim(p_lost_notes), '') else null end, last_activity_at = now(), lock_version = lock_version + 1 where id = p_lead_id and lock_version = p_lock_version returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	if p_to_stage = 'LOST' then
		with closed_tasks as (
			update public.tasks set status = 'cancelled', cancelled_at = now(), lock_version = lock_version + 1 where lead_id = p_lead_id and status = 'open' returning id
		)
		select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[]) into v_closed_task_count, v_closed_task_ids from closed_tasks;
	end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (p_lead_id, auth.uid(), case when p_to_stage = 'LOST' then 'lead_lost' else 'pipeline_changed' end, jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', p_to_stage, 'closed_task_count', v_closed_task_count, 'closed_task_ids', to_jsonb(v_closed_task_ids)), case when p_to_stage = 'LOST' then 'Lead marked lost' else format('Lead moved to %s', p_to_stage) end);
	return jsonb_build_object('lead_id', p_lead_id, 'pipeline_stage', p_to_stage, 'lock_version', v_new_lock, 'closed_task_count', v_closed_task_count);
end;
$$;

create or replace function public.convert_lead(p_lead_id uuid, p_lock_version bigint)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_client_id uuid;
	v_contact_id uuid;
	v_display_name text;
	v_company_name text;
	v_client_type text;
	v_closed_task_count integer;
	v_closed_task_ids uuid[];
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_lead.pipeline_stage = 'WON' and v_lead.converted_client_id is not null then return jsonb_build_object('lead_id', v_lead.id, 'client_id', v_lead.converted_client_id, 'idempotent', true); end if;
	if v_lead.pipeline_stage <> 'DECISION' then raise exception using errcode = '22023', message = 'Only a decision lead can be won'; end if;
	if v_lead.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	v_company_name := nullif(trim(v_lead.company), '');
	v_client_type := case when v_company_name is null then 'individual' else 'company' end;
	v_display_name := coalesce(v_company_name, nullif(trim(concat_ws(' ', nullif(trim(v_lead.first_name), ''), nullif(trim(v_lead.last_name), ''))), ''), 'Converted client');
	insert into public.clients (type, display_name, company_name, email, phone, source_lead_id, converted_at) values (v_client_type, v_display_name, v_company_name, v_lead.email, v_lead.phone, v_lead.id, now()) returning id into v_client_id;
	insert into public.client_contacts (client_id, first_name, last_name, email, phone, is_primary) values (v_client_id, coalesce(nullif(trim(v_lead.first_name), ''), 'Primary'), coalesce(nullif(trim(v_lead.last_name), ''), ''), v_lead.email, v_lead.phone, true) returning id into v_contact_id;
	update public.leads set pipeline_stage = 'WON', attention_state = 'none', attention_reason = null, attention_resume_at = null, converted_client_id = v_client_id, last_activity_at = now(), lock_version = lock_version + 1 where id = v_lead.id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Lead changed during conversion'; end if;
	with closed_tasks as (
		update public.tasks set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), lock_version = lock_version + 1 where lead_id = v_lead.id and status = 'open' returning id
	)
	select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[]) into v_closed_task_count, v_closed_task_ids from closed_tasks;
	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary) values (v_lead.id, v_client_id, auth.uid(), 'client_created', jsonb_build_object('contact_id', v_contact_id, 'client_type', v_client_type, 'duplicate_strategy', 'source_lead_id'), 'Client created from won lead');
	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary) values (v_lead.id, v_client_id, auth.uid(), 'lead_won', jsonb_build_object('client_id', v_client_id, 'closed_task_count', v_closed_task_count, 'closed_task_ids', to_jsonb(v_closed_task_ids)), 'Lead marked won and converted to client');
	return jsonb_build_object('lead_id', v_lead.id, 'client_id', v_client_id, 'contact_id', v_contact_id, 'idempotent', false, 'closed_task_count', v_closed_task_count);
end;
$$;

revoke all on function public.transition_lead(uuid, text, bigint, uuid, text) from public, anon;
grant execute on function public.transition_lead(uuid, text, bigint, uuid, text) to authenticated;
revoke all on function public.convert_lead(uuid, bigint) from public, anon;
grant execute on function public.convert_lead(uuid, bigint) to authenticated;

commit;
