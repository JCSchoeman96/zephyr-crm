begin;

create table public.product_categories (
	id uuid primary key default gen_random_uuid(),
	code text not null,
	label text not null,
	status text not null default 'active',
	sort_order integer not null default 0,
	lock_version bigint not null default 1,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint product_categories_code_bounds check (
		code = btrim(code) and char_length(code) between 1 and 80
	),
	constraint product_categories_label_bounds check (
		label = btrim(label) and char_length(label) between 1 and 200
	),
	constraint product_categories_status_check check (status in ('active', 'inactive')),
	constraint product_categories_sort_order_check check (sort_order >= 0),
	constraint product_categories_lock_version_check check (lock_version > 0)
);

create table public.products (
	id uuid primary key default gen_random_uuid(),
	product_code text not null,
	name text not null,
	customer_description text,
	internal_notes text,
	kind text not null,
	category_id uuid references public.product_categories (id) on delete set null,
	unit_label text not null,
	currency text not null default 'ZAR',
	unit_price numeric(14, 4) not null default 0,
	taxable boolean not null default true,
	status text not null default 'draft',
	lock_version bigint not null default 1,
	created_by uuid not null references public.profiles (id) on delete restrict,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	activated_at timestamptz,
	inactivated_at timestamptz,
	archived_at timestamptz,
	constraint products_code_bounds check (
		product_code = btrim(product_code) and char_length(product_code) between 1 and 80
	),
	constraint products_name_bounds check (
		name = btrim(name) and char_length(name) between 1 and 200
	),
	constraint products_kind_check check (kind in ('product', 'service')),
	constraint products_unit_bounds check (
		unit_label = btrim(unit_label) and char_length(unit_label) between 1 and 80
	),
	constraint products_currency_check check (
		currency = btrim(currency) and currency = upper(currency) and currency ~ '^[A-Z]{3}$'
	),
	constraint products_unit_price_check check (unit_price >= 0),
	constraint products_status_check check (status in ('draft', 'active', 'inactive', 'archived')),
	constraint products_lock_version_check check (lock_version > 0),
	constraint products_text_bounds check (
		(customer_description is null or char_length(customer_description) <= 10000)
		and (internal_notes is null or char_length(internal_notes) <= 10000)
	),
	constraint products_lifecycle_evidence check (
		(status = 'draft' and activated_at is null and inactivated_at is null and archived_at is null)
		or (
			status = 'active'
			and activated_at is not null
			and inactivated_at is null
			and archived_at is null
		)
		or (
			status = 'inactive'
			and inactivated_at is not null
			and archived_at is null
		)
		or (
			status = 'archived'
			and archived_at is not null
			and (
				(activated_at is null and inactivated_at is null)
				or (activated_at is not null and inactivated_at is not null)
			)
		)
	)
);

alter table public.activities
	add column product_id uuid references public.products (id) on delete cascade,
	add column product_category_id uuid references public.product_categories (id) on delete cascade;

alter table public.activities
	drop constraint if exists activities_have_target,
	add constraint activities_have_target check (
		lead_id is not null
		or client_id is not null
		or quote_id is not null
		or task_id is not null
		or outbound_message_id is not null
		or fulfilment_case_id is not null
		or product_id is not null
		or product_category_id is not null
	);

create unique index product_categories_code_lower_uidx
	on public.product_categories (lower(code));

create unique index products_product_code_lower_uidx
on public.products (lower(product_code));

create index products_status_name_idx
on public.products (status, name, updated_at desc, id);

create index products_category_status_name_idx
on public.products (category_id, status, name, updated_at desc, id);

create index products_kind_status_idx
on public.products (kind, status, name, updated_at desc, id);

create or replace function private.guard_product_category_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then
		return coalesce(new, old);
	end if;
	raise exception using errcode = '42501', message = 'ProductCategory changes require a trusted action';
end;
$$;

create or replace function private.guard_product_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then
		return coalesce(new, old);
	end if;
	raise exception using errcode = '42501', message = 'Product changes require a trusted action';
end;
$$;

create trigger product_categories_updated_at
before update on public.product_categories
for each row execute function private.set_updated_at();

create trigger products_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create trigger product_categories_protected_mutation
before insert or update or delete on public.product_categories
for each row execute function private.guard_product_category_mutation();

create trigger products_protected_mutation
before insert or update or delete on public.products
for each row execute function private.guard_product_mutation();

alter table public.product_categories enable row level security;
alter table public.products enable row level security;

revoke all on table public.product_categories from public, anon, authenticated;
revoke all on table public.products from public, anon, authenticated;
grant select on table public.product_categories to authenticated;
grant select on table public.products to authenticated;

