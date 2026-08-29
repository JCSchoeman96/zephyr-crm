# Zephyr CRM Domain Model

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.2.2 (v1.3.2 hardening amendment)

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

### Phone normalization

For `Lead`, `Client`, and `ClientContact`, `phone` preserves the original display text and `phone_normalized` is a separate comparison/index value. Normalization occurs at the trusted server/database boundary on insert and whenever `phone` changes; the server derives `phone_normalized`, so a caller-provided normalized value is not authoritative.

Only values that explicitly begin with `+` are normalized in v1. After trimming, spaces, parentheses, periods, and hyphens are removed; the remaining value must contain `+`, a non-zero first country-code digit, and 7–14 additional digits. A valid value is stored in `phone_normalized`; empty or invalid input produces `null` there. Ambiguous national-format input without an explicit `+` country code produces `null`, and the server never guesses an implicit country code or rewrites `phone`.

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

## P14 Client lifecycle and maintenance law

Client creation is conversion-only through `convert_lead`; there is no generic
Client create or merge path. Client status transitions are:

```text
active ↔ inactive
active/inactive ──Owner/Admin + reason + no active lineage work──→ archived
archived ──Owner/Admin + restore reason──→ inactive
```

`archived → active` is not a direct transition, Sales cannot archive, and an
archived Client is read-only. Archive guards inspect open Tasks and
non-terminal Quotes linked directly to the Client and through
`source_lead_id`. Client identity/billing maintenance uses optimistic
`lock_version`; protected source and lifecycle facts are trusted-action-only.

ClientContact has `active`/`inactive` status and optimistic `lock_version`.
Inactive contacts cannot be primary, at most one active contact is primary,
and normal UI/API paths never hard-delete contact history. Primary switches,
contact status changes, and edits append Activity through their trusted action.

## Task relationship authority

Task creation accepts either one direct Lead/Client parent or a Quote. For a
Quote-linked Task, PostgreSQL derives the Lead and converted Client context
from that Quote/Lead lineage and rejects mismatching caller hints. The browser
receives human labels and links through `task_work_queue`, not UUID fragments.

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

## v1.4.0 additive Sales-to-Fulfilment authority

The following definitions extend this document for the v1.4.0 roadmap. They
do not change the meaning of the existing P0-P14 resources or historical
fields unless this section explicitly names an additive extension.

The additive resource graph is:

```text
Profile
  └──< Lead
       ├──< Quote ──< QuoteItem
       │       └──< OutboundMessage
       ├──< Task
       ├──< Activity
       └──> Client ──< ClientContact
                    └──< FulfilmentCase
                         ├──< FulfilmentStep
                         ├──< PaymentMilestone
                         ├──< Task
                         └──< Activity
```

### Lead qualification evidence

`Lead` gains the additive fields `qualification_notes`,
`qualification_started_at`, and `qualified_at`. `qualification_started_at`
is set by the trusted Start Qualification action when a `NEW` Lead enters
`QUALIFICATION`. `qualified_at` is set by the trusted Ready for Quote action
when the Lead enters `PROPOSAL`.

Ready for Quote requires at least one usable contact method, meaning a
non-blank email or phone value, and meaningful enquiry information, meaning a
non-blank original `message` or `qualification_notes`. It does not require a
large questionnaire. These fields are evidence for the existing Lead
pipeline, not a second qualification status system.

### Quote decision handoff

The existing Quote remains the immutable commercial authority. In v1.4.0,
ordinary `WON` is reached through acceptance of the current valid sent Quote,
not through a separate normal UI conversion action. The trusted acceptance
action records acceptance evidence, invokes the existing idempotent conversion
policy, links the accepted Quote to the Client, creates one FulfilmentCase,
closes obsolete Sales Tasks, creates initial planning work, and appends the
required Activity records in one transaction.

