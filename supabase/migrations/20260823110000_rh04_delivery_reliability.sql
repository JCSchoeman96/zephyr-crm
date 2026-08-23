begin;

-- RH04 extends the existing logical outbound-message model to reminders. The
-- provider outcome is never inferred from a local persistence error.

alter table public.tasks
	drop constraint if exists tasks_reminder_status_check;

update public.tasks
set reminder_status = 'submitting'
where reminder_status = 'sending';

alter table public.tasks
	add constraint tasks_reminder_status_check check (
		reminder_status in ('pending', 'claimed', 'submitting', 'sent', 'failed', 'submission_unknown', 'cancelled')
	);

alter table public.automation_runs
	drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
	add column if not exists unknown_count integer not null default 0;

alter table public.automation_runs
	add constraint automation_runs_status_check check (
		status in ('running', 'succeeded', 'partial_failure', 'failed')
	),
	add constraint automation_runs_unknown_count_nonnegative check (unknown_count >= 0);

grant select on public.automation_runs to service_role;

-- A provider acknowledgement can be known while CRM finalization is not. Keep
-- the frozen safe-hold state until a trusted reconciliation completes it.
create or replace function public.record_quote_send_ack(
	p_outbound_message_id uuid,
	p_provider_message_id text,
	p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
	v_provider_id text := nullif(trim(coalesce(p_provider_message_id, '')), '');
	v_error text := left(nullif(trim(coalesce(p_error, '')), ''), 1000);
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_provider_id is null then
		raise exception using errcode = '22023', message = 'Provider message ID is required';
	end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_message
	from public.outbound_messages
	where id = p_outbound_message_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Outbound message not found';
	end if;
	if v_message.provider_message_id is not null
		and v_message.provider_message_id is distinct from v_provider_id
	then
		raise exception using errcode = '55000', message = 'Outbound provider identity is immutable';
	end if;
	if v_message.delivery_status in ('submitted', 'delivered', 'bounced') then
		return jsonb_build_object(
			'outbound_message_id', v_message.id,
			'provider_message_id', v_message.provider_message_id,
			'delivery_status', v_message.delivery_status,
			'idempotent', true
		);
	end if;
	if v_message.delivery_status not in ('claimed', 'submitting', 'submission_unknown') then
		raise exception using errcode = '22023', message = 'Outbound message cannot accept a provider acknowledgement';
	end if;
	update public.outbound_messages
	set provider_message_id = v_provider_id,
		delivery_status = 'submission_unknown',
		submission_unknown_at = coalesce(submission_unknown_at, now()),
		last_error = coalesce(v_error, 'Provider accepted the message; CRM finalization requires reconciliation')
	where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'submission_unknown',
		provider_message_id = v_provider_id,
		request_finished_at = coalesce(request_finished_at, now()),
		error_message = coalesce(v_error, 'CRM finalization requires reconciliation')
	where outbound_message_id = v_message.id
		and attempt_number = greatest(v_message.attempt_count, 1);
	return jsonb_build_object(
		'outbound_message_id', v_message.id,
		'provider_message_id', v_provider_id,
		'delivery_status', 'submission_unknown',
		'reconciliation_required', true,
		'idempotent', false
	);
end;
$$;

-- Reminder preparation claims one logical message and one append-only attempt.
-- A stale claim before provider submission can be reclaimed; a stale
-- submission is uncertainty and is never silently retried.
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
	v_logical_key text := 'task-reminder:' || p_task_id::text;
	v_attempt_number integer;
	v_attempt_key text;
	v_has_message boolean := false;
	v_reclaim_claim boolean := false;
	v_error text := 'Stale reminder submission requires provider reconciliation';
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	if p_run_id is null then
		raise exception using errcode = '22023', message = 'Reminder run ID is required';
	end if;
	select greatest(1, coalesce((setting_value ->> 'reminder_claim_timeout_minutes')::integer, 15))
	into v_timeout
	from public.app_settings
	where setting_key = 'automation_rules';
	v_timeout := coalesce(v_timeout, 15);

	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then return jsonb_build_object('status', 'missing', 'task_id', p_task_id); end if;
	if v_task.status <> 'open' or v_task.due_at is null or v_task.due_at > now() then
		return jsonb_build_object('status', 'not_due', 'task_id', v_task.id);
	end if;
	if v_task.reminder_status = 'sent' and v_task.notification_sent_at is not null then
		return jsonb_build_object('status', 'sent', 'task_id', v_task.id, 'idempotent', true);
	end if;
	if v_task.reminder_status = 'submission_unknown' then
		return jsonb_build_object(
			'status', 'submission_unknown',
			'task_id', v_task.id,
			'reconciliation_required', true
		);
	end if;
	if v_task.reminder_status = 'submitting'
		and v_task.reminder_claimed_at > now() - make_interval(mins => v_timeout)
	then
		return jsonb_build_object('status', 'submitting', 'task_id', v_task.id, 'claimed', false);
	end if;
	if v_task.reminder_status = 'claimed'
		and v_task.reminder_claimed_at > now() - make_interval(mins => v_timeout)
	then
		return jsonb_build_object('status', 'claimed', 'task_id', v_task.id, 'claimed', false);
	end if;

	select * into v_message
	from public.outbound_messages
	where task_id = v_task.id and purpose = 'task_reminder'
	for update;
	v_has_message := found;
	if v_has_message and v_message.delivery_status in ('submitted', 'delivered') and v_message.provider_message_id is not null then
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
	if v_has_message and (v_message.delivery_status = 'submission_unknown' or v_task.reminder_status = 'submission_unknown') then
		return jsonb_build_object(
			'status', 'submission_unknown',
			'task_id', v_task.id,
			'outbound_message_id', v_message.id,
			'provider_message_id', v_message.provider_message_id,
			'reconciliation_required', true
		);
	end if;
	if v_task.reminder_status = 'submitting'
		or (v_has_message and v_message.delivery_status = 'submitting')
	then
		perform private.allow_outbound_attempt_mutation();
		if v_has_message then
			update public.outbound_messages
			set delivery_status = 'submission_unknown',
				submission_unknown_at = coalesce(submission_unknown_at, now()),
				last_error = v_error
			where id = v_message.id;
			update public.outbound_message_attempts
			set state = 'submission_unknown', request_finished_at = coalesce(request_finished_at, now()), error_message = v_error
			where outbound_message_id = v_message.id and attempt_number = greatest(v_message.attempt_count, 1);
		end if;
		update public.tasks
		set reminder_status = 'submission_unknown',
			reminder_claim_id = null,
			reminder_claimed_at = null,
			reminder_last_error = v_error,
			lock_version = lock_version + 1
		where id = v_task.id;
		return jsonb_build_object(
			'status', 'submission_unknown',
			'task_id', v_task.id,
			'outbound_message_id', v_message.id,
			'reconciliation_required', true
		);
	end if;

	if v_task.assigned_to is null then
		return jsonb_build_object('status', 'unassigned', 'task_id', v_task.id);
	end if;
	select * into v_profile
	from public.profiles
	where id = v_task.assigned_to and status = 'active'
	for share;
	if not found or length(trim(coalesce(v_profile.email, ''))) = 0 then
		return jsonb_build_object('status', 'unassigned', 'task_id', v_task.id);
	end if;

	perform private.allow_outbound_attempt_mutation();
	v_recipient := jsonb_build_object('email', v_profile.email, 'name', v_profile.full_name);
	if v_has_message then
		v_reclaim_claim := v_task.reminder_status = 'claimed' and v_message.delivery_status = 'claimed';
		v_attempt_number := case when v_reclaim_claim then greatest(v_message.attempt_count, 1) else v_message.attempt_count + 1 end;
		update public.outbound_messages
		set delivery_status = 'claimed',
			attempt_count = v_attempt_number,
			last_error = null,
			submission_unknown_at = null,
			recipient_snapshot = v_recipient,
			subject = format('Task due: %s', v_task.title)
		where id = v_message.id;
	else
		v_attempt_number := 1;
		insert into public.outbound_messages (
			task_id, lead_id, client_id, quote_id, channel, purpose, provider,
			recipient_snapshot, subject, logical_key, delivery_status, attempt_count
		)
		values (
			v_task.id, v_task.lead_id, v_task.client_id, v_task.quote_id, 'email', 'task_reminder', 'sendpulse',
			v_recipient, format('Task due: %s', v_task.title), v_logical_key, 'claimed', 1
		)
		returning * into v_message;
	end if;
	v_attempt_key := v_logical_key || ':attempt:' || v_attempt_number::text;
	insert into public.outbound_message_attempts (outbound_message_id, attempt_number, idempotency_key, state)
	values (v_message.id, v_attempt_number, v_attempt_key, 'claimed')
	on conflict (outbound_message_id, attempt_number) do update
	set state = 'claimed', request_started_at = now(), request_finished_at = null, error_message = null;
	update public.tasks
	set reminder_status = 'claimed',
		reminder_claim_id = p_run_id,
		reminder_claimed_at = now(),
		reminder_attempt_count = greatest(reminder_attempt_count, v_attempt_number),
		reminder_last_error = null,
		reminder_outbound_message_id = v_message.id,
		lock_version = lock_version + 1
	where id = v_task.id;
	return jsonb_build_object(
		'status', 'claimed', 'claimed', true, 'task_id', v_task.id,
		'outbound_message_id', v_message.id, 'recipient', v_recipient,
		'subject', v_message.subject, 'run_id', p_run_id,
		'attempt_number', v_attempt_number, 'idempotency_key', v_attempt_key
	);
end;
$$;

create or replace function public.start_task_reminder(p_task_id uuid, p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
	v_message public.outbound_messages%rowtype;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if v_task.reminder_status = 'submission_unknown' then
		return jsonb_build_object('status', 'submission_unknown', 'task_id', p_task_id, 'reconciliation_required', true);
	end if;
	if v_task.reminder_status = 'submitting' then
		return jsonb_build_object('status', 'submitting', 'task_id', p_task_id, 'idempotent', true);
	end if;
	if v_task.reminder_status <> 'claimed' or v_task.reminder_claim_id is distinct from p_run_id then
		raise exception using errcode = '40001', message = 'Reminder claim does not belong to this run';
	end if;
	select * into v_message from public.outbound_messages where id = v_task.reminder_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Reminder OutboundMessage not found'; end if;
	perform private.allow_outbound_attempt_mutation();
	update public.outbound_messages set delivery_status = 'submitting' where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'submitting', request_started_at = coalesce(request_started_at, now())
	where outbound_message_id = v_message.id and attempt_number = greatest(v_message.attempt_count, 1);
	update public.tasks
	set reminder_status = 'submitting', lock_version = lock_version + 1
	where id = v_task.id;
	return jsonb_build_object('status', 'submitting', 'task_id', p_task_id, 'outbound_message_id', v_message.id);
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
	v_provider_id text := nullif(trim(coalesce(p_provider_message_id, '')), '');
	v_error text := left(coalesce(nullif(trim(coalesce(p_error, '')), ''), 'Reminder provider failed'), 500);
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if v_task.reminder_status = 'sent' and v_task.notification_sent_at is not null then
		return jsonb_build_object('task_id', p_task_id, 'status', 'sent', 'idempotent', true);
	end if;
	if v_task.reminder_status = 'submission_unknown' then
		raise exception using errcode = '22023', message = 'Reminder outcome is uncertain and requires reconciliation';
	end if;
	if v_task.reminder_claim_id is distinct from p_run_id then
		raise exception using errcode = '40001', message = 'Reminder claim does not belong to this run';
	end if;
	select * into v_message from public.outbound_messages where id = v_task.reminder_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Reminder OutboundMessage not found'; end if;
	if v_provider_id is not null then
		if v_message.provider_message_id is not null and v_message.provider_message_id is distinct from v_provider_id then
			raise exception using errcode = '55000', message = 'Reminder provider identity is immutable';
		end if;
		if v_task.reminder_status not in ('claimed', 'submitting') then
			raise exception using errcode = '22023', message = 'Reminder is not awaiting provider completion';
		end if;
		update public.outbound_messages
		set delivery_status = 'submitted',
			provider_message_id = v_provider_id,
			submitted_at = coalesce(submitted_at, now()),
			last_error = null,
			submission_unknown_at = null
		where id = v_message.id;
		update public.outbound_message_attempts
		set state = 'submitted', provider_message_id = v_provider_id, request_finished_at = coalesce(request_finished_at, now()), error_message = null
		where outbound_message_id = v_message.id and attempt_number = greatest(v_message.attempt_count, 1);
		update public.tasks
		set reminder_status = 'sent', notification_sent_at = now(), reminder_claim_id = null,
			reminder_claimed_at = null, reminder_last_error = null,
			reminder_outbound_message_id = v_message.id, lock_version = lock_version + 1
		where id = v_task.id;
		if not exists (
			select 1 from public.activities
			where outbound_message_id = v_message.id and event_type = 'task_reminder_sent'
		) then
			insert into public.activities (lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary)
			values (v_task.lead_id, v_task.client_id, v_task.quote_id, v_task.id, v_message.id, null, 'task_reminder_sent', jsonb_build_object('provider_message_id', v_provider_id), 'Task reminder submitted');
		end if;
		return jsonb_build_object('task_id', p_task_id, 'status', 'sent', 'outbound_message_id', v_message.id, 'provider_message_id', v_provider_id, 'idempotent', false);
	end if;
	if v_task.reminder_status not in ('claimed', 'submitting') then
		raise exception using errcode = '22023', message = 'Reminder is not awaiting a definitive provider failure';
	end if;
	update public.outbound_messages set delivery_status = 'failed', last_error = v_error where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'failed', request_finished_at = coalesce(request_finished_at, now()), error_message = v_error
	where outbound_message_id = v_message.id and attempt_number = greatest(v_message.attempt_count, 1);
	update public.tasks
	set reminder_status = 'failed', reminder_claim_id = null, reminder_claimed_at = null,
		reminder_last_error = v_error, lock_version = lock_version + 1
	where id = v_task.id;
	if not exists (
		select 1 from public.activities
		where outbound_message_id = v_message.id and event_type = 'task_reminder_failed'
	) then
		insert into public.activities (lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary)
		values (v_task.lead_id, v_task.client_id, v_task.quote_id, v_task.id, v_message.id, null, 'task_reminder_failed', jsonb_build_object('error', v_error), 'Task reminder failed');
	end if;
	return jsonb_build_object('task_id', p_task_id, 'status', 'failed', 'outbound_message_id', v_message.id, 'idempotent', false);
end;
$$;

create or replace function public.mark_task_reminder_unknown(
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
	v_provider_id text := nullif(trim(coalesce(p_provider_message_id, '')), '');
	v_error text := left(coalesce(nullif(trim(coalesce(p_error, '')), ''), 'Reminder provider acknowledgement was lost'), 500);
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted reminder processing required';
	end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	if v_task.reminder_status = 'submission_unknown' then
		return jsonb_build_object('task_id', p_task_id, 'status', 'submission_unknown', 'idempotent', true);
	end if;
	if v_task.reminder_claim_id is distinct from p_run_id then
		raise exception using errcode = '40001', message = 'Reminder claim does not belong to this run';
	end if;
	select * into v_message from public.outbound_messages where id = v_task.reminder_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Reminder OutboundMessage not found'; end if;
	if v_provider_id is not null and v_message.provider_message_id is not null and v_message.provider_message_id is distinct from v_provider_id then
		raise exception using errcode = '55000', message = 'Reminder provider identity is immutable';
	end if;
	update public.outbound_messages
	set delivery_status = 'submission_unknown',
		provider_message_id = coalesce(provider_message_id, v_provider_id),
		submission_unknown_at = coalesce(submission_unknown_at, now()),
		last_error = v_error
	where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'submission_unknown',
		provider_message_id = coalesce(provider_message_id, v_provider_id),
		request_finished_at = coalesce(request_finished_at, now()),
		error_message = v_error
	where outbound_message_id = v_message.id and attempt_number = greatest(v_message.attempt_count, 1);
	update public.tasks
	set reminder_status = 'submission_unknown', reminder_claim_id = null, reminder_claimed_at = null,
		reminder_last_error = v_error, lock_version = lock_version + 1
	where id = v_task.id;
	if not exists (
		select 1 from public.activities
		where outbound_message_id = v_message.id and event_type = 'task_reminder_submission_unknown'
	) then
		insert into public.activities (lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary)
		values (v_task.lead_id, v_task.client_id, v_task.quote_id, v_task.id, v_message.id, null, 'task_reminder_submission_unknown', jsonb_build_object('error', v_error), 'Task reminder requires provider reconciliation');
	end if;
	return jsonb_build_object('task_id', p_task_id, 'status', 'submission_unknown', 'outbound_message_id', v_message.id, 'provider_message_id', coalesce(v_message.provider_message_id, v_provider_id), 'reconciliation_required', true, 'idempotent', false);
end;
$$;

create or replace function public.reconcile_task_reminder(p_task_id uuid, p_provider_message_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
	v_message public.outbound_messages%rowtype;
	v_provider_id text := nullif(trim(coalesce(p_provider_message_id, '')), '');
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted provider reconciliation required';
	end if;
	if v_provider_id is null then raise exception using errcode = '22023', message = 'Provider message ID is required'; end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_task from public.tasks where id = p_task_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
	select * into v_message from public.outbound_messages where id = v_task.reminder_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Reminder OutboundMessage not found'; end if;
	if v_message.provider_message_id is not null and v_message.provider_message_id is distinct from v_provider_id then
		raise exception using errcode = '55000', message = 'Reminder provider identity is immutable';
	end if;
	if v_task.reminder_status = 'sent' and v_message.delivery_status in ('submitted', 'delivered') then
		return jsonb_build_object('task_id', p_task_id, 'status', 'sent', 'provider_message_id', v_message.provider_message_id, 'idempotent', true);
	end if;
	if v_task.reminder_status <> 'submission_unknown' and v_message.delivery_status <> 'submission_unknown' then
		raise exception using errcode = '22023', message = 'Only an uncertain reminder can be reconciled';
	end if;
	update public.outbound_messages
	set delivery_status = 'submitted', provider_message_id = v_provider_id,
		submitted_at = coalesce(submitted_at, now()), submission_unknown_at = null, last_error = null
	where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'submitted', provider_message_id = v_provider_id,
		request_finished_at = coalesce(request_finished_at, now()), error_message = null
	where outbound_message_id = v_message.id and attempt_number = greatest(v_message.attempt_count, 1);
	if v_task.status = 'open' then
		update public.tasks
		set reminder_status = 'sent', notification_sent_at = coalesce(notification_sent_at, now()),
			reminder_claim_id = null, reminder_claimed_at = null, reminder_last_error = null,
			lock_version = lock_version + 1
		where id = v_task.id;
		if not exists (
			select 1 from public.activities
			where outbound_message_id = v_message.id and event_type = 'task_reminder_sent'
		) then
			insert into public.activities (lead_id, client_id, quote_id, task_id, outbound_message_id, actor_id, event_type, metadata, summary)
			values (v_task.lead_id, v_task.client_id, v_task.quote_id, v_task.id, v_message.id, null, 'task_reminder_sent', jsonb_build_object('provider_message_id', v_provider_id, 'reconciled', true), 'Task reminder reconciled as submitted');
		end if;
	end if;
	return jsonb_build_object('task_id', p_task_id, 'status', 'sent', 'outbound_message_id', v_message.id, 'provider_message_id', v_provider_id, 'idempotent', false);
end;
$$;

-- Keep the existing aging/expiry work, but never select uncertainty for an
-- automatic provider attempt. `claimed` can be recovered; `submitting` is
-- converted to uncertainty by prepare_task_reminder.
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
	if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'Trusted reminder processing required'; end if;
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
		order by l.created_at limit v_batch
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
		order by coalesce(l.last_activity_at, l.created_at) limit v_batch
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
			where q.status = 'sent' and q.valid_until <= current_date for update of q
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
			and t.reminder_status in ('pending', 'failed', 'claimed', 'submitting')
		order by t.due_at, t.created_at limit v_batch
	loop
		v_claim := public.prepare_task_reminder(v_task.id, p_run_id);
		if v_claim ->> 'status' = 'claimed' and coalesce((v_claim ->> 'claimed')::boolean, false) then
			v_claims := v_claims || jsonb_build_array(v_claim);
		end if;
	end loop;
	return jsonb_build_object('run_id', p_run_id, 'created_tasks', v_created_tasks, 'expired_quotes', v_expired_quotes, 'claims', v_claims);
end;
$$;

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
	select coalesce(jsonb_agg(jsonb_build_object('severity', event.severity, 'source', event.source, 'event_type', event.event_type, 'message', event.message, 'occurred_at', event.occurred_at) order by event.occurred_at desc), '[]'::jsonb)
	into v_recent_errors
	from (select severity, source, event_type, message, occurred_at from public.operational_events where severity in ('error', 'critical') order by occurred_at desc limit 20) event;
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
			'failed_outbound_total', (select count(*) from public.outbound_messages where provider = 'sendpulse' and delivery_status = 'failed'),
			'submission_unknown_total', (select count(*) from public.outbound_messages where provider = 'sendpulse' and delivery_status = 'submission_unknown'),
			'stale_submitting_total', (select count(*) from public.outbound_messages where provider = 'sendpulse' and delivery_status = 'submitting' and updated_at < now() - interval '15 minutes')
		),
		'reminders', jsonb_build_object(
			'last_run_at', (select max(started_at) from public.automation_runs),
			'last_run_status', (select status from public.automation_runs order by started_at desc limit 1),
			'failed_last_24h', (select count(*) from public.automation_runs where status = 'failed' and started_at >= now() - interval '24 hours'),
			'partial_runs_last_24h', (select count(*) from public.automation_runs where status = 'partial_failure' and started_at >= now() - interval '24 hours'),
			'failed_tasks_last_24h', (select count(*) from public.tasks where reminder_status = 'failed' and updated_at >= now() - interval '24 hours'),
			'submission_unknown_tasks', (select count(*) from public.tasks where reminder_status = 'submission_unknown'),
			'stale_submitting_tasks', (select count(*) from public.tasks where reminder_status = 'submitting' and reminder_claimed_at < now() - interval '15 minutes'),
			'latest_run_error', (select left(error_message, 500) from public.automation_runs where error_message is not null order by started_at desc limit 1)
		),
		'critical_errors', v_recent_errors
	);
end;
$$;

revoke all on function public.record_quote_send_ack(uuid, text, text) from public, anon;
grant execute on function public.record_quote_send_ack(uuid, text, text) to authenticated, service_role;
revoke all on function public.start_task_reminder(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_task_reminder(uuid, uuid) to service_role;
revoke all on function public.prepare_task_reminder(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_task_reminder(uuid, uuid) to service_role;
revoke all on function public.record_task_reminder(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_task_reminder(uuid, uuid, text, text) to service_role;
revoke all on function public.mark_task_reminder_unknown(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_task_reminder_unknown(uuid, uuid, text, text) to service_role;
revoke all on function public.reconcile_task_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.reconcile_task_reminder(uuid, text) to service_role;
revoke all on function public.process_reminders(uuid, integer) from public, anon, authenticated;
grant execute on function public.process_reminders(uuid, integer) to service_role;
revoke all on function public.operational_diagnostics() from public, anon;
grant execute on function public.operational_diagnostics() to authenticated;

commit;
