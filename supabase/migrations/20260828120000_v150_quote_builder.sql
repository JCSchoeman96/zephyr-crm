begin;

-- Preserve catalogue lineage when an existing Quote draft is edited.  The
-- browser may identify an existing row, but all source fields remain owned by
-- the row already stored in PostgreSQL.
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
	v_line_subtotal numeric(19, 2);
	v_subtotal numeric(19, 2) := 0;
	v_taxable_subtotal numeric(19, 2) := 0;
	v_tax_amount numeric(19, 2);
	v_total numeric(19, 2);
	v_snapshot jsonb;
	v_new_quote boolean := p_quote_id is null;
	v_lead public.leads%rowtype;
	v_existing_item public.quote_items%rowtype;
	v_item_id uuid;
	v_item_id_text text;
	v_seen_item_ids uuid[] := '{}'::uuid[];
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
	if v_tax_rate < 0 or v_tax_rate > 100 or scale(v_tax_rate) > 6 then
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
	if p_client_id is not null and not exists (
		select 1 from public.clients where id = p_client_id and source_lead_id = p_lead_id
	) then
		raise exception using errcode = '42501', message = 'Quote client association requires the converted Lead client';
	end if;
	if not v_new_quote then
		select * into v_quote from public.quotes where id = p_quote_id for update;
		if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
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

	v_position := 0;
	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_item_id_text := nullif(trim(coalesce(v_item ->> 'id', '')), '');
		if v_item_id_text is not null
			and v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
			raise exception using errcode = '22023', message = format('Quote item %s identifier is invalid', v_position);
		end if;
		v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
		if v_name is null then
			raise exception using errcode = '22023', message = format('Quote item %s requires a name', v_position);
		end if;
		if coalesce(v_item ->> 'quantity', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position);
		end if;
		if coalesce(v_item ->> 'unit_price', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
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
	v_tax_amount := round(v_taxable_subtotal * v_tax_rate / 100, 2)::numeric(19, 2);
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
		if v_lock_version is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	end if;

	-- The unique QuoteItem position constraint is immediate.  Move stored rows
	-- out of the submitted range before applying a reordered list so swapping
	-- two existing rows remains one atomic, valid draft save.
	update public.quote_items
	set position = position + 1000
	where quote_id = v_quote_id;

	v_position := 0;
	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
		v_description := nullif(trim(coalesce(v_item ->> 'description', '')), '');
		v_quantity := (v_item ->> 'quantity')::numeric;
		v_unit_price := (v_item ->> 'unit_price')::numeric;
		v_taxable := coalesce((v_item ->> 'taxable')::boolean, true);
		v_item_id_text := nullif(trim(coalesce(v_item ->> 'id', '')), '');

		if v_item_id_text is null then
			insert into public.quote_items (
				quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal, source_type
			)
			values (
				v_quote_id, v_position, v_name, v_description, v_quantity, v_unit_price,
				v_taxable, private.quote_line_subtotal(v_quantity, v_unit_price), 'custom'
			)
			returning id into v_item_id;
		else
			v_item_id := v_item_id_text::uuid;
			if v_item_id = any(v_seen_item_ids) then
				raise exception using errcode = '22023', message = format('Quote item %s is duplicated', v_position);
			end if;
			select * into v_existing_item
			from public.quote_items
			where id = v_item_id and quote_id = v_quote_id
			for update;
			if not found then
				raise exception using errcode = '42501', message = format('Quote item %s does not belong to this Quote', v_position);
			end if;
			if v_existing_item.source_type = 'catalogue' then
				-- Catalogue names are source snapshots.  Browser input can edit
				-- commercial fields, but cannot rewrite Product-derived identity.
				v_name := v_existing_item.name;
			end if;
			update public.quote_items
			set position = v_position,
				name = v_name,
				description = v_description,
				quantity = v_quantity,
				unit_price = v_unit_price,
				taxable = v_taxable,
				line_subtotal = private.quote_line_subtotal(v_quantity, v_unit_price)
			where id = v_item_id;
		end if;
		v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
	end loop;

	if cardinality(v_seen_item_ids) = 0 then
		delete from public.quote_items where quote_id = v_quote_id;
	else
		delete from public.quote_items
		where quote_id = v_quote_id and not (id = any(v_seen_item_ids));
	end if;

	if v_new_quote then
		update public.quotes set lock_version = lock_version + 1
		where id = v_quote_id
		returning lock_version into v_lock_version;
	end if;
	update public.leads
	set last_activity_at = now(), lock_version = lock_version + 1
	where id = p_lead_id;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary)
	values (
		p_lead_id, v_quote_id, auth.uid(),
		case when v_new_quote then 'quote_created' else 'quote_updated' end,
		jsonb_build_object('quote_id', v_quote_id, 'from_status', old_status),
		case when v_new_quote then 'Quote draft created' else 'Quote draft updated' end
	);
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

