begin;

-- P17 makes the ordinary Quote decision the trusted Sales-to-Fulfilment
-- boundary. The historical two-argument status wrappers remain available for
-- frozen v1.3.2 compatibility; the four-argument actions below are the
-- canonical v1.4.0 browser/server boundary.

-- Client linkage is part of the v1.4.0 handoff, not Quote commercial content.
-- Permit only the sent-to-accepted linkage change; every commercial field and
-- every other terminal-state mutation remains covered by the old guard.
create or replace function private.protect_quote_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_accepting boolean := old.status = 'sent' and new.status = 'accepted';
begin
	if old.status in ('sent', 'accepted', 'declined', 'expired', 'cancelled', 'superseded') and (
		new.lead_id is distinct from old.lead_id or
		(new.client_id is distinct from old.client_id and not v_accepting) or
		new.currency is distinct from old.currency or
		new.subject is distinct from old.subject or
		new.introduction is distinct from old.introduction or
		new.terms is distinct from old.terms or
		new.tax_label is distinct from old.tax_label or
		new.tax_rate is distinct from old.tax_rate or
		new.subtotal is distinct from old.subtotal or
		new.tax_amount is distinct from old.tax_amount or
		new.total is distinct from old.total or
		new.valid_until is distinct from old.valid_until or
		new.quote_snapshot is distinct from old.quote_snapshot or
		new.quote_year is distinct from old.quote_year or
		new.supersedes_quote_id is distinct from old.supersedes_quote_id or
		new.document_path is distinct from old.document_path or
		new.document_hash is distinct from old.document_hash or
		new.document_generated_at is distinct from old.document_generated_at
	) then
		raise exception using errcode = '55000', message = 'Sent quote commercial data is immutable';
	end if;
	return new;
end;
$$;

