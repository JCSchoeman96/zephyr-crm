begin;

-- Phase 8 keeps the PDF bytes in private Storage and the provenance in the
-- Quote row.  The timestamp is metadata, not commercial content, but it is
-- immutable once a Quote has been sent or otherwise terminally closed.
alter table public.quotes
	add column if not exists document_generated_at timestamptz;

create unique index if not exists outbound_messages_provider_message_idx
on public.outbound_messages (provider_message_id)
	where provider_message_id is not null;

create index if not exists outbound_messages_delivery_status_idx
	on public.outbound_messages (delivery_status, updated_at desc);

create or replace function private.protect_quote_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if old.status in ('sent', 'accepted', 'declined', 'expired', 'cancelled', 'superseded') and (
		new.lead_id is distinct from old.lead_id or
		new.client_id is distinct from old.client_id or
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

drop trigger if exists quotes_immutability on public.quotes;
create trigger quotes_immutability
before update on public.quotes
for each row execute function private.protect_quote_immutability();

-- The bucket is deliberately private.  The application uses a trusted server
-- download action after the caller has passed the normal Quote RLS check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-documents', 'quote-documents', false, 10 * 1024 * 1024, array['application/pdf']::text[])
on conflict (id) do update
set name = excluded.name,
	public = false,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.quote_document_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
	if p_name !~ '^quotes/[0-9a-fA-F-]{36}/[^/]+\\.pdf$' then
		return null;
	end if;
	return substring(p_name from '^quotes/([0-9a-fA-F-]{36})/')::uuid;
exception when others then
	return null;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.quote_document_id(text) to authenticated;

drop policy if exists quote_documents_public_read on storage.objects;
drop policy if exists quote_documents_authenticated_read on storage.objects;
drop policy if exists quote_documents_authenticated_insert on storage.objects;
drop policy if exists quote_documents_authenticated_update on storage.objects;
drop policy if exists quote_documents_authenticated_delete on storage.objects;

create policy quote_documents_authenticated_read
on storage.objects for select to authenticated
using (
	bucket_id = 'quote-documents'
	and (select private.has_active_profile())
	and exists (
		select 1
		from public.quotes q
		where q.id = private.quote_document_id(name)
			and q.document_path = name
	)
);

create or replace function public.attach_quote_document(
	p_quote_id uuid,
	p_lock_version bigint,
	p_document_path text,
	p_document_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_expected_path text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_document_hash !~ '^[0-9a-fA-F]{64}$' then
		raise exception using errcode = '22023', message = 'A SHA-256 document hash is required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	v_expected_path := format('quotes/%s/%s.pdf', v_quote.id, v_quote.quote_number);
	if p_document_path <> v_expected_path then
		raise exception using errcode = '22023', message = 'Quote document path is invalid';
	end if;
	if v_quote.document_path is not null then
		if v_quote.document_path = p_document_path and v_quote.document_hash = lower(p_document_hash) then
			return jsonb_build_object(
				'quote_id', v_quote.id,
				'document_path', v_quote.document_path,
				'document_hash', v_quote.document_hash,
				'document_generated_at', v_quote.document_generated_at,
				'lock_version', v_quote.lock_version,
				'idempotent', true
			);
		end if;
		raise exception using errcode = '55000', message = 'Quote document metadata is immutable';
	end if;
	if v_quote.status <> 'ready' then
		raise exception using errcode = '22023', message = 'Only a ready Quote can receive a document';
	end if;
	update public.quotes
	set document_path = p_document_path,
		document_hash = lower(p_document_hash),
		document_generated_at = now(),
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = p_lock_version;
	return jsonb_build_object(
		'quote_id', v_quote.id,
		'document_path', p_document_path,
		'document_hash', lower(p_document_hash),
		'document_generated_at', (select document_generated_at from public.quotes where id = v_quote.id),
		'lock_version', (select lock_version from public.quotes where id = v_quote.id),
		'idempotent', false
	);
end;
$$;

-- Finalisation captures the recipient and seller identity before the Quote
-- becomes immutable.  Later lead/company edits therefore cannot change the
-- historical document or the provider recipient snapshot.
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
	update public.quote_items set line_subtotal = private.quote_line_subtotal(quantity, unit_price) where quote_id = v_quote.id;
	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	v_snapshot := coalesce(v_quote.quote_snapshot, '{}'::jsonb) || jsonb_build_object(
		'seller', coalesce(v_quote.quote_snapshot -> 'company_identity', '{}'::jsonb),
		'recipient', jsonb_build_object(
			'name', trim(concat_ws(' ', v_lead.first_name, v_lead.last_name)),
			'email', v_lead.email,
			'phone', v_lead.phone,
			'company', v_lead.company
		)
	);
	update public.quotes
	set status = 'ready', ready_at = now(), subtotal = v_totals.subtotal, tax_amount = v_totals.tax_amount,
		total = v_totals.total, quote_snapshot = v_snapshot, lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.lead_id, v_quote.id, auth.uid(), 'quote_ready', jsonb_build_object('quote_id', v_quote.id), 'Quote marked ready');
	return jsonb_build_object('quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'status', 'ready', 'subtotal', v_totals.subtotal, 'tax_amount', v_totals.tax_amount, 'total', v_totals.total, 'lock_version', v_new_lock);
end;
$$;

create or replace function public.prepare_quote_send(
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
	v_existing public.outbound_messages%rowtype;
	v_message_id uuid;
	v_recipient jsonb;
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
	select * into v_existing
	from public.outbound_messages
	where quote_id = p_quote_id
		and delivery_status in ('pending', 'sending', 'submitted', 'delivered', 'failed', 'bounced')
	order by created_at desc
	limit 1
	for update;
	if found then
		if v_existing.provider_message_id is not null and v_existing.delivery_status in ('submitted', 'delivered') then
			return jsonb_build_object('already_submitted', true, 'outbound_message_id', v_existing.id, 'provider_message_id', v_existing.provider_message_id, 'delivery_status', v_existing.delivery_status);
		end if;
		if v_existing.delivery_status in ('pending', 'sending') then
			return jsonb_build_object('in_flight', true, 'outbound_message_id', v_existing.id, 'delivery_status', v_existing.delivery_status);
		end if;
		if v_existing.delivery_status = 'bounced' then
			raise exception using errcode = '22023', message = 'A bounced Quote email requires recipient remediation before retry';
		end if;
		update public.outbound_messages
		set delivery_status = 'sending', attempt_count = attempt_count + 1, last_error = null
		where id = v_existing.id
		returning id into v_message_id;
		return jsonb_build_object('already_submitted', false, 'in_flight', false, 'retry', true, 'outbound_message_id', v_message_id, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'subject', v_quote.subject, 'total', v_quote.total, 'recipient', v_recipient);
	end if;
	insert into public.outbound_messages (lead_id, quote_id, channel, purpose, provider, recipient_snapshot, subject, delivery_status, attempt_count)
	values (v_lead.id, v_quote.id, 'email', 'quote', 'sendpulse', v_recipient, v_quote.subject, 'sending', 1)
	returning id into v_message_id;
	return jsonb_build_object('already_submitted', false, 'in_flight', false, 'retry', false, 'outbound_message_id', v_message_id, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'subject', v_quote.subject, 'total', v_quote.total, 'recipient', v_recipient);
end;
$$;

create or replace function public.fail_quote_send(
	p_outbound_message_id uuid,
	p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_message from public.outbound_messages where id = p_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Outbound message not found'; end if;
	if v_message.delivery_status in ('submitted', 'delivered', 'bounced') then
		return jsonb_build_object('outbound_message_id', v_message.id, 'delivery_status', v_message.delivery_status, 'idempotent', true);
	end if;
	if v_message.delivery_status not in ('pending', 'sending') then
		raise exception using errcode = '22023', message = 'Outbound message is not in a failed-send state';
	end if;
	update public.outbound_messages
	set delivery_status = 'failed', last_error = left(coalesce(nullif(trim(p_error), ''), 'Provider error'), 1000)
	where id = v_message.id;
	return jsonb_build_object('outbound_message_id', v_message.id, 'delivery_status', 'failed', 'idempotent', false);
end;
$$;

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
	v_event_id uuid;
	v_existing_id uuid;
	v_event_type text := lower(trim(coalesce(p_event_type, '')));
	v_activity_type text;
	v_activity_summary text;
	v_status text;
begin
	if length(trim(coalesce(p_provider_message_id, ''))) = 0 then raise exception using errcode = '22023', message = 'Provider message ID is required'; end if;
	if length(trim(coalesce(p_deduplication_hash, ''))) = 0 then raise exception using errcode = '22023', message = 'Event deduplication hash is required'; end if;
	if v_event_type in ('delivery', 'delivered', 'success') then
		v_event_type := 'delivered';
		v_activity_type := 'quote_email_delivered';
		v_activity_summary := 'SendPulse reported quote email delivery';
	elsif v_event_type in ('bounce', 'bounced', 'soft_bounce', 'hard_bounce', 'spam', 'unsubscribed') then
		v_event_type := case when v_event_type in ('hard_bounce', 'spam', 'unsubscribed') then 'hard_bounced' else 'bounced' end;
		v_activity_type := 'quote_email_bounced';
		v_activity_summary := 'SendPulse reported quote email bounce';
	elsif v_event_type in ('open', 'opened') then
		v_event_type := 'opened';
		v_activity_type := null;
	elsif v_event_type in ('click', 'clicked') then
		v_event_type := 'clicked';
		v_activity_type := null;
	elsif v_event_type in ('failed', 'error') then
		v_event_type := 'failed';
		v_activity_type := 'quote_email_failed';
		v_activity_summary := 'SendPulse reported quote email failure';
	else
		raise exception using errcode = '22023', message = 'Unsupported SendPulse event type';
	end if;
	select * into v_message
	from public.outbound_messages
	where provider_message_id = trim(p_provider_message_id)
	for update;
	if not found then raise exception using errcode = 'P0002', message = 'Provider message is not mapped to an outbound message'; end if;
	select id into v_existing_id from public.message_events where deduplication_hash = p_deduplication_hash or (p_provider_event_id is not null and provider_event_id = p_provider_event_id) limit 1;
	if v_existing_id is not null then
		return jsonb_build_object('message_event_id', v_existing_id, 'outbound_message_id', v_message.id, 'event_type', v_event_type, 'idempotent', true, 'delivery_status', v_message.delivery_status);
	end if;
	begin
		insert into public.message_events (outbound_message_id, provider_event_id, event_type, occurred_at, metadata, deduplication_hash)
		values (v_message.id, nullif(trim(p_provider_event_id), ''), v_event_type, coalesce(p_occurred_at, now()), coalesce(p_metadata, '{}'::jsonb), p_deduplication_hash)
		returning id into v_event_id;
	exception when unique_violation then
		select id into v_existing_id from public.message_events where deduplication_hash = p_deduplication_hash or (p_provider_event_id is not null and provider_event_id = p_provider_event_id) limit 1;
		return jsonb_build_object('message_event_id', v_existing_id, 'outbound_message_id', v_message.id, 'event_type', v_event_type, 'idempotent', true, 'delivery_status', v_message.delivery_status);
	end;
	if v_event_type = 'delivered' and v_message.delivery_status in ('pending', 'sending', 'submitted') then
		update public.outbound_messages set delivery_status = 'delivered', delivered_at = coalesce(p_occurred_at, now()) where id = v_message.id returning delivery_status into v_status;
	elsif v_event_type in ('bounced', 'hard_bounced') and v_message.delivery_status in ('pending', 'sending', 'submitted') then
		update public.outbound_messages set delivery_status = 'bounced', bounced_at = coalesce(p_occurred_at, now()) where id = v_message.id returning delivery_status into v_status;
	elsif v_event_type = 'failed' and v_message.delivery_status in ('pending', 'sending') then
		update public.outbound_messages set delivery_status = 'failed', last_error = 'SendPulse reported provider failure' where id = v_message.id returning delivery_status into v_status;
	else
		v_status := v_message.delivery_status;
	end if;
	if v_activity_type is not null then
		insert into public.activities (lead_id, quote_id, outbound_message_id, actor_id, event_type, metadata, summary)
		values (
			v_message.lead_id,
			v_message.quote_id,
			v_message.id,
			auth.uid(),
			v_activity_type,
			jsonb_build_object('provider', 'sendpulse', 'provider_event_id', p_provider_event_id, 'event_type', v_event_type),
			v_activity_summary
		);
	end if;
	return jsonb_build_object('message_event_id', v_event_id, 'outbound_message_id', v_message.id, 'event_type', v_event_type, 'idempotent', false, 'delivery_status', v_status);
end;
$$;

revoke all on function public.attach_quote_document(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.fail_quote_send(uuid, text) from public, anon, authenticated;
revoke all on function public.process_sendpulse_event(text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.mark_quote_ready(uuid, bigint) from public, anon, authenticated;
grant execute on function public.attach_quote_document(uuid, bigint, text, text) to authenticated;
grant execute on function public.fail_quote_send(uuid, text) to authenticated;
grant execute on function public.process_sendpulse_event(text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.mark_quote_ready(uuid, bigint) to authenticated;

commit;