An adjustment creates a new draft revision and returns the Lead to `PROPOSAL`;
the old sent Quote is never edited. A definitive decline marks the current
sent Quote `declined`, marks the Lead `LOST` with a valid LostReason, closes
obsolete Sales Tasks, and appends both Quote and Lead Activity in one trusted
operation. The existing `convert_lead` action remains available only for
authorised migration or recovery policy and is not the normal day-to-day
decision button. For v1.4 compatibility it retains the historical
Owner/Admin/Sales grant, records `lead_converted_compatibility` audit evidence,
and marks the conversion Activity as `legacy_compatibility_recovery`; the
ordinary browser path is `accept_quote`.

### FulfilmentCase

`FulfilmentCase` represents one accepted sale after the Sales handoff. It has:

```text
id
fulfilment_number
client_id
lead_id
accepted_quote_id
status
created_at
updated_at
completed_at
cancelled_at
cancel_reason
lock_version
```

`accepted_quote_id` is unique. It references the accepted Quote that created
the case and cannot be changed through ordinary CRUD. `client_id` and
`lead_id` are server-derived lineage. `status` is `open`, `completed`, or
`cancelled`. A case is created only by the trusted acceptance handoff; there
is no generic browser-created case.

### FulfilmentStep

`FulfilmentStep` records one independent operational work item for a case. It
has:

```text
id
fulfilment_case_id
type
status
scheduled_for
completed_at
tracking_reference
notes
created_at
updated_at
lock_version
```

`type` is `installation`, `courier`, or `pickup`. A case may contain more
than one type, including installation and courier together. There is at most
one active step of a given type for a case in v1.4.0; a retained cancelled
step is history, not an active work item. Step state combinations and trusted
transitions are defined in `docs/STATE_MACHINES.md`.

### PaymentMilestone

`PaymentMilestone` records operator-entered CRM evidence for one payment
milestone. It has:

```text
id
fulfilment_case_id
type
status
requested_at
received_at
received_recorded_by
note
created_at
updated_at
lock_version
```

`type` is `deposit` or `final_balance`. There is exactly one milestone of
each type per FulfilmentCase. v1.4.0 deliberately has no amount field. The
accepted Quote remains the commercial amount authority. `received_recorded_by`
and `received_at` prove who recorded the CRM fact and when; they do not prove
bank settlement or accounting reconciliation.

### Task and Activity lineage

`Task` gains nullable `fulfilment_case_id`. Its v1.4.0 types add
`plan_fulfilment`, `schedule_installation`, `complete_installation`,
`dispatch_order`, `confirm_delivery`, `prepare_pickup`,
`confirm_collection`, and `payment_follow_up`. Existing Task states remain
`open`, `completed`, and `cancelled`.

For a FulfilmentCase Task, the trusted database action derives the Client and
Lead lineage from the case. A caller-supplied Client or Lead hint that does
not match the case is rejected. A payment follow-up changes Task evidence
only; it never changes a PaymentMilestone status.

`Activity` gains nullable `fulfilment_case_id`. Case, step, payment, and
handoff actions append Activity in the same transaction as their state change.
Examples include `fulfilment_created`, `fulfilment_step_created`,
`fulfilment_step_scheduled`, `fulfilment_step_rescheduled`,
`fulfilment_step_dispatched`, `fulfilment_step_ready_for_collection`,
`fulfilment_step_completed`, `fulfilment_step_cancelled`,
`payment_milestone_requested`, `payment_milestone_received`,
`payment_milestone_marked_not_required`, `payment_follow_up_created`,
`fulfilment_completed`, `fulfilment_cancelled`, and
`payment_milestone_corrected`.

### v1.4.0 ownership and trusted actions

PostgreSQL remains authoritative for these additions:

