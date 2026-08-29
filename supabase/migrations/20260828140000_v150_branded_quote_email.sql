begin;

-- Delivery must use the recipient captured by the current immutable Quote
-- revision.  The Lead row is still locked for relationship/ownership checks,
-- but later Lead edits cannot silently redirect a frozen Quote.
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
	if not found then raise exception using errcode = 'P0002', message = 'Quote lead not found'; end if;
	v_recipient := v_quote.quote_snapshot -> 'recipient';
	if jsonb_typeof(v_recipient) is distinct from 'object'
		or length(trim(coalesce(v_recipient ->> 'email', ''))) = 0 then
		raise exception using errcode = '23514', message = 'A frozen Quote recipient email is required before sending a Quote';
	end if;
	v_recipient := jsonb_build_object(
		'email', trim(v_recipient ->> 'email'),
		'name', trim(coalesce(v_recipient ->> 'name', ''))
	);
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

commit;
