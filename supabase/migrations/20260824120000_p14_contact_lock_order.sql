-- P14 correction: every ClientContact mutation takes the Client lock before
-- the Contact lock. This gives concurrent primary/status/edit operations one
-- deterministic lock order and prevents a Client-first action from deadlocking
-- against a Contact-first action.

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
	v_client_id uuid;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select client_id into v_client_id from public.client_contacts where id = p_contact_id;
	if not found then raise exception using errcode = 'P0002', message = 'Client contact not found'; end if;
	select * into v_client from public.clients where id = v_client_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	select * into v_contact from public.client_contacts where id = p_contact_id for update;
	if v_client.status = 'archived' then raise exception using errcode = '55000', message = 'Archived Clients are read-only'; end if;
	if v_contact.status = 'inactive' then raise exception using errcode = '55000', message = 'Inactive contacts must be activated before editing'; end if;
	if v_contact.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale ClientContact lock_version'; end if;
	if nullif(trim(coalesce(p_first_name, '')), '') is null then raise exception using errcode = '22023', message = 'Contact first name is required'; end if;
	update public.client_contacts
	set first_name = trim(p_first_name),
		last_name = trim(coalesce(p_last_name, '')),
		email = nullif(trim(coalesce(p_email, '')), ''),
		phone = nullif(trim(coalesce(p_phone, '')), ''),
		job_title = nullif(trim(coalesce(p_job_title, '')), ''),
		lock_version = lock_version + 1
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
	v_client_id uuid;
	v_old_primary uuid;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select client_id into v_client_id from public.client_contacts where id = p_contact_id;
	if not found then raise exception using errcode = 'P0002', message = 'Client contact not found'; end if;
	select * into v_client from public.clients where id = v_client_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	select * into v_contact from public.client_contacts where id = p_contact_id for update;
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
	v_client_id uuid;
	v_reason text := nullif(trim(coalesce(p_reason, '')), '');
	v_active_other boolean;
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_status not in ('active', 'inactive') then raise exception using errcode = '22023', message = 'ClientContact status is invalid'; end if;
	select client_id into v_client_id from public.client_contacts where id = p_contact_id;
	if not found then raise exception using errcode = 'P0002', message = 'Client contact not found'; end if;
	select * into v_client from public.clients where id = v_client_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Client not found'; end if;
	select * into v_contact from public.client_contacts where id = p_contact_id for update;
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
