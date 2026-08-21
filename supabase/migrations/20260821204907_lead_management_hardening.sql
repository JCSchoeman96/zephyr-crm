begin;

alter table public.leads
	add column if not exists attention_reason text,
	add column if not exists attention_resume_at timestamptz;

alter table public.leads
	add constraint leads_attention_pause_matches_state check (
		(
			attention_state = 'paused'
			and length(trim(coalesce(attention_reason, ''))) > 0
		)
		or (
			attention_state <> 'paused'
			and attention_reason is null
			and attention_resume_at is null
		)
	);

create index if not exists leads_created_at_idx
on public.leads (created_at desc, id);

create index if not exists leads_last_activity_idx
on public.leads (last_activity_at desc nulls last, id);

create index if not exists leads_updated_at_idx
on public.leads (updated_at desc, id);

create or replace function public.ingest_bricks_lead(
	p_form_id text,
	p_external_submission_id text,
	p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_inbound_id uuid;
	v_existing_lead_id uuid;
	v_lead_id uuid;
	v_source_id uuid;
	v_payload_hash text;
	v_first_name text;
	v_last_name text;
	v_source_code text;
begin
	if length(trim(coalesce(p_form_id, ''))) = 0 then
		raise exception using errcode = '22023', message = 'form_id is required';
	end if;
	if length(trim(coalesce(p_external_submission_id, ''))) = 0 then
		raise exception using errcode = '22023', message = 'external_submission_id is required';
	end if;
	if p_payload is null then
		raise exception using errcode = '22023', message = 'payload is required';
	end if;

	v_payload_hash = encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');

	insert into public.inbound_submissions (
		source,
		external_submission_id,
		form_id,
		intake_state,
		payload_hash
	)
	values ('bricks', trim(p_external_submission_id), trim(p_form_id), 'received', v_payload_hash)
	on conflict (source, external_submission_id) do nothing
	returning id into v_inbound_id;

	if v_inbound_id is null then
		select id, lead_id
		into v_inbound_id, v_existing_lead_id
		from public.inbound_submissions
		where source = 'bricks'
			and external_submission_id = trim(p_external_submission_id);
		update public.inbound_submissions
		set intake_state = case
			when lead_id is null then intake_state
			else 'accepted'
		end,
			processed_at = coalesce(processed_at, now())
		where id = v_inbound_id;
		return jsonb_build_object(
			'duplicate', true,
			'inbound_submission_id', v_inbound_id,
			'lead_id', v_existing_lead_id
		);
	end if;

	v_first_name = coalesce(
		nullif(trim(p_payload ->> 'first_name'), ''),
		nullif(trim(p_payload ->> 'name'), ''),
		'Unknown'
	);
	v_last_name = coalesce(nullif(trim(p_payload ->> 'last_name'), ''), '');
	v_source_code = coalesce(nullif(trim(p_payload ->> 'source'), ''), 'bricks');
	select id into v_source_id
	from public.lead_sources
	where code = v_source_code and active;
	if v_source_id is null then
		select id into v_source_id
		from public.lead_sources
		where code = 'bricks' and active;
	end if;

	insert into public.leads (
		source_id,
		external_submission_id,
		first_name,
		last_name,
		email,
		phone,
		company,
		message,
		landing_page,
		referrer,
		utm_source,
		utm_medium,
		utm_campaign,
		utm_content,
		utm_term,
		last_activity_at
	)
	values (
		v_source_id,
		trim(p_external_submission_id),
		v_first_name,
		v_last_name,
		nullif(trim(p_payload ->> 'email'), ''),
		nullif(trim(p_payload ->> 'phone'), ''),
		nullif(trim(p_payload ->> 'company'), ''),
		nullif(trim(p_payload ->> 'message'), ''),
		nullif(trim(p_payload ->> 'landing_page'), ''),
		nullif(trim(p_payload ->> 'referrer'), ''),
		nullif(trim(p_payload ->> 'utm_source'), ''),
		nullif(trim(p_payload ->> 'utm_medium'), ''),
		nullif(trim(p_payload ->> 'utm_campaign'), ''),
		nullif(trim(p_payload ->> 'utm_content'), ''),
		nullif(trim(p_payload ->> 'utm_term'), ''),
		now()
	)
	returning id into v_lead_id;

	insert into public.activities (lead_id, event_type, metadata, summary)
	values (
		v_lead_id,
		'lead_created',
		jsonb_build_object('source', 'bricks', 'inbound_submission_id', v_inbound_id),
		'Lead created from Bricks website submission'
	);

	update public.inbound_submissions
	set intake_state = 'accepted', lead_id = v_lead_id, processed_at = now()
	where id = v_inbound_id;

	return jsonb_build_object(
		'duplicate', false,
		'inbound_submission_id', v_inbound_id,
		'lead_id', v_lead_id
	);
end;
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
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_quote_id uuid;
	v_item_id uuid;
	v_subtotal numeric(14, 2);
	v_tax_amount numeric(14, 2);
	v_total numeric(14, 2);
	v_line_subtotal numeric(14, 2);
	v_lock_version bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if length(trim(coalesce(p_subject, ''))) = 0 or length(trim(coalesce(p_item_name, ''))) = 0 then
		raise exception using errcode = '22023', message = 'Quote subject and item name are required';
	end if;
	if p_quantity is null or p_quantity <= 0 or p_unit_price is null or p_unit_price < 0 then
		raise exception using errcode = '22023', message = 'Quote quantity and price are invalid';
	end if;
	if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then
		raise exception using errcode = '22023', message = 'Quote tax rate is invalid';
	end if;

	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then
		raise exception using errcode = '22023', message = 'Lead must be in proposal or decision before quoting';
	end if;

	v_line_subtotal = round(p_quantity * p_unit_price, 2);
	v_subtotal = v_line_subtotal;
	v_tax_amount = round(v_subtotal * p_tax_rate / 100, 2);
	v_total = v_subtotal + v_tax_amount;

	insert into public.quotes (
		lead_id,
		status,
		subject,
		tax_rate,
		subtotal,
		tax_amount,
		total,
		valid_until,
		created_by
	)
	values (
		p_lead_id,
		'ready',
		trim(p_subject),
		p_tax_rate,
		v_subtotal,
		v_tax_amount,
		v_total,
		current_date + 30,
		auth.uid()
	)
	returning id, lock_version into v_quote_id, v_lock_version;

	insert into public.quote_items (quote_id, position, name, quantity, unit_price, line_subtotal)
	values (v_quote_id, 1, trim(p_item_name), p_quantity, p_unit_price, v_line_subtotal)
	returning id into v_item_id;

	update public.leads
	set last_activity_at = now(),
		lock_version = lock_version + 1
	where id = p_lead_id;

	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id,
		v_quote_id,
		auth.uid(),
		'quote_created',
		jsonb_build_object('quote_id', v_quote_id, 'item_id', v_item_id),
		'Quote created'
	);

	return jsonb_build_object(
		'quote_id', v_quote_id,
		'item_id', v_item_id,
		'status', 'ready',
		'subtotal', v_subtotal,
		'tax_amount', v_tax_amount,
		'total', v_total,
		'lock_version', v_lock_version
	);
