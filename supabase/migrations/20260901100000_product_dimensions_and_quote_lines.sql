begin;

alter table public.products
	add column dimensions_enabled boolean not null default false,
	add column dimension_definitions jsonb not null default '[]'::jsonb;

alter table public.products
	add constraint products_dimensions_configuration_check check (
		(not dimensions_enabled and dimension_definitions = '[]'::jsonb)
		or (dimensions_enabled and jsonb_typeof(dimension_definitions) = 'array')
	),
	add constraint products_service_dimensions_check check (
		kind <> 'service'
		or (not dimensions_enabled and dimension_definitions = '[]'::jsonb)
	);

create or replace function private.normalize_product_dimensions(
	p_kind text,
	p_dimensions_enabled boolean,
	p_dimension_definitions jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_definition jsonb;
	v_field text;
	v_key text;
	v_label text;
	v_required boolean;
	v_position bigint;
	v_seen_keys text[] := array[]::text[];
	v_normalized jsonb := '[]'::jsonb;
	v_definition_count integer;
begin
	if p_kind is null or p_kind not in ('product', 'service') then
		raise exception using errcode = '22023', message = 'Product kind is invalid';
	end if;
	if p_dimensions_enabled is null then
		raise exception using errcode = '22023', message = 'Dimensions enabled value is required';
	end if;
	if p_dimension_definitions is null
		or jsonb_typeof(p_dimension_definitions) is distinct from 'array' then
		raise exception using errcode = '22023', message = 'Dimension definitions must be a JSON array';
	end if;

	v_definition_count := jsonb_array_length(p_dimension_definitions);
	if p_kind = 'service' and (p_dimensions_enabled or v_definition_count > 0) then
		raise exception using errcode = '22023', message = 'Services cannot use dimensions';
	end if;
	if not p_dimensions_enabled then
		if v_definition_count > 0 then
			raise exception using errcode = '22023', message = 'Disabled Products cannot have dimension definitions';
		end if;
		return '[]'::jsonb;
	end if;
	if v_definition_count < 1 or v_definition_count > 4 then
		raise exception using errcode = '22023', message = 'Dimension definitions must contain between 1 and 4 fields';
	end if;

	for v_definition, v_position in
		select value, ordinality
		from jsonb_array_elements(p_dimension_definitions) with ordinality
		order by ordinality
	loop
		if jsonb_typeof(v_definition) is distinct from 'object' then
			raise exception using errcode = '22023', message = format('Dimension definition %s must be an object', v_position);
		end if;

		for v_field in select jsonb_object_keys(v_definition) loop
			if v_field not in ('key', 'label', 'unit', 'required') then
				raise exception using errcode = '22023', message = format('Unknown dimension definition field: %s', v_field);
			end if;
		end loop;

		if not (v_definition ? 'key')
			or jsonb_typeof(v_definition -> 'key') is distinct from 'string' then
			raise exception using errcode = '22023', message = format('Dimension definition %s requires a string key', v_position);
		end if;
		v_key := btrim(v_definition ->> 'key');
		if v_key not in ('width', 'height', 'length', 'depth') then
			raise exception using errcode = '22023', message = format('Unknown dimension key: %s', coalesce(v_key, '(missing)'));
		end if;
		if v_key = any(v_seen_keys) then
			raise exception using errcode = '22023', message = format('Duplicate dimension key: %s', v_key);
		end if;
		v_seen_keys := array_append(v_seen_keys, v_key);

		if not (v_definition ? 'label')
			or jsonb_typeof(v_definition -> 'label') is distinct from 'string' then
			raise exception using errcode = '22023', message = format('Dimension label for %s is required', v_key);
		end if;
		v_label := btrim(v_definition ->> 'label');
		if v_label = '' then
			raise exception using errcode = '22023', message = format('Dimension label for %s is required', v_key);
		end if;

		if not (v_definition ? 'unit')
			or jsonb_typeof(v_definition -> 'unit') is distinct from 'string'
			or btrim(v_definition ->> 'unit') <> 'mm' then
			raise exception using errcode = '22023', message = format('Dimension unit for %s must be mm', v_key);
		end if;

		if not (v_definition ? 'required')
			or jsonb_typeof(v_definition -> 'required') is distinct from 'boolean' then
			raise exception using errcode = '22023', message = format('Dimension required flag for %s must be boolean', v_key);
		end if;
		v_required := (v_definition ->> 'required')::boolean;

		v_normalized := v_normalized || jsonb_build_array(
			jsonb_build_object(
				'key', v_key,
				'label', v_label,
				'unit', 'mm',
				'required', v_required
			)
		);
	end loop;

	return v_normalized;
end;
$$;

drop function if exists public.create_product(text, text, text, text, text, uuid, text, text, numeric, boolean);
drop function if exists public.update_product(uuid, bigint, text, text, text, text, text, uuid, text, text, boolean);

create or replace function public.create_product(
	p_product_code text,
	p_name text,
	p_customer_description text default null,
	p_internal_notes text default null,
	p_kind text default null,
	p_category_id uuid default null,
	p_unit_label text default null,
	p_currency text default 'ZAR',
	p_unit_price numeric default null,
	p_taxable boolean default true,
	p_dimensions_enabled boolean default false,
	p_dimension_definitions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_code text := btrim(coalesce(p_product_code, ''));
	v_name text := btrim(coalesce(p_name, ''));
	v_customer_description text := nullif(btrim(coalesce(p_customer_description, '')), '');
	v_internal_notes text := nullif(btrim(coalesce(p_internal_notes, '')), '');
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_unit_label text := btrim(coalesce(p_unit_label, ''));
	v_currency text := upper(btrim(coalesce(p_currency, '')));
	v_dimension_definitions jsonb;
	v_category_status text;
	v_id uuid;
	v_lock_version bigint;
begin
	if char_length(v_code) not between 1 and 80 then
		raise exception using errcode = '22023', message = 'Product code is invalid';
	end if;
	if char_length(v_name) not between 1 and 200 then
		raise exception using errcode = '22023', message = 'Product name is invalid';
	end if;
	if v_kind not in ('product', 'service') then
		raise exception using errcode = '22023', message = 'Product kind is invalid';
	end if;
	if char_length(v_unit_label) not between 1 and 80 then
		raise exception using errcode = '22023', message = 'Product unit label is invalid';
	end if;
	if v_currency !~ '^[A-Z]{3}$' then
		raise exception using errcode = '22023', message = 'Product currency is invalid';
	end if;
	if p_unit_price is null or p_unit_price < 0 or scale(p_unit_price) > 4 then
		raise exception using errcode = '22023', message = 'Product unit price is invalid';
	end if;
	if p_taxable is null then
		raise exception using errcode = '22023', message = 'Product taxable value is required';
	end if;
	if char_length(coalesce(v_customer_description, '')) > 10000 then
		raise exception using errcode = '22023', message = 'Customer description is too long';
	end if;
	if char_length(coalesce(v_internal_notes, '')) > 10000 then
		raise exception using errcode = '22023', message = 'Internal notes are too long';
	end if;

	v_dimension_definitions := private.normalize_product_dimensions(
		v_kind,
		p_dimensions_enabled,
		p_dimension_definitions
	);

	if p_category_id is not null then
		select status into v_category_status
		from public.product_categories
		where id = p_category_id;
		if v_category_status is null then
			raise exception using errcode = 'P0002', message = 'ProductCategory not found';
		end if;
		if v_category_status <> 'active' then
			raise exception using errcode = '22023', message = 'Products require an active ProductCategory';
		end if;
	end if;

	insert into public.products (
		product_code,
		name,
		customer_description,
		internal_notes,
		kind,
		category_id,
		unit_label,
		currency,
		unit_price,
		taxable,
		dimensions_enabled,
		dimension_definitions,
		created_by
	)
	values (
		v_code,
		v_name,
		v_customer_description,
		v_internal_notes,
		v_kind,
		p_category_id,
		v_unit_label,
		v_currency,
		p_unit_price,
		p_taxable,
		p_dimensions_enabled,
		v_dimension_definitions,
		v_actor
	)
	returning id, lock_version into v_id, v_lock_version;

	perform private.product_activity(
		v_id,
		v_actor,
		'product_created',
		'Product created',
		jsonb_build_object('product_code', v_code, 'kind', v_kind)
	);
	return jsonb_build_object(
		'product_id', v_id,
		'lock_version', v_lock_version,
		'status', 'draft'
	);
end;
$$;

create or replace function public.update_product(
	p_product_id uuid,
	p_lock_version bigint,
	p_product_code text,
	p_name text,
	p_customer_description text default null,
	p_internal_notes text default null,
	p_kind text default null,
	p_category_id uuid default null,
	p_unit_label text default null,
	p_currency text default 'ZAR',
	p_taxable boolean default true,
	p_dimensions_enabled boolean default false,
	p_dimension_definitions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.products%rowtype;
	v_code text := btrim(coalesce(p_product_code, ''));
	v_name text := btrim(coalesce(p_name, ''));
	v_customer_description text := nullif(btrim(coalesce(p_customer_description, '')), '');
	v_internal_notes text := nullif(btrim(coalesce(p_internal_notes, '')), '');
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_unit_label text := btrim(coalesce(p_unit_label, ''));
	v_currency text := upper(btrim(coalesce(p_currency, '')));
	v_dimension_definitions jsonb;
	v_category_status text;
	v_lock_version bigint;
begin
	if char_length(v_code) not between 1 and 80 then
		raise exception using errcode = '22023', message = 'Product code is invalid';
	end if;
	if char_length(v_name) not between 1 and 200 then
		raise exception using errcode = '22023', message = 'Product name is invalid';
	end if;
	if v_kind not in ('product', 'service') then
		raise exception using errcode = '22023', message = 'Product kind is invalid';
	end if;
	if char_length(v_unit_label) not between 1 and 80 then
		raise exception using errcode = '22023', message = 'Product unit label is invalid';
	end if;
	if v_currency !~ '^[A-Z]{3}$' then
		raise exception using errcode = '22023', message = 'Product currency is invalid';
	end if;
	if p_taxable is null then
		raise exception using errcode = '22023', message = 'Product taxable value is required';
	end if;
	if char_length(coalesce(v_customer_description, '')) > 10000 then
		raise exception using errcode = '22023', message = 'Customer description is too long';
	end if;
	if char_length(coalesce(v_internal_notes, '')) > 10000 then
		raise exception using errcode = '22023', message = 'Internal notes are too long';
	end if;

	v_dimension_definitions := private.normalize_product_dimensions(
		v_kind,
		p_dimensions_enabled,
		p_dimension_definitions
	);

	select * into v_current
	from public.products
	where id = p_product_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'Product not found';
	end if;
	if p_lock_version is distinct from v_current.lock_version then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;
	if v_current.status = 'archived' then
		raise exception using errcode = '22023', message = 'Archived Products cannot be edited';
	end if;

	if p_category_id is not null then
		select status into v_category_status
		from public.product_categories
		where id = p_category_id;
		if v_category_status is null then
			raise exception using errcode = 'P0002', message = 'ProductCategory not found';
		end if;
		if v_category_status <> 'active' then
			raise exception using errcode = '22023', message = 'Products require an active ProductCategory';
		end if;
	end if;

	update public.products
	set product_code = v_code,
		name = v_name,
		customer_description = v_customer_description,
		internal_notes = v_internal_notes,
		kind = v_kind,
		category_id = p_category_id,
		unit_label = v_unit_label,
		currency = v_currency,
		taxable = p_taxable,
		dimensions_enabled = p_dimensions_enabled,
		dimension_definitions = v_dimension_definitions,
		lock_version = lock_version + 1
	where id = p_product_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;

	perform private.product_activity(
		p_product_id,
		v_actor,
		'product_updated',
		'Product updated',
		jsonb_build_object('product_code', v_code, 'previous_code', v_current.product_code)
	);
	return jsonb_build_object(
		'product_id', p_product_id,
		'lock_version', v_lock_version,
		'status', v_current.status
	);
end;
$$;

revoke execute on function private.normalize_product_dimensions(text, boolean, jsonb) from public, anon, authenticated, service_role;

revoke execute on function public.create_product(text, text, text, text, text, uuid, text, text, numeric, boolean, boolean, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.update_product(uuid, bigint, text, text, text, text, text, uuid, text, text, boolean, boolean, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.create_product(text, text, text, text, text, uuid, text, text, numeric, boolean, boolean, jsonb) to authenticated;
grant execute on function public.update_product(uuid, bigint, text, text, text, text, text, uuid, text, text, boolean, boolean, jsonb) to authenticated;

comment on column public.products.dimensions_enabled is 'Whether this Product requires configured millimetre measurements.';
comment on column public.products.dimension_definitions is 'Ordered Product measurement definitions; trusted actions enforce the canonical shape.';

commit;