create or replace function private.accepted_quote_handoff(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_case public.fulfilment_cases%rowtype;
	v_lead public.leads%rowtype;
	v_planning_task_id uuid;
begin
	select * into v_quote
	from public.quotes
	where id = p_quote_id
	for share;
	if not found then
		raise exception using errcode = 'P0002', message = 'Quote not found';
	end if;
	if v_quote.status <> 'accepted' then
		raise exception using errcode = '22023', message = 'Quote has not been accepted';
	end if;

	select * into v_case
	from public.fulfilment_cases
	where accepted_quote_id = p_quote_id
	for update;
	if not found then
		raise exception using errcode = '55000', message = 'Accepted Quote has no FulfilmentCase';
	end if;

	select * into v_lead
	from public.leads
	where id = v_case.lead_id
	for share;
	select id into v_planning_task_id
	from public.tasks
	where fulfilment_case_id = v_case.id
		and type = 'plan_fulfilment'
	order by created_at, id
	limit 1
	for share;
	if v_planning_task_id is null then
		raise exception using errcode = '55000', message = 'Accepted Quote has no planning Task';
	end if;

	return jsonb_build_object(
		'quote_id', v_quote.id,
		'status', v_quote.status,
		'lock_version', v_quote.lock_version,
		'quote_lock_version', v_quote.lock_version,
		'lead_id', v_case.lead_id,
		'lead_lock_version', v_lead.lock_version,
		'client_id', v_case.client_id,
		'fulfilment_case_id', v_case.id,
		'fulfilment_case_lock_version', v_case.lock_version,
		'planning_task_id', v_planning_task_id,
		'idempotent', true
	);
end;
$$;

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
	v_actor uuid := (select auth.uid());
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_conversion jsonb;
	v_case jsonb;
	v_planning_task jsonb;
	v_source text := nullif(trim(coalesce(p_acceptance_source, '')), '');
	v_evidence text := nullif(trim(coalesce(p_acceptance_evidence, '')), '');
	v_client_id uuid;
	v_case_id uuid;
	v_quote_lock bigint;
	v_planning_task_id uuid;
	v_assignee uuid;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_source is null then
		raise exception using errcode = '22023', message = 'Acceptance source is required';
	end if;
	if char_length(v_source) > 120 then
		raise exception using errcode = '22023', message = 'Acceptance source is too long';
	end if;
	if v_evidence is not null and char_length(v_evidence) > 2000 then
		raise exception using errcode = '22023', message = 'Acceptance evidence is too long';
	end if;

	-- Quote is the commercial decision authority. Every cross-resource path
	-- takes this lock before the Lead lock, including revision handback.
	select * into v_quote
	from public.quotes
	where id = p_quote_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Quote not found';
	end if;
	if v_quote.status = 'accepted' then
		return private.accepted_quote_handoff(v_quote.id);
	end if;
	if v_quote.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	if v_quote.status <> 'sent' then
		raise exception using errcode = '22023', message = 'Only a sent Quote can be accepted';
	end if;

	select * into v_lead
	from public.leads
	where id = v_quote.lead_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if v_lead.pipeline_stage <> 'DECISION' then
		raise exception using errcode = '22023', message = 'Only a decision Lead can accept a Quote';
	end if;
	if exists (
		select 1
		from public.quotes newer
		where newer.lead_id = v_quote.lead_id
			and newer.id <> v_quote.id
			and newer.status in ('draft', 'ready', 'sent', 'accepted')
			and (
				newer.created_at > v_quote.created_at
				or (newer.created_at = v_quote.created_at and newer.id > v_quote.id)
			)
	) then
		raise exception using errcode = '22023', message = 'Quote is not the current valid sent revision';
	end if;

	-- Conversion remains the existing idempotent Client policy. It runs inside
	-- this transaction, so any later case/task/activity failure rolls it back.
	v_conversion := public.convert_lead(v_lead.id, v_lead.lock_version);
	v_client_id := nullif(v_conversion ->> 'client_id', '')::uuid;
	if v_client_id is null then
		raise exception using errcode = '55000', message = 'Lead conversion returned no Client';
	end if;

	update public.quotes
	set status = 'accepted',
		client_id = v_client_id,
		accepted_at = now(),
		accepted_by = v_actor,
		acceptance_source = v_source,
		acceptance_evidence = v_evidence,
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_quote_lock;
	if v_quote_lock is null then
		raise exception using errcode = '40001', message = 'Quote changed during acceptance';
	end if;

	v_case := private.create_fulfilment_case_for_accepted_quote(v_quote.id, v_actor);
	v_case_id := nullif(v_case ->> 'fulfilment_case_id', '')::uuid;
	if v_case_id is null then
		raise exception using errcode = '55000', message = 'Fulfilment handoff returned no case';
	end if;

	select p.id into v_assignee
	from public.profiles p
	where p.id = v_actor
		and p.status = 'active'
		and p.role in ('owner', 'admin', 'sales');
	v_planning_task := private.create_task_impl(
		v_case_id,
		null,
		null,
		v_quote.id,
		'plan_fulfilment',
		'Plan fulfilment',
		'Plan the accepted sale and schedule its operational work.',
		v_assignee,
		now(),
		null
	);
	v_planning_task_id := nullif(v_planning_task ->> 'task_id', '')::uuid;
	if v_planning_task_id is null then
		raise exception using errcode = '55000', message = 'Fulfilment handoff returned no planning Task';
	end if;

	insert into public.activities (
		lead_id, client_id, quote_id, fulfilment_case_id, actor_id,
		event_type, metadata, summary
	)
	values (
		v_lead.id,
		v_client_id,
		v_quote.id,
		v_case_id,
		v_actor,
		'quote_accepted',
		jsonb_build_object(
			'acceptance_source', v_source,
			'has_evidence', v_evidence is not null,
			'planning_task_id', v_planning_task_id
		),
		'Quote accepted and handed to Fulfilment'
	);

	return jsonb_build_object(
		'quote_id', v_quote.id,
		'status', 'accepted',
		'lock_version', v_quote_lock,
		'quote_lock_version', v_quote_lock,
		'lead_id', v_lead.id,
		'lead_lock_version', v_lead.lock_version + 1,
		'client_id', v_client_id,
		'contact_id', nullif(v_conversion ->> 'contact_id', '')::uuid,
		'fulfilment_case_id', v_case_id,
		'fulfilment_case_lock_version', (v_case ->> 'lock_version')::bigint,
		'planning_task_id', v_planning_task_id,
		'closed_task_count', coalesce((v_conversion ->> 'closed_task_count')::integer, 0),
		'idempotent', false
	);
end;
$$;

-- Frozen v1.3.2 tests and migration/recovery callers still use this wrapper.
-- It records a valid internal acceptance source but deliberately does not
-- pretend to be the v1.4.0 cross-domain browser handoff.
create or replace function public.accept_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status = 'accepted' then
		return jsonb_build_object('quote_id', v_quote.id, 'status', v_quote.status, 'lock_version', v_quote.lock_version, 'idempotent', true);
	end if;
	if v_quote.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_quote.status <> 'sent' then raise exception using errcode = '22023', message = 'Only a sent Quote can be accepted'; end if;
	update public.quotes
	set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), acceptance_source = 'internal', acceptance_evidence = null, lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.lead_id, v_quote.id, auth.uid(), 'quote_accepted', jsonb_build_object('acceptance_source', 'internal', 'legacy_wrapper', true), 'Quote accepted');
	return jsonb_build_object('quote_id', v_quote.id, 'status', 'accepted', 'lock_version', v_new_lock, 'idempotent', false);
