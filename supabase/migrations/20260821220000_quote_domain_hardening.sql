begin;

-- Phase 7 establishes Quote as a durable commercial snapshot.  The existing
-- identity remains the source of a new quote number; revisions reuse that
-- identity and advance revision_number under a transaction advisory lock.
alter table public.quotes
	add column cancelled_at timestamptz,
	add column quote_year smallint not null default extract(year from timezone('UTC', now()))::smallint,
	add column quote_snapshot jsonb not null default '{}'::jsonb,
	add column quote_number text generated always as (
		'Q-' || quote_year::text || '-' || lpad(base_quote_number::text, 6, '0') ||
		case when revision_number > 1 then '-R' || revision_number::text else '' end
	) stored;

alter table public.quotes
	add constraint quotes_quote_year_valid check (quote_year between 2000 and 9999),
	add constraint quotes_snapshot_object check (jsonb_typeof(quote_snapshot) = 'object');

create unique index quotes_quote_number_idx on public.quotes (quote_number);
create index quotes_status_valid_until_idx
	on public.quotes (status, valid_until, updated_at desc, id)
	where status in ('ready', 'sent');
create index quotes_number_revision_idx
	on public.quotes (base_quote_number, revision_number desc);

create or replace function private.quote_line_subtotal(
	p_quantity numeric,
	p_unit_price numeric
)
returns numeric
language sql
immutable
set search_path = pg_catalog, public
as $$
	select round(p_quantity * p_unit_price, 2)::numeric(14, 2);
$$;

create or replace function private.build_quote_snapshot(
	p_terms text,
	p_tax_label text,
	p_tax_rate numeric,
	p_currency text,
	p_valid_until date
)
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
	select jsonb_build_object(
		'company_identity', coalesce(
			(select setting_value from public.app_settings where setting_key = 'company_identity'),
			'{}'::jsonb
		),
		'terms', p_terms,
		'tax_label', p_tax_label,
		'tax_rate', p_tax_rate,
		'currency', p_currency,
		'valid_until', p_valid_until
	);
$$;

create or replace function private.quote_state_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if old.status = new.status then
		return new;
	end if;
	if old.status = 'draft' and new.status in ('ready') then
		return new;
	end if;
	if old.status = 'ready' and new.status in ('draft', 'sent') then
		return new;
	end if;
	if old.status = 'sent' and new.status in ('accepted', 'declined', 'expired', 'cancelled', 'superseded') then
		return new;
	end if;
	raise exception using
		errcode = '22023',
		message = format('Illegal Quote transition from %s to %s', old.status, new.status);
end;
$$;

create or replace function private.quote_insert_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if new.status <> 'draft' then
		raise exception using errcode = '22023', message = 'New Quotes must start in draft';
	end if;
	return new;
end;
$$;

create or replace function private.quote_ready_validation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_item_count bigint;
begin
	if new.status = 'ready' and old.status <> 'ready' then
		if length(trim(coalesce(new.subject, ''))) = 0 then
			raise exception using errcode = '23514', message = 'A ready Quote requires a subject';
		end if;
		if new.valid_until is null or new.valid_until < current_date then
			raise exception using errcode = '23514', message = 'A ready Quote requires a current validity date';
		end if;
		if jsonb_typeof(new.quote_snapshot) <> 'object' then
			raise exception using errcode = '23514', message = 'A ready Quote requires a commercial snapshot';
		end if;
		select count(*) into v_item_count from public.quote_items where quote_id = new.id;
		if v_item_count = 0 then
			raise exception using errcode = '23514', message = 'A ready Quote requires at least one line item';
		end if;
	end if;
	return new;
end;
$$;

create or replace function private.protect_quote_item_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_status text;
begin
	select status into v_status from public.quotes where id = coalesce(new.quote_id, old.quote_id);
	if v_status in ('ready', 'sent', 'accepted', 'declined', 'expired', 'cancelled', 'superseded')
		and (tg_op in ('UPDATE', 'DELETE') or v_status <> 'draft') then
		raise exception using errcode = '55000', message = 'Quote items can only be edited while a Quote is draft';
	end if;
	return coalesce(new, old);
end;
$$;

