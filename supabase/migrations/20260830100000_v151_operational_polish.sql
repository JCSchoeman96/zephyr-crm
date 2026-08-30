begin;

update public.app_settings
set setting_value = setting_value || jsonb_build_object('logo_path', ''),
	updated_at = now()
where setting_key = 'company_identity'
	and setting_value ->> 'logo_path' = '/favicon.svg';

commit;
