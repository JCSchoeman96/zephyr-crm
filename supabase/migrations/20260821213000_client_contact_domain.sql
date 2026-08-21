-- Phase 6: complete the Client/ClientContact model and harden conversion.

alter table public.clients
	add column if not exists tax_number text,
	add column if not exists registration_number text,
	add column if not exists billing_address_line_1 text,
	add column if not exists billing_address_line_2 text,
	add column if not exists billing_city text,
	add column if not exists billing_region text,
	add column if not exists billing_postal_code text,
	add column if not exists billing_country text;

update public.clients
set billing_address_line_1 = nullif(trim(billing_address), '')
where billing_address_line_1 is null
	and nullif(trim(billing_address), '') is not null;

alter table public.clients
	add constraint clients_company_name_matches_type check (
		(type = 'individual' and nullif(trim(company_name), '') is null)
		or (type = 'company' and nullif(trim(company_name), '') is not null)
	),
	add constraint clients_optional_identity_fields_not_blank check (
		(tax_number is null or length(trim(tax_number)) > 0)
		and (registration_number is null or length(trim(registration_number)) > 0)
	),
	add constraint clients_billing_fields_not_blank check (
		(billing_address_line_1 is null or length(trim(billing_address_line_1)) > 0)
		and (billing_address_line_2 is null or length(trim(billing_address_line_2)) > 0)
		and (billing_city is null or length(trim(billing_city)) > 0)
		and (billing_region is null or length(trim(billing_region)) > 0)
		and (billing_postal_code is null or length(trim(billing_postal_code)) > 0)
		and (billing_country is null or length(trim(billing_country)) > 0)
	);

create index clients_updated_at_idx on public.clients (updated_at desc, id);
create index clients_type_status_idx on public.clients (type, status, updated_at desc, id);

create or replace function public.convert_lead(
	p_lead_id uuid,
	p_lock_version bigint
)
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
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;

	select *
	into v_lead
	from public.leads
	where id = p_lead_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;

	if v_lead.pipeline_stage = 'WON' and v_lead.converted_client_id is not null then
		return jsonb_build_object(
			'lead_id', v_lead.id,
			'client_id', v_lead.converted_client_id,
			'idempotent', true
		);
	end if;
	if v_lead.pipeline_stage <> 'DECISION' then
		raise exception using errcode = '22023', message = 'Only a decision lead can be won';
	end if;
	if v_lead.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	v_company_name = nullif(trim(v_lead.company), '');
	v_client_type = case when v_company_name is null then 'individual' else 'company' end;
	v_display_name = coalesce(
		v_company_name,
		nullif(trim(concat_ws(' ', nullif(trim(v_lead.first_name), ''), nullif(trim(v_lead.last_name), ''))), ''),
		'Converted client'
	);

	-- A Client is created only by this explicit conversion. The source Lead is
	-- the only deterministic identity boundary; email is never used to merge.
	insert into public.clients (
		type,
		display_name,
		company_name,
		email,
		phone,
		source_lead_id,
		converted_at
	)
	values (
		v_client_type,
		v_display_name,
		v_company_name,
		v_lead.email,
		v_lead.phone,
		v_lead.id,
		now()
	)
	returning id into v_client_id;

	insert into public.client_contacts (
		client_id,
		first_name,
		last_name,
		email,
		phone,
		is_primary
	)
	values (
		v_client_id,
		coalesce(nullif(trim(v_lead.first_name), ''), 'Primary'),
		coalesce(nullif(trim(v_lead.last_name), ''), ''),
		v_lead.email,
		v_lead.phone,
		true
	)
	returning id into v_contact_id;

	update public.leads
	set pipeline_stage = 'WON',
		attention_state = 'none',
		attention_reason = null,
		attention_resume_at = null,
		converted_client_id = v_client_id,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id
		and lock_version = p_lock_version;
	if not found then
		raise exception using errcode = '40001', message = 'Lead changed during conversion';
	end if;

	with closed_tasks as (
		update public.tasks
		set status = 'cancelled',
			cancelled_at = coalesce(cancelled_at, now())
		where lead_id = v_lead.id
			and status = 'open'
		returning id
	)
	select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
	into v_closed_task_count, v_closed_task_ids
	from closed_tasks;

	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_client_id,
		auth.uid(),
		'client_created',
		jsonb_build_object(
			'contact_id', v_contact_id,
			'client_type', v_client_type,
			'duplicate_strategy', 'source_lead_id'
		),
		'Client created from won lead'
	);
	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_client_id,
		auth.uid(),
		'lead_won',
		jsonb_build_object(
			'client_id', v_client_id,
			'closed_task_count', v_closed_task_count,
			'closed_task_ids', to_jsonb(v_closed_task_ids)
		),
		'Lead marked won and converted to client'
	);

	return jsonb_build_object(
		'lead_id', v_lead.id,
		'client_id', v_client_id,
		'contact_id', v_contact_id,
		'idempotent', false,
		'closed_task_count', v_closed_task_count
	);
end;
$$;

revoke all on function public.convert_lead(uuid, bigint) from public, anon;
grant execute on function public.convert_lead(uuid, bigint) to authenticated;

commit;