create or replace function private.quote_totals(
	p_quote_id uuid,
	p_tax_rate numeric
)
returns table(subtotal numeric, tax_amount numeric, total numeric)
language sql
stable
set search_path = pg_catalog, public
as $$
	with sums as (
		select
			coalesce(sum(line_subtotal), 0)::numeric(14, 2) as subtotal,
			coalesce(sum(case when taxable then line_subtotal else 0 end), 0)::numeric(14, 2) as taxable_subtotal
		from public.quote_items
		where quote_id = p_quote_id
	)
	select
		subtotal,
		round(taxable_subtotal * p_tax_rate / 100, 2)::numeric(14, 2),
		subtotal + round(taxable_subtotal * p_tax_rate / 100, 2)::numeric(14, 2)
	from sums;
$$;

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
		new.document_hash is distinct from old.document_hash
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

create trigger quotes_insert_state
before insert on public.quotes
for each row execute function private.quote_insert_state();

create trigger quotes_state_transition
before update on public.quotes
for each row execute function private.quote_state_transition();

create trigger quotes_ready_validation
before update on public.quotes
for each row execute function private.quote_ready_validation();

create trigger quote_items_immutability
before insert or update or delete on public.quote_items
for each row execute function private.protect_quote_item_immutability();

revoke insert, update, delete on table public.quotes from authenticated;
revoke insert, update, delete on table public.quote_items from authenticated;