| Resource/action | Durable authority | Ordinary mutation boundary |
|---|---|---|
| Lead qualification evidence | PostgreSQL | RLS-secured fields through the trusted qualification actions |
| Quote acceptance/adjust/decline | PostgreSQL transaction | Trusted Quote decision actions only |
| FulfilmentCase | PostgreSQL | Created by acceptance; lifecycle through trusted actions |
| FulfilmentStep | PostgreSQL | Trusted create/dispatch/ready/schedule/reschedule/complete/cancel actions |
| PaymentMilestone | PostgreSQL | Trusted request/receive/not-required actions; correction is privileged |
| Fulfilment Task | PostgreSQL | Trusted lineage-validating Task action plus existing Task lifecycle actions |
| Fulfilment Activity | PostgreSQL append-only | Transaction-bound trusted action evidence |

The v1.4.0 trusted action set is:

```text
start_lead_qualification
ready_lead_for_quote
accept_quote
revise_quote
decline_quote
create_fulfilment_step
dispatch_fulfilment_step
ready_fulfilment_step
schedule_fulfilment_step
reschedule_fulfilment_step
complete_fulfilment_step
cancel_fulfilment_step
request_payment_milestone
record_payment_received
mark_payment_not_required
correct_payment_milestone
complete_fulfilment
cancel_fulfilment
create_task
```

`accept_quote`, `revise_quote`, `decline_quote`, and `create_task` extend the
existing trusted actions rather than introducing a second mutation model.

### v1.4.0 domain invariants

The following invariants are additive:

11. A Lead in ordinary `WON` state has an accepted current Quote, a linked or newly created Client, and exactly one FulfilmentCase for that accepted Quote.
12. `accepted_quote_id` is unique across FulfilmentCases, and repeating acceptance returns the existing handoff result without duplicate Client, Contact, case, or planning Task rows.
13. A FulfilmentCase belongs to one Client and one accepted Quote/Lead lineage; a Client may have many cases over time.
14. FulfilmentCase status is independent of every step and payment milestone status.
15. A FulfilmentStep has one of the documented type/status combinations; rescheduling changes schedule evidence and does not invent a state.
16. A PaymentMilestone has one type per case, and `received` requires actor and timestamp evidence.
17. Follow-up remains Task-derived. No `follow_up` PaymentMilestone status exists.
18. A FulfilmentCase can complete only with at least one successful non-cancelled step, every required non-cancelled step in its successful terminal state, and every required payment milestone `received` or `not_required`.
19. Fulfilment Task Client/Lead lineage is derived from its case; mismatched browser-supplied parent IDs are rejected.
20. Privileged payment correction and case cancellation require authorised role, current lock version, a reason, and append-only Activity/security evidence.
21. Fulfilment state changes use optimistic locking, deterministic row-lock order, trusted transactions, unique constraints, and idempotency where retries can occur.

Fulfilment is still a CRM record of work and operator-entered evidence. It is
not accounting, inventory, project management, or a logistics-provider
integration.

## v1.5.0 additive Product Catalogue and Quote Document authority

This section extends the v1.4.0 resource model without changing existing Lead,
Client, Quote, Task, Activity, money, or Fulfilment meanings except where the
new QuoteItem source fields are explicitly named. The full contract is in
`docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`.

### ProductCategory

`ProductCategory` is a flat, isolated-stack grouping for Product search and
picker filters. It has `id`, `code`, `label`, `status`, `sort_order`,
`lock_version`, `created_at`, and `updated_at`. `status` is `active` or
`inactive`. Codes are trimmed and unique case-insensitively. An inactive
category cannot receive a new Product; historical Products retain their
category. Categories are not nested.

### Product

`Product` is a reusable product or service catalogue record, not an inventory
record. It has:

```text
id
product_code
name
customer_description
internal_notes
kind
category_id
unit_label
currency
unit_price
taxable
status
lock_version
created_by
created_at
updated_at
activated_at
inactivated_at
archived_at
```

