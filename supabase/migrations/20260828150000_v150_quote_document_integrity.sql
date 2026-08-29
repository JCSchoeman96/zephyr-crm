begin;

-- Once a Quote revision owns a document, it may still move through its legal
-- lifecycle, but it cannot be reset to draft or have its commercial facts
-- changed.  This closes the ready -> draft path after a provider failure while
-- preserving the trusted ready -> sent completion action.
create or replace function private.protect_quote_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
	v_accepting boolean := old.status = 'sent' and new.status = 'accepted';
	v_document_frozen boolean := old.document_path is not null
		or old.document_hash is not null
		or old.document_generated_at is not null;
begin
	if (old.status in ('sent', 'accepted', 'declined', 'expired', 'cancelled', 'superseded') or v_document_frozen) and (
		(v_document_frozen and new.status = 'draft') or
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
		if v_document_frozen and old.status not in ('sent', 'accepted', 'declined', 'expired', 'cancelled', 'superseded') then
			raise exception using errcode = '55000', message = 'Quote with an attached document is commercially immutable';
		end if;
		raise exception using errcode = '55000', message = 'Sent quote commercial data is immutable';
	end if;
	return new;
end;
$$;

commit;