end;
$$;

create function public.record_bricks_rejection(
	p_form_id text,
	p_external_submission_id text,
	p_payload jsonb,
	p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_id uuid;
	v_form_id text := nullif(trim(coalesce(p_form_id, '')), '');
	v_external_id text := nullif(trim(coalesce(p_external_submission_id, '')), '');
	v_error text := left(nullif(trim(coalesce(p_error_message, '')), ''), 500);
	v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
	v_payload_hash text;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted intake recording required';
	end if;
	if v_form_id is null or v_external_id is null then
		raise exception using errcode = '22023', message = 'form_id and external_submission_id are required';
	end if;
	if v_error is null then
		raise exception using errcode = '22023', message = 'rejection error_message is required';
	end if;

	v_payload_hash = encode(
		extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'),
		'hex'
	);

	insert into public.inbound_submissions (
		source,
		external_submission_id,
		form_id,
		intake_state,
		payload_hash,
		error_message,
		processed_at
	)
	values (
		'bricks',
		v_external_id,
		v_form_id,
		'rejected',
		v_payload_hash,
		v_error,
		now()
	)
	on conflict (source, external_submission_id) do update
	set form_id = excluded.form_id,
		intake_state = case
			when public.inbound_submissions.lead_id is not null
				or public.inbound_submissions.intake_state = 'accepted'
			then public.inbound_submissions.intake_state
			else 'rejected'
		end,
		payload_hash = case
			when public.inbound_submissions.lead_id is not null
				or public.inbound_submissions.intake_state = 'accepted'
			then public.inbound_submissions.payload_hash
			else excluded.payload_hash
		end,
		error_message = case
			when public.inbound_submissions.lead_id is not null
				or public.inbound_submissions.intake_state = 'accepted'
			then public.inbound_submissions.error_message
			else excluded.error_message
		end,
		processed_at = case
			when public.inbound_submissions.lead_id is not null
				or public.inbound_submissions.intake_state = 'accepted'
			then public.inbound_submissions.processed_at
			else excluded.processed_at
		end
	returning id into v_id;

	if v_id is null then
		select id
		into v_id
		from public.inbound_submissions
		where source = 'bricks'
			and external_submission_id = v_external_id;
	end if;

	return jsonb_build_object('inbound_submission_id', v_id, 'recorded', true);
end;
$$;

create function public.set_lead_attention(
	p_lead_id uuid,
	p_attention_state text,
	p_reason text default null,
	p_resume_at timestamptz default null,
	p_lock_version bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_lead public.leads%rowtype;
	v_new_lock bigint;
	v_reason text;
	v_resume_at timestamptz;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_attention_state not in ('none', 'waiting_on_client', 'waiting_on_us', 'follow_up_scheduled', 'paused') then
		raise exception using errcode = '22023', message = 'Invalid lead attention state';
	end if;
	v_reason = case
		when p_attention_state = 'paused' then nullif(trim(coalesce(p_reason, '')), '')
		else null
	end;
	v_resume_at = case when p_attention_state = 'paused' then p_resume_at else null end;
	if p_attention_state = 'paused' and v_reason is null then
		raise exception using errcode = '23514', message = 'Paused leads require an attention reason';
	end if;

	select *
	into v_lead
	from public.leads
	where id = p_lead_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if p_lock_version is not null and p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;
	if v_lead.pipeline_stage in ('WON', 'LOST') and p_attention_state <> 'none' then
		raise exception using errcode = '22023', message = 'Terminal leads cannot require attention';
	end if;

	update public.leads
	set attention_state = p_attention_state,
		attention_reason = case when p_attention_state = 'paused' then v_reason else null end,
		attention_resume_at = v_resume_at,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = p_lead_id and lock_version = v_lead.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id,
	auth.uid(),
		'attention_changed',
		jsonb_build_object(
			'from_state', v_lead.attention_state,
			'to_state', p_attention_state,
			'reason', v_reason,
			'resume_at', v_resume_at
		),
		case
			when p_attention_state = 'paused' then 'Lead paused'
			when p_attention_state = 'none' then 'Lead attention cleared'
			else format('Lead attention set to %s', p_attention_state)
		end
	);

	return jsonb_build_object(
		'lead_id', p_lead_id,
		'attention_state', p_attention_state,
		'attention_reason', v_reason,
		'attention_resume_at', v_resume_at,
		'lock_version', v_new_lock
	);
end;
$$;

create function public.assign_lead(
	p_lead_id uuid,
	p_assigned_to uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_actor_role text;
	v_lead public.leads%rowtype;
	v_target_role text;
	v_new_lock bigint;
begin
	v_actor_role := private.current_user_role();
	if v_actor_role is null or v_actor_role not in ('owner', 'admin', 'sales') then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_actor_role = 'sales' and p_assigned_to is distinct from auth.uid() then
		raise exception using errcode = '42501', message = 'Sales users may only assign leads to themselves';
	end if;
	if p_assigned_to is not null then
		select role
		into v_target_role
		from public.profiles
		where id = p_assigned_to
			and status = 'active'
			and role in ('owner', 'admin', 'sales');
		if v_target_role is null then
			raise exception using errcode = '22023', message = 'Lead assignee must be an active CRM user';
		end if;
	end if;

	select *
	into v_lead
	from public.leads
	where id = p_lead_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	update public.leads
	set assigned_to = p_assigned_to,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = p_lead_id and lock_version = p_lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id,
		auth.uid(),
		'lead_assigned',
		jsonb_build_object('from_assigned_to', v_lead.assigned_to, 'to_assigned_to', p_assigned_to),
		case when p_assigned_to is null then 'Lead unassigned' else 'Lead assigned' end
	);

	return jsonb_build_object(
		'lead_id', p_lead_id,
		'assigned_to', p_assigned_to,
		'lock_version', v_new_lock
	);
end;
$$;

create function public.reopen_lead(
	p_lead_id uuid,
	p_lock_version bigint,
	p_reason text
)
returns jsonb
language plpgsql
security invoker
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
	if v_reason is null then
		raise exception using errcode = '22023', message = 'A reopen reason is required';
	end if;

	select *
	into v_lead
	from public.leads
	where id = p_lead_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if v_lead.pipeline_stage <> 'LOST' then
		raise exception using errcode = '22023', message = 'Only lost leads can be reopened';
	end if;
	if p_lock_version is distinct from v_lead.lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	update public.leads
	set pipeline_stage = 'QUALIFICATION',
		attention_state = 'none',
		attention_reason = null,
		attention_resume_at = null,
		lost_reason_id = null,
		lost_notes = null,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = p_lead_id and lock_version = p_lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id,
		auth.uid(),
		'lead_reopened',
		jsonb_build_object('from_stage', 'LOST', 'to_stage', 'QUALIFICATION', 'reason', v_reason),
		'Lead reopened for qualification'
	);

	return jsonb_build_object(
		'lead_id', p_lead_id,
		'pipeline_stage', 'QUALIFICATION',
		'lock_version', v_new_lock
	);
end;
$$;

revoke all on function public.record_bricks_rejection(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_bricks_rejection(text, text, jsonb, text) to service_role;

revoke all on function public.set_lead_attention(uuid, text, text, timestamptz, bigint) from public, anon;
grant execute on function public.set_lead_attention(uuid, text, text, timestamptz, bigint) to authenticated;

revoke all on function public.assign_lead(uuid, uuid, bigint) from public, anon;
grant execute on function public.assign_lead(uuid, uuid, bigint) to authenticated;

revoke all on function public.reopen_lead(uuid, bigint, text) from public, anon;
grant execute on function public.reopen_lead(uuid, bigint, text) to authenticated;

commit;
