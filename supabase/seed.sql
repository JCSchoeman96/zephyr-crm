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
	('company_identity', '{"name":"Zephyr CRM"}'::jsonb, 'Non-secret company identity'),
	('locale', '{"language":"en-ZA","timezone":"Africa/Johannesburg","currency":"ZAR"}'::jsonb, 'Presentation and scheduling defaults'),
	('quote_defaults', '{"validity_days":30,"tax_rate":0}'::jsonb, 'Initial quote defaults'),
	('owner_user', '{"profile_id":null,"provisioning":"invitation-only"}'::jsonb, 'Owner is assigned through trusted invitation provisioning')
on conflict (setting_key) do update set setting_value = excluded.setting_value, description = excluded.description;
