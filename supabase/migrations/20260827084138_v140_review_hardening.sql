begin;

-- v1.4 review hardening. This migration is forward-only and preserves the
-- historical function signatures needed by the frozen P0-P14 contracts while
-- removing browser access to incomplete compatibility paths.

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
		or new.resume_at is not null
		or new.qualification_notes is not null
		or new.qualification_started_at is not null
		or new.qualified_at is not null then
		raise exception using errcode = '42501', message = 'Lead initial workflow state requires a trusted action';
	end if;
	new.created_at := now();
	new.updated_at := new.created_at;

	return new;
end;
$$;

-- The two-argument acceptance signature is retained for the frozen callers,
-- but it must have the same atomic result as the evidence-bearing v1.4 path.
create or replace function public.accept_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
	select public.accept_quote(p_quote_id, p_lock_version, 'legacy_compatibility', null);
$$;

comment on function public.accept_quote(uuid, bigint) is
	'Compatibility wrapper. Delegates to the canonical v1.4 atomic acceptance and Fulfilment handoff.';

-- Generic Quote terminal transitions remain internal implementation helpers for
-- the named wrappers, never a browser-selectable state machine.
revoke all on function public.transition_quote_status(uuid, bigint, text) from public, anon, authenticated;

-- A decline without a LostReason cannot satisfy the v1.4 Quote/Lead closure
-- contract. The old signature remains defined for migration compatibility but
-- is no longer an authenticated browser action.
revoke all on function public.decline_quote(uuid, bigint) from public, anon, authenticated;
comment on function public.decline_quote(uuid, bigint) is
	'Deprecated compatibility signature. Use the evidence-bearing v1.4 decline action.';

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
	set pipeline_stage = 'QUALIFICATION',
		qualification_started_at = coalesce(qualification_started_at, now()),
		qualified_at = null,
		attention_state = 'none',
		attention_reason = null,
		attention_resume_at = null,
		lost_reason_id = null,
		lost_notes = null,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = p_lead_id and lock_version = p_lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (p_lead_id, auth.uid(), 'lead_reopened', jsonb_build_object('from_stage', 'LOST', 'to_stage', 'QUALIFICATION', 'reason', v_reason), 'Lead reopened for qualification');
	perform private.record_security_audit('lead_reopened', 'lead', p_lead_id::text, jsonb_build_object('reason', v_reason));
	return jsonb_build_object('lead_id', p_lead_id, 'pipeline_stage', 'QUALIFICATION', 'lock_version', v_new_lock);
end;
$$;

