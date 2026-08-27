begin;

-- P19 completes the independent courier and pickup state machines. These
-- transitions remain trusted, optimistic-locking actions; no provider or
-- inventory integration is implied by the recorded CRM evidence.

create or replace function public.dispatch_fulfilment_step(
	p_step_id uuid,
	p_lock_version bigint,
	p_tracking_reference text default null,
	p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_case public.fulfilment_cases%rowtype;
	v_step public.fulfilment_steps%rowtype;
	v_case_id uuid;
	v_case_lock bigint;
	v_tracking_reference text := nullif(trim(coalesce(p_tracking_reference, '')), '');
	v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select fulfilment_case_id into v_case_id
	from public.fulfilment_steps
	where id = p_step_id;
	if not found then raise exception using errcode = 'P0002', message = 'FulfilmentStep not found'; end if;
	select * into v_case from public.fulfilment_cases where id = v_case_id for update;
	select * into v_step from public.fulfilment_steps where id = p_step_id for update;
	if v_case.status <> 'open' then raise exception using errcode = '55000', message = 'Closed FulfilmentCases are read-only'; end if;
	if v_step.type <> 'courier' or v_step.status <> 'awaiting_dispatch' then
		raise exception using errcode = '22023', message = 'Only awaiting courier steps can be dispatched';
	end if;
	if v_step.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale FulfilmentStep lock_version'; end if;
	update public.fulfilment_steps
	set status = 'dispatched',
		tracking_reference = coalesce(v_tracking_reference, v_step.tracking_reference),
		notes = coalesce(v_notes, v_step.notes),
		lock_version = lock_version + 1
	where id = p_step_id and lock_version = p_lock_version
	returning * into v_step;
	update public.fulfilment_cases
	set lock_version = lock_version + 1
	where id = v_case.id
	returning lock_version into v_case_lock;
	insert into public.activities (lead_id, client_id, quote_id, fulfilment_case_id, actor_id, event_type, metadata, summary)
	values (
		v_case.lead_id,
		v_case.client_id,
		v_case.accepted_quote_id,
		v_case.id,
		v_actor,
		'fulfilment_step_dispatched',
		jsonb_build_object('step_id', v_step.id, 'tracking_reference', v_step.tracking_reference),
		'Courier dispatched'
	);
	return jsonb_build_object(
		'step_id', v_step.id,
		'status', v_step.status,
		'tracking_reference', v_step.tracking_reference,
		'lock_version', v_step.lock_version,
		'fulfilment_case_lock_version', v_case_lock
	);
end;
$$;

create or replace function public.ready_fulfilment_step(
	p_step_id uuid,
	p_lock_version bigint,
	p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_case public.fulfilment_cases%rowtype;
	v_step public.fulfilment_steps%rowtype;
	v_case_id uuid;
	v_case_lock bigint;
	v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select fulfilment_case_id into v_case_id
	from public.fulfilment_steps
	where id = p_step_id;
	if not found then raise exception using errcode = 'P0002', message = 'FulfilmentStep not found'; end if;
	select * into v_case from public.fulfilment_cases where id = v_case_id for update;
	select * into v_step from public.fulfilment_steps where id = p_step_id for update;
	if v_case.status <> 'open' then raise exception using errcode = '55000', message = 'Closed FulfilmentCases are read-only'; end if;
	if v_step.type <> 'pickup' or v_step.status <> 'preparing' then
		raise exception using errcode = '22023', message = 'Only preparing pickup steps can be marked ready';
	end if;
	if v_step.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale FulfilmentStep lock_version'; end if;
	update public.fulfilment_steps
	set status = 'ready_for_collection',
		notes = coalesce(v_notes, v_step.notes),
		lock_version = lock_version + 1
	where id = p_step_id and lock_version = p_lock_version
	returning * into v_step;
	update public.fulfilment_cases
	set lock_version = lock_version + 1
	where id = v_case.id
	returning lock_version into v_case_lock;
	insert into public.activities (lead_id, client_id, quote_id, fulfilment_case_id, actor_id, event_type, metadata, summary)
	values (
		v_case.lead_id,
		v_case.client_id,
		v_case.accepted_quote_id,
		v_case.id,
		v_actor,
		'fulfilment_step_ready_for_collection',
		jsonb_build_object('step_id', v_step.id),
		'Pickup ready for collection'
	);
	return jsonb_build_object(
		'step_id', v_step.id,
		'status', v_step.status,
		'lock_version', v_step.lock_version,
		'fulfilment_case_lock_version', v_case_lock
	);
end;
$$;

revoke all on function public.dispatch_fulfilment_step(uuid, bigint, text, text) from public, anon;
grant execute on function public.dispatch_fulfilment_step(uuid, bigint, text, text) to authenticated;
revoke all on function public.ready_fulfilment_step(uuid, bigint, text) from public, anon;
grant execute on function public.ready_fulfilment_step(uuid, bigint, text) to authenticated;

comment on function public.dispatch_fulfilment_step(uuid, bigint, text, text) is 'Trusted courier dispatch transition with optional CRM tracking evidence.';
comment on function public.ready_fulfilment_step(uuid, bigint, text) is 'Trusted pickup readiness transition with optional CRM notes.';

commit;
