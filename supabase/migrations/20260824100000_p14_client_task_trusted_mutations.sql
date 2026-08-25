begin;

-- P14 hardening keeps PostgreSQL as the only authority for Client, Contact and
-- Task mutation. Historical migrations remain immutable; this migration closes
-- the effective Data API bypasses additively.

alter table public.clients
	add column if not exists lock_version bigint not null default 1;

alter table public.client_contacts
	add column if not exists status text not null default 'active',
	add column if not exists lock_version bigint not null default 1;

alter table public.clients
	drop constraint if exists clients_lock_version_positive,
	add constraint clients_lock_version_positive check (lock_version > 0);

alter table public.client_contacts
	drop constraint if exists client_contacts_status_check,
	drop constraint if exists client_contacts_lock_version_positive,
	drop constraint if exists client_contacts_primary_active,
	add constraint client_contacts_status_check check (status in ('active', 'inactive')),
	add constraint client_contacts_lock_version_positive check (lock_version > 0),
	add constraint client_contacts_primary_active check (not is_primary or status = 'active');

drop index if exists public.client_contacts_one_primary_idx;
create unique index if not exists client_contacts_one_primary_idx
	on public.client_contacts (client_id)
	where is_primary and status = 'active';

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
		raise exception using errcode = '42501', message = 'Client creation requires convert_lead';
	end if;
	if new.source_lead_id is distinct from old.source_lead_id
		or new.converted_at is distinct from old.converted_at
		or new.client_number is distinct from old.client_number
		or new.lock_version is distinct from old.lock_version then
		raise exception using errcode = '42501', message = 'Client protected fields require a trusted action';
	end if;
	return new;
end;
$$;

drop trigger if exists clients_provenance_protection on public.clients;
create trigger clients_provenance_protection
before insert or update on public.clients
for each row execute function private.guard_client_provenance();

create or replace function private.guard_client_contact_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin')
		or (select auth.role()) = 'service_role' then
		return new;
	end if;
	raise exception using errcode = '42501', message = 'ClientContact changes require a trusted action';
end;
$$;

drop trigger if exists client_contacts_trusted_mutation on public.client_contacts;
create trigger client_contacts_trusted_mutation
before insert or update or delete on public.client_contacts
for each row execute function private.guard_client_contact_mutation();