-- Preserve the public compatibility endpoint used by P0-P14 while applying
-- the v1.4 evidence guard to the only transition that creates a quote-ready
-- Lead. The endpoint never permits DECISION -> WON.
create or replace function public.transition_lead(
	p_lead_id uuid,
	p_to_stage text,
	p_lock_version bigint,
	p_lost_reason_id uuid default null,
	p_lost_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_reason_code text;
	v_new_lock bigint;
	v_closed_task_count integer := 0;
	v_closed_task_ids uuid[] := '{}'::uuid[];
	v_has_contact boolean;
	v_has_enquiry boolean;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;
	if not (
		(v_lead.pipeline_stage = 'NEW' and p_to_stage in ('QUALIFICATION', 'LOST'))
		or (v_lead.pipeline_stage = 'QUALIFICATION' and p_to_stage in ('PROPOSAL', 'LOST'))
		or (v_lead.pipeline_stage = 'PROPOSAL' and p_to_stage in ('DECISION', 'LOST'))
		or (v_lead.pipeline_stage = 'DECISION' and p_to_stage in ('PROPOSAL', 'LOST'))
	) then
		raise exception using errcode = '22023', message = 'No legal lead pipeline transition';
	end if;
	if v_lead.pipeline_stage = 'QUALIFICATION' and p_to_stage = 'PROPOSAL' then
		v_has_contact := length(trim(coalesce(v_lead.email, ''))) > 0
			or length(trim(coalesce(v_lead.phone, ''))) > 0;
		v_has_enquiry := length(trim(coalesce(v_lead.message, ''))) > 0
			or length(trim(coalesce(v_lead.qualification_notes, ''))) > 0;
		if not v_has_contact then
			raise exception using errcode = '23514', message = 'Ready for Quote requires an email or phone';
		end if;
		if not v_has_enquiry then
			raise exception using errcode = '23514', message = 'Ready for Quote requires enquiry information';
		end if;
	end if;
	if p_to_stage = 'LOST' then
		select code into v_reason_code from public.lost_reasons where id = p_lost_reason_id and active;
		if v_reason_code is null then raise exception using errcode = '23514', message = 'LOST leads require an active lost reason'; end if;
		if v_reason_code = 'other' and length(trim(coalesce(p_lost_notes, ''))) = 0 then raise exception using errcode = '23514', message = 'The other lost reason requires lost_notes'; end if;
	end if;
	update public.leads
	set pipeline_stage = p_to_stage,
		qualification_started_at = case when p_to_stage = 'QUALIFICATION' then coalesce(qualification_started_at, now()) else qualification_started_at end,
		qualified_at = case when p_to_stage = 'PROPOSAL' and v_lead.pipeline_stage = 'QUALIFICATION' then coalesce(qualified_at, now()) else qualified_at end,
		attention_state = 'none',
		lost_reason_id = case when p_to_stage = 'LOST' then p_lost_reason_id else null end,
		lost_notes = case when p_to_stage = 'LOST' then nullif(trim(p_lost_notes), '') else null end,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = p_lead_id and lock_version = p_lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale lead lock_version'; end if;
	if p_to_stage = 'LOST' then
		with closed_tasks as (
			update public.tasks
			set status = 'cancelled', cancelled_at = now(), lock_version = lock_version + 1
			where lead_id = p_lead_id and status = 'open'
			returning id
		)
		select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[]) into v_closed_task_count, v_closed_task_ids from closed_tasks;
	end if;
	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id,
		auth.uid(),
		case when p_to_stage = 'LOST' then 'lead_lost' else 'pipeline_changed' end,
		jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', p_to_stage, 'closed_task_count', v_closed_task_count, 'closed_task_ids', to_jsonb(v_closed_task_ids)),
		case when p_to_stage = 'LOST' then 'Lead marked lost' else format('Lead moved to %s', p_to_stage) end
	);
	return jsonb_build_object('lead_id', p_lead_id, 'pipeline_stage', p_to_stage, 'lock_version', v_new_lock, 'closed_task_count', v_closed_task_count);
end;
$$;

comment on function public.transition_lead(uuid, text, bigint, uuid, text) is
	'Compatibility Lead workflow action. Quote readiness requires contact and enquiry evidence; WON requires canonical Quote acceptance.';

-- Every Fulfilment Task is part of the accepted sale. Derive the canonical
-- Quote when a trusted caller omits it, and reject cross-case lineage before
-- the task activity trigger can record an inconsistent relationship.
create or replace function private.enforce_fulfilment_task_quote_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_accepted_quote_id uuid;
begin
	if new.fulfilment_case_id is null then
		return new;
	end if;
	select accepted_quote_id
	into v_accepted_quote_id
	from public.fulfilment_cases
	where id = new.fulfilment_case_id;
	if v_accepted_quote_id is null then
		raise exception using errcode = '23514', message = 'Fulfilment Task requires a valid case Quote';
	end if;
	if new.quote_id is null then
		new.quote_id := v_accepted_quote_id;
	elsif new.quote_id is distinct from v_accepted_quote_id then
		raise exception using errcode = '23514', message = 'Fulfilment Task Quote does not match its case';
	end if;
	return new;
end;
$$;

drop trigger if exists fulfilment_task_quote_lineage on public.tasks;
create trigger fulfilment_task_quote_lineage
before insert or update of fulfilment_case_id, quote_id on public.tasks
for each row execute function private.enforce_fulfilment_task_quote_lineage();

comment on function private.enforce_fulfilment_task_quote_lineage() is
	'Every Fulfilment Task inherits and retains the accepted Quote lineage.';

