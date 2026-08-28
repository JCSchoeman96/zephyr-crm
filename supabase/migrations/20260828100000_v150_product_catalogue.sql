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
			and activated_at is not null
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

comment on table public.product_categories is 'Flat reusable Product grouping; not client or inventory data.';
comment on table public.products is 'Reusable Product or service catalogue source; not inventory ownership.';
comment on column public.products.internal_notes is 'Staff-only notes; never copied to a QuoteItem or customer document.';

commit;