create or replace function public.save_quote_draft(
	p_quote_id uuid,
	p_lock_version bigint,
	p_lead_id uuid,
	p_client_id uuid,
	p_subject text,
	p_introduction text,
	p_terms text,
	p_tax_label text,
	p_tax_rate numeric,
	p_valid_until date,
	p_currency text,
	p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_quote_id uuid := p_quote_id;
	v_lock_version bigint;
	v_subject text := nullif(trim(coalesce(p_subject, '')), '');
	v_currency text := upper(trim(coalesce(p_currency, 'ZAR')));
	v_tax_rate numeric := coalesce(p_tax_rate, 0);
	v_items jsonb := coalesce(p_items, '[]'::jsonb);
	v_item jsonb;
	v_position integer := 0;
	v_name text;
	v_description text;
	v_quantity numeric;
	v_unit_price numeric;
	v_taxable boolean;
	v_line_subtotal numeric(14, 2);
	v_subtotal numeric(14, 2) := 0;
	v_taxable_subtotal numeric(14, 2) := 0;
	v_tax_amount numeric(14, 2);
	v_total numeric(14, 2);
	v_snapshot jsonb;
	v_new_quote boolean := p_quote_id is null;
	v_lead public.leads%rowtype;
	old_lock_version bigint;
	old_status text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_subject is null then
		raise exception using errcode = '22023', message = 'Quote subject is required';
	end if;
	if v_currency !~ '^[A-Z]{3}$' then
		raise exception using errcode = '22023', message = 'Quote currency is invalid';
	end if;
	if v_tax_rate < 0 or v_tax_rate > 100 or scale(v_tax_rate) > 4 then
		raise exception using errcode = '22023', message = 'Quote tax rate is invalid';
	end if;
	if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 100 then
		raise exception using errcode = '22023', message = 'Quote items must be an array of at most 100 items';
	end if;

	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Lead not found';
	end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then
		raise exception using errcode = '22023', message = 'Lead must be in proposal or decision before quoting';
	end if;

	if not v_new_quote then
		select * into v_quote from public.quotes where id = p_quote_id for update;
		if not found then
			raise exception using errcode = 'P0002', message = 'Quote not found';
		end if;
		if v_quote.lead_id is distinct from p_lead_id then
			raise exception using errcode = '42501', message = 'Quote lead cannot be changed';
		end if;
		if v_quote.status not in ('draft', 'ready') then
			raise exception using errcode = '55000', message = 'Only draft or ready Quotes can be edited';
		end if;
		if p_lock_version is null or v_quote.lock_version is distinct from p_lock_version then
			raise exception using errcode = '40001', message = 'Stale quote lock_version';
		end if;
		old_lock_version := v_quote.lock_version;
		old_status := v_quote.status;
	end if;

	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
		if v_name is null then
			raise exception using errcode = '22023', message = format('Quote item %s requires a name', v_position);
		end if;
		if coalesce(v_item ->> 'quantity', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position);
		end if;
		if coalesce(v_item ->> 'unit_price', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s unit price is invalid', v_position);
		end if;
		v_quantity := (v_item ->> 'quantity')::numeric;
		v_unit_price := (v_item ->> 'unit_price')::numeric;
		if v_quantity <= 0 or v_unit_price < 0 then
			raise exception using errcode = '22023', message = format('Quote item %s quantity or unit price is invalid', v_position);
		end if;
		if v_item ? 'taxable' and jsonb_typeof(v_item -> 'taxable') <> 'boolean' then
			raise exception using errcode = '22023', message = format('Quote item %s taxable flag is invalid', v_position);
		end if;
		v_taxable := coalesce((v_item ->> 'taxable')::boolean, true);
		v_line_subtotal := private.quote_line_subtotal(v_quantity, v_unit_price);
		v_subtotal := v_subtotal + v_line_subtotal;
		if v_taxable then v_taxable_subtotal := v_taxable_subtotal + v_line_subtotal; end if;
	end loop;

	v_tax_amount := round(v_taxable_subtotal * v_tax_rate / 100, 2)::numeric(14, 2);
	v_total := v_subtotal + v_tax_amount;
	v_snapshot := private.build_quote_snapshot(p_terms, p_tax_label, v_tax_rate, v_currency, p_valid_until);

	if v_new_quote then
		insert into public.quotes (
			lead_id, client_id, status, currency, subject, introduction, terms,
			tax_label, tax_rate, subtotal, tax_amount, total, valid_until,
			quote_snapshot, created_by
		)
		values (
			p_lead_id, p_client_id, 'draft', v_currency, v_subject, nullif(trim(p_introduction), ''),
			nullif(trim(p_terms), ''), nullif(trim(p_tax_label), ''), v_tax_rate,
			v_subtotal, v_tax_amount, v_total, p_valid_until, v_snapshot, auth.uid()
		)
		returning id, lock_version into v_quote_id, v_lock_version;
	else
		update public.quotes
		set client_id = p_client_id,
			status = 'draft',
			currency = v_currency,
			subject = v_subject,
			introduction = nullif(trim(p_introduction), ''),
			terms = nullif(trim(p_terms), ''),
			tax_label = nullif(trim(p_tax_label), ''),
			tax_rate = v_tax_rate,
			subtotal = v_subtotal,
			tax_amount = v_tax_amount,
			total = v_total,
			valid_until = p_valid_until,
			ready_at = null,
			quote_snapshot = v_snapshot,
			lock_version = lock_version + 1
		where id = p_quote_id and lock_version = old_lock_version
		returning lock_version into v_lock_version;
		if v_lock_version is null then
			raise exception using errcode = '40001', message = 'Stale quote lock_version';
		end if;
	end if;

	delete from public.quote_items where quote_id = v_quote_id;
	v_position := 0;
	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
		v_description := nullif(trim(coalesce(v_item ->> 'description', '')), '');
		v_quantity := (v_item ->> 'quantity')::numeric;
		v_unit_price := (v_item ->> 'unit_price')::numeric;
		v_taxable := coalesce((v_item ->> 'taxable')::boolean, true);
		insert into public.quote_items (quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal)
		values (
			v_quote_id,
			v_position,
			v_name,
			v_description,
			v_quantity,
			v_unit_price,
			v_taxable,
			private.quote_line_subtotal(v_quantity, v_unit_price)
		);
	end loop;

	if v_new_quote then
		update public.quotes set lock_version = lock_version + 1 where id = v_quote_id returning lock_version into v_lock_version;
	end if;
	update public.leads set last_activity_at = now(), lock_version = lock_version + 1 where id = p_lead_id;
	if v_new_quote then
		insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
		values (p_lead_id, v_quote_id, auth.uid(), 'quote_created', jsonb_build_object('quote_id', v_quote_id), 'Quote draft created');
	else
		insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
		values (p_lead_id, v_quote_id, auth.uid(), 'quote_updated', jsonb_build_object('quote_id', v_quote_id, 'from_status', old_status), 'Quote draft updated');
	end if;

	return jsonb_build_object(
		'quote_id', v_quote_id,
		'quote_number', (select quote_number from public.quotes where id = v_quote_id),
		'revision_number', (select revision_number from public.quotes where id = v_quote_id),
		'status', 'draft',
		'subtotal', v_subtotal,
		'tax_amount', v_tax_amount,
		'total', v_total,
		'lock_version', v_lock_version
	);
end;
$$;

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
	v_totals record;
	v_item_count bigint;
	v_new_lock bigint;
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
	if v_item_count = 0 then
		raise exception using errcode = '23514', message = 'A ready Quote requires at least one line item';
	end if;
	update public.quote_items set line_subtotal = private.quote_line_subtotal(quantity, unit_price) where quote_id = v_quote.id;
	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	update public.quotes
	set status = 'ready', ready_at = now(), subtotal = v_totals.subtotal, tax_amount = v_totals.tax_amount,
		total = v_totals.total, lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.lead_id, v_quote.id, auth.uid(), 'quote_ready', jsonb_build_object('quote_id', v_quote.id), 'Quote marked ready');
	return jsonb_build_object('quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'status', 'ready', 'subtotal', v_totals.subtotal, 'tax_amount', v_totals.tax_amount, 'total', v_totals.total, 'lock_version', v_new_lock);
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
security definer
set search_path = pg_catalog, public
as $$
declare
	v_saved jsonb;
	v_ready jsonb;
	v_quote_id uuid;
	v_item_id uuid;
begin
	if p_quantity is null or scale(p_quantity) > 4 or p_unit_price is null or scale(p_unit_price) > 2 then
		raise exception using errcode = '22023', message = 'Quote quantity or price has too many decimal places';
	end if;
	if p_tax_rate is null or scale(p_tax_rate) > 4 then
		raise exception using errcode = '22023', message = 'Quote tax rate has too many decimal places';
	end if;
	v_saved := public.save_quote_draft(
		null,
		null,
		p_lead_id,
		null,
		p_subject,
		null,
		null,
		null,
		p_tax_rate,
		current_date + 30,
		'ZAR',
		jsonb_build_array(jsonb_build_object('name', p_item_name, 'quantity', p_quantity::text, 'unit_price', p_unit_price::text, 'taxable', true))
	);
	v_quote_id := (v_saved ->> 'quote_id')::uuid;
	v_ready := public.mark_quote_ready(v_quote_id, (v_saved ->> 'lock_version')::bigint);
	select id into v_item_id from public.quote_items where quote_id = v_quote_id order by position limit 1;
	return jsonb_build_object(
		'quote_id', v_quote_id,
		'item_id', v_item_id,
		'quote_number', v_ready ->> 'quote_number',
		'status', v_ready ->> 'status',
		'subtotal', v_ready -> 'subtotal',
		'tax_amount', v_ready -> 'tax_amount',
		'total', v_ready -> 'total',
		'lock_version', v_ready -> 'lock_version'
	);
end;
$$;

create or replace function public.transition_quote_status(
	p_quote_id uuid,
	p_lock_version bigint,
	p_to_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_new_lock bigint;
	v_event text;
	v_summary text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_to_status not in ('accepted', 'declined', 'expired', 'cancelled', 'superseded') then
		raise exception using errcode = '22023', message = 'Invalid Quote terminal state';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_quote.status <> 'sent' then raise exception using errcode = '22023', message = 'Only a sent Quote can enter a terminal state'; end if;
	v_event := 'quote_' || p_to_status;
	v_summary := 'Quote marked ' || p_to_status;
	update public.quotes
	set status = p_to_status,
		accepted_at = case when p_to_status = 'accepted' then now() else accepted_at end,
		declined_at = case when p_to_status = 'declined' then now() else declined_at end,
		expired_at = case when p_to_status = 'expired' then now() else expired_at end,
		cancelled_at = case when p_to_status = 'cancelled' then now() else cancelled_at end,
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.lead_id, v_quote.id, auth.uid(), v_event, jsonb_build_object('from_status', v_quote.status, 'to_status', p_to_status), v_summary);
	return jsonb_build_object('quote_id', v_quote.id, 'status', p_to_status, 'lock_version', v_new_lock);
end;
$$;

create or replace function public.accept_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_quote_status(p_quote_id, p_lock_version, 'accepted'); $$;

create or replace function public.decline_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_quote_status(p_quote_id, p_lock_version, 'declined'); $$;

create or replace function public.expire_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_quote_status(p_quote_id, p_lock_version, 'expired'); $$;

create or replace function public.cancel_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_quote_status(p_quote_id, p_lock_version, 'cancelled'); $$;

create or replace function public.supersede_quote(p_quote_id uuid, p_lock_version bigint)
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$ select public.transition_quote_status(p_quote_id, p_lock_version, 'superseded'); $$;

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
	v_source public.quotes%rowtype;
	v_new_id uuid;
	v_revision integer;
	v_lock_version bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_source from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_source.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_source.status <> 'sent' then raise exception using errcode = '22023', message = 'Only a sent Quote can be revised'; end if;
	perform pg_advisory_xact_lock(v_source.base_quote_number);
	select coalesce(max(revision_number), 0) + 1 into v_revision from public.quotes where base_quote_number = v_source.base_quote_number;
	insert into public.quotes (
		base_quote_number, quote_year, revision_number, lead_id, client_id, status, currency, subject,
		introduction, terms, tax_label, tax_rate, subtotal, tax_amount, total, valid_until,
		quote_snapshot, supersedes_quote_id, created_by
	)
	values (
		v_source.base_quote_number, v_source.quote_year, v_revision, v_source.lead_id, v_source.client_id,
		'draft', v_source.currency, v_source.subject, v_source.introduction, v_source.terms,
		v_source.tax_label, v_source.tax_rate, v_source.subtotal, v_source.tax_amount, v_source.total,
		v_source.valid_until, v_source.quote_snapshot, v_source.id, auth.uid()
	)
	returning id, lock_version into v_new_id, v_lock_version;
	insert into public.quote_items (quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal)
	select v_new_id, position, name, description, quantity, unit_price, taxable, line_subtotal
	from public.quote_items where quote_id = v_source.id order by position;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (v_source.lead_id, v_new_id, auth.uid(), 'quote_revised', jsonb_build_object('previous_quote_id', v_source.id, 'revision_number', v_revision), 'Quote revision created');
	return jsonb_build_object('quote_id', v_new_id, 'quote_number', (select quote_number from public.quotes where id = v_new_id), 'revision_number', v_revision, 'supersedes_quote_id', v_source.id, 'status', 'draft', 'lock_version', v_lock_version);
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
	select * into v_existing from public.outbound_messages where quote_id = p_quote_id and delivery_status in ('pending', 'sending', 'submitted', 'delivered') order by created_at desc limit 1 for update;
	if found then
		if v_existing.provider_message_id is not null then return jsonb_build_object('already_submitted', true, 'outbound_message_id', v_existing.id, 'provider_message_id', v_existing.provider_message_id); end if;
		return jsonb_build_object('in_flight', true, 'outbound_message_id', v_existing.id);
	end if;
	insert into public.outbound_messages (lead_id, quote_id, channel, purpose, provider, recipient_snapshot, subject, delivery_status, attempt_count)
	values (v_lead.id, v_quote.id, 'email', 'quote', 'sendpulse', v_recipient, v_quote.subject, 'sending', 1)
	returning id into v_message_id;
	return jsonb_build_object('already_submitted', false, 'in_flight', false, 'outbound_message_id', v_message_id, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'subject', v_quote.subject, 'total', v_quote.total, 'recipient', v_recipient);
end;
$$;

create or replace function public.complete_quote_send(
	p_outbound_message_id uuid,
	p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_message public.outbound_messages%rowtype;
	v_quote public.quotes%rowtype;
	v_lead public.leads%rowtype;
	v_task_id uuid;
	v_pipeline_changed boolean := false;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	if length(trim(coalesce(p_provider_message_id, ''))) = 0 then raise exception using errcode = '22023', message = 'Provider message ID is required'; end if;
	select * into v_message from public.outbound_messages where id = p_outbound_message_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Outbound message not found'; end if;
	if v_message.provider_message_id is not null and v_message.delivery_status in ('submitted', 'delivered') then return jsonb_build_object('outbound_message_id', v_message.id, 'provider_message_id', v_message.provider_message_id, 'idempotent', true); end if;
	if v_message.delivery_status <> 'sending' then raise exception using errcode = '22023', message = 'Outbound message is not awaiting provider completion'; end if;
	select * into v_quote from public.quotes where id = v_message.quote_id for update;
	select * into v_lead from public.leads where id = v_message.lead_id for update;
	if v_quote.status <> 'ready' then raise exception using errcode = '22023', message = 'Quote is no longer ready to send'; end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then raise exception using errcode = '22023', message = 'Lead is not in a sendable stage'; end if;
	update public.outbound_messages set delivery_status = 'submitted', provider_message_id = trim(p_provider_message_id), submitted_at = now() where id = v_message.id;
	update public.quotes set status = 'sent', sent_at = now(), lock_version = lock_version + 1 where id = v_quote.id and status = 'ready';
	if v_quote.supersedes_quote_id is not null then
		update public.quotes set status = 'superseded', lock_version = lock_version + 1 where id = v_quote.supersedes_quote_id and status = 'sent';
	end if;
	update public.leads set pipeline_stage = 'DECISION', attention_state = 'waiting_on_client', last_activity_at = now(), lock_version = lock_version + 1 where id = v_lead.id;
	v_pipeline_changed := v_lead.pipeline_stage <> 'DECISION';
	insert into public.activities (lead_id, quote_id, outbound_message_id, actor_id, event_type, metadata, summary)
	values (v_lead.id, v_quote.id, v_message.id, auth.uid(), 'quote_sent', jsonb_build_object('provider', 'sendpulse', 'provider_message_id', trim(p_provider_message_id)), 'Quote submitted through SendPulse');
	if v_pipeline_changed then
		insert into public.activities (lead_id, actor_id, event_type, metadata, summary) values (v_lead.id, auth.uid(), 'pipeline_changed', jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'DECISION'), 'Lead moved to Decision after quote send');
	end if;
	select id into v_task_id from public.tasks where quote_id = v_quote.id and type = 'follow_up' and status = 'open' order by created_at limit 1 for update;
	if v_task_id is null then
		insert into public.tasks (lead_id, quote_id, type, title, due_at, assigned_to, created_by) values (v_lead.id, v_quote.id, 'follow_up', 'Follow up on sent quote', now() + interval '3 days', v_lead.assigned_to, auth.uid()) returning id into v_task_id;
		insert into public.activities (lead_id, quote_id, task_id, actor_id, event_type, metadata, summary) values (v_lead.id, v_quote.id, v_task_id, auth.uid(), 'task_created', jsonb_build_object('task_type', 'follow_up'), 'Follow-up task created after quote send');
	end if;
	return jsonb_build_object('outbound_message_id', v_message.id, 'provider_message_id', trim(p_provider_message_id), 'task_id', v_task_id, 'idempotent', false);
end;
$$;

-- Public RPCs are the only authenticated write boundary for quote lifecycle data.
revoke all on function public.save_quote_draft(uuid, bigint, uuid, uuid, text, text, text, text, numeric, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_quote_ready(uuid, bigint) from public, anon, authenticated;
revoke all on function public.create_minimal_quote(uuid, text, text, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.transition_quote_status(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.accept_quote(uuid, bigint) from public, anon, authenticated;
revoke all on function public.decline_quote(uuid, bigint) from public, anon, authenticated;
revoke all on function public.expire_quote(uuid, bigint) from public, anon, authenticated;
revoke all on function public.cancel_quote(uuid, bigint) from public, anon, authenticated;
revoke all on function public.supersede_quote(uuid, bigint) from public, anon, authenticated;
revoke all on function public.revise_quote(uuid, bigint) from public, anon, authenticated;
revoke all on function public.prepare_quote_send(uuid, bigint) from public, anon, authenticated;
revoke all on function public.complete_quote_send(uuid, text) from public, anon, authenticated;

grant execute on function public.save_quote_draft(uuid, bigint, uuid, uuid, text, text, text, text, numeric, date, text, jsonb) to authenticated;
grant execute on function public.mark_quote_ready(uuid, bigint) to authenticated;
grant execute on function public.create_minimal_quote(uuid, text, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.transition_quote_status(uuid, bigint, text) to authenticated;
grant execute on function public.accept_quote(uuid, bigint) to authenticated;
grant execute on function public.decline_quote(uuid, bigint) to authenticated;
grant execute on function public.expire_quote(uuid, bigint) to authenticated;
grant execute on function public.cancel_quote(uuid, bigint) to authenticated;
grant execute on function public.supersede_quote(uuid, bigint) to authenticated;
grant execute on function public.revise_quote(uuid, bigint) to authenticated;
grant execute on function public.prepare_quote_send(uuid, bigint) to authenticated;
grant execute on function public.complete_quote_send(uuid, text) to authenticated;

commit;