-- P1-01 compatibility policy: the v1.3.2 two-argument conversion boundary
-- remains available for frozen callers, but v1.4 browser decisions use
-- accept_quote. Every compatibility conversion emits privileged evidence so
-- it is distinguishable from ordinary Quote acceptance during recovery.
create or replace function public.convert_lead(p_lead_id uuid, p_lock_version bigint)
returns jsonb
language plpgsql
security definer
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
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_lead.pipeline_stage = 'WON' and v_lead.converted_client_id is not null then
		return jsonb_build_object('lead_id', v_lead.id, 'client_id', v_lead.converted_client_id, 'idempotent', true);
	end if;
	if v_lead.pipeline_stage <> 'DECISION' then
		raise exception using errcode = '22023', message = 'Only a decision lead can be won';
	end if;
	if v_lead.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;
	v_company_name := nullif(trim(v_lead.company), '');
	v_client_type := case when v_company_name is null then 'individual' else 'company' end;
	v_display_name := coalesce(
		v_company_name,
		nullif(trim(concat_ws(' ', nullif(trim(v_lead.first_name), ''), nullif(trim(v_lead.last_name), ''))), ''),
		'Converted client'
	);
	insert into public.clients (type, display_name, company_name, email, phone, source_lead_id, converted_at)
	values (v_client_type, v_display_name, v_company_name, v_lead.email, v_lead.phone, v_lead.id, now())
	returning id into v_client_id;
	insert into public.client_contacts (client_id, first_name, last_name, email, phone, is_primary)
	values (v_client_id, coalesce(nullif(trim(v_lead.first_name), ''), 'Primary'), coalesce(nullif(trim(v_lead.last_name), ''), ''), v_lead.email, v_lead.phone, true)
	returning id into v_contact_id;
	update public.leads
	set pipeline_stage = 'WON', attention_state = 'none', attention_reason = null,
		attention_resume_at = null, converted_client_id = v_client_id, last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id and lock_version = p_lock_version;
	if not found then raise exception using errcode = '40001', message = 'Lead changed during conversion'; end if;
	with closed_tasks as (
		update public.tasks
		set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), lock_version = lock_version + 1
		where lead_id = v_lead.id and status = 'open'
		returning id
	)
	select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
	into v_closed_task_count, v_closed_task_ids
	from closed_tasks;
	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary)
	values (v_lead.id, v_client_id, auth.uid(), 'client_created', jsonb_build_object('contact_id', v_contact_id, 'client_type', v_client_type, 'duplicate_strategy', 'source_lead_id'), 'Client created from won lead');
	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary)
	values (v_lead.id, v_client_id, auth.uid(), 'lead_won', jsonb_build_object('client_id', v_client_id, 'closed_task_count', v_closed_task_count, 'closed_task_ids', to_jsonb(v_closed_task_ids), 'conversion_policy', 'legacy_compatibility_recovery'), 'Lead marked won and converted to client');
	perform private.record_security_audit(
		'lead_converted_compatibility',
		'lead',
		v_lead.id::text,
		jsonb_build_object('client_id', v_client_id, 'reason', 'legacy v1.3.2 conversion compatibility boundary')
	);
	return jsonb_build_object('lead_id', v_lead.id, 'client_id', v_client_id, 'contact_id', v_contact_id, 'idempotent', false, 'closed_task_count', v_closed_task_count);
end;
$$;

comment on function public.convert_lead(uuid, bigint) is
	'Compatibility migration/recovery conversion. The v1.4 ordinary WON path is accept_quote; this boundary records security audit evidence.';

-- Fulfilment status, work, payment, and append-only history are all part of
-- the live detail contract. Keep the publication in sync with the page
-- subscriptions so the status indicator never implies broader coverage.
do $$
declare
	table_name text;
begin
	foreach table_name in array array[
		'quotes',
		'tasks',
		'fulfilment_cases',
		'fulfilment_steps',
		'payment_milestones',
		'activities'
	] loop
		if not exists (
			select 1
			from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = table_name
		) then
			execute format('alter publication supabase_realtime add table public.%I', table_name);
		end if;
	end loop;
end;
$$;

commit;
