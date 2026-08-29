begin;

-- P25 adds MIME and explicit renderer provenance without rewriting the
-- historical document metadata already attached to a Quote revision.
alter table public.quotes
	add column if not exists document_mime_type text;

alter table public.quotes
	drop constraint if exists quotes_document_mime_type_check,
	add constraint quotes_document_mime_type_check check (
		document_mime_type is null or document_mime_type = 'application/pdf'
	);

create or replace function private.guard_quote_protected_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
	if new.lead_id is distinct from old.lead_id
		or new.client_id is distinct from old.client_id
		or new.status is distinct from old.status
		or new.revision_number is distinct from old.revision_number
		or new.base_quote_number is distinct from old.base_quote_number
		or new.tax_rate is distinct from old.tax_rate
		or new.subtotal is distinct from old.subtotal
		or new.tax_amount is distinct from old.tax_amount
		or new.total is distinct from old.total
		or new.quote_snapshot is distinct from old.quote_snapshot
		or new.supersedes_quote_id is distinct from old.supersedes_quote_id
		or new.document_path is distinct from old.document_path
		or new.document_hash is distinct from old.document_hash
		or new.document_mime_type is distinct from old.document_mime_type
		or new.document_template_version is distinct from old.document_template_version
		or new.document_generator_version is distinct from old.document_generator_version
		or new.lock_version is distinct from old.lock_version
		or new.accepted_at is distinct from old.accepted_at
		or new.accepted_by is distinct from old.accepted_by
		or new.acceptance_source is distinct from old.acceptance_source
		or new.acceptance_evidence is distinct from old.acceptance_evidence then
		raise exception using errcode = '42501', message = 'Quote protected fields require a trusted action';
	end if;
	return new;
end;
$$;

create or replace function private.protect_quote_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_accepting boolean := old.status = 'sent' and new.status = 'accepted';
begin
	if old.status in ('sent', 'accepted', 'declined', 'expired', 'cancelled', 'superseded') and (
		new.lead_id is distinct from old.lead_id or
		(new.client_id is distinct from old.client_id and not v_accepting) or
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
		new.document_hash is distinct from old.document_hash or
		new.document_mime_type is distinct from old.document_mime_type or
		new.document_template_version is distinct from old.document_template_version or
		new.document_generator_version is distinct from old.document_generator_version or
		new.document_generated_at is distinct from old.document_generated_at
	) then
		raise exception using errcode = '55000', message = 'Sent quote commercial data is immutable';
	end if;
	return new;
end;
$$;

create or replace function private.freeze_quote_document_defaults()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_defaults jsonb := coalesce(
		(select setting_value from public.app_settings where setting_key = 'quote_defaults'),
		'{}'::jsonb
	);
	v_snapshot jsonb := coalesce(new.quote_snapshot, '{}'::jsonb);
begin
	if old.status = 'draft' and new.status = 'ready' and not (v_snapshot ? 'bank_details') then
		new.quote_snapshot := v_snapshot || jsonb_build_object(
			'bank_details', coalesce(v_defaults ->> 'bank_details', '')
		);
	end if;
	return new;
end;
$$;

drop trigger if exists quotes_document_defaults on public.quotes;
create trigger quotes_document_defaults
before update on public.quotes
for each row execute function private.freeze_quote_document_defaults();

create or replace function public.attach_quote_document(
	p_quote_id uuid,
	p_lock_version bigint,
	p_document_path text,
	p_document_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
	v_quote public.quotes%rowtype;
	v_expected_path text;
	v_template text := 'professional-v2';
	v_generator text := 'quote-pdf-v2.1.0';
	v_mime text := 'application/pdf';
begin
	if not (select private.has_any_role(array['owner', 'admin', 'sales']::text[])) then
		raise exception using errcode = '42501', message = 'CRM role required';
	end if;
	if p_document_hash !~ '^[0-9a-fA-F]{64}$' then
		raise exception using errcode = '22023', message = 'A SHA-256 document hash is required';
	end if;
	select * into v_quote from public.quotes where id = p_quote_id for update;
	if not found then raise exception using errcode = 'P0002', message = 'Quote not found'; end if;
	if v_quote.lock_version is distinct from p_lock_version then
		raise exception using errcode = '40001', message = 'Stale quote lock_version';
	end if;
	v_expected_path := format('quotes/%s/%s.pdf', v_quote.id, v_quote.quote_number);
	if p_document_path <> v_expected_path then
		raise exception using errcode = '22023', message = 'Quote document path is invalid';
	end if;
	if v_quote.document_path is not null then
		if v_quote.document_path = p_document_path and v_quote.document_hash = lower(p_document_hash) then
			return jsonb_build_object(
				'quote_id', v_quote.id,
				'document_path', v_quote.document_path,
				'document_hash', v_quote.document_hash,
				'document_mime_type', coalesce(v_quote.document_mime_type, v_mime),
				'document_template_version', v_quote.document_template_version,
				'document_generator_version', v_quote.document_generator_version,
				'document_generated_at', v_quote.document_generated_at,
				'lock_version', v_quote.lock_version,
				'idempotent', true
			);
		end if;
		raise exception using errcode = '55000', message = 'Quote document metadata is immutable';
	end if;
	if v_quote.status <> 'ready' then
		raise exception using errcode = '22023', message = 'Only a ready Quote can receive a document';
	end if;
	update public.quotes
	set document_path = p_document_path,
		document_hash = lower(p_document_hash),
		document_mime_type = v_mime,
		document_template_version = v_template,
		document_generator_version = v_generator,
		document_generated_at = now(),
		lock_version = lock_version + 1
	where id = v_quote.id and lock_version = p_lock_version;
	return jsonb_build_object(
		'quote_id', v_quote.id,
		'document_path', p_document_path,
		'document_hash', lower(p_document_hash),
		'document_mime_type', v_mime,
		'document_template_version', v_template,
		'document_generator_version', v_generator,
		'document_generated_at', (select document_generated_at from public.quotes where id = v_quote.id),
		'lock_version', (select lock_version from public.quotes where id = v_quote.id),
		'idempotent', false
	);
end;
$$;

revoke all on function public.attach_quote_document(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.attach_quote_document(uuid, bigint, text, text) to authenticated;

commit;