create or replace function public.update_client_details(
	p_client_id uuid,
	p_lock_version bigint,
	p_type text,
	p_display_name text,
	p_company_name text default null,
	p_email text default null,
	p_phone text default null,
	p_tax_number text default null,
	p_registration_number text default null,
	p_billing_address_line_1 text default null,
	p_billing_address_line_2 text default null,
	p_billing_city text default null,
	p_billing_region text default null,
	p_billing_postal_code text default null,
	p_billing_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_client public.clients%rowtype;
	v_company text := nullif(trim(coalesce(p_company_name, '')), '');
	v_display text := nullif(trim(coalesce(p_display_name, '')), '');
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_type not in ('individual', 'company') then
		raise exception using errcode = '22023', message = 'Client type is invalid';
	end if;
	if v_display is null then
		raise exception using errcode = '22023', message = 'Client display name is required';
	end if;
	if p_type = 'company' and v_company is null then
		raise exception using errcode = '22023', message = 'Company Clients require a company name';
	end if;
	if p_type = 'individual' and v_company is not null then
		raise exception using errcode = '22023', message = 'Individual Clients cannot have a company name';
	end if;

	select * into v_client from public.clients where id = p_client_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	if v_client.status = 'archived' then
		raise exception using errcode = '55000', message = 'Archived Clients are read-only';
	end if;
	if v_client.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale Client lock_version';
	end if;

	update public.clients
	set type = p_type,
		display_name = v_display,
		company_name = case when p_type = 'company' then v_company else null end,
		email = nullif(trim(coalesce(p_email, '')), ''),
		phone = nullif(trim(coalesce(p_phone, '')), ''),
		tax_number = nullif(trim(coalesce(p_tax_number, '')), ''),
		registration_number = nullif(trim(coalesce(p_registration_number, '')), ''),
		billing_address_line_1 = nullif(trim(coalesce(p_billing_address_line_1, '')), ''),
		billing_address_line_2 = nullif(trim(coalesce(p_billing_address_line_2, '')), ''),
		billing_city = nullif(trim(coalesce(p_billing_city, '')), ''),
		billing_region = nullif(trim(coalesce(p_billing_region, '')), ''),
		billing_postal_code = nullif(trim(coalesce(p_billing_postal_code, '')), ''),
		billing_country = nullif(trim(coalesce(p_billing_country, '')), ''),
		lock_version = lock_version + 1
	where id = p_client_id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Client changed during update'; end if;

	insert into public.activities (client_id, actor_id, event_type, metadata, summary)
	values (
		p_client_id,
		v_actor,
		'client_updated',
		jsonb_build_object('client_type', p_type, 'lock_version', p_lock_version + 1),
		'Client details updated'
	);
	select * into v_client from public.clients where id = p_client_id;
	return jsonb_build_object('client_id', v_client.id, 'lock_version', v_client.lock_version, 'status', v_client.status);
end;
$$;

create or replace function private.client_has_open_work(p_client public.clients)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
	select exists (
		select 1 from public.tasks t
		where t.status = 'open'
		and (t.client_id = p_client.id or (p_client.source_lead_id is not null and t.lead_id = p_client.source_lead_id))
	)
	or exists (
		select 1 from public.quotes q
		where q.status in ('draft', 'ready', 'sent')
		and (q.client_id = p_client.id or (p_client.source_lead_id is not null and q.lead_id = p_client.source_lead_id))
	);
$$;

create or replace function public.set_client_status(
	p_client_id uuid,
	p_lock_version bigint,
	p_status text,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_role text := (select private.current_user_role());
	v_client public.clients%rowtype;
	v_reason text := nullif(trim(coalesce(p_reason, '')), '');
	v_event text;
begin
	if v_actor is null or v_role not in ('owner', 'admin', 'sales') then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_status not in ('active', 'inactive', 'archived') then
		raise exception using errcode = '22023', message = 'Client status is invalid';
	end if;
	select * into v_client from public.clients where id = p_client_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	if v_client.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale Client lock_version';
	end if;

	if v_client.status = 'active' and p_status = 'inactive' then
		null;
	elsif v_client.status = 'inactive' and p_status = 'active' then
		null;
	elsif v_client.status in ('active', 'inactive') and p_status = 'archived' then
		if v_role not in ('owner', 'admin') then
			raise exception using errcode = '42501', message = 'Only Owner/Admin may archive a Client';
		end if;
		if v_reason is null then raise exception using errcode = '22023', message = 'Archive reason is required'; end if;
		if private.client_has_open_work(v_client) then
			raise exception using errcode = '55000', message = 'Client has active commercial work';
		end if;
	elsif v_client.status = 'archived' and p_status = 'inactive' then
		if v_role not in ('owner', 'admin') then
			raise exception using errcode = '42501', message = 'Only Owner/Admin may restore a Client';
		end if;
		if v_reason is null then raise exception using errcode = '22023', message = 'Restore reason is required'; end if;
	else
		raise exception using errcode = '22023', message = format('Illegal Client transition %s to %s', v_client.status, p_status);
	end if;

	v_event := case when p_status = 'archived' then 'client_archived' when v_client.status = 'archived' then 'client_restored' else 'client_status_changed' end;
	update public.clients
	set status = p_status, lock_version = lock_version + 1
	where id = p_client_id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Client changed during status update'; end if;
	insert into public.activities (client_id, actor_id, event_type, metadata, summary)
	values (
		p_client_id,
		v_actor,
		v_event,
		jsonb_build_object('from_status', v_client.status, 'to_status', p_status, 'reason', v_reason),
		case when p_status = 'archived' then 'Client archived' when v_client.status = 'archived' then 'Client restored to inactive' else format('Client marked %s', p_status) end
	);
	return jsonb_build_object('client_id', p_client_id, 'status', p_status, 'lock_version', p_lock_version + 1);
end;
$$;

create or replace function public.create_client_contact(
	p_client_id uuid,
	p_first_name text,
	p_last_name text default '',
	p_email text default null,
	p_phone text default null,
	p_job_title text default null,
	p_is_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_client public.clients%rowtype;
	v_contact public.client_contacts%rowtype;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_client from public.clients where id = p_client_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	if v_client.status = 'archived' then raise exception using errcode = '55000', message = 'Archived Clients are read-only'; end if;
	if nullif(trim(coalesce(p_first_name, '')), '') is null then raise exception using errcode = '22023', message = 'Contact first name is required'; end if;
	if p_is_primary then
		update public.client_contacts set is_primary = false, lock_version = lock_version + 1 where client_id = p_client_id and is_primary;
	end if;
	insert into public.client_contacts (client_id, first_name, last_name, email, phone, job_title, is_primary)
	values (p_client_id, trim(p_first_name), trim(coalesce(p_last_name, '')), nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_job_title, '')), ''), p_is_primary)
	returning * into v_contact;
	insert into public.activities (client_id, actor_id, event_type, metadata, summary)
	values (p_client_id, v_actor, 'client_contact_created', jsonb_build_object('contact_id', v_contact.id, 'is_primary', v_contact.is_primary), 'Client contact created');
	return jsonb_build_object('contact_id', v_contact.id, 'lock_version', v_contact.lock_version);
end;
$$;

