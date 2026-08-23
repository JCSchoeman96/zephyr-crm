begin;

-- A provider acknowledgement is system evidence. Keep the recovery path
-- available to the trusted server adapter while preventing ordinary browser
-- sessions from fabricating provider identity or submission state.
create or replace function public.record_quote_send_ack(
	p_outbound_message_id uuid,
	p_provider_message_id text,
	p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
	v_provider_id text := nullif(trim(coalesce(p_provider_message_id, '')), '');
	v_error text := left(nullif(trim(coalesce(p_error, '')), ''), 1000);
begin
	if auth.role() <> 'service_role' then
		raise exception using errcode = '42501', message = 'Trusted provider acknowledgement required';
	end if;
	if v_provider_id is null then
		raise exception using errcode = '22023', message = 'Provider message ID is required';
	end if;
	perform private.allow_outbound_attempt_mutation();
	select * into v_message
	from public.outbound_messages
	where id = p_outbound_message_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Outbound message not found';
	end if;
	if v_message.provider_message_id is not null
		and v_message.provider_message_id is distinct from v_provider_id
	then
		raise exception using errcode = '55000', message = 'Outbound provider identity is immutable';
	end if;
	if v_message.delivery_status in ('submitted', 'delivered', 'bounced') then
		return jsonb_build_object(
			'outbound_message_id', v_message.id,
			'provider_message_id', v_message.provider_message_id,
			'delivery_status', v_message.delivery_status,
			'idempotent', true
		);
	end if;
	if v_message.delivery_status not in ('claimed', 'submitting', 'submission_unknown') then
		raise exception using errcode = '22023', message = 'Outbound message cannot accept a provider acknowledgement';
	end if;
	update public.outbound_messages
	set provider_message_id = v_provider_id,
		delivery_status = 'submission_unknown',
		submission_unknown_at = coalesce(submission_unknown_at, now()),
		last_error = coalesce(v_error, 'Provider accepted the message; CRM finalization requires reconciliation')
	where id = v_message.id;
	update public.outbound_message_attempts
	set state = 'submission_unknown',
		provider_message_id = v_provider_id,
		request_finished_at = coalesce(request_finished_at, now()),
		error_message = coalesce(v_error, 'CRM finalization requires reconciliation')
	where outbound_message_id = v_message.id
		and attempt_number = greatest(v_message.attempt_count, 1);
	return jsonb_build_object(
		'outbound_message_id', v_message.id,
		'provider_message_id', v_provider_id,
		'delivery_status', 'submission_unknown',
		'reconciliation_required', true,
		'idempotent', false
	);
end;
$$;

revoke all on function public.record_quote_send_ack(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_quote_send_ack(uuid, text, text) to service_role;

commit;
