begin;

-- v1.3.1 is a forward correction. Historical migrations remain preserved so a
-- client can reproduce the old baseline before applying this authority delta.

-- Attention is responsibility only. Pause and follow-up are separate facts.
alter table public.leads
	add column if not exists paused_at timestamptz,
	add column if not exists pause_reason text,
	add column if not exists resume_at timestamptz,
	add column if not exists phone_normalized text;

update public.leads
set paused_at = coalesce(paused_at, now()),
	pause_reason = coalesce(nullif(trim(pause_reason), ''), nullif(trim(attention_reason), ''), 'Legacy pause'),
	resume_at = coalesce(resume_at, attention_resume_at),
	attention_state = 'none',
	attention_reason = null,
	attention_resume_at = null
where attention_state = 'paused';

update public.leads
set attention_state = 'none'
where attention_state = 'follow_up_scheduled';

alter table public.leads
	drop constraint if exists leads_attention_state_check,
	drop constraint if exists leads_attention_pause_matches_state,
	add constraint leads_attention_state_check check (
		attention_state in ('none', 'waiting_on_client', 'waiting_on_us')
	),
	add constraint leads_pause_contract check (
		(
			paused_at is null
			and pause_reason is null
			and resume_at is null
		)
		or (
			paused_at is not null
			and length(trim(coalesce(pause_reason, ''))) > 0
		)
	);

