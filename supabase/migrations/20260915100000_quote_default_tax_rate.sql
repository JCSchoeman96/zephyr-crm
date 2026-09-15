begin;

-- Move only the legacy exact-zero quote default to the shared 15% default.
-- Existing Quote rows and explicitly configured non-zero defaults are unchanged.
update public.app_settings
set setting_value = jsonb_set(setting_value, '{tax_rate}', '15'::jsonb, true),
	updated_at = now()
where setting_key = 'quote_defaults'
	and jsonb_typeof(setting_value -> 'tax_rate') = 'number'
	and (setting_value ->> 'tax_rate')::numeric = 0;

commit;