end;
$$;

create or replace function public.revise_quote(
	p_quote_id uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_source public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_new_id uuid;
	v_revision integer;
	v_lock_version bigint;
	v_lead_lock bigint;
	v_planning_task jsonb;
	v_planning_task_id uuid;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_source from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_source.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_source.status <> 'sent' then raise exception using errcode = '22023', message = 'Only a sent Quote can be revised'; end if;
	select * into v_lead from public.leads where id = v_source.lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_lead.pipeline_stage <> 'DECISION' then raise exception using errcode = '22023', message = 'Only a decision Lead can revise a Quote'; end if;

	perform pg_advisory_xact_lock(v_source.base_quote_number);
	select coalesce(max(revision_number), 0) + 1
	into v_revision
	from public.quotes
	where base_quote_number = v_source.base_quote_number;
	insert into public.quotes (
		base_quote_number, quote_year, revision_number, lead_id, client_id, status, currency, subject,
		introduction, terms, tax_label, tax_rate, subtotal, tax_amount, total, valid_until,
		quote_snapshot, supersedes_quote_id, created_by
	)
	values (
		v_source.base_quote_number, v_source.quote_year, v_revision, v_source.lead_id, v_source.client_id,
		'draft', v_source.currency, v_source.subject, v_source.introduction, v_source.terms,
		v_source.tax_label, v_source.tax_rate, v_source.subtotal, v_source.tax_amount, v_source.total,
		v_source.valid_until, v_source.quote_snapshot, v_source.id, v_actor
	)
	returning id, lock_version into v_new_id, v_lock_version;

	insert into public.quote_items (quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal)
	select v_new_id, position, name, description, quantity, unit_price, taxable, line_subtotal
	from public.quote_items
	where quote_id = v_source.id
	order by position;

	update public.leads
	set pipeline_stage = 'PROPOSAL',
		attention_state = 'waiting_on_us',
		attention_reason = null,
		attention_resume_at = null,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id and lock_version = v_lead.lock_version
	returning lock_version into v_lead_lock;
	if v_lead_lock is null then raise exception using errcode = '40001', message = 'Lead changed during Quote revision'; end if;

	v_planning_task := private.create_task_impl(
		null,
		v_source.lead_id,
		null,
		v_new_id,
		'prepare_quote',
		'Prepare revised Quote',
		'Review and send the revised Quote.',
		v_actor,
		now(),
		null
	);
	v_planning_task_id := nullif(v_planning_task ->> 'task_id', '')::uuid;

	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		v_source.lead_id,
		v_new_id,
		v_actor,
		'quote_revised',
		jsonb_build_object('previous_quote_id', v_source.id, 'revision_number', v_revision, 'planning_task_id', v_planning_task_id),
		'Quote revision created'
	);
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		v_source.lead_id,
		v_new_id,
		v_actor,
		'pipeline_changed',
		jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'PROPOSAL'),
		'Lead returned to Proposal for Quote revision'
	);

	return jsonb_build_object(
		'quote_id', v_new_id,
		'quote_number', (select quote_number from public.quotes where id = v_new_id),
		'revision_number', v_revision,
		'supersedes_quote_id', v_source.id,
		'status', 'draft',
		'lock_version', v_lock_version,
		'lead_lock_version', v_lead_lock,
		'planning_task_id', v_planning_task_id,
		'idempotent', false
	);
end;
$$;