create or replace function private.normalize_phone_e164(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
	select case
		when p_phone is null then null
		when regexp_replace(trim(p_phone), '[[:space:]().-]', '', 'g') ~ '^\+[1-9][0-9]{7,14}$'
			then regexp_replace(trim(p_phone), '[[:space:]().-]', '', 'g')
		else null
	end;
$$;

alter table public.clients add column if not exists phone_normalized text;
alter table public.client_contacts add column if not exists phone_normalized text;

update public.leads set phone_normalized = private.normalize_phone_e164(phone);
update public.clients set phone_normalized = private.normalize_phone_e164(phone);
update public.client_contacts set phone_normalized = private.normalize_phone_e164(phone);

create or replace function private.sync_phone_normalized()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
	new.phone_normalized = private.normalize_phone_e164(new.phone);
	return new;
end;
$$;

drop trigger if exists leads_phone_normalized on public.leads;
create trigger leads_phone_normalized
before insert or update of phone on public.leads
for each row execute function private.sync_phone_normalized();

drop trigger if exists clients_phone_normalized on public.clients;
create trigger clients_phone_normalized
before insert or update of phone on public.clients
for each row execute function private.sync_phone_normalized();

drop trigger if exists client_contacts_phone_normalized on public.client_contacts;
create trigger client_contacts_phone_normalized
before insert or update of phone on public.client_contacts
for each row execute function private.sync_phone_normalized();

create index if not exists leads_phone_normalized_idx on public.leads (phone_normalized)
where phone_normalized is not null;
create index if not exists clients_phone_normalized_idx on public.clients (phone_normalized)
where phone_normalized is not null;
create index if not exists client_contacts_phone_normalized_idx on public.client_contacts (phone_normalized)
where phone_normalized is not null;

-- Freeze the v1 two-decimal money boundary without losing the existing values.
drop view if exists public.dashboard_quote_facts;
drop view if exists public.dashboard_lead_facts;
alter table public.quote_items
	alter column quantity type numeric(12, 4) using quantity::numeric(12, 4),
	alter column unit_price type numeric(19, 4) using unit_price::numeric(19, 4),
	alter column line_subtotal type numeric(19, 2) using line_subtotal::numeric(19, 2);
alter table public.quotes
	alter column tax_rate type numeric(9, 6) using tax_rate::numeric(9, 6),
	alter column subtotal type numeric(19, 2) using subtotal::numeric(19, 2),
	alter column tax_amount type numeric(19, 2) using tax_amount::numeric(19, 2),
	alter column total type numeric(19, 2) using total::numeric(19, 2);

alter table public.quotes
	add column if not exists accepted_by uuid references public.profiles (id) on delete set null,
	add column if not exists acceptance_source text,
	add column if not exists acceptance_evidence text,
	add column if not exists document_template_version text,
	add column if not exists document_generator_version text;

alter table public.quotes
	drop constraint if exists quotes_acceptance_contract,
	add constraint quotes_acceptance_contract check (
		status <> 'accepted'
		or (
			accepted_at is not null
			and length(trim(coalesce(acceptance_source, ''))) > 0
		)
	);

create or replace function private.quote_line_subtotal(p_quantity numeric, p_unit_price numeric)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
	select round(p_quantity * p_unit_price, 2)::numeric(19, 2);
$$;

create or replace function private.quote_totals(p_quote_id uuid, p_tax_rate numeric)
returns table(subtotal numeric, tax_amount numeric, total numeric)
language sql
stable
set search_path = pg_catalog, public
as $$
	with sums as (
		select
			coalesce(sum(line_subtotal), 0)::numeric(19, 2) as subtotal,
			coalesce(sum(case when taxable then line_subtotal else 0 end), 0)::numeric(19, 2) as taxable_subtotal
		from public.quote_items
		where quote_id = p_quote_id
	)
	select
		subtotal,
		round(taxable_subtotal * p_tax_rate / 100, 2)::numeric(19, 2),
		subtotal + round(taxable_subtotal * p_tax_rate / 100, 2)::numeric(19, 2)
	from sums;
$$;

-- Outbound messages distinguish a logical message from its attempts and make a
-- lost provider acknowledgement explicit instead of falsely recording failure.
alter table public.outbound_messages
	add column if not exists logical_key text,
	add column if not exists submission_unknown_at timestamptz;

update public.outbound_messages
set delivery_status = 'submitting'
where delivery_status = 'sending';

update public.outbound_messages
set logical_key = case
	when quote_id is not null then 'quote:' || quote_id::text
	when task_id is not null then 'task:' || task_id::text || ':' || purpose
	else 'message:' || id::text
end
where logical_key is null;

alter table public.outbound_messages
	drop constraint if exists outbound_messages_delivery_status_check,
	add constraint outbound_messages_delivery_status_check check (
		delivery_status in (
			'pending', 'claimed', 'submitting', 'submitted', 'delivered',
			'bounced', 'failed', 'submission_unknown'
		)
	),
	add constraint outbound_messages_logical_key_present check (length(trim(logical_key)) > 0);

alter table public.outbound_messages alter column logical_key set not null;
create unique index if not exists outbound_messages_logical_key_unique
on public.outbound_messages (logical_key);

-- Older task-reminder actions remain in the historical migration chain. This
-- boundary normalizes their legacy `sending` status and supplies the same
-- logical idempotency key required by the v1.3.1 outbound contract.
create or replace function private.normalize_outbound_message_contract()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	new.id := coalesce(new.id, gen_random_uuid());
	new.logical_key := coalesce(
		new.logical_key,
		case when tg_op = 'UPDATE' then old.logical_key end,
		case
			when new.task_id is not null then 'task-reminder:' || new.task_id::text
			when new.quote_id is not null then 'quote:' || new.quote_id::text
			else 'message:' || new.id::text
		end
	);
	if new.delivery_status = 'sending' then new.delivery_status := 'submitting'; end if;
	return new;
end;
$$;

drop trigger if exists outbound_message_contract_normalize on public.outbound_messages;
create trigger outbound_message_contract_normalize
before insert or update on public.outbound_messages
for each row execute function private.normalize_outbound_message_contract();

create table if not exists public.outbound_message_attempts (
	id uuid primary key default gen_random_uuid(),
	outbound_message_id uuid not null references public.outbound_messages (id) on delete cascade,
	attempt_number integer not null check (attempt_number > 0),
	idempotency_key text not null unique,
	state text not null check (state in ('claimed', 'submitting', 'submitted', 'bounced', 'failed', 'submission_unknown')),
	provider_message_id text,
	request_started_at timestamptz not null default now(),
	request_finished_at timestamptz,
	error_message text,
	created_at timestamptz not null default now(),
	unique (outbound_message_id, attempt_number)
);

alter table public.outbound_message_attempts enable row level security;
revoke all on table public.outbound_message_attempts from public, anon, authenticated;

create or replace function private.prevent_outbound_attempt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin')
		or current_setting('zephyr.trusted_attempt_mutation', true) = 'on'
	then
		return new;
	end if;
	raise exception using errcode = '55000', message = 'Outbound attempts are append-only';
end;
$$;

create or replace function private.allow_outbound_attempt_mutation()
returns void
language sql
security definer
set search_path = pg_catalog
as $$
	select set_config('zephyr.trusted_attempt_mutation', 'on', true);
$$;

drop trigger if exists outbound_attempts_append_only on public.outbound_message_attempts;
create trigger outbound_attempts_append_only
before update or delete on public.outbound_message_attempts
for each row execute function private.prevent_outbound_attempt_mutation();

create index if not exists outbound_message_attempts_message_idx
on public.outbound_message_attempts (outbound_message_id, attempt_number desc);

-- Privileged evidence is separate from ordinary business Activity.
create table if not exists public.security_audit_events (
	id uuid primary key default gen_random_uuid(),
	actor_id uuid references public.profiles (id) on delete set null,
	action text not null check (length(trim(action)) > 0),
	target_type text not null check (length(trim(target_type)) > 0),
	target_id text,
	occurred_at timestamptz not null default now(),
	metadata jsonb not null default '{}'::jsonb
);

alter table public.security_audit_events enable row level security;
revoke all on table public.security_audit_events from public, anon, authenticated;
grant select on table public.security_audit_events to authenticated;
create policy security_audit_owner_admin_read
on public.security_audit_events for select to authenticated
using ((select private.has_any_role(array['owner', 'admin']::text[])));

create or replace function private.current_session_aal2()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
	select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

create or replace function private.require_current_session_aal2()
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
	if not private.current_session_aal2() then
		raise exception using errcode = '42501', message = 'Current session AAL2 is required';
	end if;
end;
$$;

create or replace function private.record_security_audit(
	p_action text,
	p_target_type text,
	p_target_id text,
	p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
	insert into public.security_audit_events (actor_id, action, target_type, target_id, metadata)
	values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Generic Data API writes cannot mutate trusted fields. Trusted actions are
-- SECURITY DEFINER and still perform their own role/status/domain checks.
create or replace function private.guard_lead_protected_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
	if new.pipeline_stage is distinct from old.pipeline_stage
		or new.attention_state is distinct from old.attention_state
		or new.assigned_to is distinct from old.assigned_to
		or new.lost_reason_id is distinct from old.lost_reason_id
		or new.lost_notes is distinct from old.lost_notes
		or new.converted_client_id is distinct from old.converted_client_id
		or new.lock_version is distinct from old.lock_version
		or new.paused_at is distinct from old.paused_at
		or new.pause_reason is distinct from old.pause_reason
		or new.resume_at is distinct from old.resume_at
		or new.phone_normalized is distinct from old.phone_normalized then
		raise exception using errcode = '42501', message = 'Lead protected fields require a trusted action';
	end if;
	return new;
end;
$$;

create or replace function private.guard_quote_protected_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
	if new.lead_id is distinct from old.lead_id
		or new.client_id is distinct from old.client_id
		or new.status is distinct from old.status
		or new.revision_number is distinct from old.revision_number
		or new.base_quote_number is distinct from old.base_quote_number
		or new.tax_rate is distinct from old.tax_rate
		or new.subtotal is distinct from old.subtotal
		or new.tax_amount is distinct from old.tax_amount
		or new.total is distinct from old.total
		or new.quote_snapshot is distinct from old.quote_snapshot
		or new.supersedes_quote_id is distinct from old.supersedes_quote_id
		or new.document_path is distinct from old.document_path
		or new.document_hash is distinct from old.document_hash
		or new.document_template_version is distinct from old.document_template_version
		or new.document_generator_version is distinct from old.document_generator_version
		or new.lock_version is distinct from old.lock_version
		or new.accepted_at is distinct from old.accepted_at
		or new.accepted_by is distinct from old.accepted_by
		or new.acceptance_source is distinct from old.acceptance_source
		or new.acceptance_evidence is distinct from old.acceptance_evidence then
		raise exception using errcode = '42501', message = 'Quote protected fields require a trusted action';
	end if;
	return new;
end;
$$;

create or replace function private.guard_outbound_message_protected_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
	if new.logical_key is distinct from old.logical_key
		or new.provider_message_id is distinct from old.provider_message_id
		or new.delivery_status is distinct from old.delivery_status
		or new.attempt_count is distinct from old.attempt_count
		or new.submitted_at is distinct from old.submitted_at
		or new.delivered_at is distinct from old.delivered_at
		or new.bounced_at is distinct from old.bounced_at
		or new.submission_unknown_at is distinct from old.submission_unknown_at
		or new.recipient_snapshot is distinct from old.recipient_snapshot
		or new.quote_id is distinct from old.quote_id
		or new.lead_id is distinct from old.lead_id then
		raise exception using errcode = '42501', message = 'Outbound protected fields require a trusted action';
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
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
	if new.status is distinct from old.status
		or new.lock_version is distinct from old.lock_version
		or new.reminder_status is distinct from old.reminder_status
		or new.reminder_claim_id is distinct from old.reminder_claim_id
		or new.reminder_outbound_message_id is distinct from old.reminder_outbound_message_id
		or new.created_by is distinct from old.created_by
		or new.lead_id is distinct from old.lead_id
		or new.client_id is distinct from old.client_id
		or new.quote_id is distinct from old.quote_id then
		raise exception using errcode = '42501', message = 'Task protected fields require a trusted action';
	end if;
	return new;
end;
$$;

drop trigger if exists leads_protected_fields on public.leads;
create trigger leads_protected_fields
before update on public.leads
for each row execute function private.guard_lead_protected_fields();

drop trigger if exists quotes_protected_fields on public.quotes;
create trigger quotes_protected_fields
before update on public.quotes
for each row execute function private.guard_quote_protected_fields();

drop trigger if exists outbound_messages_protected_fields on public.outbound_messages;
create trigger outbound_messages_protected_fields
before update on public.outbound_messages
for each row execute function private.guard_outbound_message_protected_fields();

drop trigger if exists tasks_protected_fields on public.tasks;
create trigger tasks_protected_fields
before update on public.tasks
for each row execute function private.guard_task_protected_fields();

-- Profile role/status and configuration changes are trusted actions, not generic
-- browser CRUD. Existing full-name/email maintenance remains available under RLS.
create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	actor_role text;
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
	if new.id is distinct from old.id or new.email is distinct from old.email then
		raise exception using errcode = '42501', message = 'Profile identity fields are Auth-managed';
	end if;
	actor_role = private.current_user_role();
	if actor_role is null then
		raise exception using errcode = '42501', message = 'An active profile is required';
	end if;
	if new.role is distinct from old.role or new.status is distinct from old.status then
		raise exception using errcode = '42501', message = 'Role and status require the trusted profile action';
	end if;
	return new;
end;
$$;

create or replace function private.protect_app_setting_privileges()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return coalesce(new, old); end if;
	raise exception using errcode = '42501', message = 'AppSetting changes require the trusted configuration action';
end;
$$;

drop trigger if exists app_settings_privilege_protection on public.app_settings;
create trigger app_settings_privilege_protection
before insert or update or delete on public.app_settings
for each row execute function private.protect_app_setting_privileges();

create or replace function public.set_profile_access(
	p_user_id uuid,
	p_role text,
	p_status text,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_profile public.profiles%rowtype;
begin
	if not (select private.has_any_role(array['owner']::text[])) then
		raise exception using errcode = '42501', message = 'Owner role required';
	end if;
	perform private.require_current_session_aal2();
	if p_role not in ('owner', 'admin', 'sales', 'viewer') then
		raise exception using errcode = '22023', message = 'Invalid profile role';
	end if;
	if p_status not in ('invited', 'active', 'suspended') then
		raise exception using errcode = '22023', message = 'Invalid profile status';
	end if;
	select * into v_profile from public.profiles where id = p_user_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Profile not found'; end if;
	update public.profiles set role = p_role, status = p_status where id = p_user_id;
	perform private.record_security_audit(
		'profile_access_changed', 'profile', p_user_id::text,
		jsonb_build_object('from_role', v_profile.role, 'to_role', p_role, 'from_status', v_profile.status, 'to_status', p_status, 'reason', nullif(trim(p_reason), ''))
	);
	return jsonb_build_object('profile_id', p_user_id, 'role', p_role, 'status', p_status);
end;
$$;

create or replace function public.set_app_setting(
	p_setting_key text,
	p_setting_value jsonb,
	p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
	if not (select private.has_any_role(array['owner', 'admin']::text[])) then
		raise exception using errcode = '42501', message = 'Owner or admin role required';
	end if;
	perform private.require_current_session_aal2();
	if p_setting_key is null or p_setting_key !~ '^[a-z][a-z0-9_]*$' then
		raise exception using errcode = '22023', message = 'Setting key is invalid';
	end if;
	insert into public.app_settings (setting_key, setting_value, description, updated_by)
	values (p_setting_key, coalesce(p_setting_value, '{}'::jsonb), nullif(trim(p_description), ''), auth.uid())
	on conflict (setting_key) do update set setting_value = excluded.setting_value, description = excluded.description, updated_by = auth.uid();
	perform private.record_security_audit('app_setting_changed', 'app_setting', p_setting_key, '{}'::jsonb);
	return jsonb_build_object('setting_key', p_setting_key, 'updated', true);
end;
$$;

-- Existing cross-resource actions are trusted boundaries. They retain their
-- internal role/status/domain checks while allowing protected-field triggers to
-- distinguish them from generic Data API writes.
alter function public.set_lead_attention(uuid, text, text, timestamptz, bigint) security definer;
alter function public.assign_lead(uuid, uuid, bigint) security definer;
alter function public.reopen_lead(uuid, bigint, text) security definer;
alter function public.transition_lead(uuid, text, bigint, uuid, text) security definer;
alter function public.convert_lead(uuid, bigint) security definer;
alter function public.complete_task(uuid, bigint) security definer;
alter function public.reschedule_task(uuid, bigint, timestamptz) security definer;
alter function public.cancel_task(uuid, bigint) security definer;

create or replace function public.reopen_lead(
	p_lead_id uuid,
	p_lock_version bigint,
	p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_reason text := nullif(trim(coalesce(p_reason, '')), '');
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin']::text[])) then
		raise exception using errcode = '42501', message = 'Owner or admin role required';
	end if;
	perform private.require_current_session_aal2();
	if v_reason is null then raise exception using errcode = '22023', message = 'A reopen reason is required'; end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_lead.pipeline_stage <> 'LOST' then raise exception using errcode = '22023', message = 'Only lost leads can be reopened'; end if;
	if p_lock_version is distinct from v_lead.lock_version then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	update public.leads
	set pipeline_stage = 'QUALIFICATION', attention_state = 'none', attention_reason = null,
		attention_resume_at = null, paused_at = null, pause_reason = null, resume_at = null,
		lost_reason_id = null, lost_notes = null, last_activity_at = now(), lock_version = lock_version + 1
	where id = p_lead_id and lock_version = p_lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (p_lead_id, auth.uid(), 'lead_reopened', jsonb_build_object('from_stage', 'LOST', 'to_stage', 'QUALIFICATION', 'reason', v_reason), 'Lead reopened for qualification');
	perform private.record_security_audit('lead_reopened', 'lead', p_lead_id::text, jsonb_build_object('reason', v_reason));
	return jsonb_build_object('lead_id', p_lead_id, 'pipeline_stage', 'QUALIFICATION', 'lock_version', v_new_lock);
end;
$$;

-- The new pause action stores pause facts without changing attention_state.
create or replace function public.set_lead_attention(
	p_lead_id uuid,
	p_attention_state text,
	p_reason text default null,
	p_resume_at timestamptz default null,
	p_lock_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_new_lock bigint;
	v_paused_at timestamptz;
	v_pause_reason text;
	actor uuid := auth.uid();
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_attention_state not in ('none', 'waiting_on_client', 'waiting_on_us') then
		raise exception using errcode = '22023', message = 'Invalid lead attention state';
	end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if p_lock_version is not null and p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;
	if v_lead.pipeline_stage in ('WON', 'LOST') and p_attention_state <> 'none' then
		raise exception using errcode = '22023', message = 'Terminal leads cannot require attention';
	end if;
	v_paused_at := v_lead.paused_at;
	v_pause_reason := v_lead.pause_reason;
	update public.leads
	set attention_state = p_attention_state,
		last_activity_at = now(), lock_version = lock_version + 1
	where id = p_lead_id and (p_lock_version is null or lock_version = p_lock_version)
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (p_lead_id, actor, 'attention_changed', jsonb_build_object('from_state', v_lead.attention_state, 'to_state', p_attention_state, 'reason', nullif(trim(p_reason), ''), 'paused_at', v_paused_at, 'pause_reason', v_pause_reason, 'resume_at', p_resume_at), format('Lead attention set to %s', p_attention_state));
	return jsonb_build_object('lead_id', p_lead_id, 'attention_state', p_attention_state, 'paused_at', v_paused_at, 'pause_reason', v_pause_reason, 'resume_at', p_resume_at, 'lock_version', v_new_lock);
end;
$$;

create or replace function public.pause_lead(
	p_lead_id uuid,
	p_reason text,
	p_resume_at timestamptz default null,
	p_lock_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_reason text := nullif(trim(coalesce(p_reason, '')), '');
	v_lead public.leads%rowtype;
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	if v_reason is null then raise exception using errcode = '22023', message = 'Pause reason is required'; end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if p_lock_version is not null and p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;
	update public.leads
	set paused_at = now(), pause_reason = v_reason, resume_at = p_resume_at, last_activity_at = now(), lock_version = lock_version + 1
	where id = p_lead_id and (p_lock_version is null or lock_version = p_lock_version) and pipeline_stage not in ('WON', 'LOST')
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale or terminal lead'; end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id, auth.uid(), 'lead_paused',
		jsonb_build_object('attention_state', v_lead.attention_state, 'pause_reason', v_reason, 'resume_at', p_resume_at),
		'Lead paused'
	);
	return jsonb_build_object('lead_id', p_lead_id, 'paused_at', now(), 'pause_reason', v_reason, 'resume_at', p_resume_at, 'lock_version', v_new_lock);
end;
$$;

create or replace function public.resume_lead(p_lead_id uuid, p_lock_version bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if p_lock_version is not null and p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;
	update public.leads set paused_at = null, pause_reason = null, resume_at = null, last_activity_at = now(), lock_version = lock_version + 1
	where id = p_lead_id and (p_lock_version is null or lock_version = p_lock_version)
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id, auth.uid(), 'lead_resumed',
		jsonb_build_object('attention_state', v_lead.attention_state, 'previous_pause_reason', v_lead.pause_reason),
		'Lead resumed'
	);
	return jsonb_build_object('lead_id', p_lead_id, 'paused_at', null, 'pause_reason', null, 'resume_at', null, 'lock_version', v_new_lock);
end;
$$;

-- Quote send preparation uses one logical key and appends an attempt claim.
create or replace function public.prepare_quote_send(p_quote_id uuid, p_lock_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_existing public.outbound_messages%rowtype;
	v_message_id uuid;
	v_attempt_id uuid;
	v_attempt_key text;
	v_recipient jsonb;
	v_attempt_number integer;
	v_logical_key text := 'quote:' || p_quote_id::text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_quote.status <> 'ready' then raise exception using errcode = '22023', message = 'Only a ready Quote can be sent'; end if;
	if v_quote.valid_until is null or v_quote.valid_until < current_date then raise exception using errcode = '22023', message = 'Quote validity has expired'; end if;
	select * into v_lead from public.leads where id = v_quote.lead_id for update;
	if not found or length(trim(coalesce(v_lead.email, ''))) = 0 then raise exception using errcode = '23514', message = 'A lead email is required before sending a Quote'; end if;
	v_recipient := jsonb_build_object('email', v_lead.email, 'name', trim(concat_ws(' ', v_lead.first_name, v_lead.last_name)));
	select * into v_existing from public.outbound_messages where logical_key = v_logical_key for update;
	if found then
		if v_existing.provider_message_id is not null and v_existing.delivery_status in ('submitted', 'delivered') then
			return jsonb_build_object('already_submitted', true, 'outbound_message_id', v_existing.id, 'provider_message_id', v_existing.provider_message_id, 'delivery_status', v_existing.delivery_status);
		end if;
		if v_existing.delivery_status in ('claimed', 'submitting') then
			return jsonb_build_object('in_flight', true, 'outbound_message_id', v_existing.id, 'delivery_status', v_existing.delivery_status);
		end if;
		if v_existing.delivery_status = 'submission_unknown' then
			return jsonb_build_object('submission_unknown', true, 'outbound_message_id', v_existing.id, 'delivery_status', v_existing.delivery_status, 'logical_key', v_existing.logical_key);
		end if;
		if v_existing.delivery_status = 'bounced' then raise exception using errcode = '22023', message = 'A bounced Quote email requires recipient remediation before retry'; end if;
		v_attempt_number := v_existing.attempt_count + 1;
		update public.outbound_messages set delivery_status = 'claimed', attempt_count = v_attempt_number, last_error = null, submission_unknown_at = null where id = v_existing.id returning id into v_message_id;
	else
		v_attempt_number := 1;
		insert into public.outbound_messages (lead_id, quote_id, channel, purpose, provider, recipient_snapshot, subject, logical_key, delivery_status, attempt_count)
		values (v_lead.id, v_quote.id, 'email', 'quote', 'sendpulse', v_recipient, v_quote.subject, v_logical_key, 'claimed', 1)
		returning id into v_message_id;
	end if;
	v_attempt_key := v_logical_key || ':attempt:' || v_attempt_number::text;
	insert into public.outbound_message_attempts (outbound_message_id, attempt_number, idempotency_key, state)
	values (v_message_id, v_attempt_number, v_attempt_key, 'claimed')
	returning id into v_attempt_id;
	update public.outbound_messages set delivery_status = 'submitting' where id = v_message_id;
	return jsonb_build_object('already_submitted', false, 'in_flight', false, 'retry', v_attempt_number > 1, 'outbound_message_id', v_message_id, 'attempt_id', v_attempt_id, 'idempotency_key', v_attempt_key, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'subject', v_quote.subject, 'total', v_quote.total, 'recipient', v_recipient);
end;
$$;

create or replace function public.fail_quote_send(p_outbound_message_id uuid, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_message public.outbound_messages%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_message from public.outbound_messages where id = p_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Outbound message not found'; end if;
	if v_message.delivery_status in ('submitted', 'delivered', 'bounced') then return jsonb_build_object('outbound_message_id', v_message.id, 'delivery_status', v_message.delivery_status, 'idempotent', true); end if;
	if v_message.delivery_status not in ('claimed', 'submitting') then raise exception using errcode = '22023', message = 'Outbound message is not in a failed-send state'; end if;
	update public.outbound_messages set delivery_status = 'failed', last_error = left(coalesce(nullif(trim(p_error), ''), 'Provider error'), 1000) where id = v_message.id;
	update public.outbound_message_attempts set state = 'failed', request_finished_at = now(), error_message = left(coalesce(nullif(trim(p_error), ''), 'Provider error'), 1000) where outbound_message_id = v_message.id and attempt_number = v_message.attempt_count;
	return jsonb_build_object('outbound_message_id', v_message.id, 'delivery_status', 'failed', 'idempotent', false);
end;
$$;

create or replace function public.mark_quote_send_unknown(p_outbound_message_id uuid, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_message public.outbound_messages%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_message from public.outbound_messages where id = p_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Outbound message not found'; end if;
	if v_message.delivery_status in ('submitted', 'delivered', 'bounced') then return jsonb_build_object('outbound_message_id', v_message.id, 'delivery_status', v_message.delivery_status, 'idempotent', true); end if;
	update public.outbound_messages set delivery_status = 'submission_unknown', submission_unknown_at = now(), last_error = left(coalesce(nullif(trim(p_error), ''), 'Provider acknowledgement was lost'), 1000) where id = v_message.id;
	update public.outbound_message_attempts set state = 'submission_unknown', request_finished_at = now(), error_message = left(coalesce(nullif(trim(p_error), ''), 'Provider acknowledgement was lost'), 1000) where outbound_message_id = v_message.id and attempt_number = v_message.attempt_count;
	return jsonb_build_object('outbound_message_id', v_message.id, 'delivery_status', 'submission_unknown', 'idempotent', false);
end;
$$;

-- Replace the historical quote-send completion function with the v1.3.1
-- submitting/submission-unknown contract. Provider acknowledgement completes a
-- Quote only through this trusted boundary; webhook evidence never accepts or
-- wins a commercial record.
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
	v_actor uuid;
	v_automation_key text;
	v_pipeline_changed boolean := false;
begin
	if auth.role() <> 'service_role'
		and not (select private.has_any_role(array['owner', 'admin', 'sales']::text[]))
	then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	perform private.allow_outbound_attempt_mutation();
	if length(trim(coalesce(p_provider_message_id, ''))) = 0 then
		raise exception using errcode = '22023', message = 'Provider message ID is required';
	end if;
	select * into v_message
	from public.outbound_messages
	where id = p_outbound_message_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Outbound message not found';
	end if;
	if v_message.provider_message_id is not null
		and v_message.provider_message_id is distinct from trim(p_provider_message_id)
	then
		raise exception using errcode = '55000', message = 'Outbound provider identity is immutable';
	end if;
	select * into v_quote
	from public.quotes
	where id = v_message.quote_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Quote not found for outbound message';
	end if;
	if v_message.provider_message_id is not null
		and v_message.delivery_status in ('submitted', 'delivered', 'bounced')
		and v_quote.status <> 'ready'
	then
		select * into v_task
		from public.tasks
		where automation_key = 'quote-follow-up:' || v_quote.id::text
		for update;
		return jsonb_build_object(
			'outbound_message_id', v_message.id,
			'provider_message_id', v_message.provider_message_id,
			'task_id', v_task.id,
			'idempotent', true
		);
	end if;
	if v_message.delivery_status not in ('claimed', 'submitting', 'submitted', 'delivered', 'submission_unknown') then
		raise exception using errcode = '22023', message = 'Outbound message is not awaiting provider completion';
	end if;
	select * into v_lead
	from public.leads
	where id = v_message.lead_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found for outbound message';
	end if;
	if v_quote.status <> 'ready' then
		raise exception using errcode = '22023', message = 'Quote is no longer ready to send';
	end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then
		raise exception using errcode = '22023', message = 'Lead is not in a sendable stage';
	end if;
	select id into v_default_owner
	from public.profiles
	where status = 'active' and role in ('owner', 'admin', 'sales')
	order by case role when 'owner' then 1 when 'admin' then 2 else 3 end, created_at
	limit 1;
	v_actor := coalesce(auth.uid(), v_lead.assigned_to, v_default_owner);
	if v_actor is null then
		raise exception using errcode = '23514', message = 'An active CRM actor is required to create the follow-up Task';
	end if;
	update public.outbound_messages
	set delivery_status = 'submitted',
		provider_message_id = trim(p_provider_message_id),
		submitted_at = coalesce(submitted_at, now()),
		submission_unknown_at = null
	where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'submitted',
		provider_message_id = trim(p_provider_message_id),
		request_finished_at = coalesce(request_finished_at, now())
	where outbound_message_id = v_message.id
		and attempt_number = greatest(v_message.attempt_count, 1);
	update public.quotes
	set status = 'sent', sent_at = coalesce(sent_at, now()), lock_version = lock_version + 1
	where id = v_quote.id and status = 'ready';
	if v_quote.supersedes_quote_id is not null then
		update public.quotes
		set status = 'superseded', lock_version = lock_version + 1
		where id = v_quote.supersedes_quote_id and status = 'sent';
	end if;
	v_pipeline_changed := v_lead.pipeline_stage <> 'DECISION';
	update public.leads
	set pipeline_stage = 'DECISION',
		attention_state = 'waiting_on_client',
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id;
	insert into public.activities (
		lead_id, quote_id, outbound_message_id, actor_id, event_type, metadata, summary
	)
	values (
		v_lead.id, v_quote.id, v_message.id, v_actor, 'quote_sent',
		jsonb_build_object('provider', 'sendpulse', 'provider_message_id', trim(p_provider_message_id)),
		'Quote submitted through SendPulse'
	);
	if v_pipeline_changed then
		insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
		values (
			v_lead.id, v_actor,
			'pipeline_changed',
			jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'DECISION'),
			'Lead moved to Decision after quote send'
		);
	end if;
	select coalesce((setting_value ->> 'follow_up_days')::integer, 3)
	into v_follow_up_days
	from public.app_settings
	where setting_key = 'automation_rules';
	v_follow_up_days := greatest(1, coalesce(v_follow_up_days, 3));
	v_automation_key := 'quote-follow-up:' || v_quote.id::text;
	select * into v_task
	from public.tasks
	where automation_key = v_automation_key
	for update;
	if not found then
		insert into public.tasks (
			lead_id, quote_id, type, title, due_at, assigned_to, created_by, automation_key
		)
		values (
			v_lead.id, v_quote.id, 'follow_up', 'Follow up on sent quote',
			now() + make_interval(days => v_follow_up_days),
			coalesce(v_lead.assigned_to, v_actor), v_actor, v_automation_key
		)
		returning * into v_task;
	end if;
	return jsonb_build_object(
		'outbound_message_id', v_message.id,
		'provider_message_id', trim(p_provider_message_id),
		'task_id', v_task.id,
		'follow_up_days', v_follow_up_days,
		'idempotent', false
	);
end;
$$;

-- A trusted reconciliation job may finish an uncertain submission after the
-- provider identity has been confirmed. This is deliberately service-role
-- only; ordinary browser sessions cannot turn provider evidence into a send.
create or replace function public.reconcile_quote_submission(
	p_logical_key text,
	p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted provider reconciliation required';
	end if;
	if length(trim(coalesce(p_logical_key, ''))) = 0
		or length(trim(coalesce(p_provider_message_id, ''))) = 0
	then
		raise exception using errcode = '22023', message = 'Logical and provider message IDs are required';
	end if;
	select * into v_message
	from public.outbound_messages
	where logical_key = trim(p_logical_key)
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Logical outbound message not found';
	end if;
	if v_message.provider_message_id is not null
		and v_message.provider_message_id is distinct from trim(p_provider_message_id)
	then
		raise exception using errcode = '55000', message = 'Logical outbound message is mapped to another provider ID';
	end if;
	if v_message.delivery_status not in ('submission_unknown', 'submitted', 'delivered') then
		raise exception using errcode = '22023', message = 'Only uncertain or accepted submissions can be reconciled';
	end if;
	if v_message.provider_message_id is null or v_message.delivery_status = 'submission_unknown' then
		update public.outbound_messages
		set provider_message_id = trim(p_provider_message_id),
			delivery_status = case when delivery_status = 'submission_unknown' then 'submitting' else delivery_status end
		where id = v_message.id;
	end if;
	return public.complete_quote_send(v_message.id, trim(p_provider_message_id));
end;
$$;

-- SendPulse events are evidence. They may map an uncertain provider ID and
-- update communication state, but do not accept Quotes, win Leads, or convert
-- Clients. Definitive hard bounces add one deterministic corrective Task.
create or replace function public.process_sendpulse_event(
	p_provider_event_id text,
	p_provider_message_id text,
	p_event_type text,
	p_occurred_at timestamptz,
	p_metadata jsonb,
	p_deduplication_hash text
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
	v_event_id uuid;
	v_existing_id uuid;
	v_event_type text := lower(trim(coalesce(p_event_type, '')));
	v_activity_type text;
	v_activity_summary text;
	v_status text;
	v_logical_key text := nullif(trim(coalesce(p_metadata ->> 'logical_key', '')), '');
	v_reconciled boolean := false;
	v_current_actionable boolean := false;
	v_attention_changed boolean := false;
	v_task_created boolean := false;
	v_actor uuid;
	v_default_owner uuid;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted SendPulse event processing required';
	end if;
	perform private.allow_outbound_attempt_mutation();
	if length(trim(coalesce(p_provider_message_id, ''))) = 0 then
		raise exception using errcode = '22023', message = 'Provider message ID is required';
	end if;
	if length(trim(coalesce(p_deduplication_hash, ''))) = 0 then
		raise exception using errcode = '22023', message = 'Event deduplication hash is required';
	end if;
	if v_event_type in ('delivery', 'delivered', 'success') then
		v_event_type := 'delivered';
		v_activity_type := 'quote_email_delivered';
		v_activity_summary := 'SendPulse reported quote email delivery';
	elsif v_event_type in ('bounce', 'bounced', 'soft_bounce', 'hard_bounce', 'hard_bounced', 'spam', 'unsubscribed') then
		v_event_type := case when v_event_type in ('hard_bounce', 'hard_bounced', 'spam', 'unsubscribed') then 'hard_bounced' else 'bounced' end;
		v_activity_type := 'quote_email_bounced';
		v_activity_summary := 'SendPulse reported quote email bounce';
	elsif v_event_type in ('open', 'opened') then
		v_event_type := 'opened';
	elsif v_event_type in ('click', 'clicked') then
		v_event_type := 'clicked';
	elsif v_event_type in ('failed', 'error') then
		v_event_type := 'failed';
		v_activity_type := 'quote_email_failed';
		v_activity_summary := 'SendPulse reported provider failure';
	else
		raise exception using errcode = '22023', message = 'Unsupported SendPulse event type';
	end if;

	select * into v_message
	from public.outbound_messages
	where provider_message_id = trim(p_provider_message_id)
	for update;
	if not found and v_logical_key is not null then
		select * into v_message
		from public.outbound_messages
		where logical_key = v_logical_key
			and delivery_status = 'submission_unknown'
		for update;
		if found then
			update public.outbound_messages
			set provider_message_id = trim(p_provider_message_id),
				delivery_status = 'submitted',
				submitted_at = coalesce(submitted_at, now()),
				submission_unknown_at = null
			where id = v_message.id;
			update public.outbound_message_attempts
			set state = 'submitted',
				provider_message_id = trim(p_provider_message_id),
				request_finished_at = coalesce(request_finished_at, now())
			where outbound_message_id = v_message.id
				and attempt_number = greatest(v_message.attempt_count, 1);
			v_reconciled := true;
			select * into v_message
			from public.outbound_messages
			where id = v_message.id
			for update;
		end if;
	end if;
	if not found and v_message.id is null then
		raise exception using errcode = 'P0002', message = 'Provider message is not mapped to an outbound message';
	end if;

	select id into v_existing_id
	from public.message_events
	where deduplication_hash = p_deduplication_hash
		or (p_provider_event_id is not null and provider_event_id = p_provider_event_id)
	limit 1;
	if v_existing_id is not null then
		return jsonb_build_object(
			'message_event_id', v_existing_id,
			'outbound_message_id', v_message.id,
			'event_type', v_event_type,
			'idempotent', true,
			'delivery_status', v_message.delivery_status
		);
	end if;
	begin
		insert into public.message_events (
			outbound_message_id, provider_event_id, event_type, occurred_at, metadata, deduplication_hash
		)
		values (
			v_message.id, nullif(trim(p_provider_event_id), ''), v_event_type,
			coalesce(p_occurred_at, now()), coalesce(p_metadata, '{}'::jsonb), p_deduplication_hash
		)
		returning id into v_event_id;
	exception when unique_violation then
		select id into v_existing_id
		from public.message_events
		where deduplication_hash = p_deduplication_hash
			or (p_provider_event_id is not null and provider_event_id = p_provider_event_id)
		limit 1;
		return jsonb_build_object(
			'message_event_id', v_existing_id,
			'outbound_message_id', v_message.id,
			'event_type', v_event_type,
			'idempotent', true,
			'delivery_status', v_message.delivery_status
		);
	end;

	if v_event_type = 'delivered'
		and v_message.delivery_status in ('pending', 'claimed', 'submitting', 'submitted', 'submission_unknown')
	then
		update public.outbound_messages
		set delivery_status = 'delivered', delivered_at = coalesce(p_occurred_at, now())
		where id = v_message.id
		returning delivery_status into v_status;
	elsif v_event_type in ('bounced', 'hard_bounced')
		and v_message.delivery_status in ('pending', 'claimed', 'submitting', 'submitted', 'submission_unknown', 'delivered')
	then
		update public.outbound_messages
		set delivery_status = 'bounced', bounced_at = coalesce(p_occurred_at, now())
		where id = v_message.id
		returning delivery_status into v_status;
		if v_message.attempt_count > 0 then
			update public.outbound_message_attempts
			set state = 'bounced', request_finished_at = coalesce(request_finished_at, now())
			where outbound_message_id = v_message.id
				and attempt_number = v_message.attempt_count;
		end if;
	else
		v_status := v_message.delivery_status;
	end if;

	if v_event_type = 'hard_bounced' and v_message.quote_id is not null then
		select * into v_quote from public.quotes where id = v_message.quote_id;
		if found and v_quote.status = 'sent' then
			select not exists (
				select 1 from public.quotes newer
				where newer.lead_id = v_quote.lead_id
					and newer.created_at > v_quote.created_at
					and newer.status not in ('cancelled', 'declined', 'expired', 'superseded')
			) and not exists (
				select 1 from public.outbound_messages newer_message
				where newer_message.lead_id = v_message.lead_id
					and newer_message.purpose = 'quote'
					and newer_message.created_at > v_message.created_at
					and newer_message.delivery_status not in ('failed', 'bounced')
			) into v_current_actionable;
			if v_current_actionable then
				select * into v_lead from public.leads where id = v_quote.lead_id for update;
				if found and v_lead.pipeline_stage not in ('WON', 'LOST') then
					v_attention_changed := v_lead.attention_state <> 'waiting_on_us';
					update public.leads
					set attention_state = 'waiting_on_us',
						last_activity_at = now(),
						lock_version = lock_version + 1
					where id = v_lead.id;
					select id into v_default_owner
					from public.profiles
					where status = 'active' and role in ('owner', 'admin', 'sales')
					order by case role when 'owner' then 1 when 'admin' then 2 else 3 end, created_at
					limit 1;
					v_actor := coalesce(auth.uid(), v_lead.assigned_to, v_default_owner);
					if v_actor is null then
						raise exception using errcode = '23514', message = 'An active CRM actor is required for bounce remediation';
					end if;
					insert into public.tasks (
						lead_id, quote_id, type, title, description, due_at,
						assigned_to, created_by, automation_key
					)
					values (
						v_lead.id, v_quote.id, 'call_client',
						'Quote email bounced — verify contact details',
						'Confirm the recipient address and update the Lead before retrying the Quote.',
						now(), coalesce(v_lead.assigned_to, v_actor), v_actor,
						'hard-bounce:' || v_message.id::text
					)
					on conflict (automation_key) where automation_key is not null do nothing;
					if found then v_task_created := true; end if;
					select * into v_task
					from public.tasks
					where automation_key = 'hard-bounce:' || v_message.id::text;
					if v_attention_changed or v_task_created then
						insert into public.activities (
							lead_id, quote_id, task_id, outbound_message_id, actor_id,
							event_type, metadata, summary
						)
						values (
							v_lead.id, v_quote.id, v_task.id, v_message.id, v_actor,
							'quote_hard_bounce_remediation',
							jsonb_build_object('provider_message_id', p_provider_message_id, 'task_id', v_task.id),
							'Hard bounce requires contact verification before another Quote send'
						);
					end if;
				end if;
			end if;
		end if;
	end if;
	if v_activity_type is not null then
		insert into public.activities (
			lead_id, quote_id, outbound_message_id, actor_id, event_type, metadata, summary
		)
		values (
			v_message.lead_id, v_message.quote_id, v_message.id, coalesce(auth.uid(), v_actor),
			v_activity_type,
			jsonb_build_object(
				'provider', 'sendpulse',
				'provider_event_id', p_provider_event_id,
				'event_type', v_event_type,
				'reconciled_uncertain', v_reconciled
			),
			v_activity_summary
		);
	end if;
	return jsonb_build_object(
		'message_event_id', v_event_id,
		'outbound_message_id', v_message.id,
		'event_type', v_event_type,
		'idempotent', false,
		'delivery_status', coalesce(v_status, v_message.delivery_status),
		'reconciled_uncertain', v_reconciled,
		'remediation_task_id', v_task.id
	);
end;
$$;

-- Re-emit draft saving with the frozen v1.3.1 decimal scales. The browser may
-- send decimal text, but PostgreSQL validates and calculates every amount.
create or replace function public.save_quote_draft(
	p_quote_id uuid,
	p_lock_version bigint,
	p_lead_id uuid,
	p_client_id uuid,
	p_subject text,
	p_introduction text,
	p_terms text,
	p_tax_label text,
	p_tax_rate numeric,
	p_valid_until date,
	p_currency text,
	p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_quote_id uuid := p_quote_id;
	v_lock_version bigint;
	v_subject text := nullif(trim(coalesce(p_subject, '')), '');
	v_currency text := upper(trim(coalesce(p_currency, 'ZAR')));
	v_tax_rate numeric := coalesce(p_tax_rate, 0);
	v_items jsonb := coalesce(p_items, '[]'::jsonb);
	v_item jsonb;
	v_position integer := 0;
	v_name text;
	v_description text;
	v_quantity numeric;
	v_unit_price numeric;
	v_taxable boolean;
	v_line_subtotal numeric(19, 2);
	v_subtotal numeric(19, 2) := 0;
	v_taxable_subtotal numeric(19, 2) := 0;
	v_tax_amount numeric(19, 2);
	v_total numeric(19, 2);
	v_snapshot jsonb;
	v_new_quote boolean := p_quote_id is null;
	v_lead public.leads%rowtype;
	old_lock_version bigint;
	old_status text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_subject is null then
		raise exception using errcode = '22023', message = 'Quote subject is required';
	end if;
	if v_currency !~ '^[A-Z]{3}$' then
		raise exception using errcode = '22023', message = 'Quote currency is invalid';
	end if;
	if v_tax_rate < 0 or v_tax_rate > 100 or scale(v_tax_rate) > 6 then
		raise exception using errcode = '22023', message = 'Quote tax rate is invalid';
	end if;
	if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 100 then
		raise exception using errcode = '22023', message = 'Quote items must be an array of at most 100 items';
	end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then
		raise exception using errcode = '22023', message = 'Lead must be in proposal or decision before quoting';
	end if;
	if p_client_id is not null and not exists (
		select 1 from public.clients where id = p_client_id and source_lead_id = p_lead_id
	) then
		raise exception using errcode = '42501', message = 'Quote client association requires the converted Lead client';
	end if;
	if not v_new_quote then
		select * into v_quote from public.quotes where id = p_quote_id for update;
		if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
		if v_quote.lead_id is distinct from p_lead_id then
			raise exception using errcode = '42501', message = 'Quote lead cannot be changed';
		end if;
		if v_quote.status not in ('draft', 'ready') then
			raise exception using errcode = '55000', message = 'Only draft or ready Quotes can be edited';
		end if;
		if p_lock_version is null or v_quote.lock_version is distinct from p_lock_version then
			raise exception using errcode = '40001', message = 'Stale quote lock_version';
		end if;
		old_lock_version := v_quote.lock_version;
		old_status := v_quote.status;
	end if;
	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
		if v_name is null then
			raise exception using errcode = '22023', message = format('Quote item %s requires a name', v_position);
		end if;
		if coalesce(v_item ->> 'quantity', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position);
		end if;
		if coalesce(v_item ->> 'unit_price', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s unit price is invalid', v_position);
		end if;
		v_quantity := (v_item ->> 'quantity')::numeric;
		v_unit_price := (v_item ->> 'unit_price')::numeric;
		if v_quantity <= 0 or v_unit_price < 0 then
			raise exception using errcode = '22023', message = format('Quote item %s quantity or unit price is invalid', v_position);
		end if;
		if v_item ? 'taxable' and jsonb_typeof(v_item -> 'taxable') <> 'boolean' then
			raise exception using errcode = '22023', message = format('Quote item %s taxable flag is invalid', v_position);
		end if;
		v_taxable := coalesce((v_item ->> 'taxable')::boolean, true);
		v_line_subtotal := private.quote_line_subtotal(v_quantity, v_unit_price);
		v_subtotal := v_subtotal + v_line_subtotal;
		if v_taxable then v_taxable_subtotal := v_taxable_subtotal + v_line_subtotal; end if;
	end loop;
	v_tax_amount := round(v_taxable_subtotal * v_tax_rate / 100, 2)::numeric(19, 2);
	v_total := v_subtotal + v_tax_amount;
	v_snapshot := private.build_quote_snapshot(p_terms, p_tax_label, v_tax_rate, v_currency, p_valid_until);
	if v_new_quote then
		insert into public.quotes (
			lead_id, client_id, status, currency, subject, introduction, terms,
			tax_label, tax_rate, subtotal, tax_amount, total, valid_until,
			quote_snapshot, created_by
		)
		values (
			p_lead_id, p_client_id, 'draft', v_currency, v_subject, nullif(trim(p_introduction), ''),
			nullif(trim(p_terms), ''), nullif(trim(p_tax_label), ''), v_tax_rate,
			v_subtotal, v_tax_amount, v_total, p_valid_until, v_snapshot, auth.uid()
		)
		returning id, lock_version into v_quote_id, v_lock_version;
	else
		update public.quotes
		set client_id = p_client_id,
			status = 'draft',
			currency = v_currency,
			subject = v_subject,
			introduction = nullif(trim(p_introduction), ''),
			terms = nullif(trim(p_terms), ''),
			tax_label = nullif(trim(p_tax_label), ''),
			tax_rate = v_tax_rate,
			subtotal = v_subtotal,
			tax_amount = v_tax_amount,
			total = v_total,
			valid_until = p_valid_until,
			ready_at = null,
			quote_snapshot = v_snapshot,
			lock_version = lock_version + 1
		where id = p_quote_id and lock_version = old_lock_version
		returning lock_version into v_lock_version;
		if v_lock_version is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	end if;
	delete from public.quote_items where quote_id = v_quote_id;
	v_position := 0;
	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
		v_description := nullif(trim(coalesce(v_item ->> 'description', '')), '');
		v_quantity := (v_item ->> 'quantity')::numeric;
		v_unit_price := (v_item ->> 'unit_price')::numeric;
		v_taxable := coalesce((v_item ->> 'taxable')::boolean, true);
		insert into public.quote_items (
			quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal
		)
		values (
			v_quote_id, v_position, v_name, v_description, v_quantity, v_unit_price,
			v_taxable, private.quote_line_subtotal(v_quantity, v_unit_price)
		);
	end loop;
	if v_new_quote then
		update public.quotes set lock_version = lock_version + 1
		where id = v_quote_id
		returning lock_version into v_lock_version;
	end if;
	update public.leads
	set last_activity_at = now(), lock_version = lock_version + 1
	where id = p_lead_id;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id, v_quote_id, auth.uid(),
		case when v_new_quote then 'quote_created' else 'quote_updated' end,
		jsonb_build_object('quote_id', v_quote_id, 'from_status', old_status),
		case when v_new_quote then 'Quote draft created' else 'Quote draft updated' end
	);
	return jsonb_build_object(
		'quote_id', v_quote_id,
		'quote_number', (select quote_number from public.quotes where id = v_quote_id),
		'revision_number', (select revision_number from public.quotes where id = v_quote_id),
		'status', 'draft',
		'subtotal', v_subtotal,
		'tax_amount', v_tax_amount,
		'total', v_total,
		'lock_version', v_lock_version
	);
end;
$$;

-- Finalisation freezes seller, recipient, commercial and document-generator
-- provenance in the same immutable Quote snapshot.
create or replace function public.mark_quote_ready(
	p_quote_id uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_totals record;
	v_item_count bigint;
	v_new_lock bigint;
	v_snapshot jsonb;
	v_seller jsonb;
	v_recipient jsonb;
	v_items jsonb;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	if v_quote.status = 'ready' then
		return jsonb_build_object('quote_id', v_quote.id, 'status', v_quote.status, 'lock_version', v_quote.lock_version);
	end if;
	if v_quote.status <> 'draft' then
		raise exception using errcode = '22023', message = 'Only a draft Quote can become ready';
	end if;
	if v_quote.valid_until is null or v_quote.valid_until < current_date then
		raise exception using errcode = '23514', message = 'A ready Quote requires a current validity date';
	end if;
	select count(*) into v_item_count from public.quote_items where quote_id = v_quote.id;
	if v_item_count = 0 then raise exception using errcode = '23514', message = 'A ready Quote requires at least one line item'; end if;
	select * into v_lead from public.leads where id = v_quote.lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote lead not found'; end if;
	update public.quote_items
	set line_subtotal = private.quote_line_subtotal(quantity, unit_price)
	where quote_id = v_quote.id;
	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	select coalesce(setting_value, '{}'::jsonb) into v_seller
	from public.app_settings where setting_key = 'company_identity';
	v_seller := coalesce(v_seller, '{}'::jsonb);
	select jsonb_build_object(
		'name', trim(concat_ws(' ', cc.first_name, cc.last_name)),
		'email', cc.email,
		'phone', cc.phone,
		'company', c.company_name,
		'contact_id', cc.id,
		'source', 'client_contact'
	)
	into v_recipient
	from public.client_contacts cc
	join public.clients c on c.id = cc.client_id
	where cc.client_id = v_quote.client_id
	order by cc.is_primary desc, cc.created_at, cc.id
	limit 1;
	if v_recipient is null then
		v_recipient := jsonb_build_object(
			'name', trim(concat_ws(' ', v_lead.first_name, v_lead.last_name)),
			'email', v_lead.email,
			'phone', v_lead.phone,
			'company', v_lead.company,
			'source', 'lead'
		);
	end if;
	select coalesce(jsonb_agg(jsonb_build_object(
		'position', qi.position,
		'name', qi.name,
		'description', qi.description,
		'quantity', qi.quantity,
		'unit_price', qi.unit_price,
		'taxable', qi.taxable,
		'line_subtotal', qi.line_subtotal
	) order by qi.position), '[]'::jsonb)
	into v_items
	from public.quote_items qi
	where qi.quote_id = v_quote.id;
	v_snapshot := coalesce(v_quote.quote_snapshot, '{}'::jsonb) || jsonb_build_object(
		'seller', v_seller,
		'recipient', v_recipient,
		'commercial', jsonb_build_object(
			'subject', v_quote.subject,
			'introduction', v_quote.introduction,
			'terms', v_quote.terms,
			'tax_label', v_quote.tax_label,
			'tax_rate', v_quote.tax_rate,
			'currency', v_quote.currency,
			'valid_until', v_quote.valid_until,
			'subtotal', v_totals.subtotal,
			'tax_amount', v_totals.tax_amount,
			'total', v_totals.total,
			'items', v_items
		),
		'document_template_version', 'quote-document-v1.3.1',
		'document_generator_version', 'zephyr-crm-v1.3.1'
	);
	update public.quotes
	set status = 'ready',
		ready_at = now(),
		subtotal = v_totals.subtotal,
		tax_amount = v_totals.tax_amount,
		total = v_totals.total,
		quote_snapshot = v_snapshot,
		document_template_version = 'quote-document-v1.3.1',
		document_generator_version = 'zephyr-crm-v1.3.1',
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.lead_id, v_quote.id, auth.uid(), 'quote_ready', jsonb_build_object('quote_id', v_quote.id), 'Quote marked ready');
	return jsonb_build_object(
		'quote_id', v_quote.id,
		'quote_number', v_quote.quote_number,
		'status', 'ready',
		'subtotal', v_totals.subtotal,
		'tax_amount', v_totals.tax_amount,
		'total', v_totals.total,
		'lock_version', v_new_lock
	);
end;
$$;

-- Accepted Quotes require explicit provenance; the legacy two-argument RPC
-- remains compatible and records an internal acceptance source.
create or replace function public.accept_quote(
	p_quote_id uuid,
	p_lock_version bigint,
	p_acceptance_source text,
	p_acceptance_evidence text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_new_lock bigint;
	v_source text := nullif(trim(coalesce(p_acceptance_source, '')), '');
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_source is null or length(v_source) > 80 then
		raise exception using errcode = '22023', message = 'Acceptance source is required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status = 'accepted' then
		return jsonb_build_object('quote_id', v_quote.id, 'status', 'accepted', 'lock_version', v_quote.lock_version, 'idempotent', true);
	end if;
	if v_quote.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	if v_quote.status <> 'sent' then
		raise exception using errcode = '22023', message = 'Only a sent Quote can be accepted';
	end if;
	update public.quotes
	set status = 'accepted',
		accepted_at = now(),
		accepted_by = auth.uid(),
		acceptance_source = v_source,
		acceptance_evidence = nullif(trim(coalesce(p_acceptance_evidence, '')), ''),
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		v_quote.lead_id, v_quote.id, auth.uid(), 'quote_accepted',
		jsonb_build_object('acceptance_source', v_source, 'has_evidence', p_acceptance_evidence is not null),
		'Quote accepted'
	);
	return jsonb_build_object('quote_id', v_quote.id, 'status', 'accepted', 'lock_version', v_new_lock, 'idempotent', false);
end;
$$;

create or replace function public.accept_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
	select public.accept_quote(p_quote_id, p_lock_version, 'internal', null);
$$;

create or replace function public.create_minimal_quote(
	p_lead_id uuid,
	p_subject text,
	p_item_name text,
	p_quantity numeric,
	p_unit_price numeric,
	p_tax_rate numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_saved jsonb;
	v_ready jsonb;
	v_quote_id uuid;
	v_item_id uuid;
begin
	if p_quantity is null or scale(p_quantity) > 4
		or p_unit_price is null or scale(p_unit_price) > 4
	then
		raise exception using errcode = '22023', message = 'Quote quantity or price has too many decimal places';
	end if;
	if p_tax_rate is null or scale(p_tax_rate) > 6 then
		raise exception using errcode = '22023', message = 'Quote tax rate has too many decimal places';
	end if;
	v_saved := public.save_quote_draft(
		null, null, p_lead_id, null, p_subject, null, null, null, p_tax_rate,
		current_date + 30, 'ZAR',
		jsonb_build_array(jsonb_build_object(
			'name', p_item_name,
			'quantity', p_quantity::text,
			'unit_price', p_unit_price::text,
			'taxable', true
		))
	);
	v_quote_id := (v_saved ->> 'quote_id')::uuid;
	v_ready := public.mark_quote_ready(v_quote_id, (v_saved ->> 'lock_version')::bigint);
	select id into v_item_id
	from public.quote_items
	where quote_id = v_quote_id
	order by position
	limit 1;
	return jsonb_build_object(
		'quote_id', v_quote_id,
		'item_id', v_item_id,
		'quote_number', v_ready ->> 'quote_number',
		'status', v_ready ->> 'status',
		'subtotal', v_ready -> 'subtotal',
		'tax_amount', v_ready -> 'tax_amount',
		'total', v_ready -> 'total',
		'lock_version', v_ready -> 'lock_version'
	);
end;
$$;

-- Restricted EXECUTE is applied after all forward functions exist.
do $$
declare r record;
begin
	for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' loop
		execute format('revoke all on function %s from public, anon, authenticated', r.signature);
	end loop;
	for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
		execute format('revoke all on function %s from public, anon', r.signature);
	end loop;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.has_active_profile() to authenticated;
grant execute on function private.has_any_role(text[]) to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.quote_document_id(text) to authenticated;
grant execute on function private.validate_dashboard_range(date, date) to authenticated;

revoke all on function public.set_profile_access(uuid, text, text, text) from public, anon;
grant execute on function public.set_profile_access(uuid, text, text, text) to authenticated;
revoke all on function public.set_app_setting(text, jsonb, text) from public, anon;
grant execute on function public.set_app_setting(text, jsonb, text) to authenticated;
revoke all on function public.pause_lead(uuid, text, timestamptz, bigint) from public, anon;
grant execute on function public.pause_lead(uuid, text, timestamptz, bigint) to authenticated;
revoke all on function public.resume_lead(uuid, bigint) from public, anon;
grant execute on function public.resume_lead(uuid, bigint) to authenticated;
revoke all on function public.mark_quote_send_unknown(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_quote_send_unknown(uuid, text) to authenticated;
revoke all on function public.reconcile_quote_submission(text, text) from public, anon, authenticated;
grant execute on function public.reconcile_quote_submission(text, text) to service_role;
revoke all on function public.accept_quote(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.accept_quote(uuid, bigint, text, text) to authenticated;

create view public.dashboard_lead_facts
with (security_invoker = true)
as
select
	l.id, l.created_at, l.updated_at, l.last_activity_at, l.pipeline_stage,
	l.attention_state, l.lost_reason_id, l.converted_client_id,
	ls.code as source_code, ls.label as source_label, l.utm_source, l.utm_medium,
	l.utm_campaign, l.utm_content, l.utm_term,
	coalesce(task_projection.has_follow_up, false) as has_follow_up,
	task_projection.next_task_due_at,
	(task_projection.next_task_due_at is not null and task_projection.next_task_due_at < now()) as is_overdue
from public.leads l
left join public.lead_sources ls on ls.id = l.source_id
left join lateral (
	select true as has_follow_up, min(t.due_at) as next_task_due_at
	from public.tasks t
	where t.lead_id = l.id and t.type = 'follow_up' and t.status = 'open'
) task_projection on true;

create view public.dashboard_quote_facts
with (security_invoker = true)
as
select
	q.id, q.lead_id, q.status, q.total, q.currency, q.created_at, q.sent_at,
	q.accepted_at, q.valid_until, l.pipeline_stage, ls.code as source_code,
	l.utm_source, l.utm_medium, l.utm_campaign
from public.quotes q
join public.leads l on l.id = q.lead_id
left join public.lead_sources ls on ls.id = l.source_id;

revoke all on public.dashboard_lead_facts, public.dashboard_quote_facts from public, anon, authenticated;

commit;