create policy product_categories_select_active
on public.product_categories for select to authenticated
using ((select private.has_active_profile()));

create policy products_select_active
on public.products for select to authenticated
using ((select private.has_active_profile()));

create or replace function private.require_product_admin()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := (select auth.uid());
begin
	if v_actor is null or not (select private.has_any_role(array['owner', 'admin']::text[])) then
		raise exception using errcode = '42501', message = 'Owner or Admin role required';
	end if;
	return v_actor;
end;
$$;

create or replace function private.product_category_activity(
	p_category_id uuid,
	p_actor_id uuid,
	p_event_type text,
	p_summary text,
	p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
	insert into public.activities (
		product_category_id,
		actor_id,
		event_type,
		metadata,
		summary
	)
	values ($1, $2, $3, coalesce($5, '{}'::jsonb), $4);
$$;

create or replace function private.product_activity(
	p_product_id uuid,
	p_actor_id uuid,
	p_event_type text,
	p_summary text,
	p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
	insert into public.activities (
		product_id,
		actor_id,
		event_type,
		metadata,
		summary
	)
	values ($1, $2, $3, coalesce($5, '{}'::jsonb), $4);
$$;

create or replace function public.create_product_category(
	p_code text,
	p_label text,
	p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_id uuid;
	v_code text := btrim(coalesce(p_code, ''));
	v_label text := btrim(coalesce(p_label, ''));
begin
	if char_length(v_code) not between 1 and 80 then
		raise exception using errcode = '22023', message = 'ProductCategory code is invalid';
	end if;
	if char_length(v_label) not between 1 and 200 then
		raise exception using errcode = '22023', message = 'ProductCategory label is invalid';
	end if;
	if p_sort_order is null or p_sort_order < 0 then
		raise exception using errcode = '22023', message = 'ProductCategory sort order is invalid';
	end if;

	insert into public.product_categories (code, label, sort_order)
	values (v_code, v_label, p_sort_order)
	returning id into v_id;

	perform private.product_category_activity(
		v_id,
		v_actor,
		'product_category_created',
		'ProductCategory created',
		jsonb_build_object('code', v_code)
	);
	return jsonb_build_object(
		'product_category_id', v_id,
		'lock_version', 1,
		'status', 'active'
	);
end;
$$;

create or replace function public.update_product_category(
	p_category_id uuid,
	p_lock_version bigint,
	p_code text,
	p_label text,
	p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.product_categories%rowtype;
	v_code text := btrim(coalesce(p_code, ''));
	v_label text := btrim(coalesce(p_label, ''));
	v_lock_version bigint;
begin
	if char_length(v_code) not between 1 and 80 then
		raise exception using errcode = '22023', message = 'ProductCategory code is invalid';
	end if;
	if char_length(v_label) not between 1 and 200 then
		raise exception using errcode = '22023', message = 'ProductCategory label is invalid';
	end if;
	if p_sort_order is null or p_sort_order < 0 then
		raise exception using errcode = '22023', message = 'ProductCategory sort order is invalid';
	end if;

	select * into v_current
	from public.product_categories
	where id = p_category_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'ProductCategory not found';
	end if;
	if p_lock_version is distinct from v_current.lock_version then
		raise exception using errcode = '40001', message = 'Stale ProductCategory lock_version';
	end if;

	update public.product_categories
	set code = v_code,
		label = v_label,
		sort_order = p_sort_order,
		lock_version = lock_version + 1
	where id = p_category_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale ProductCategory lock_version';
	end if;

	perform private.product_category_activity(
		p_category_id,
		v_actor,
		'product_category_updated',
		'ProductCategory updated',
		jsonb_build_object('code', v_code, 'previous_code', v_current.code)
	);
	return jsonb_build_object(
		'product_category_id', p_category_id,
		'lock_version', v_lock_version,
		'status', v_current.status
	);
end;
$$;

create or replace function public.activate_product_category(
	p_category_id uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.product_categories%rowtype;
	v_lock_version bigint;
begin
	select * into v_current
	from public.product_categories
	where id = p_category_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'ProductCategory not found';
	end if;
	if p_lock_version is distinct from v_current.lock_version then
		raise exception using errcode = '40001', message = 'Stale ProductCategory lock_version';
	end if;
	if v_current.status <> 'inactive' then
		raise exception using errcode = '22023', message = 'Only an inactive ProductCategory can be activated';
	end if;

	update public.product_categories
	set status = 'active', lock_version = lock_version + 1
	where id = p_category_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale ProductCategory lock_version';
	end if;

	perform private.product_category_activity(
		p_category_id,
		v_actor,
		'product_category_activated',
		'ProductCategory activated'
	);
	return jsonb_build_object(
		'product_category_id', p_category_id,
		'lock_version', v_lock_version,
		'status', 'active'
	);
end;
$$;

create or replace function public.inactivate_product_category(
	p_category_id uuid,
	p_lock_version bigint,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.product_categories%rowtype;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_lock_version bigint;
begin
	if v_reason is null or char_length(v_reason) > 2000 then
		raise exception using errcode = '22023', message = 'ProductCategory inactivation reason is required';
	end if;

	select * into v_current
	from public.product_categories
	where id = p_category_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'ProductCategory not found';
	end if;
	if p_lock_version is distinct from v_current.lock_version then
		raise exception using errcode = '40001', message = 'Stale ProductCategory lock_version';
	end if;
	if v_current.status <> 'active' then
		raise exception using errcode = '22023', message = 'Only an active ProductCategory can be inactivated';
	end if;

	update public.product_categories
	set status = 'inactive', lock_version = lock_version + 1
	where id = p_category_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale ProductCategory lock_version';
	end if;

	perform private.product_category_activity(
		p_category_id,
		v_actor,
		'product_category_inactivated',
		'ProductCategory inactivated',
		jsonb_build_object('reason', v_reason)
	);
	return jsonb_build_object(
		'product_category_id', p_category_id,
		'lock_version', v_lock_version,
		'status', 'inactive'
	);
end;
$$;

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
	p_taxable boolean default true
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
	p_taxable boolean default true
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

create or replace function public.change_product_price(
	p_product_id uuid,
	p_lock_version bigint,
	p_unit_price numeric,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.products%rowtype;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_lock_version bigint;
begin
	if p_unit_price is null or p_unit_price < 0 or scale(p_unit_price) > 4 then
		raise exception using errcode = '22023', message = 'Product unit price is invalid';
	end if;
	if v_reason is not null and char_length(v_reason) > 2000 then
		raise exception using errcode = '22023', message = 'Product price change reason is too long';
	end if;

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
		raise exception using errcode = '22023', message = 'Archived Products cannot be repriced';
	end if;

	update public.products
	set unit_price = p_unit_price,
		lock_version = lock_version + 1
	where id = p_product_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;

	perform private.product_activity(
		p_product_id,
		v_actor,
		'product_price_changed',
		'Product price changed',
		jsonb_build_object(
			'old_unit_price', to_char(v_current.unit_price, 'FM9999999990.0000'),
			'new_unit_price', to_char(p_unit_price, 'FM9999999990.0000'),
			'currency', v_current.currency,
			'reason', v_reason
		)
	);
	return jsonb_build_object(
		'product_id', p_product_id,
		'lock_version', v_lock_version,
		'unit_price', to_char(p_unit_price, 'FM9999999990.0000'),
		'status', v_current.status
	);
end;
$$;

create or replace function public.activate_product(
	p_product_id uuid,
	p_lock_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.products%rowtype;
	v_category_status text;
	v_lock_version bigint;
begin
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
	if v_current.status not in ('draft', 'inactive') then
		raise exception using errcode = '22023', message = 'Only draft or inactive Products can be activated';
	end if;
	if v_current.category_id is not null then
		select status into v_category_status
		from public.product_categories
		where id = v_current.category_id;
		if v_category_status <> 'active' then
			raise exception using errcode = '22023', message = 'Products require an active ProductCategory';
		end if;
	end if;

	update public.products
	set status = 'active',
		activated_at = coalesce(activated_at, now()),
		inactivated_at = null,
		archived_at = null,
		lock_version = lock_version + 1
	where id = p_product_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;

	perform private.product_activity(
		p_product_id,
		v_actor,
		'product_activated',
		'Product activated',
		jsonb_build_object('from_status', v_current.status, 'to_status', 'active')
	);
	return jsonb_build_object(
		'product_id', p_product_id,
		'lock_version', v_lock_version,
		'status', 'active'
	);
end;
$$;

create or replace function public.inactivate_product(
	p_product_id uuid,
	p_lock_version bigint,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.products%rowtype;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_lock_version bigint;
begin
	if v_reason is not null and char_length(v_reason) > 2000 then
		raise exception using errcode = '22023', message = 'Product inactivation reason is too long';
	end if;

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
	if v_current.status <> 'active' then
		raise exception using errcode = '22023', message = 'Only an active Product can be inactivated';
	end if;

	update public.products
	set status = 'inactive',
		inactivated_at = now(),
		lock_version = lock_version + 1
	where id = p_product_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;

	perform private.product_activity(
		p_product_id,
		v_actor,
		'product_inactivated',
		'Product inactivated',
		jsonb_build_object('from_status', v_current.status, 'to_status', 'inactive', 'reason', v_reason)
	);
	return jsonb_build_object(
		'product_id', p_product_id,
		'lock_version', v_lock_version,
		'status', 'inactive'
	);
end;
$$;

create or replace function public.archive_product(
	p_product_id uuid,
	p_lock_version bigint,
	p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.products%rowtype;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_lock_version bigint;
begin
	if v_reason is null or char_length(v_reason) > 2000 then
		raise exception using errcode = '22023', message = 'Product archive reason is required';
	end if;

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
	if v_current.status not in ('draft', 'inactive') then
		raise exception using errcode = '22023', message = 'Only draft or inactive Products can be archived';
	end if;

	update public.products
	set status = 'archived',
		archived_at = now(),
		lock_version = lock_version + 1
	where id = p_product_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;

	perform private.product_activity(
		p_product_id,
		v_actor,
		'product_archived',
		'Product archived',
		jsonb_build_object('from_status', v_current.status, 'to_status', 'archived', 'reason', v_reason)
	);
	return jsonb_build_object(
		'product_id', p_product_id,
		'lock_version', v_lock_version,
		'status', 'archived'
	);
end;
$$;

create or replace function public.restore_product(
	p_product_id uuid,
	p_lock_version bigint,
	p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_actor uuid := private.require_product_admin();
	v_current public.products%rowtype;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_lock_version bigint;
begin
	if v_reason is null or char_length(v_reason) > 2000 then
		raise exception using errcode = '22023', message = 'Product restore reason is required';
	end if;

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
	if v_current.status <> 'archived' then
		raise exception using errcode = '22023', message = 'Only an archived Product can be restored';
	end if;

	update public.products
	set status = 'inactive',
		inactivated_at = coalesce(inactivated_at, now()),
		archived_at = null,
		lock_version = lock_version + 1
	where id = p_product_id and lock_version = p_lock_version
	returning lock_version into v_lock_version;
	if v_lock_version is null then
		raise exception using errcode = '40001', message = 'Stale Product lock_version';
	end if;

	perform private.product_activity(
		p_product_id,
		v_actor,
		'product_restored',
		'Product restored to inactive',
		jsonb_build_object('from_status', v_current.status, 'to_status', 'inactive', 'reason', v_reason)
	);
	return jsonb_build_object(
		'product_id', p_product_id,
		'lock_version', v_lock_version,
		'status', 'inactive'
	);
end;
$$;

revoke execute on function private.require_product_admin() from public, anon, authenticated, service_role;
revoke execute on function private.product_category_activity(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function private.product_activity(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;

revoke execute on function public.create_product_category(text, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.update_product_category(uuid, bigint, text, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.activate_product_category(uuid, bigint) from public, anon, authenticated, service_role;
revoke execute on function public.inactivate_product_category(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.create_product(text, text, text, text, text, uuid, text, text, numeric, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.update_product(uuid, bigint, text, text, text, text, text, uuid, text, text, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.change_product_price(uuid, bigint, numeric, text) from public, anon, authenticated, service_role;
revoke execute on function public.activate_product(uuid, bigint) from public, anon, authenticated, service_role;
revoke execute on function public.inactivate_product(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.archive_product(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.restore_product(uuid, bigint, text) from public, anon, authenticated, service_role;

grant execute on function public.create_product_category(text, text, integer) to authenticated;
grant execute on function public.update_product_category(uuid, bigint, text, text, integer) to authenticated;
grant execute on function public.activate_product_category(uuid, bigint) to authenticated;
grant execute on function public.inactivate_product_category(uuid, bigint, text) to authenticated;
grant execute on function public.create_product(text, text, text, text, text, uuid, text, text, numeric, boolean) to authenticated;
grant execute on function public.update_product(uuid, bigint, text, text, text, text, text, uuid, text, text, boolean) to authenticated;
grant execute on function public.change_product_price(uuid, bigint, numeric, text) to authenticated;
grant execute on function public.activate_product(uuid, bigint) to authenticated;
grant execute on function public.inactivate_product(uuid, bigint, text) to authenticated;
grant execute on function public.archive_product(uuid, bigint, text) to authenticated;
grant execute on function public.restore_product(uuid, bigint, text) to authenticated;

comment on table public.product_categories is 'Flat reusable Product grouping; not client or inventory data.';
comment on table public.products is 'Reusable Product or service catalogue source; not inventory ownership.';
comment on column public.products.internal_notes is 'Staff-only notes; never copied to a QuoteItem or customer document.';

commit;
