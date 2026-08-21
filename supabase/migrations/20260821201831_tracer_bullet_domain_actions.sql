begin;

insert into public.lead_sources (code, label, sort_order)
values ('bricks', 'Bricks website form', 5)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;

alter table public.leads drop constraint if exists leads_external_submission_id_key;

create index if not exists leads_external_submission_idx
on public.leads (external_submission_id)
where external_submission_id is not null;

create function public.ingest_bricks_lead(
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
		set intake_state = case when lead_id is null then intake_state else 'duplicate' end,
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
		utm_term
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
		nullif(trim(p_payload ->> 'utm_term'), '')
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

create function public.transition_lead(
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
	v_current_stage text;
	v_current_lock bigint;
	v_reason_code text;
	v_new_lock bigint;
	v_attention_state text;
	v_event_type text;
	v_summary text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;

	select pipeline_stage, lock_version
	into v_current_stage, v_current_lock
	from public.leads
	where id = p_lead_id
	for update;
	if v_current_stage is null then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if p_lock_version is distinct from v_current_lock then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	if not (
		(v_current_stage = 'NEW' and p_to_stage in ('QUALIFICATION', 'LOST')) or
		(v_current_stage = 'QUALIFICATION' and p_to_stage in ('PROPOSAL', 'LOST')) or
		(v_current_stage = 'PROPOSAL' and p_to_stage in ('DECISION', 'LOST')) or
		(v_current_stage = 'DECISION' and p_to_stage in ('PROPOSAL', 'LOST'))
	) then
		raise exception using errcode = '22023', message = 'No legal lead pipeline transition';
	end if;

	if p_to_stage = 'LOST' then
		select code into v_reason_code
		from public.lost_reasons
		where id = p_lost_reason_id and active;
		if v_reason_code is null then
			raise exception using errcode = '23514', message = 'LOST leads require an active lost reason';
		end if;
		if v_reason_code = 'other' and length(trim(coalesce(p_lost_notes, ''))) = 0 then
			raise exception using errcode = '23514', message = 'The other lost reason requires lost_notes';
		end if;
		v_attention_state = 'none';
		v_event_type = 'lead_lost';
		v_summary = 'Lead marked lost';
	else
		v_attention_state = 'none';
		v_event_type = 'pipeline_changed';
		v_summary = format('Lead moved to %s', p_to_stage);
	end if;

	update public.leads
	set pipeline_stage = p_to_stage,
		attention_state = v_attention_state,
		lost_reason_id = case when p_to_stage = 'LOST' then p_lost_reason_id else null end,
		lost_notes = case when p_to_stage = 'LOST' then nullif(trim(p_lost_notes), '') else null end,
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
		v_event_type,
		jsonb_build_object('from_stage', v_current_stage, 'to_stage', p_to_stage),
		v_summary
	);

	return jsonb_build_object('lead_id', p_lead_id, 'pipeline_stage', p_to_stage, 'lock_version', v_new_lock);
end;
$$;

create function public.create_minimal_quote(
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

create function public.prepare_quote_send(
	p_quote_id uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_existing public.outbound_messages%rowtype;
	v_message_id uuid;
	v_recipient jsonb;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;

	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Quote not found';
	end if;
	if v_quote.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	if v_quote.status <> 'ready' then
		raise exception using errcode = '22023', message = 'Only a ready quote can be sent';
	end if;

	select * into v_lead from public.leads where id = v_quote.lead_id for update;
	if not found or length(trim(coalesce(v_lead.email, ''))) = 0 then
		raise exception using errcode = '23514', message = 'A lead email is required before sending a quote';
	end if;
	v_recipient = jsonb_build_object(
		'email', v_lead.email,
		'name', trim(concat_ws(' ', v_lead.first_name, v_lead.last_name))
	);

	select * into v_existing
	from public.outbound_messages
	where quote_id = p_quote_id
	  and delivery_status in ('pending', 'sending', 'submitted', 'delivered')
	order by created_at desc
	limit 1
	for update;
	if found then
		if v_existing.provider_message_id is not null then
			return jsonb_build_object(
				'already_submitted', true,
				'outbound_message_id', v_existing.id,
				'provider_message_id', v_existing.provider_message_id
			);
		end if;
		return jsonb_build_object(
			'in_flight', true,
			'outbound_message_id', v_existing.id
		);
	end if;

	insert into public.outbound_messages (
		lead_id,
		quote_id,
		channel,
		purpose,
		provider,
		recipient_snapshot,
		subject,
		delivery_status,
		attempt_count
	)
	values (
		v_lead.id,
		v_quote.id,
		'email',
		'quote',
		'sendpulse',
		v_recipient,
		v_quote.subject,
		'sending',
		1
	)
	returning id into v_message_id;

	return jsonb_build_object(
		'already_submitted', false,
		'in_flight', false,
		'outbound_message_id', v_message_id,
		'quote_id', v_quote.id,
		'quote_number', v_quote.base_quote_number,
		'subject', v_quote.subject,
		'total', v_quote.total,
		'recipient', v_recipient
	);
end;
$$;

create function public.complete_quote_send(
	p_outbound_message_id uuid,
	p_provider_message_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_task_id uuid;
	v_pipeline_changed boolean := false;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
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
	if v_message.provider_message_id is not null and v_message.delivery_status in ('submitted', 'delivered') then
		return jsonb_build_object(
			'outbound_message_id', v_message.id,
			'provider_message_id', v_message.provider_message_id,
			'idempotent', true
		);
	end if;
	if v_message.delivery_status <> 'sending' then
		raise exception using errcode = '22023', message = 'Outbound message is not awaiting provider completion';
	end if;

	select * into v_quote from public.quotes where id = v_message.quote_id for update;
	select * into v_lead from public.leads where id = v_message.lead_id for update;
	if v_quote.status <> 'ready' then
		raise exception using errcode = '22023', message = 'Quote is no longer ready to send';
	end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then
		raise exception using errcode = '22023', message = 'Lead is not in a sendable stage';
	end if;

	update public.outbound_messages
	set delivery_status = 'submitted',
		provider_message_id = trim(p_provider_message_id),
		submitted_at = now()
	where id = v_message.id;

	update public.quotes
	set status = 'sent', sent_at = now(), lock_version = lock_version + 1
	where id = v_quote.id and status = 'ready';

	update public.leads
	set pipeline_stage = 'DECISION',
		attention_state = 'waiting_on_client',
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id;
	v_pipeline_changed = v_lead.pipeline_stage <> 'DECISION';

	insert into public.activities (lead_id, quote_id, outbound_message_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_quote.id,
		v_message.id,
		auth.uid(),
		'quote_sent',
		jsonb_build_object('provider', 'sendpulse', 'provider_message_id', trim(p_provider_message_id)),
		'Quote submitted through SendPulse'
	);
	if v_pipeline_changed then
		insert into public.activities (lead_id, actor_id, event_type, metadata, summary)
		values (
			v_lead.id,
			auth.uid(),
			'pipeline_changed',
			jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'DECISION'),
			'Lead moved to Decision after quote send'
		);
	end if;

	select id into v_task_id
	from public.tasks
	where quote_id = v_quote.id and type = 'follow_up' and status = 'open'
	order by created_at
	limit 1
	for update;
	if v_task_id is null then
		insert into public.tasks (
			lead_id,
			quote_id,
			type,
			title,
			due_at,
			assigned_to,
			created_by
		)
		values (
			v_lead.id,
			v_quote.id,
			'follow_up',
			'Follow up on sent quote',
			now() + interval '3 days',
			v_lead.assigned_to,
			auth.uid()
		)
		returning id into v_task_id;
		insert into public.activities (lead_id, quote_id, task_id, actor_id, event_type, metadata, summary)
		values (
			v_lead.id,
			v_quote.id,
			v_task_id,
			auth.uid(),
			'task_created',
			jsonb_build_object('task_type', 'follow_up'),
			'Follow-up task created after quote send'
		);
	end if;

	return jsonb_build_object(
		'outbound_message_id', v_message.id,
		'provider_message_id', trim(p_provider_message_id),
		'task_id', v_task_id,
		'idempotent', false
	);
end;
$$;

create function public.convert_lead(
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
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;

	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if v_lead.pipeline_stage = 'WON' and v_lead.converted_client_id is not null then
		return jsonb_build_object('lead_id', v_lead.id, 'client_id', v_lead.converted_client_id, 'idempotent', true);
	end if;
	if v_lead.pipeline_stage <> 'DECISION' then
		raise exception using errcode = '22023', message = 'Only a decision lead can be won';
	end if;
	if v_lead.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale lead lock_version';
	end if;

	v_display_name = coalesce(
		nullif(trim(v_lead.company), ''),
		nullif(trim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
		'Converted client'
	);
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
		case when nullif(trim(v_lead.company), '') is null then 'individual' else 'company' end,
		v_display_name,
		nullif(trim(v_lead.company), ''),
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
		converted_client_id = v_client_id,
		last_activity_at = now(),
		lock_version = lock_version + 1
	where id = v_lead.id and lock_version = p_lock_version;

	update public.tasks
	set status = 'cancelled', cancelled_at = now()
	where lead_id = v_lead.id and status = 'open';

	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_client_id,
		auth.uid(),
		'client_created',
		jsonb_build_object('contact_id', v_contact_id),
		'Client created from won lead'
	);
	insert into public.activities (lead_id, client_id, actor_id, event_type, metadata, summary)
	values (
		v_lead.id,
		v_client_id,
		auth.uid(),
		'lead_won',
		jsonb_build_object('client_id', v_client_id),
		'Lead marked won and converted to client'
	);

	return jsonb_build_object(
		'lead_id', v_lead.id,
		'client_id', v_client_id,
		'contact_id', v_contact_id,
		'idempotent', false
	);
end;
$$;

create function public.provision_invited_profile(
	p_user_id uuid,
	p_role text default 'viewer',
	p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_profile public.profiles%rowtype;
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted invitation provisioning required';
	end if;
	if p_role not in ('owner', 'admin', 'sales', 'viewer') or p_status not in ('invited', 'active', 'suspended') then
		raise exception using errcode = '22023', message = 'Invalid profile role or status';
	end if;
	update public.profiles
	set role = p_role, status = p_status
	where id = p_user_id
	returning * into v_profile;
	if not found then
		raise exception using errcode = 'P0002', message = 'Auth user profile not found';
	end if;
	return jsonb_build_object('id', v_profile.id, 'role', v_profile.role, 'status', v_profile.status);
end;
$$;

revoke all on function public.ingest_bricks_lead(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_bricks_lead(text, text, jsonb) to service_role;
revoke all on function public.provision_invited_profile(uuid, text, text) from public, anon, authenticated;
grant execute on function public.provision_invited_profile(uuid, text, text) to service_role;

revoke all on function public.transition_lead(uuid, text, bigint, uuid, text) from public, anon;
grant execute on function public.transition_lead(uuid, text, bigint, uuid, text) to authenticated;
revoke all on function public.create_minimal_quote(uuid, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_minimal_quote(uuid, text, text, numeric, numeric, numeric) to authenticated;
revoke all on function public.prepare_quote_send(uuid, bigint) from public, anon;
grant execute on function public.prepare_quote_send(uuid, bigint) to authenticated;
revoke all on function public.complete_quote_send(uuid, text) from public, anon;
grant execute on function public.complete_quote_send(uuid, text) to authenticated;
revoke all on function public.convert_lead(uuid, bigint) from public, anon;
grant execute on function public.convert_lead(uuid, bigint) to authenticated;

commit;
