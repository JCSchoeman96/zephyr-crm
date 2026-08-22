insert into public.lead_sources (code, label, sort_order)
values
	('bricks', 'Bricks website form', 5),
	('website', 'Website', 10),
	('manual', 'Manual', 20),
	('telephone', 'Telephone', 30),
	('email', 'Email', 40),
	('referral', 'Referral', 50),
	('facebook', 'Facebook', 60),
	('instagram', 'Instagram', 70),
	('google_ads', 'Google Ads', 80),
	('walk_in', 'Walk-in', 90),
	('other', 'Other', 100)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;

insert into public.lost_reasons (code, label, sort_order)
values
	('price', 'Price', 10),
	('timing', 'Timing', 20),
	('competitor', 'Competitor', 30),
	('no_budget', 'No budget', 40),
	('not_a_fit', 'Not a fit', 50),
	('other', 'Other', 100)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;

insert into public.app_settings (setting_key, setting_value, description)
values
	('company_identity', '{"name":"Zephyr CRM","logo_path":"/favicon.svg","brand_tokens":{"primary":"#315cce","primary_strong":"#2649a8","accent":"#d9773b"}}'::jsonb, 'Non-secret company identity and client brand tokens'),
	('locale', '{"language":"en-ZA","timezone":"Africa/Johannesburg","currency":"ZAR","date_format":"dd/MM/yyyy"}'::jsonb, 'Presentation and scheduling defaults'),
	('quote_defaults', '{"prefix":"Q-","tax_label":"VAT","validity_days":30,"tax_rate":0,"terms":"","bank_details":""}'::jsonb, 'Non-secret commercial defaults for new quotes'),
	('sales_rules', '{"follow_up_days":3,"stale_lead_days":14,"default_owner_email":""}'::jsonb, 'Lead follow-up and stale-opportunity rules'),
	('email_defaults', '{"sender_email":"","sender_name":"Zephyr CRM","reply_to":"","template_ids":{}}'::jsonb, 'Non-secret sender identity and message template identifiers'),
	('integration_identifiers', '{"bricks_form_id":"contact-form","sendpulse_api_base_url":"https://api.sendpulse.com","sendpulse_sender_domain":"","sendpulse_template_ids":{}}'::jsonb, 'Non-secret external integration identifiers'),
	('owner_user', '{"profile_id":null,"provisioning":"invitation-only"}'::jsonb, 'Owner is assigned through trusted invitation provisioning')
on conflict (setting_key) do update set setting_value = excluded.setting_value, description = excluded.description;