create or replace function public.update_client_contact(
	p_contact_id uuid,
	p_lock_version bigint,
	p_first_name text,
	p_last_name text default '',
	p_email text default null,
	p_phone text default null,
	p_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_contact public.client_contacts%rowtype;
	v_client public.clients%rowtype;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select cc.* into v_contact from public.client_contacts cc where cc.id = p_contact_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client contact not found'; end if;
	select * into v_client from public.clients where id = v_contact.client_id for update;
	if v_client.status = 'archived' then raise exception using errcode = '55000', message = 'Archived Clients are read-only'; end if;
	if v_contact.status = 'inactive' then raise exception using errcode = '55000', message = 'Inactive contacts must be activated before editing'; end if;
	if v_contact.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale ClientContact lock_version'; end if;
	if nullif(trim(coalesce(p_first_name, '')), '') is null then raise exception using errcode = '22023', message = 'Contact first name is required'; end if;
	update public.client_contacts
	set first_name = trim(p_first_name), last_name = trim(coalesce(p_last_name, '')), email = nullif(trim(coalesce(p_email, '')), ''), phone = nullif(trim(coalesce(p_phone, '')), ''), job_title = nullif(trim(coalesce(p_job_title, '')), ''), lock_version = lock_version + 1
	where id = p_contact_id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Client contact changed during update'; end if;
	insert into public.activities (client_id, actor_id, event_type, metadata, summary)
	values (v_client.id, v_actor, 'client_contact_updated', jsonb_build_object('contact_id', p_contact_id, 'lock_version', p_lock_version + 1), 'Client contact updated');
	return jsonb_build_object('contact_id', p_contact_id, 'lock_version', p_lock_version + 1);
end;
$$;

create or replace function public.set_primary_client_contact(
	p_contact_id uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_contact public.client_contacts%rowtype;
	v_client public.clients%rowtype;
	v_old_primary uuid;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select cc.* into v_contact from public.client_contacts cc where cc.id = p_contact_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client contact not found'; end if;
	select * into v_client from public.clients where id = v_contact.client_id for update;
	if v_client.status = 'archived' then raise exception using errcode = '55000', message = 'Archived Clients are read-only'; end if;
	if v_contact.status <> 'active' then raise exception using errcode = '22023', message = 'Inactive contacts cannot be primary'; end if;
	if v_contact.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale ClientContact lock_version'; end if;
	select id into v_old_primary from public.client_contacts where client_id = v_client.id and is_primary and id <> p_contact_id for update;
	if v_contact.is_primary and v_old_primary is null then return jsonb_build_object('contact_id', p_contact_id, 'lock_version', p_lock_version, 'idempotent', true); end if;
	if v_old_primary is not null then update public.client_contacts set is_primary = false, lock_version = lock_version + 1 where id = v_old_primary; end if;
	update public.client_contacts set is_primary = true, lock_version = lock_version + 1 where id = p_contact_id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Client contact changed during primary update'; end if;
	insert into public.activities (client_id, actor_id, event_type, metadata, summary)
	values (v_client.id, v_actor, 'client_primary_contact_changed', jsonb_build_object('contact_id', p_contact_id, 'previous_contact_id', v_old_primary), 'Primary Client contact changed');
	return jsonb_build_object('contact_id', p_contact_id, 'lock_version', p_lock_version + 1, 'previous_contact_id', v_old_primary);
end;
$$;

create or replace function public.set_client_contact_status(
	p_contact_id uuid,
	p_lock_version bigint,
	p_status text,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_contact public.client_contacts%rowtype;
	v_client public.clients%rowtype;
	v_reason text := nullif(trim(coalesce(p_reason, '')), '');
	v_active_other boolean;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	if p_status not in ('active', 'inactive') then raise exception using errcode = '22023', message = 'ClientContact status is invalid'; end if;
	select cc.* into v_contact from public.client_contacts cc where cc.id = p_contact_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client contact not found'; end if;
	select * into v_client from public.clients where id = v_contact.client_id for update;
	if v_client.status = 'archived' then raise exception using errcode = '55000', message = 'Archived Clients are read-only'; end if;
	if v_contact.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale ClientContact lock_version'; end if;
	if v_contact.status = p_status then return jsonb_build_object('contact_id', p_contact_id, 'status', p_status, 'lock_version', p_lock_version, 'idempotent', true); end if;
	if p_status = 'inactive' and v_contact.is_primary then
		select exists (select 1 from public.client_contacts where client_id = v_client.id and status = 'active' and id <> p_contact_id) into v_active_other;
		if v_active_other then raise exception using errcode = '55000', message = 'Choose another active primary contact before inactivation'; end if;
	end if;
	update public.client_contacts set status = p_status, is_primary = case when p_status = 'inactive' then false else is_primary end, lock_version = lock_version + 1 where id = p_contact_id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Client contact changed during status update'; end if;
	insert into public.activities (client_id, actor_id, event_type, metadata, summary)
	values (v_client.id, v_actor, 'client_contact_status_changed', jsonb_build_object('contact_id', p_contact_id, 'from_status', v_contact.status, 'to_status', p_status, 'reason', v_reason), format('Client contact marked %s', p_status));
	return jsonb_build_object('contact_id', p_contact_id, 'status', p_status, 'lock_version', p_lock_version + 1);
end;
$$;

-- Relationship integrity is derived at the trusted Task boundary. Quote is
-- authoritative when present; direct table writes are removed below.
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
security definer
set search_path = pg_catalog, public
as $$
declare
	v_task public.tasks%rowtype;
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_lead_id uuid := p_lead_id;
	v_client_id uuid := p_client_id;
	v_parent_count integer;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	if p_automation_key is not null then raise exception using errcode = '42501', message = 'Automation keys require a trusted action'; end if;
	if p_type not in ('review_lead', 'call_client', 'prepare_quote', 'send_quote', 'follow_up', 'confirm_acceptance', 'custom') then raise exception using errcode = '22023', message = 'Invalid Task type'; end if;
	if length(trim(coalesce(p_title, ''))) = 0 then raise exception using errcode = '22023', message = 'Task title is required'; end if;

	if p_quote_id is not null then
		select * into v_quote from public.quotes where id = p_quote_id for share;
		if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
		select * into v_lead from public.leads where id = v_quote.lead_id for share;
		v_lead_id := v_quote.lead_id;
		v_client_id := coalesce(v_quote.client_id, v_lead.converted_client_id);
		if p_lead_id is not null and p_lead_id <> v_lead_id then raise exception using errcode = '23514', message = 'Task Lead does not match Quote'; end if;
		if p_client_id is not null and p_client_id is distinct from v_client_id then raise exception using errcode = '23514', message = 'Task Client does not match Quote'; end if;
	else
		v_parent_count := (p_lead_id is not null)::integer + (p_client_id is not null)::integer;
		if v_parent_count <> 1 then raise exception using errcode = '23514', message = 'A Task without a Quote requires exactly one Lead or Client'; end if;
		if p_lead_id is not null and not exists (select 1 from public.leads where id = p_lead_id) then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
		if p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id) then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	end if;
	if p_assigned_to is not null and not exists (select 1 from public.profiles where id = p_assigned_to and status = 'active' and role in ('owner', 'admin', 'sales')) then raise exception using errcode = '22023', message = 'Task assignee must be an active CRM user'; end if;
	insert into public.tasks (lead_id, client_id, quote_id, type, title, description, assigned_to, due_at, created_by)
	values (v_lead_id, v_client_id, p_quote_id, p_type, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_assigned_to, p_due_at, (select auth.uid()))
	returning * into v_task;
	return jsonb_build_object('task_id', v_task.id, 'lock_version', v_task.lock_version, 'idempotent', false);
end;
$$;

revoke insert, update, delete on table public.clients from authenticated;
revoke insert, update, delete on table public.client_contacts from authenticated;
revoke insert, update, delete on table public.tasks from authenticated;

revoke all on function public.update_client_details(uuid, bigint, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.set_client_status(uuid, bigint, text, text) from public, anon;
revoke all on function public.create_client_contact(uuid, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.update_client_contact(uuid, bigint, text, text, text, text, text) from public, anon;
revoke all on function public.set_primary_client_contact(uuid, bigint) from public, anon;
revoke all on function public.set_client_contact_status(uuid, bigint, text, text) from public, anon;
revoke all on function public.create_task(uuid, uuid, uuid, text, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.update_client_details(uuid, bigint, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_client_status(uuid, bigint, text, text) to authenticated;
grant execute on function public.create_client_contact(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_client_contact(uuid, bigint, text, text, text, text, text) to authenticated;
grant execute on function public.set_primary_client_contact(uuid, bigint) to authenticated;
grant execute on function public.set_client_contact_status(uuid, bigint, text, text) to authenticated;
grant execute on function public.create_task(uuid, uuid, uuid, text, text, text, uuid, timestamptz, text) to authenticated;

comment on function public.update_client_details(uuid, bigint, text, text, text, text, text, text, text, text, text, text, text, text, text) is 'Trusted Client identity and billing maintenance; conversion provenance remains immutable.';
comment on function public.set_client_status(uuid, bigint, text, text) is 'Trusted Client lifecycle transition with archive work guard and Activity evidence.';
comment on function public.create_task(uuid, uuid, uuid, text, text, text, uuid, timestamptz, text) is 'Trusted Task creation; Quote parent relationships are derived and validated server-side.';

commit;
