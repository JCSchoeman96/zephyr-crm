# Zephyr CRM Domain Model

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.2.1 (v1.3.1 reconciliation)

This document is the single definition of Zephyr CRM resources, relationships, invariants, ownership, and authoritative actions. Lifecycle state names and transitions are defined only in `docs/STATE_MACHINES.md`.

## Resource map

```text
Profile ──< Lead ──< Quote ──< QuoteItem
   │          │         │
   │          ├──< Task  └──< OutboundMessage ──< MessageEvent
   │          ├──< Activity
   │          └──> Client ──< ClientContact
   │
   └── owns configuration and staff actions

InboundSubmission ──> Lead
LeadSource and LostReason configure Lead choices
AppSetting configures the isolated client stack
```

## Identity & Access resources

### Profile

`Profile` represents one Supabase Auth staff identity. It has `id`, `full_name`, `email`, `role`, `status`, `timezone`, `created_at`, and `updated_at`. Its `id` references the Auth user. A profile in `suspended` status cannot use normal CRM operations.

Roles are exactly `owner`, `admin`, `sales`, and `viewer`. No public registration creates a Profile.

### AppSetting

`AppSetting` contains non-secret client configuration: company identity, brand tokens, locale/timezone/currency, quote defaults, sales thresholds, sender identity, and SendPulse template identifiers. Provider secrets and webhook secrets never reside in browser-readable configuration or ordinary settings rows.

## Lead Management resources

### Lead

