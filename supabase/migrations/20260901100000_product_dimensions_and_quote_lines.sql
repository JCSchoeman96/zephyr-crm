begin;

-- Dimensional boundaries: customer-facing labels are at most 80 characters;
-- values are positive millimetre decimals no greater than 100000 mm with at
-- most four decimal places.

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
		if char_length(v_label) > 80 then
			raise exception using errcode = '22023', message = format('Dimension label for %s cannot exceed 80 characters', v_key);
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

create or replace function private.is_valid_quote_item_dimensions(p_dimensions jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
	v_item jsonb;
	v_field text;
	v_key text;
	v_value text;
	v_seen_keys text[] := array[]::text[];
begin
	if jsonb_typeof(p_dimensions) is distinct from 'array' then
		return false;
	end if;

	for v_item in select value from jsonb_array_elements(p_dimensions) loop
		if jsonb_typeof(v_item) is distinct from 'object'
			or (select count(*) from jsonb_object_keys(v_item)) <> 5 then
			return false;
		end if;

		for v_field in select jsonb_object_keys(v_item) loop
			if v_field not in ('key', 'label', 'unit', 'required', 'value') then
				return false;
			end if;
		end loop;

		if not (v_item ? 'key')
			or jsonb_typeof(v_item -> 'key') is distinct from 'string' then
			return false;
		end if;
		v_key := v_item ->> 'key';
		if v_key not in ('width', 'height', 'length', 'depth') or v_key = any(v_seen_keys) then
			return false;
		end if;
		v_seen_keys := array_append(v_seen_keys, v_key);

		if not (v_item ? 'label')
			or jsonb_typeof(v_item -> 'label') is distinct from 'string'
			or (v_item ->> 'label') = ''
			or (v_item ->> 'label') <> btrim(v_item ->> 'label')
			or char_length(v_item ->> 'label') > 80 then
			return false;
		end if;
		if not (v_item ? 'unit')
			or jsonb_typeof(v_item -> 'unit') is distinct from 'string'
			or (v_item ->> 'unit') <> 'mm' then
			return false;
		end if;
		if not (v_item ? 'required')
			or jsonb_typeof(v_item -> 'required') is distinct from 'boolean' then
			return false;
		end if;
		if not (v_item ? 'value')
			or jsonb_typeof(v_item -> 'value') not in ('null', 'string') then
			return false;
		end if;

		if jsonb_typeof(v_item -> 'value') = 'string' then
			v_value := v_item ->> 'value';
			if v_value !~ '^(?:[1-9][0-9]{0,5}(?:\.[0-9]{0,3}[1-9])?|0\.[0-9]{0,3}[1-9])$' then
				return false;
			end if;
			if v_value::numeric > 100000 then
				return false;
			end if;
		end if;
	end loop;

	return true;
end;
$$;

alter table public.quote_items
	add column dimensions jsonb not null default '[]'::jsonb,
	add column product_category_id_snapshot uuid,
	add column product_category_code_snapshot text,
	add column product_category_label_snapshot text,
	add constraint quote_items_dimensions_array_check
		check (jsonb_typeof(dimensions) = 'array'),
	add constraint quote_items_dimensions_snapshot_check
		check (private.is_valid_quote_item_dimensions(dimensions));

revoke all on function private.is_valid_quote_item_dimensions(jsonb) from public, anon, authenticated, service_role;

comment on column public.quote_items.dimensions is 'Canonical client-specific dimension snapshot; values are positive millimetre decimal strings up to 100000 mm with at most four decimal places, or null while a draft is incomplete.';
comment on column public.quote_items.product_category_id_snapshot is 'Historical ProductCategory identity captured on the QuoteItem; intentionally has no live foreign key.';
comment on column public.quote_items.product_category_code_snapshot is 'Historical ProductCategory code captured on the QuoteItem.';
comment on column public.quote_items.product_category_label_snapshot is 'Historical ProductCategory label captured on the QuoteItem.';

-- Task 6: keep Product-to-Quote actions as the trusted owner of all source
-- snapshots and client-specific dimension values.  These helpers are kept in
-- the same forward migration as the Product/QuoteItem columns so a reset can
-- replay one coherent contract without changing historical migrations.
create or replace function private.normalize_quote_item_dimensions(
	p_product public.products,
	p_dimensions jsonb,
	p_preserve_null boolean default true
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
	v_definition jsonb;
	v_item jsonb;
	v_value text;
	v_canonical text;
	v_normalized jsonb := '[]'::jsonb;
	v_index integer := 0;
begin
	if not p_product.dimensions_enabled then
		if p_dimensions is not null and p_dimensions <> '[]'::jsonb then
			raise exception using errcode = '22023', message = 'Non-dimensional Products cannot have dimensions';
		end if;
		return '[]'::jsonb;
	end if;
	if p_dimensions is null or jsonb_typeof(p_dimensions) is distinct from 'array' then
		raise exception using errcode = '22023', message = 'Product dimensions must be a JSON array';
	end if;
	if jsonb_array_length(p_dimensions) <> jsonb_array_length(p_product.dimension_definitions) then
		raise exception using errcode = '22023', message = 'Product dimensions do not match its configured fields';
	end if;

	for v_definition in select value from jsonb_array_elements(p_product.dimension_definitions) loop
		v_index := v_index + 1;
		v_item := p_dimensions -> (v_index - 1);
		if jsonb_typeof(v_item) is distinct from 'object'
			or (select count(*) from jsonb_object_keys(v_item)) <> 5 then
			raise exception using errcode = '22023', message = format('Dimension %s is malformed', v_index);
		end if;
		if v_item ->> 'key' is distinct from v_definition ->> 'key'
			or v_item ->> 'label' is distinct from v_definition ->> 'label'
			or v_item ->> 'unit' is distinct from v_definition ->> 'unit'
			or (v_item ->> 'required')::boolean is distinct from (v_definition ->> 'required')::boolean then
			raise exception using errcode = '22023', message = format('Dimension %s does not match the Product definition', v_index);
		end if;
		if jsonb_typeof(v_item -> 'value') is distinct from 'null'
			and jsonb_typeof(v_item -> 'value') is distinct from 'string' then
			raise exception using errcode = '22023', message = format('Dimension %s value must be text or null', v_index);
		end if;
		if jsonb_typeof(v_item -> 'value') = 'null' then
			if not p_preserve_null then
				raise exception using errcode = '22023', message = format('Dimension %s value is required', v_index);
			end if;
			v_normalized := v_normalized || jsonb_build_array(
				jsonb_build_object(
					'key', v_definition ->> 'key',
					'label', v_definition ->> 'label',
					'unit', 'mm',
					'required', (v_definition ->> 'required')::boolean,
					'value', null
				)
			);
			continue;
		end if;
		v_value := v_item ->> 'value';
		if v_value !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$' then
			raise exception using errcode = '22023', message = format('Dimension %s value must be positive', v_index);
		end if;
		if position('.' in v_value) > 0 and char_length(v_value) - position('.' in v_value) > 4 then
			raise exception using errcode = '22023', message = format('Dimension %s value cannot use more than 4 decimal places', v_index);
		end if;
		if char_length(split_part(v_value, '.', 1)) > 6
			or split_part(v_value, '.', 1)::bigint > 100000
			or (split_part(v_value, '.', 1) = '100000' and rtrim(split_part(v_value, '.', 2), '0') <> '') then
			raise exception using errcode = '22023', message = format('Dimension %s value cannot exceed 100000 mm', v_index);
		end if;
		if v_value::numeric <= 0 then
			raise exception using errcode = '22023', message = format('Dimension %s value must be positive', v_index);
		end if;
		v_canonical := v_value::numeric::text;
		if position('.' in v_canonical) > 0 then
			v_canonical := rtrim(rtrim(v_canonical, '0'), '.');
		end if;
		v_normalized := v_normalized || jsonb_build_array(
			jsonb_build_object(
				'key', v_definition ->> 'key',
				'label', v_definition ->> 'label',
				'unit', 'mm',
				'required', (v_definition ->> 'required')::boolean,
				'value', v_canonical
			)
		);
	end loop;
	return v_normalized;
end;
$$;

create or replace function private.quote_item_dimensions_ready(p_dimensions jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
	v_item jsonb;
begin
	if jsonb_typeof(p_dimensions) is distinct from 'array' then
		return false;
	end if;
	for v_item in select value from jsonb_array_elements(p_dimensions) loop
		if (v_item ->> 'required')::boolean and jsonb_typeof(v_item -> 'value') = 'null' then
			return false;
		end if;
	end loop;
	return true;
end;
$$;

create or replace function private.normalize_quote_item_dimensions_from_snapshot(
	p_definition_snapshot jsonb,
	p_dimensions jsonb
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
	v_definition jsonb;
	v_item jsonb;
	v_value text;
	v_canonical text;
	v_normalized jsonb := '[]'::jsonb;
	v_index integer := 0;
begin
	if p_definition_snapshot = '[]'::jsonb then
		if p_dimensions is not null and p_dimensions <> '[]'::jsonb then
			raise exception using errcode = '22023', message = 'Non-dimensional Quote items cannot have dimensions';
		end if;
		return '[]'::jsonb;
	end if;
	if jsonb_typeof(p_definition_snapshot) is distinct from 'array'
		or p_dimensions is null
		or jsonb_typeof(p_dimensions) is distinct from 'array'
		or jsonb_array_length(p_dimensions) <> jsonb_array_length(p_definition_snapshot) then
		raise exception using errcode = '22023', message = 'Quote item dimensions do not match their stored Product definition';
	end if;
	for v_definition in select value from jsonb_array_elements(p_definition_snapshot) loop
		v_index := v_index + 1;
		v_item := p_dimensions -> (v_index - 1);
		if jsonb_typeof(v_item) is distinct from 'object'
			or (select count(*) from jsonb_object_keys(v_item)) <> 5 then
			raise exception using errcode = '22023', message = format('Dimension %s is malformed', v_index);
		end if;
		if v_item ->> 'key' is distinct from v_definition ->> 'key'
			or v_item ->> 'label' is distinct from v_definition ->> 'label'
			or v_item ->> 'unit' is distinct from v_definition ->> 'unit'
			or (v_item ->> 'required')::boolean is distinct from (v_definition ->> 'required')::boolean then
			raise exception using errcode = '22023', message = format('Dimension %s does not match its stored Product definition', v_index);
		end if;
		if jsonb_typeof(v_item -> 'value') is distinct from 'null'
			and jsonb_typeof(v_item -> 'value') is distinct from 'string' then
			raise exception using errcode = '22023', message = format('Dimension %s value must be text or null', v_index);
		end if;
		if jsonb_typeof(v_item -> 'value') = 'null' then
			v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
				'key', v_definition ->> 'key', 'label', v_definition ->> 'label', 'unit', v_definition ->> 'unit',
				'required', (v_definition ->> 'required')::boolean, 'value', null
			));
			continue;
		end if;
		v_value := v_item ->> 'value';
		if v_value !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$' then
			raise exception using errcode = '22023', message = format('Dimension %s value must be positive', v_index);
		end if;
		if position('.' in v_value) > 0 and char_length(v_value) - position('.' in v_value) > 4 then
			raise exception using errcode = '22023', message = format('Dimension %s value cannot use more than 4 decimal places', v_index);
		end if;
		if char_length(split_part(v_value, '.', 1)) > 6
			or split_part(v_value, '.', 1)::bigint > 100000
			or (split_part(v_value, '.', 1) = '100000' and rtrim(split_part(v_value, '.', 2), '0') <> '') then
			raise exception using errcode = '22023', message = format('Dimension %s value cannot exceed 100000 mm', v_index);
		end if;
		if v_value::numeric <= 0 then
			raise exception using errcode = '22023', message = format('Dimension %s value must be positive', v_index);
		end if;
		v_canonical := v_value::numeric::text;
		if position('.' in v_canonical) > 0 then v_canonical := rtrim(rtrim(v_canonical, '0'), '.'); end if;
		v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
			'key', v_definition ->> 'key', 'label', v_definition ->> 'label', 'unit', v_definition ->> 'unit',
			'required', (v_definition ->> 'required')::boolean, 'value', v_canonical
		));
	end loop;
	return v_normalized;
