begin;

alter table public.quote_items
	add column source_type text not null default 'custom',
	add column product_id uuid,
	add column product_code_snapshot text,
	add column unit_label_snapshot text,
	add column catalogue_unit_price numeric(19, 4),
	add column source_product_version bigint,
	add column source_product_reviewed_version bigint,
	add column source_product_reviewed_at timestamptz,
	add column source_product_reviewed_by uuid;

alter table public.quote_items
	add constraint quote_items_product_id_fkey
		foreign key (product_id) references public.products (id) on delete restrict,
	add constraint quote_items_source_product_reviewed_by_fkey
		foreign key (source_product_reviewed_by) references public.profiles (id) on delete set null,
	add constraint quote_items_source_type_check
		check (source_type in ('custom', 'catalogue')),
	add constraint quote_items_source_contract
		check (
			(
				source_type = 'custom'
				and product_id is null
				and product_code_snapshot is null
				and unit_label_snapshot is null
				and catalogue_unit_price is null
				and source_product_version is null
			)
			or (
				source_type = 'catalogue'
				and product_id is not null
				and product_code_snapshot is not null
				and product_code_snapshot = btrim(product_code_snapshot)
				and char_length(product_code_snapshot) between 1 and 80
				and unit_label_snapshot is not null
				and unit_label_snapshot = btrim(unit_label_snapshot)
				and char_length(unit_label_snapshot) between 1 and 80
				and catalogue_unit_price is not null
				and catalogue_unit_price >= 0
				and source_product_version is not null
				and source_product_version > 0
			)
		),
	add constraint quote_items_review_evidence_check
		check (
			(
				source_product_reviewed_version is null
				and source_product_reviewed_at is null
				and source_product_reviewed_by is null
			)
			or (
				source_type = 'catalogue'
				and source_product_reviewed_version is not null
				and source_product_reviewed_version >= source_product_version
				and source_product_reviewed_at is not null
			)
		),
	add constraint quote_items_source_product_version_check
		check (
			source_product_version is null
			or source_product_version > 0
		),
	add constraint quote_items_source_reviewed_version_check
		check (
			source_product_reviewed_version is null
			or source_product_reviewed_version > 0
		);

create index quote_items_product_id_idx
	on public.quote_items (product_id, quote_id, position)
	where product_id is not null;

alter index public.quote_items_quote_id_idx rename to quote_items_quote_position_idx;

-- Keep the v1.4 index name as a compatibility surface for the frozen query
-- planner contract while the v1.5 name becomes the canonical position index.
create index quote_items_quote_id_idx
on public.quote_items (quote_id, position);

-- Product selection is the narrow trusted boundary. It locks both source
-- records, copies the customer-facing snapshot, and recalculates Quote totals
-- without ever accepting browser-supplied Product fields or totals.
create or replace function public.add_product_quote_item(
	p_quote_id uuid,
	p_quote_lock_version bigint,
	p_product_id uuid,
	p_product_lock_version bigint,
	p_quantity numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_product public.products%rowtype;
	v_actor uuid := (select auth.uid());
	v_position integer;
	v_line_subtotal numeric(19, 2);
	v_totals record;
	v_quote_lock bigint;
	v_item_id uuid;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_quantity is null or p_quantity <= 0 or scale(p_quantity) > 4 then
		raise exception using errcode = '22023', message = 'Quote item quantity is invalid';
	end if;

	select * into v_quote
	from public.quotes
	where id = p_quote_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Quote not found';
	end if;
	if v_quote.status <> 'draft' then
		raise exception using errcode = '22023', message = 'Products can only be added to a draft Quote';
	end if;
	if p_quote_lock_version is distinct from v_quote.lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;

	select * into v_product
	from public.products
	where id = p_product_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Product not found';
	end if;
	if p_product_lock_version is distinct from v_product.lock_version then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;
	if v_product.status <> 'active' then
		raise exception using errcode = '22023', message = 'Only an active Product can be added to a Quote';
	end if;
	if v_product.currency <> v_quote.currency then
		raise exception using errcode = '22023', message = 'Product currency must match Quote currency';
	end if;

	select coalesce(max(position), 0) + 1
	into v_position
	from public.quote_items
	where quote_id = v_quote.id;
	v_line_subtotal := private.quote_line_subtotal(p_quantity, v_product.unit_price);

	insert into public.quote_items (
		quote_id,
		position,
		name,
		description,
		quantity,
		unit_price,
		taxable,
		line_subtotal,
		source_type,
		product_id,
		product_code_snapshot,
		unit_label_snapshot,
		catalogue_unit_price,
		source_product_version
	)
	values (
		v_quote.id,
		v_position,
		v_product.name,
		v_product.customer_description,
		p_quantity,
		v_product.unit_price,
		v_product.taxable,
		v_line_subtotal,
		'catalogue',
		v_product.id,
		v_product.product_code,
		v_product.unit_label,
		v_product.unit_price,
		v_product.lock_version
	)
	returning id into v_item_id;

	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	update public.quotes
	set subtotal = v_totals.subtotal,
		tax_amount = v_totals.tax_amount,
		total = v_totals.total,
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_quote_lock;
	if v_quote_lock is null then
		raise exception using errcode = '40001', message = 'Quote changed during Product selection';
	end if;

	insert into public.activities (quote_id, actor_id, event_type, metadata, summary)
	values (
		v_quote.id,
		v_actor,
		'quote_item_product_added',
		jsonb_build_object(
			'quote_item_id', v_item_id,
			'product_id', v_product.id,
			'product_code', v_product.product_code,
			'source_product_version', v_product.lock_version,
			'position', v_position
		),
		'Product added to Quote'
	);

	return jsonb_build_object(
		'quote_id', v_quote.id,
		'quote_item_id', v_item_id,
		'product_id', v_product.id,
		'position', v_position,
		'source_product_version', v_product.lock_version,
		'quote_lock_version', v_quote_lock,
		'currency', v_quote.currency,
		'unit_price', v_product.unit_price,
		'catalogue_unit_price', v_product.unit_price,
		'status', 'draft'
	);
end;
$$;

-- Preserve Product lineage when the existing immutable revision action clones a
-- sent Quote into a new draft revision.
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

	insert into public.quote_items (
		quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal,
		source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price,
		source_product_version, source_product_reviewed_version, source_product_reviewed_at,
		source_product_reviewed_by
	)
	select
		v_new_id, position, name, description, quantity, unit_price, taxable, line_subtotal,
		source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price,
		source_product_version, source_product_reviewed_version, source_product_reviewed_at,
		source_product_reviewed_by
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

revoke all on function public.add_product_quote_item(uuid, bigint, uuid, bigint, numeric)
	from public, anon, authenticated, service_role;
grant execute on function public.add_product_quote_item(uuid, bigint, uuid, bigint, numeric)
	to authenticated;

commit;