`Lead` is an enquiry or sales opportunity before explicit commercial conversion. It has `id`, `lead_number`, optional `source_id`, optional `external_submission_id`, contact fields (`first_name`, `last_name`, `email`, `phone`, `phone_normalized`, `company`, `message`), attribution fields (`landing_page`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`), `pipeline_stage`, `attention_state`, optional pause facts (`paused_at`, `pause_reason`, `resume_at`), optional `assigned_to`, optional `lost_reason_id`, optional `lost_notes`, optional `converted_client_id`, `last_activity_at`, `lock_version`, `created_at`, and `updated_at`.

The unique external submission identifier prevents integration retries from creating duplicate Leads. Email is not an idempotency or deduplication key. Two distinct submission identifiers may create two legitimate Leads with the same email.

### LeadSource

`LeadSource` is configurable attribution data with `id`, `code`, `label`, `active`, and `sort_order`. Examples include `website`, `manual`, `telephone`, `email`, `referral`, `facebook`, `instagram`, `google_ads`, `walk_in`, and `other`.

### LostReason

`LostReason` is configurable loss classification with `id`, `code`, `label`, `active`, and `sort_order`. `other` requires explanatory notes. A Lead cannot enter `LOST` without a configured active reason.

## Client Management resources

### Client

`Client` is an individual or company that the business has deliberately recognized as a customer. A Lead is not a Client merely because an enquiry exists. `Client` has `id`, `client_number`, `type`, `display_name`, optional `company_name`, contact and billing fields, `status`, optional `source_lead_id`, `converted_at`, `created_at`, and `updated_at`.

Client `type` is `individual` or `company`; Client `status` is `active`, `inactive`, or `archived`.

### ClientContact

`ClientContact` belongs to one Client and has `id`, `client_id`, `first_name`, `last_name`, `email`, `phone`, `job_title`, `is_primary`, `created_at`, and `updated_at`. A company conversion creates the source Lead contact as the primary contact when contact data is available. The database enforces the documented single-primary rule per Client.

## Quoting resources

### Quote

`Quote` is a commercial proposal linked to a Lead and optionally a Client. It has `id`, `base_quote_number`, `revision_number`, `lead_id`, optional `client_id`, `status`, `currency`, `subject`, `introduction`, `terms`, `tax_label`, exact decimal `tax_rate`, exact decimal `subtotal`, `tax_amount`, and `total`, `valid_until`, lifecycle timestamps, optional `supersedes_quote_id`, optional private `document_path`, `document_hash`, `document_template_version`, `document_generator_version`, complete seller/recipient/commercial snapshots, `created_by`, `lock_version`, `created_at`, and `updated_at`.

Commercial settings are copied into the Quote snapshot when it becomes ready/finalized. Later setting changes cannot change a sent Quote.

### QuoteItem

`QuoteItem` belongs to one Quote and has `id`, `quote_id`, `position`, `name`, `description`, exact decimal `quantity`, exact decimal `unit_price`, `taxable`, exact decimal `line_subtotal`, `created_at`, and `updated_at`. The server/database calculates line and Quote totals; browser-provided totals are advisory at most and are never authoritative.

## Tasks & Follow-up resources

### Task

`Task` is a concrete next action and may reference a Lead, Client, and/or Quote. It has `id`, optional `lead_id`, optional `client_id`, optional `quote_id`, `type`, `title`, `description`, optional `assigned_to`, `status`, `due_at`, completion/cancellation timestamps, optional `notification_sent_at`, `created_by`, `created_at`, and `updated_at`.

Task `type` is one of `review_lead`, `call_client`, `prepare_quote`, `send_quote`, `follow_up`, `confirm_acceptance`, or `custom`. Overdue is derived from an open Task and its due time; it is not a persisted Task state.

## Communications resources

### OutboundMessage

`OutboundMessage` records one CRM communication attempt with `id`, optional Lead/Client/Quote links, `channel`, `purpose`, `provider`, recipient snapshot, subject, optional provider message ID, delivery status, attempt count, last error, lifecycle timestamps, `created_at`, and `updated_at`. Initial channel is `email` and provider is `sendpulse`.

### MessageEvent

`MessageEvent` records provider observations with `id`, `outbound_message_id`, optional provider event ID, `event_type`, `occurred_at`, metadata, deduplication hash, and `created_at`. Delivery observations are evidence, not permission to silently rewrite commercial state. Open/click events are signals and must not be presented as certainty that a person read a Quote.

## Activity & Audit resources

### Activity

`Activity` is append-only historical evidence linked to the relevant Lead, Client, Quote, Task, or OutboundMessage. It records actor/system identity, canonical event type, event timestamp, structured metadata, and a human-readable summary. Material operations append Activity within the same transaction as the state change. Ordinary users cannot update or delete Activity.

Canonical material events include `lead_created`, `pipeline_changed`, `quote_created`, `quote_sent`, `task_created`, `lead_won`, `lead_lost`, `client_created`, `quote_revised`, `message_status_changed`, and `task_completed`.

## Integration resources

### InboundSubmission

`InboundSubmission` is the idempotency and intake evidence record with `id`, `source`, `external_submission_id`, `form_id`, intake state, `payload_hash`, optional `lead_id`, optional `error_message`, `received_at`, and `processed_at`. Raw personal payload retention is minimized; arbitrary provider fields are never inserted directly into business tables.

## Ownership and authoritative source of truth

| Resource | Durable authority | Ownership boundary | Mutation boundary |
|---|---|---|---|
| Profile | PostgreSQL + Supabase Auth | isolated client stack | invitation/admin trusted action |
| AppSetting | PostgreSQL | Owner/Admin | RLS settings action |
| LeadSource/LostReason | PostgreSQL | Owner/Admin | RLS configuration action |
| Lead | PostgreSQL | assigned staff within isolated stack | RLS CRUD plus trusted lifecycle actions |
| Client/ClientContact | PostgreSQL | staff within isolated stack | RLS CRUD plus trusted conversion |
| Quote/QuoteItem | PostgreSQL | staff within isolated stack | RLS CRUD plus trusted finalize/revise/send |
| Task | PostgreSQL | assigned/authorized staff | RLS CRUD plus trusted automation |
| Activity | PostgreSQL append-only | system and staff evidence | transaction-bound append only |
| OutboundMessage/MessageEvent | PostgreSQL plus provider observations | CRM integration boundary | trusted adapter/webhook actions |
| InboundSubmission | PostgreSQL | integration boundary | authenticated intake function only |
| Quote document | private Supabase Storage + metadata in PostgreSQL | isolated client stack | trusted document generation |

## Trusted domain actions

The following actions are atomic, authorization-checked, idempotent where retryable, and server/database authoritative:

- `convert_lead`: verify eligibility, find/create Client, create primary ClientContact when appropriate, link Lead, mark `WON`, close obsolete Tasks, append Activity, return Client.
- `mark_lead_lost`: require active LostReason and notes for `other`, mark `LOST`, close obsolete Tasks, append Activity.
- `reopen_lead`: Owner/Admin-only administrative action from `LOST` to `QUALIFICATION`, with reason and Activity.
- `finalise_quote`: validate commercial snapshot and line items, calculate exact totals, allocate number, generate private document, append Activity.
- `send_quote`: create/send one OutboundMessage through the SendPulse adapter, persist provider acknowledgement, update Quote/Lead/Task state exactly once.
- `revise_quote`: copy an immutable sent Quote into a new Draft revision with lineage and Activity.
- `accept_quote`: record customer acceptance and optionally invoke authorized conversion policy.
- `process_reminders` and `process_quote_expiry`: claim due work safely and are idempotent across overlapping runs.

## Domain invariants

1. A Lead remains distinct from a Client until explicit conversion.
2. Pipeline stage is not attention state and neither is a Task lifecycle; pause facts are orthogonal and follow-up is Task-derived.
3. Sent Quote commercial data cannot be edited in place; revisions are new records with lineage.
4. Quote totals use exact decimal arithmetic, explicit scales, half-up line/tax rounding, and server authority.
5. Retry identifiers are unique at the database boundary.
6. A stale `lock_version` rejects a write.
7. A Lost Lead has a valid LostReason; `other` has notes.
8. Client conversion is atomic and repeatable without duplicate Client/Contact rows.
9. Activity is append-only and records material actions.
10. UTC is used for storage; configured IANA timezone is used for presentation and scheduling.