`kind` is `product` or `service`. `unit_label` is bounded configurable text.
`currency` is an uppercase ISO three-letter code. `unit_price` is a
non-negative PostgreSQL numeric at the existing unit-price scale of 4.
`status` is `draft`, `active`, `inactive`, or `archived`; only `active` may be
selected into a new QuoteItem. Product codes use the named
`products_product_code_lower_uidx` case-insensitive uniqueness index. The
required query indexes are `products_status_name_idx`,
`products_category_status_name_idx`, and `products_kind_status_idx`.

Product changes are Owner/Admin trusted actions with optimistic locking and
material Activity evidence. `internal_notes` is staff-only and is never
copied to QuoteItem, Quote snapshots, preview, PDF, email, public config, or
logs. Product has no stock, supplier, cost, variant, bundle, price-book, or
exchange-rate responsibility.

### QuoteItem Product source and snapshot

`QuoteItem` retains its existing `name`, `description`, `quantity`,
`unit_price`, `taxable`, and database-authoritative `line_subtotal` fields. It
additionally has:

```text
source_type
product_id
product_code_snapshot
unit_label_snapshot
catalogue_unit_price
source_product_version
source_product_reviewed_version
source_product_reviewed_at
source_product_reviewed_by
```

Existing rows are valid `custom` lines. A catalogue line has
`source_type = catalogue`, nullable historical `product_id`, copied code and
unit, copied catalogue price, and the Product lock version used for its
snapshot. `unit_price` is the quoted customer-facing price and may differ from
`catalogue_unit_price` after an authorized draft negotiation. A custom line
has `source_type = custom`, null Product lineage/snapshot fields, and remains
available to all existing Quote workflows.

Only a trusted draft-only Product selection action may create catalogue
lineage. It requires an active Product, matching Quote currency, expected
Quote/Product locks, and an active Owner/Admin/Sales Profile. The server copies
the Product's customer-facing values and never trusts browser totals. Product
edits, price changes, category changes, and lifecycle transitions never
cascade to QuoteItems. Sent and terminal Quote commercial data remains
immutable.

If the current Product lock differs from the source version, the draft item is
stale. Refresh explicitly copies the current customer-facing snapshot and
records a new source version. Keep explicitly preserves all QuoteItem
commercial values and records the reviewed source version, actor, time, and
Activity evidence. Mark Ready rejects an unresolved stale source. No Product
change silently refreshes a Quote.

### v1.5.0 ownership and trusted actions

PostgreSQL remains durable authority. The additive trusted action set is:

```text
create_product_category
update_product_category
activate_product_category
inactivate_product_category
create_product
update_product
change_product_price
activate_product
inactivate_product
archive_product
restore_product
add_product_quote_item
refresh_product_quote_item
review_product_quote_item
```

The exact role, RLS, protected-field, and Activity boundary is defined in
`docs/SECURITY_MODEL.md`. No generic Product archive hard-delete exists.

### v1.5.0 domain invariants

The following invariants are additive:

22. Product codes are unique case-insensitively after trusted trimming.
23. Only an active Product can be selected into a new QuoteItem, and its currency must match the Quote currency.
24. Product mutations never cascade into QuoteItem snapshot or sent Quote commercial data.
25. Catalogue QuoteItems preserve source code, unit, catalogue price, and Product version separately from negotiated quoted `unit_price`.
26. Existing and newly created custom QuoteItems remain legal without Product lineage.
27. An unresolved Product source-version mismatch prevents Quote readiness; Refresh and Keep are explicit draft-only actions with evidence.
28. Product internal notes never enter customer-facing snapshots, presentation models, PDFs, emails, public configuration, or logs.
29. Quote preview and PDF use one server-built QuotePresentationModel and do not independently calculate authoritative totals.
30. One eligible Quote revision has one canonical private PDF artifact whose stored SHA-256 matches its bytes; historical artifacts are not regenerated in place.

Product Catalogue is not inventory ownership, accounting, payment processing,
an ERP, or a customer-facing portal.