create or replace function public.refresh_product_quote_item(
	p_quote_id uuid,
	p_quote_lock_version bigint,
	p_quote_item_id uuid,
	p_product_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_quote public.quotes%rowtype;
	v_item public.quote_items%rowtype;
	v_product public.products%rowtype;
	v_totals record;
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status <> 'draft' then
		raise exception using errcode = '22023', message = 'Product source review is draft-only';
	end if;
	if p_quote_lock_version is distinct from v_quote.lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	select * into v_item
	from public.quote_items
	where id = p_quote_item_id and quote_id = v_quote.id
	for update;
	if not found then raise exception using errcode = 'P0002', message = 'QuoteItem not found'; end if;
	if v_item.source_type <> 'catalogue' or v_item.product_id is null then
		raise exception using errcode = '22023', message = 'Only catalogue QuoteItems can be refreshed';
	end if;
	select * into v_product from public.products where id = v_item.product_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
	if p_product_lock_version is distinct from v_product.lock_version then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;
	if v_product.status <> 'active' then
		raise exception using errcode = '22023', message = 'Only an active Product can be refreshed';
	end if;
	if v_product.currency <> v_quote.currency then
		raise exception using errcode = '22023', message = 'Product currency must match Quote currency';
	end if;
	if v_product.lock_version = v_item.source_product_version then
		raise exception using errcode = '22023', message = 'Product source is already current';
	end if;

	update public.quote_items
	set name = v_product.name,
		description = v_product.customer_description,
		product_code_snapshot = v_product.product_code,
		unit_label_snapshot = v_product.unit_label,
		catalogue_unit_price = v_product.unit_price,
		source_product_version = v_product.lock_version,
		source_product_reviewed_version = null,
		source_product_reviewed_at = null,
		source_product_reviewed_by = null,
		taxable = v_product.taxable,
		line_subtotal = private.quote_line_subtotal(quantity, unit_price)
	where id = v_item.id;

	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	update public.quotes
	set subtotal = v_totals.subtotal,
		tax_amount = v_totals.tax_amount,
		total = v_totals.total,
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then
		raise exception using errcode = '40001', message = 'Quote changed during Product refresh';
	end if;

	insert into public.activities (quote_id, actor_id, event_type, metadata, summary)
	values (
		v_quote.id,
		v_actor,
		'quote_item_product_refreshed',
		jsonb_build_object(
			'quote_item_id', v_item.id,
			'product_id', v_product.id,
			'previous_source_product_version', v_item.source_product_version,
			'source_product_version', v_product.lock_version,
			'product_code', v_product.product_code
		),
		'Product snapshot refreshed on Quote'
	);

	return jsonb_build_object(
		'quote_id', v_quote.id,
		'quote_item_id', v_item.id,
		'product_id', v_product.id,
		'source_product_version', v_product.lock_version,
		'quote_lock_version', v_new_lock,
		'status', 'draft'
	);
end;
$$;

create or replace function public.review_product_quote_item(
	p_quote_id uuid,
	p_quote_lock_version bigint,
	p_quote_item_id uuid,
	p_product_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
	v_quote public.quotes%rowtype;
	v_item public.quote_items%rowtype;
	v_product public.products%rowtype;
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status <> 'draft' then
		raise exception using errcode = '22023', message = 'Product source review is draft-only';
	end if;
	if p_quote_lock_version is distinct from v_quote.lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	select * into v_item
	from public.quote_items
	where id = p_quote_item_id and quote_id = v_quote.id
	for update;
	if not found then raise exception using errcode = 'P0002', message = 'QuoteItem not found'; end if;
	if v_item.source_type <> 'catalogue' or v_item.product_id is null then
		raise exception using errcode = '22023', message = 'Only catalogue QuoteItems can be reviewed';
	end if;
	select * into v_product from public.products where id = v_item.product_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
	if p_product_lock_version is distinct from v_product.lock_version then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;
	if v_product.lock_version = v_item.source_product_version then
		raise exception using errcode = '22023', message = 'Product source is already current';
	end if;

	update public.quote_items
	set source_product_reviewed_version = v_product.lock_version,
		source_product_reviewed_at = now(),
		source_product_reviewed_by = v_actor
	where id = v_item.id;

	update public.quotes
	set lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_new_lock;
	if v_new_lock is null then
		raise exception using errcode = '40001', message = 'Quote changed during Product review';
	end if;

	insert into public.activities (quote_id, actor_id, event_type, metadata, summary)
	values (
		v_quote.id,
		v_actor,
		'quote_item_product_reviewed',
		jsonb_build_object(
			'quote_item_id', v_item.id,
			'product_id', v_product.id,
			'source_product_version', v_item.source_product_version,
			'reviewed_product_version', v_product.lock_version
		),
		'Product changes reviewed; quoted values kept'
	);

	return jsonb_build_object(
		'quote_id', v_quote.id,
		'quote_item_id', v_item.id,
		'product_id', v_product.id,
		'source_product_version', v_item.source_product_version,
		'source_product_reviewed_version', v_product.lock_version,
		'quote_lock_version', v_new_lock,
		'status', 'draft'
	);
end;
$$;

create or replace function private.guard_quote_product_source_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
	if new.status = 'ready'
		and old.status <> 'ready'
		and exists (
			select 1
			from public.quote_items qi
			join public.products p on p.id = qi.product_id
			where qi.quote_id = new.id
				and qi.source_type = 'catalogue'
				and p.lock_version is distinct from qi.source_product_version
				and (
					qi.source_product_reviewed_version is null
					or p.lock_version > qi.source_product_reviewed_version
				)
		) then
		raise exception using errcode = '23514', message = 'Quote has unresolved Product source changes';
	end if;
	return new;
end;
$$;

drop trigger if exists quotes_product_source_readiness on public.quotes;
create trigger quotes_product_source_readiness
before update on public.quotes
for each row execute function private.guard_quote_product_source_readiness();

revoke all on function public.refresh_product_quote_item(uuid, bigint, uuid, bigint)
	from public, anon, authenticated, service_role;
grant execute on function public.refresh_product_quote_item(uuid, bigint, uuid, bigint)
	to authenticated;

revoke all on function public.review_product_quote_item(uuid, bigint, uuid, bigint)
	from public, anon, authenticated, service_role;
grant execute on function public.review_product_quote_item(uuid, bigint, uuid, bigint)
	to authenticated;

commit;