create or replace function public.decline_quote(
	p_quote_id uuid,
	p_lock_version bigint,
	p_lost_reason_id uuid,
	p_lost_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_reason_code text;
	v_notes text := nullif(trim(coalesce(p_lost_notes, '')), '');
	v_quote_lock bigint;
	v_lead_lock bigint;
	v_closed_task_count integer := 0;
	v_closed_task_ids uuid[] := '{}'::uuid[];
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_notes is not null and char_length(v_notes) > 2000 then
		raise exception using errcode = '22023', message = 'Lost notes are too long';
	end if;

	-- Keep the same Quote-before-Lead ordering as acceptance and revision.
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	select * into v_lead from public.leads where id = v_quote.lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_quote.status = 'declined' and v_lead.pipeline_stage = 'LOST' then
		return jsonb_build_object(
			'quote_id', v_quote.id,
			'status', v_quote.status,
			'lock_version', v_quote.lock_version,
			'lead_id', v_lead.id,
			'lead_lock_version', v_lead.lock_version,
			'lost_reason_id', v_lead.lost_reason_id,
			'idempotent', true
		);
	end if;
	if v_quote.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_quote.status <> 'sent' then raise exception using errcode = '22023', message = 'Only a sent Quote can be declined'; end if;
	if v_lead.pipeline_stage <> 'DECISION' then raise exception using errcode = '22023', message = 'Only a decision Lead can decline a Quote'; end if;
	if exists (
		select 1
		from public.quotes newer
		where newer.lead_id = v_quote.lead_id
			and newer.id <> v_quote.id
			and newer.status in ('draft', 'ready', 'sent', 'accepted')
			and (
				newer.created_at > v_quote.created_at
				or (newer.created_at = v_quote.created_at and newer.id > v_quote.id)
			)
	) then
		raise exception using errcode = '22023', message = 'Quote is not the current valid sent revision';
	end if;

	select code into v_reason_code
	from public.lost_reasons
	where id = p_lost_reason_id and active;
	if v_reason_code is null then raise exception using errcode = '23514', message = 'LOST leads require an active lost reason'; end if;
	if v_reason_code = 'other' and v_notes is null then raise exception using errcode = '23514', message = 'The other lost reason requires lost_notes'; end if;

	update public.quotes
	set status = 'declined', declined_at = now(), lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_quote_lock;
	if v_quote_lock is null then raise exception using errcode = '40001', message = 'Quote changed during decline'; end if;

	with closed_tasks as (
		update public.tasks
		set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), lock_version = lock_version + 1
		where lead_id = v_lead.id and status = 'open'
		returning id
	)
	select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
	into v_closed_task_count, v_closed_task_ids
	from closed_tasks;

	update public.leads
	set pipeline_stage = 'LOST',
		attention_state = 'none',
		attention_reason = null,
		attention_resume_at = null,
		lost_reason_id = p_lost_reason_id,
		lost_notes = v_notes,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id and lock_version = v_lead.lock_version
	returning lock_version into v_lead_lock;
	if v_lead_lock is null then raise exception using errcode = '40001', message = 'Lead changed during decline'; end if;

	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_quote.id,
		v_actor,
		'quote_declined',
		jsonb_build_object('lost_reason_id', p_lost_reason_id, 'lost_reason_code', v_reason_code, 'closed_task_count', v_closed_task_count),
		'Quote declined'
	);
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_quote.id,
		v_actor,
		'lead_lost',
		jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'LOST', 'lost_reason_id', p_lost_reason_id, 'closed_task_count', v_closed_task_count, 'closed_task_ids', to_jsonb(v_closed_task_ids)),
		'Lead marked lost after Quote decline'
	);

	return jsonb_build_object(
		'quote_id', v_quote.id,
		'status', 'declined',
		'lock_version', v_quote_lock,
		'lead_id', v_lead.id,
		'lead_lock_version', v_lead_lock,
		'lost_reason_id', p_lost_reason_id,
		'closed_task_count', v_closed_task_count,
		'idempotent', false
	);
end;
$$;

-- Keep the legacy two-argument decline wrapper for the frozen v1.3.2 state
-- matrix. The browser uses the evidence-bearing overload above.
create or replace function public.decline_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
	select public.transition_quote_status(p_quote_id, p_lock_version, 'declined');
$$;

revoke all on function private.accepted_quote_handoff(uuid) from public, anon, authenticated;
revoke all on function public.accept_quote(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.accept_quote(uuid, bigint, text, text) to authenticated;
revoke all on function public.accept_quote(uuid, bigint) from public, anon, authenticated;
grant execute on function public.accept_quote(uuid, bigint) to authenticated;
revoke all on function public.revise_quote(uuid, bigint) from public, anon, authenticated;
grant execute on function public.revise_quote(uuid, bigint) to authenticated;
revoke all on function public.decline_quote(uuid, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.decline_quote(uuid, bigint, uuid, text) to authenticated;
revoke all on function public.decline_quote(uuid, bigint) from public, anon, authenticated;
grant execute on function public.decline_quote(uuid, bigint) to authenticated;

comment on function public.accept_quote(uuid, bigint, text, text) is 'Canonical v1.4.0 atomic Quote acceptance and Sales-to-Fulfilment handoff.';
comment on function public.revise_quote(uuid, bigint) is 'Creates an immutable Quote revision and returns its Lead to Proposal.';
comment on function public.decline_quote(uuid, bigint, uuid, text) is 'Canonical v1.4.0 atomic Quote decline and Lead-loss closure.';

commit;
