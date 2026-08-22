-- Phase 13: make client quote numbering and default validity part of the
-- isolated instance configuration without introducing tenant state.

alter table public.quotes
	add column if not exists quote_prefix text not null default 'Q-';

alter table public.quotes
	drop constraint if exists quotes_quote_prefix_check,
	add constraint quotes_quote_prefix_check check (quote_prefix ~ '^[A-Z0-9-]{1,12}$');

drop index if exists public.quotes_quote_number_idx;
alter table public.quotes drop column if exists quote_number;
alter table public.quotes
	add column quote_number text generated always as (
		quote_prefix || quote_year::text || '-' || lpad(base_quote_number::text, 6, '0') ||
		case when revision_number > 1 then '-R' || revision_number::text else '' end
	) stored;
create unique index quotes_quote_number_idx on public.quotes (quote_number);

create or replace function private.apply_client_quote_defaults()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_defaults jsonb;
	v_prefix text;
	v_validity_days integer;
begin
	select setting_value into v_defaults
	from public.app_settings
	where setting_key = 'quote_defaults';
	v_prefix := coalesce(nullif(trim(v_defaults ->> 'prefix'), ''), 'Q-');
	v_validity_days := greatest(1, least(365, coalesce((v_defaults ->> 'validity_days')::integer, 30)));
	if v_prefix !~ '^[A-Z0-9-]{1,12}$' then
		v_prefix := 'Q-';
	end if;
	new.quote_prefix := v_prefix;
	if new.valid_until is null then
		new.valid_until := current_date + v_validity_days;
	end if;
	return new;
end;
$$;

create or replace function private.prevent_quote_prefix_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if new.quote_prefix is distinct from old.quote_prefix then
		raise exception using errcode = '55000', message = 'Quote prefix is immutable';
	end if;
	return new;
end;
$$;

drop trigger if exists quotes_client_defaults on public.quotes;
create trigger quotes_client_defaults
before insert on public.quotes
for each row execute function private.apply_client_quote_defaults();

drop trigger if exists quotes_prefix_immutability on public.quotes;
create trigger quotes_prefix_immutability
before update on public.quotes
for each row execute function private.prevent_quote_prefix_change();

insert into public.app_settings (setting_key, setting_value, description)
values
	(
		'company_identity',
		'{"name":"Zephyr CRM","logo_path":"/favicon.svg","brand_tokens":{"primary":"#315cce","primary_strong":"#2649a8","accent":"#d9773b"}}'::jsonb,
		'Non-secret company identity and client brand tokens'
	),
	(
		'locale',
		'{"language":"en-ZA","timezone":"Africa/Johannesburg","currency":"ZAR","date_format":"dd/MM/yyyy"}'::jsonb,
		'Presentation and scheduling defaults'
	),
	(
		'quote_defaults',
		'{"prefix":"Q-","tax_label":"VAT","tax_rate":0,"validity_days":30,"terms":"","bank_details":""}'::jsonb,
		'Non-secret commercial defaults for new quotes'
	),
	(
		'sales_rules',
		'{"follow_up_days":3,"stale_lead_days":14,"default_owner_email":""}'::jsonb,
		'Lead follow-up and stale-opportunity rules'
	),
	(
		'email_defaults',
		'{"sender_email":"","sender_name":"Zephyr CRM","reply_to":"","template_ids":{}}'::jsonb,
		'Non-secret sender identity and message template identifiers'
	),
	(
		'integration_identifiers',
		'{"bricks_form_id":"contact-form","sendpulse_api_base_url":"https://api.sendpulse.com","sendpulse_sender_domain":"","sendpulse_template_ids":{}}'::jsonb,
		'Non-secret external integration identifiers; credentials remain trusted environment values'
	)
on conflict (setting_key) do nothing;

commit;