end;
$$;

create or replace function private.product_dimension_snapshot(
	p_product public.products,
	p_existing_dimensions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
	v_definition jsonb;
	v_existing jsonb;
	v_snapshot jsonb := '[]'::jsonb;
begin
	if not p_product.dimensions_enabled then
		return '[]'::jsonb;
	end if;
	for v_definition in select value from jsonb_array_elements(p_product.dimension_definitions) loop
		select value into v_existing
		from jsonb_array_elements(coalesce(p_existing_dimensions, '[]'::jsonb))
		where value ->> 'key' = v_definition ->> 'key'
		limit 1;
		v_snapshot := v_snapshot || jsonb_build_array(
			jsonb_build_object(
				'key', v_definition ->> 'key',
				'label', v_definition ->> 'label',
				'unit', 'mm',
				'required', (v_definition ->> 'required')::boolean,
				'value', case when v_existing is null then null else v_existing -> 'value' end
			)
		);
	end loop;
	return v_snapshot;
end;
$$;

revoke execute on function private.normalize_quote_item_dimensions(public.products, jsonb, boolean) from public, anon, authenticated, service_role;
revoke execute on function private.quote_item_dimensions_ready(jsonb) from public, anon, authenticated, service_role;
revoke execute on function private.product_dimension_snapshot(public.products, jsonb) from public, anon, authenticated, service_role;
revoke execute on function private.normalize_quote_item_dimensions_from_snapshot(jsonb, jsonb) from public, anon, authenticated, service_role;

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
	v_category public.product_categories%rowtype;
	v_actor uuid := (select auth.uid());
	v_position integer;
	v_quantity numeric;
	v_dimensions jsonb;
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
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status <> 'draft' then raise exception using errcode = '22023', message = 'Products can only be added to a draft Quote'; end if;
	if p_quote_lock_version is distinct from v_quote.lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	select * into v_product from public.products where id = p_product_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
	if p_product_lock_version is distinct from v_product.lock_version then raise exception using errcode = '40001', message = 'Stale Product lock_version'; end if;
	if v_product.status <> 'active' then raise exception using errcode = '22023', message = 'Only an active Product can be added to a Quote'; end if;
	if v_product.currency <> v_quote.currency then raise exception using errcode = '22023', message = 'Product currency must match Quote currency'; end if;
	if v_product.category_id is not null then
		select * into v_category from public.product_categories where id = v_product.category_id for share;
		if not found then raise exception using errcode = 'P0002', message = 'ProductCategory not found'; end if;
	end if;
	v_quantity := case when v_product.dimensions_enabled then 1 else p_quantity end;
	v_dimensions := private.product_dimension_snapshot(v_product);
	v_line_subtotal := private.quote_line_subtotal(v_quantity, v_product.unit_price);
	select coalesce(max(position), 0) + 1 into v_position from public.quote_items where quote_id = v_quote.id;
	insert into public.quote_items (
		quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal,
		source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price,
		source_product_version, dimensions, product_category_id_snapshot,
		product_category_code_snapshot, product_category_label_snapshot
	)
	values (
		v_quote.id, v_position, v_product.name, v_product.customer_description, v_quantity,
		v_product.unit_price, v_product.taxable, v_line_subtotal, 'catalogue', v_product.id,
		v_product.product_code, v_product.unit_label, v_product.unit_price, v_product.lock_version,
		v_dimensions, v_category.id, v_category.code, v_category.label
	)
	returning id into v_item_id;
	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	update public.quotes
	set subtotal = v_totals.subtotal, tax_amount = v_totals.tax_amount, total = v_totals.total,
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version
	returning lock_version into v_quote_lock;
	if v_quote_lock is null then raise exception using errcode = '40001', message = 'Quote changed during Product selection'; end if;
	insert into public.activities (quote_id, actor_id, event_type, metadata, summary)
	values (
		v_quote.id, v_actor, 'quote_item_product_added',
		jsonb_build_object('quote_item_id', v_item_id, 'product_id', v_product.id,
			'source_product_version', v_product.lock_version, 'position', v_position),
		'Product added to Quote'
	);
	return jsonb_build_object(
		'quote_id', v_quote.id, 'quote_item_id', v_item_id, 'product_id', v_product.id,
		'position', v_position, 'source_product_version', v_product.lock_version,
		'quote_lock_version', v_quote_lock, 'currency', v_quote.currency,
		'unit_price', v_product.unit_price, 'catalogue_unit_price', v_product.unit_price,
		'quantity', v_quantity, 'dimensions', v_dimensions, 'status', 'draft'
	);
end;
$$;

revoke all on function public.add_product_quote_item(uuid, bigint, uuid, bigint, numeric) from public, anon, authenticated, service_role;
grant execute on function public.add_product_quote_item(uuid, bigint, uuid, bigint, numeric) to authenticated;

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
	v_normalized_items jsonb := '[]'::jsonb;
	v_item jsonb;
	v_position integer := 0;
	v_name text;
	v_description text;
	v_quantity numeric;
	v_unit_price numeric;
	v_taxable boolean;
	v_dimensions jsonb;
	v_source_type text;
	v_product_id uuid;
	v_product_lock_version bigint;
	v_product_code text;
	v_unit_label text;
	v_catalogue_unit_price numeric;
	v_source_product_version bigint;
	v_category_id uuid;
	v_category_code text;
	v_category_label text;
	v_line_subtotal numeric(19, 2);
	v_subtotal numeric(19, 2) := 0;
	v_taxable_subtotal numeric(19, 2) := 0;
	v_tax_amount numeric(19, 2);
	v_total numeric(19, 2);
	v_snapshot jsonb;
	v_new_quote boolean := p_quote_id is null;
	v_lead public.leads%rowtype;
	v_existing_item public.quote_items%rowtype;
	v_product public.products%rowtype;
	v_category public.product_categories%rowtype;
	v_item_id uuid;
	v_lock_product_id uuid;
	v_item_id_text text;
	v_product_id_text text;
	v_product_lock_text text;
	v_seen_item_ids uuid[] := '{}'::uuid[];
	old_lock_version bigint;
	old_status text;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if v_subject is null then raise exception using errcode = '22023', message = 'Quote subject is required'; end if;
	if v_currency !~ '^[A-Z]{3}$' then raise exception using errcode = '22023', message = 'Quote currency is invalid'; end if;
	if v_tax_rate < 0 or v_tax_rate > 100 or scale(v_tax_rate) > 6 then raise exception using errcode = '22023', message = 'Quote tax rate is invalid'; end if;
	if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 100 then
		raise exception using errcode = '22023', message = 'Quote items must be an array of at most 100 items';
	end if;
	if not v_new_quote then
		select * into v_quote from public.quotes where id = p_quote_id for update;
		if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
		if v_quote.lead_id is distinct from p_lead_id then raise exception using errcode = '42501', message = 'Quote lead cannot be changed'; end if;
		if v_quote.status not in ('draft', 'ready') then raise exception using errcode = '55000', message = 'Only draft or ready Quotes can be edited'; end if;
		if p_lock_version is null or v_quote.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
		old_lock_version := v_quote.lock_version;
		old_status := v_quote.status;
	end if;
	select * into v_lead from public.leads where id = p_lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_lead.pipeline_stage not in ('PROPOSAL', 'DECISION') then raise exception using errcode = '22023', message = 'Lead must be in proposal or decision before quoting'; end if;
	if p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id and source_lead_id = p_lead_id) then
		raise exception using errcode = '42501', message = 'Quote client association requires the converted Lead client';
	end if;

	-- Lock every Product participating in this save in one deterministic order.
	-- New rows identify Products directly; existing catalogue rows identify them
	-- through their already-persisted QuoteItem lineage.
	for v_lock_product_id in
		select product_id
		from (
			select (value ->> 'product_id')::uuid as product_id
			from jsonb_array_elements(v_items)
			where nullif(trim(value ->> 'product_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			union
			select qi.product_id
			from public.quote_items qi
			join jsonb_array_elements(v_items) item
				on nullif(trim(item.value ->> 'id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
				and qi.id = (item.value ->> 'id')::uuid
			where qi.quote_id = v_quote_id
				and qi.source_type = 'catalogue'
		) product_ids
		where product_id is not null
		order by product_id
	loop
		perform 1 from public.products where id = v_lock_product_id for update;
	end loop;

	-- Validate every line and replace all browser-owned source fields with a
	-- server-derived normalized representation before changing the Quote.
	for v_item in select value from jsonb_array_elements(v_items) loop
		v_position := v_position + 1;
		v_item_id_text := nullif(trim(coalesce(v_item ->> 'id', '')), '');
		if v_item_id_text is not null and v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
			raise exception using errcode = '22023', message = format('Quote item %s identifier is invalid', v_position);
		end if;
		if coalesce(v_item ->> 'quantity', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position);
		end if;
		if coalesce(v_item ->> 'unit_price', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then
			raise exception using errcode = '22023', message = format('Quote item %s unit price is invalid', v_position);
		end if;
		v_unit_price := (v_item ->> 'unit_price')::numeric;
		if v_unit_price < 0 then raise exception using errcode = '22023', message = format('Quote item %s unit price is invalid', v_position); end if;
		if v_item ? 'taxable' and jsonb_typeof(v_item -> 'taxable') <> 'boolean' then raise exception using errcode = '22023', message = format('Quote item %s taxable flag is invalid', v_position); end if;
		v_taxable := coalesce((v_item ->> 'taxable')::boolean, true);
		v_product := null;
		v_category := null;
		v_existing_item := null;
		v_product_id := null;
		v_source_type := 'custom';
		v_dimensions := '[]'::jsonb;
		v_product_code := null;
		v_unit_label := null;
		v_catalogue_unit_price := null;
		v_source_product_version := null;
		v_category_id := null;
		v_category_code := null;
		v_category_label := null;

		if v_item_id_text is not null then
			v_item_id := v_item_id_text::uuid;
			select * into v_existing_item from public.quote_items where id = v_item_id and quote_id = v_quote_id for update;
			if not found then raise exception using errcode = '42501', message = format('Quote item %s does not belong to this Quote', v_position); end if;
			v_source_type := v_existing_item.source_type;
			v_product_id := v_existing_item.product_id;
			v_product_code := v_existing_item.product_code_snapshot;
			v_unit_label := v_existing_item.unit_label_snapshot;
			v_catalogue_unit_price := v_existing_item.catalogue_unit_price;
			v_source_product_version := v_existing_item.source_product_version;
			v_category_id := v_existing_item.product_category_id_snapshot;
			v_category_code := v_existing_item.product_category_code_snapshot;
			v_category_label := v_existing_item.product_category_label_snapshot;
			if v_existing_item.source_type = 'catalogue' then
				select * into v_product from public.products where id = v_existing_item.product_id for update;
				if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
				v_name := v_existing_item.name;
				v_description := nullif(trim(coalesce(v_item ->> 'description', '')), '');
				v_quantity := case when v_existing_item.dimensions <> '[]'::jsonb then 1 else (v_item ->> 'quantity')::numeric end;
				v_dimensions := private.normalize_quote_item_dimensions_from_snapshot(v_existing_item.dimensions, case when v_item ? 'dimensions' then v_item -> 'dimensions' else v_existing_item.dimensions end);
				if v_existing_item.dimensions <> '[]'::jsonb and (v_item ->> 'quantity')::numeric <> 1 then
					raise exception using errcode = '22023', message = format('Dimensional Quote item %s quantity must be 1', v_position);
				end if;
			else
				if v_item ? 'product_id' or (v_item ? 'dimensions' and v_item -> 'dimensions' <> '[]'::jsonb) then
					raise exception using errcode = '22023', message = format('Custom Quote item %s cannot use Product dimensions', v_position);
				end if;
				v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
				if v_name is null then raise exception using errcode = '22023', message = format('Quote item %s requires a name', v_position); end if;
				if coalesce(v_item ->> 'quantity', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position); end if;
				v_quantity := (v_item ->> 'quantity')::numeric;
			end if;
		else
			v_product_id_text := nullif(trim(coalesce(v_item ->> 'product_id', '')), '');
			if v_product_id_text is not null then
				if v_product_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode = '22023', message = format('Quote item %s Product identifier is invalid', v_position); end if;
				v_product_lock_text := nullif(trim(coalesce(v_item ->> 'product_lock_version', '')), '');
				if v_product_lock_text is null or v_product_lock_text !~ '^[0-9]+$' then raise exception using errcode = '22023', message = format('Quote item %s Product lock_version is invalid', v_position); end if;
				v_product_id := v_product_id_text::uuid;
				v_product_lock_version := v_product_lock_text::bigint;
				select * into v_product from public.products where id = v_product_id for update;
				if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
				if v_product_lock_version is distinct from v_product.lock_version then raise exception using errcode = '40001', message = 'Stale Product lock_version'; end if;
				if v_product.status <> 'active' then raise exception using errcode = '22023', message = 'Only an active Product can be added to a Quote'; end if;
				if v_product.currency <> v_currency then raise exception using errcode = '22023', message = 'Product currency must match Quote currency'; end if;
				v_source_type := 'catalogue';
				v_name := v_product.name;
				v_description := v_product.customer_description;
				v_quantity := case when v_product.dimensions_enabled then 1 else (v_item ->> 'quantity')::numeric end;
				if v_product.dimensions_enabled and v_item ? 'quantity' and (v_item ->> 'quantity')::numeric <> 1 then raise exception using errcode = '22023', message = format('Dimensional Quote item %s quantity must be 1', v_position); end if;
				v_dimensions := private.normalize_quote_item_dimensions(v_product, coalesce(v_item -> 'dimensions', private.product_dimension_snapshot(v_product)));
				v_product_code := v_product.product_code;
				v_unit_label := v_product.unit_label;
				v_catalogue_unit_price := v_product.unit_price;
				v_source_product_version := v_product.lock_version;
				if v_product.category_id is not null then
					select * into v_category from public.product_categories where id = v_product.category_id for share;
					if not found then raise exception using errcode = 'P0002', message = 'ProductCategory not found'; end if;
					v_category_id := v_category.id;
					v_category_code := v_category.code;
					v_category_label := v_category.label;
				end if;
			else
				if v_item ? 'dimensions' and v_item -> 'dimensions' <> '[]'::jsonb then raise exception using errcode = '22023', message = format('Custom Quote item %s cannot use Product dimensions', v_position); end if;
				v_name := nullif(trim(coalesce(v_item ->> 'name', '')), '');
				if v_name is null then raise exception using errcode = '22023', message = format('Quote item %s requires a name', v_position); end if;
				if coalesce(v_item ->> 'quantity', '') !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$' then raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position); end if;
				v_quantity := (v_item ->> 'quantity')::numeric;
				v_description := nullif(trim(coalesce(v_item ->> 'description', '')), '');
			end if;
		end if;
		if v_quantity is null or v_quantity <= 0 then raise exception using errcode = '22023', message = format('Quote item %s quantity is invalid', v_position); end if;
		v_line_subtotal := private.quote_line_subtotal(v_quantity, v_unit_price);
		v_subtotal := v_subtotal + v_line_subtotal;
		if v_taxable then v_taxable_subtotal := v_taxable_subtotal + v_line_subtotal; end if;
		v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
			'id', v_item_id_text, 'name', v_name, 'description', v_description, 'quantity', v_quantity::text,
			'unit_price', v_unit_price::text, 'taxable', v_taxable, 'dimensions', v_dimensions,
			'source_type', v_source_type, 'product_id', v_product_id, 'product_code_snapshot', v_product_code,
			'unit_label_snapshot', v_unit_label, 'catalogue_unit_price', v_catalogue_unit_price,
			'source_product_version', v_source_product_version, 'product_category_id_snapshot', v_category_id,
			'product_category_code_snapshot', v_category_code, 'product_category_label_snapshot', v_category_label
		));
	end loop;
	v_tax_amount := round(v_taxable_subtotal * v_tax_rate / 100, 2)::numeric(19, 2);
	v_total := v_subtotal + v_tax_amount;
	v_snapshot := private.build_quote_snapshot(p_terms, p_tax_label, v_tax_rate, v_currency, p_valid_until);
	if v_new_quote then
		insert into public.quotes (lead_id, client_id, status, currency, subject, introduction, terms, tax_label, tax_rate, subtotal, tax_amount, total, valid_until, quote_snapshot, created_by)
		values (p_lead_id, p_client_id, 'draft', v_currency, v_subject, nullif(trim(p_introduction), ''), nullif(trim(p_terms), ''), nullif(trim(p_tax_label), ''), v_tax_rate, v_subtotal, v_tax_amount, v_total, p_valid_until, v_snapshot, auth.uid())
		returning id, lock_version into v_quote_id, v_lock_version;
	else
		update public.quotes set client_id = p_client_id, status = 'draft', currency = v_currency, subject = v_subject, introduction = nullif(trim(p_introduction), ''), terms = nullif(trim(p_terms), ''), tax_label = nullif(trim(p_tax_label), ''), tax_rate = v_tax_rate, subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total, valid_until = p_valid_until, ready_at = null, quote_snapshot = v_snapshot, lock_version = lock_version + 1
		where id = p_quote_id and lock_version = old_lock_version returning lock_version into v_lock_version;
		if v_lock_version is null then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	end if;
	update public.quote_items set position = position + 1000 where quote_id = v_quote_id;
	v_position := 0;
	for v_item in select value from jsonb_array_elements(v_normalized_items) loop
		v_position := v_position + 1;
		v_item_id_text := nullif(trim(coalesce(v_item ->> 'id', '')), '');
		if v_item_id_text is null then
			insert into public.quote_items (quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal, source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price, source_product_version, dimensions, product_category_id_snapshot, product_category_code_snapshot, product_category_label_snapshot)
			values (v_quote_id, v_position, v_item ->> 'name', nullif(v_item ->> 'description', ''), (v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::numeric, (v_item ->> 'taxable')::boolean, private.quote_line_subtotal((v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::numeric), v_item ->> 'source_type', nullif(v_item ->> 'product_id', '')::uuid, nullif(v_item ->> 'product_code_snapshot', ''), nullif(v_item ->> 'unit_label_snapshot', ''), nullif(v_item ->> 'catalogue_unit_price', '')::numeric, nullif(v_item ->> 'source_product_version', '')::bigint, v_item -> 'dimensions', nullif(v_item ->> 'product_category_id_snapshot', '')::uuid, nullif(v_item ->> 'product_category_code_snapshot', ''), nullif(v_item ->> 'product_category_label_snapshot', ''))
			returning id into v_item_id;
		else
			v_item_id := v_item_id_text::uuid;
			if v_item_id = any(v_seen_item_ids) then raise exception using errcode = '22023', message = format('Quote item %s is duplicated', v_position); end if;
			select * into v_existing_item from public.quote_items where id = v_item_id and quote_id = v_quote_id for update;
			if not found then raise exception using errcode = '42501', message = format('Quote item %s does not belong to this Quote', v_position); end if;
			update public.quote_items set position = v_position, name = case when v_existing_item.source_type = 'catalogue' then v_existing_item.name else v_item ->> 'name' end, description = nullif(v_item ->> 'description', ''), quantity = (v_item ->> 'quantity')::numeric, unit_price = (v_item ->> 'unit_price')::numeric, taxable = (v_item ->> 'taxable')::boolean, line_subtotal = private.quote_line_subtotal((v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::numeric), dimensions = case when v_existing_item.source_type = 'catalogue' then v_item -> 'dimensions' else '[]'::jsonb end where id = v_item_id;
		end if;
		v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
	end loop;
	if cardinality(v_seen_item_ids) = 0 then delete from public.quote_items where quote_id = v_quote_id; else delete from public.quote_items where quote_id = v_quote_id and not (id = any(v_seen_item_ids)); end if;
	if v_new_quote then update public.quotes set lock_version = lock_version + 1 where id = v_quote_id returning lock_version into v_lock_version; end if;
	update public.leads set last_activity_at = now(), lock_version = lock_version + 1 where id = p_lead_id;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary) values (p_lead_id, v_quote_id, auth.uid(), case when v_new_quote then 'quote_created' else 'quote_updated' end, jsonb_build_object('quote_id', v_quote_id, 'from_status', old_status), case when v_new_quote then 'Quote draft created' else 'Quote draft updated' end);
	return jsonb_build_object('quote_id', v_quote_id, 'quote_number', (select quote_number from public.quotes where id = v_quote_id), 'revision_number', (select revision_number from public.quotes where id = v_quote_id), 'status', 'draft', 'subtotal', v_subtotal, 'tax_amount', v_tax_amount, 'total', v_total, 'lock_version', v_lock_version);
end;
$$;

revoke all on function public.save_quote_draft(uuid, bigint, uuid, uuid, text, text, text, text, numeric, date, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_quote_draft(uuid, bigint, uuid, uuid, text, text, text, text, numeric, date, text, jsonb) to authenticated;

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
	v_category public.product_categories%rowtype;
	v_dimensions jsonb;
	v_quantity numeric;
	v_totals record;
	v_new_lock bigint;
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status <> 'draft' then raise exception using errcode = '22023', message = 'Product source review is draft-only'; end if;
	if p_quote_lock_version is distinct from v_quote.lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	select * into v_item from public.quote_items where id = p_quote_item_id and quote_id = v_quote.id for update;
	if not found then raise exception using errcode = 'P0002', message = 'QuoteItem not found'; end if;
	if v_item.source_type <> 'catalogue' or v_item.product_id is null then raise exception using errcode = '22023', message = 'Only catalogue QuoteItems can be refreshed'; end if;
	select * into v_product from public.products where id = v_item.product_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
	if p_product_lock_version is distinct from v_product.lock_version then raise exception using errcode = '40001', message = 'Stale Product lock_version'; end if;
	if v_product.status <> 'active' then raise exception using errcode = '22023', message = 'Only an active Product can be refreshed'; end if;
	if v_product.currency <> v_quote.currency then raise exception using errcode = '22023', message = 'Product currency must match Quote currency'; end if;
	if v_product.lock_version = v_item.source_product_version then raise exception using errcode = '22023', message = 'Product source is already current'; end if;
	if v_product.category_id is not null then
		select * into v_category from public.product_categories where id = v_product.category_id for share;
		if not found then raise exception using errcode = 'P0002', message = 'ProductCategory not found'; end if;
	end if;
	v_dimensions := private.product_dimension_snapshot(v_product, v_item.dimensions);
	v_quantity := case when v_product.dimensions_enabled then 1 else v_item.quantity end;
	update public.quote_items
	set name = v_product.name,
		description = v_product.customer_description,
		quantity = v_quantity,
		product_code_snapshot = v_product.product_code,
		unit_label_snapshot = v_product.unit_label,
		catalogue_unit_price = v_product.unit_price,
		source_product_version = v_product.lock_version,
		dimensions = v_dimensions,
		product_category_id_snapshot = v_category.id,
		product_category_code_snapshot = v_category.code,
		product_category_label_snapshot = v_category.label,
		source_product_reviewed_version = null,
		source_product_reviewed_at = null,
		source_product_reviewed_by = null,
		taxable = v_product.taxable,
		line_subtotal = private.quote_line_subtotal(v_quantity, unit_price)
	where id = v_item.id;
	select * into v_totals from private.quote_totals(v_quote.id, v_quote.tax_rate);
	update public.quotes set subtotal = v_totals.subtotal, tax_amount = v_totals.tax_amount, total = v_totals.total, lock_version = lock_version + 1
	where id = v_quote.id and lock_version = v_quote.lock_version returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Quote changed during Product refresh'; end if;
	insert into public.activities (quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.id, v_actor, 'quote_item_product_refreshed', jsonb_build_object('quote_item_id', v_item.id, 'product_id', v_product.id, 'previous_source_product_version', v_item.source_product_version, 'source_product_version', v_product.lock_version, 'product_code', v_product.product_code), 'Product snapshot refreshed on Quote');
	return jsonb_build_object('quote_id', v_quote.id, 'quote_item_id', v_item.id, 'product_id', v_product.id, 'source_product_version', v_product.lock_version, 'quote_lock_version', v_new_lock, 'dimensions', v_dimensions, 'status', 'draft');
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
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.status <> 'draft' then raise exception using errcode = '22023', message = 'Product source review is draft-only'; end if;
	if p_quote_lock_version is distinct from v_quote.lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	select * into v_item from public.quote_items where id = p_quote_item_id and quote_id = v_quote.id for update;
	if not found then raise exception using errcode = 'P0002', message = 'QuoteItem not found'; end if;
	if v_item.source_type <> 'catalogue' or v_item.product_id is null then raise exception using errcode = '22023', message = 'Only catalogue QuoteItems can be reviewed'; end if;
	select * into v_product from public.products where id = v_item.product_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Product not found'; end if;
	if p_product_lock_version is distinct from v_product.lock_version then raise exception using errcode = '40001', message = 'Stale Product lock_version'; end if;
	if v_product.lock_version = v_item.source_product_version then raise exception using errcode = '22023', message = 'Product source is already current'; end if;
	update public.quote_items set source_product_reviewed_version = v_product.lock_version, source_product_reviewed_at = now(), source_product_reviewed_by = v_actor where id = v_item.id;
	update public.quotes set lock_version = lock_version + 1 where id = v_quote.id and lock_version = v_quote.lock_version returning lock_version into v_new_lock;
	if v_new_lock is null then raise exception using errcode = '40001', message = 'Quote changed during Product review'; end if;
	insert into public.activities (quote_id, actor_id, event_type, metadata, summary)
	values (v_quote.id, v_actor, 'quote_item_product_reviewed', jsonb_build_object('quote_item_id', v_item.id, 'product_id', v_product.id, 'source_product_version', v_item.source_product_version, 'reviewed_product_version', v_product.lock_version), 'Product changes reviewed; quoted values kept');
	return jsonb_build_object('quote_id', v_quote.id, 'quote_item_id', v_item.id, 'product_id', v_product.id, 'source_product_version', v_item.source_product_version, 'source_product_reviewed_version', v_product.lock_version, 'dimensions', v_item.dimensions, 'product_category_id_snapshot', v_item.product_category_id_snapshot, 'product_category_code_snapshot', v_item.product_category_code_snapshot, 'product_category_label_snapshot', v_item.product_category_label_snapshot, 'quote_lock_version', v_new_lock, 'status', 'draft');
end;
$$;

revoke all on function public.refresh_product_quote_item(uuid, bigint, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.refresh_product_quote_item(uuid, bigint, uuid, bigint) to authenticated;
revoke all on function public.review_product_quote_item(uuid, bigint, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.review_product_quote_item(uuid, bigint, uuid, bigint) to authenticated;

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
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then raise exception using errcode = '42501', message = 'CRM role required'; end if;
	select * into v_source from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_source.lock_version is distinct from p_lock_version then raise exception using errcode = '40001', message = 'Stale quote lock_version'; end if;
	if v_source.status <> 'sent' then raise exception using errcode = '22023', message = 'Only a sent Quote can be revised'; end if;
	select * into v_lead from public.leads where id = v_source.lead_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Lead not found'; end if;
	if v_lead.pipeline_stage <> 'DECISION' then raise exception using errcode = '22023', message = 'Only a decision Lead can revise a Quote'; end if;
	perform pg_advisory_xact_lock(v_source.base_quote_number);
	select coalesce(max(revision_number), 0) + 1 into v_revision from public.quotes where base_quote_number = v_source.base_quote_number;
	insert into public.quotes (base_quote_number, quote_year, revision_number, lead_id, client_id, status, currency, subject, introduction, terms, tax_label, tax_rate, subtotal, tax_amount, total, valid_until, quote_snapshot, supersedes_quote_id, created_by)
	values (v_source.base_quote_number, v_source.quote_year, v_revision, v_source.lead_id, v_source.client_id, 'draft', v_source.currency, v_source.subject, v_source.introduction, v_source.terms, v_source.tax_label, v_source.tax_rate, v_source.subtotal, v_source.tax_amount, v_source.total, v_source.valid_until, v_source.quote_snapshot, v_source.id, v_actor)
	returning id, lock_version into v_new_id, v_lock_version;
	insert into public.quote_items (quote_id, position, name, description, quantity, unit_price, taxable, line_subtotal, source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price, source_product_version, source_product_reviewed_version, source_product_reviewed_at, source_product_reviewed_by, dimensions, product_category_id_snapshot, product_category_code_snapshot, product_category_label_snapshot)
	select v_new_id, position, name, description, quantity, unit_price, taxable, line_subtotal, source_type, product_id, product_code_snapshot, unit_label_snapshot, catalogue_unit_price, source_product_version, source_product_reviewed_version, source_product_reviewed_at, source_product_reviewed_by, dimensions, product_category_id_snapshot, product_category_code_snapshot, product_category_label_snapshot
	from public.quote_items where quote_id = v_source.id order by position;
	update public.leads set pipeline_stage = 'PROPOSAL', attention_state = 'waiting_on_us', attention_reason = null, attention_resume_at = null, last_activity_at = now(), lock_version = lock_version + 1 where id = v_lead.id and lock_version = v_lead.lock_version returning lock_version into v_lead_lock;
	if v_lead_lock is null then raise exception using errcode = '40001', message = 'Lead changed during Quote revision'; end if;
	v_planning_task := private.create_task_impl(null, v_source.lead_id, null, v_new_id, 'prepare_quote', 'Prepare revised Quote', 'Review and send the revised Quote.', v_actor, now(), null);
	v_planning_task_id := nullif(v_planning_task ->> 'task_id', '')::uuid;
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary) values (v_source.lead_id, v_new_id, v_actor, 'quote_revised', jsonb_build_object('previous_quote_id', v_source.id, 'revision_number', v_revision, 'planning_task_id', v_planning_task_id), 'Quote revision created');
	insert into public.activities (lead_id, quote_id, actor_id, event_type, metadata, summary) values (v_source.lead_id, v_new_id, v_actor, 'pipeline_changed', jsonb_build_object('from_stage', v_lead.pipeline_stage, 'to_stage', 'PROPOSAL'), 'Lead returned to Proposal for Quote revision');
	return jsonb_build_object('quote_id', v_new_id, 'quote_number', (select quote_number from public.quotes where id = v_new_id), 'revision_number', v_revision, 'supersedes_quote_id', v_source.id, 'status', 'draft', 'lock_version', v_lock_version, 'lead_lock_version', v_lead_lock, 'planning_task_id', v_planning_task_id, 'idempotent', false);
end;
$$;

revoke all on function public.revise_quote(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.revise_quote(uuid, bigint) to authenticated;

create or replace function private.quote_ready_validation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_item_count bigint;
begin
	if new.status = 'ready' and old.status <> 'ready' then
		if length(trim(coalesce(new.subject, ''))) = 0 then raise exception using errcode = '23514', message = 'A ready Quote requires a subject'; end if;
		if new.valid_until is null or new.valid_until < current_date then raise exception using errcode = '23514', message = 'A ready Quote requires a current validity date'; end if;
		if jsonb_typeof(new.quote_snapshot) <> 'object' then raise exception using errcode = '23514', message = 'A ready Quote requires a commercial snapshot'; end if;
		select count(*) into v_item_count from public.quote_items where quote_id = new.id;
		if v_item_count = 0 then raise exception using errcode = '23514', message = 'A ready Quote requires at least one line item'; end if;
		if exists (select 1 from public.quote_items where quote_id = new.id and not private.quote_item_dimensions_ready(dimensions)) then
			raise exception using errcode = '23514', message = 'A ready Quote requires all required Product dimensions';
		end if;
	end if;
	return new;
end;
$$;

commit;
