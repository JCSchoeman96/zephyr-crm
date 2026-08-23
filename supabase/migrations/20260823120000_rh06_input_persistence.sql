begin;

-- RH06 keeps ordinary CRM CRUD available while ensuring that untrusted text
-- cannot grow without bound once it becomes durable application/provider
-- state. These limits are intentionally generous and align with the existing
-- Bricks boundary, email limits, and trusted action error/note limits.

alter table public.profiles
	drop constraint if exists profiles_input_bounds,
	add constraint profiles_input_bounds check (
		char_length(full_name) <= 120
		and char_length(email) <= 320
		and char_length(timezone) <= 64
	);

alter table public.app_settings
	drop constraint if exists app_settings_input_bounds,
	add constraint app_settings_input_bounds check (
		char_length(setting_key) <= 120
		and (description is null or char_length(description) <= 2000)
		and pg_column_size(setting_value) <= 65536
	);

alter table public.leads
	drop constraint if exists leads_input_bounds,
	add constraint leads_input_bounds check (
		char_length(first_name) <= 120
		and char_length(last_name) <= 120
		and (external_submission_id is null or char_length(external_submission_id) <= 128)
		and (email is null or char_length(email) <= 320)
		and (phone is null or char_length(phone) <= 80)
		and (phone_normalized is null or char_length(phone_normalized) <= 16)
		and (company is null or char_length(company) <= 240)
		and (message is null or char_length(message) <= 10000)
		and (landing_page is null or char_length(landing_page) <= 2000)
		and (referrer is null or char_length(referrer) <= 2000)
		and (utm_source is null or char_length(utm_source) <= 160)
		and (utm_medium is null or char_length(utm_medium) <= 160)
		and (utm_campaign is null or char_length(utm_campaign) <= 160)
		and (utm_content is null or char_length(utm_content) <= 160)
		and (utm_term is null or char_length(utm_term) <= 160)
		and (lost_notes is null or char_length(lost_notes) <= 2000)
		and (attention_reason is null or char_length(attention_reason) <= 2000)
		and (pause_reason is null or char_length(pause_reason) <= 2000)
	);

alter table public.clients
	drop constraint if exists clients_input_bounds,
	add constraint clients_input_bounds check (
		char_length(display_name) <= 240
		and (company_name is null or char_length(company_name) <= 240)
		and (email is null or char_length(email) <= 320)
		and (phone is null or char_length(phone) <= 80)
		and (phone_normalized is null or char_length(phone_normalized) <= 16)
		and (billing_address is null or char_length(billing_address) <= 500)
		and (tax_number is null or char_length(tax_number) <= 120)
		and (registration_number is null or char_length(registration_number) <= 120)
		and (billing_address_line_1 is null or char_length(billing_address_line_1) <= 500)
		and (billing_address_line_2 is null or char_length(billing_address_line_2) <= 500)
		and (billing_city is null or char_length(billing_city) <= 120)
		and (billing_region is null or char_length(billing_region) <= 120)
		and (billing_postal_code is null or char_length(billing_postal_code) <= 40)
		and (billing_country is null or char_length(billing_country) <= 120)
	);

alter table public.client_contacts
	drop constraint if exists client_contacts_input_bounds,
	add constraint client_contacts_input_bounds check (
		char_length(first_name) <= 120
		and char_length(last_name) <= 120
		and (email is null or char_length(email) <= 320)
		and (phone is null or char_length(phone) <= 80)
		and (phone_normalized is null or char_length(phone_normalized) <= 16)
		and (job_title is null or char_length(job_title) <= 160)
	);

alter table public.tasks
	drop constraint if exists tasks_input_bounds,
	add constraint tasks_input_bounds check (
		char_length(title) <= 240
		and (description is null or char_length(description) <= 10000)
		and (automation_key is null or char_length(automation_key) <= 255)
		and (reminder_last_error is null or char_length(reminder_last_error) <= 1000)
	);

alter table public.quotes
	drop constraint if exists quotes_input_bounds,
	add constraint quotes_input_bounds check (
		char_length(subject) <= 240
		and (introduction is null or char_length(introduction) <= 10000)
		and (terms is null or char_length(terms) <= 10000)
		and (tax_label is null or char_length(tax_label) <= 120)
		and (acceptance_source is null or char_length(acceptance_source) <= 120)
		and (acceptance_evidence is null or char_length(acceptance_evidence) <= 2000)
		and (document_path is null or char_length(document_path) <= 500)
		and (document_hash is null or char_length(document_hash) <= 128)
		and (document_template_version is null or char_length(document_template_version) <= 120)
		and (document_generator_version is null or char_length(document_generator_version) <= 120)
	);

alter table public.quote_items
	drop constraint if exists quote_items_input_bounds,
	add constraint quote_items_input_bounds check (
		char_length(name) <= 240
		and (description is null or char_length(description) <= 10000)
	);

alter table public.outbound_messages
	drop constraint if exists outbound_messages_input_bounds,
	add constraint outbound_messages_input_bounds check (
		char_length(purpose) <= 120
		and (subject is null or char_length(subject) <= 240)
		and (provider_message_id is null or char_length(provider_message_id) <= 255)
		and char_length(logical_key) <= 255
		and (last_error is null or char_length(last_error) <= 1000)
		and pg_column_size(recipient_snapshot) <= 65536
	);

alter table public.message_events
	drop constraint if exists message_events_input_bounds,
	add constraint message_events_input_bounds check (
		(provider_event_id is null or char_length(provider_event_id) <= 255)
		and char_length(event_type) <= 64
		and char_length(deduplication_hash) <= 128
		and pg_column_size(metadata) <= 65536
	);

alter table public.inbound_submissions
	drop constraint if exists inbound_submissions_input_bounds,
	add constraint inbound_submissions_input_bounds check (
		char_length(source) <= 64
		and char_length(external_submission_id) <= 128
		and (form_id is null or char_length(form_id) <= 120)
		and char_length(payload_hash) <= 128
		and (error_message is null or char_length(error_message) <= 1000)
	);

alter table public.activities
	drop constraint if exists activities_input_bounds,
	add constraint activities_input_bounds check (
		char_length(event_type) <= 64
		and char_length(summary) <= 2000
		and pg_column_size(metadata) <= 65536
	);

alter table public.outbound_message_attempts
	drop constraint if exists outbound_message_attempts_input_bounds,
	add constraint outbound_message_attempts_input_bounds check (
		char_length(idempotency_key) <= 255
		and (provider_message_id is null or char_length(provider_message_id) <= 255)
		and (error_message is null or char_length(error_message) <= 1000)
	);

alter table public.operational_events
	drop constraint if exists operational_events_input_bounds,
	add constraint operational_events_input_bounds check (
		char_length(source) <= 64
		and char_length(event_type) <= 120
		and char_length(message) <= 2000
		and pg_column_size(metadata) <= 65536
	);

alter table public.automation_runs
	drop constraint if exists automation_runs_input_bounds,
	add constraint automation_runs_input_bounds check (
		error_message is null or char_length(error_message) <= 1000
	);

alter table public.security_audit_events
	drop constraint if exists security_audit_events_input_bounds,
	add constraint security_audit_events_input_bounds check (
		char_length(action) <= 120
		and char_length(target_type) <= 64
		and (target_id is null or char_length(target_id) <= 255)
		and pg_column_size(metadata) <= 65536
	);

commit;
