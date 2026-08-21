# Small Business CRM
## Complete Architecture, Domain & Implementation Blueprint

**Version:** 1.0.0  
**Status:** Proposed implementation baseline  
**Architecture:** SvelteKit + Cloudflare Pages + Supabase + PostgreSQL + SendPulse + WordPress/Bricks  
**Deployment model:** Isolated single-client deployment  
**Primary use case:** Lead → Quote → Follow-up → Conversion / Decline  
**Target users:** Small businesses and sales teams  
**Primary objective:** A reusable, low-cost CRM that can be deployed repeatedly for different clients without turning into a bloated general-purpose CRM.

---

# 1. Executive Decision

Build the system as a **single-tenant CRM template**.

Each client receives an independent deployment consisting of:

- one Cloudflare Pages application;
- one Supabase project;
- one PostgreSQL database;
- one Supabase Auth user base;
- one SendPulse account/integration;
- one Bricks webhook integration;
- one client-specific domain/subdomain;
- client-specific branding and settings.

The recommended runtime architecture is:

```text
                        ┌────────────────────────┐
                        │   WordPress Website    │
                        │      Bricks Form       │
                        └───────────┬────────────┘
                                    │
                                    │ HTTPS webhook
                                    ▼
                    ┌───────────────────────────────┐
                    │ Supabase Edge Function       │
                    │ ingest-bricks-lead           │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                          ┌────────────────┐
                          │   PostgreSQL   │
                          │    Supabase    │
                          └───────┬────────┘
                                  │
                      RLS-secured Data API
                                  │
                                  ▼
                  ┌────────────────────────────────┐
                  │ SvelteKit CRM                  │
                  │ Cloudflare Pages               │
                  │ crm.clientdomain.co.za         │
                  └────────────────────────────────┘
                                  │
                     privileged operations
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │ Supabase Edge Functions │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │    SendPulse    │
                         │ Transactional   │
                         │     Email       │
                         └─────────────────┘
```

The frontend should be **static-first**.

Normal authenticated CRUD can communicate directly with Supabase from the browser under strict Row Level Security.

Server-side functionality should only be introduced where secrets, trusted state transitions, scheduling or external systems require it.

Examples:

- Bricks webhook ingestion;
- sending email;
- SendPulse webhook processing;
- quote finalisation;
- conversion transactions;
- scheduled reminder processing;
- user invitations;
- privileged administrative operations.

This keeps Cloudflare almost entirely responsible for serving static files.

---

# 2. What We Are Actually Building

This should **not** begin as a generic CRM.

The product is specifically:

> A lightweight sales workflow system that receives enquiries, helps staff qualify them, creates and sends quotes, tracks follow-ups, records communication history, and closes leads as won or lost.

The fundamental business flow is:

```text
Website Form
     ↓
New Lead
     ↓
Qualification
     ↓
Quote Preparation
     ↓
Quote Sent
     ↓
Waiting / Follow-up
     ↓
Negotiation
     ↓
┌──────────────┬───────────────┐
│     WON      │      LOST     │
└──────┬───────┴───────┬───────┘
       │               │
       ▼               ▼
Create Client     Record Reason
```

That is the product.

Everything else must justify itself against this workflow.

---

# 3. Core Architectural Principle

Do **not** confuse:

1. where the lead is in the sales process;
2. who we are waiting for;
3. what action needs to happen next.

These are different concepts.

A poorly designed CRM often uses one enormous status enum:

```text
new
quote_sent
waiting_on_client
follow_up
declined
called
needs_quote
waiting_on_us
...
```

That becomes impossible to reason about.

Instead we model three dimensions.

## 3.1 Pipeline Stage

Where is the opportunity commercially?

```text
new
qualification
proposal
decision
won
lost
```

## 3.2 Attention State

Who or what are we waiting for?

```text
none
waiting_on_client
waiting_on_us
follow_up_scheduled
paused
```

## 3.3 Tasks

What must happen next?

Examples:

```text
Review enquiry
Phone client
Prepare quote
Send quote
Follow up
Confirm acceptance
Custom
```

A lead can therefore be:

```text
Pipeline:
decision

Attention:
waiting_on_client

Task:
Follow up on 26 August at 09:00
```

This is vastly cleaner than trying to encode everything into one status.

---

# 4. Ultimate Long-Term Goal

The eventual product can become a reusable small-business commercial operations platform:

```text
Lead Capture
    ↓
CRM
    ↓
Quotes
    ↓
Customers
    ↓
Sales / Orders
    ↓
Projects
    ↓
Invoices
    ↓
Payments
    ↓
Support / Retention
```

Potential future integrations include:

- WhatsApp;
- calendars;
- accounting;
- invoicing;
- online quote acceptance;
- electronic signatures;
- payment/deposit requests;
- project management;
- customer portals;
- email automation;
- marketing attribution;
- AI-assisted summaries;
- AI-assisted quote drafting.

But **none of those belongs in the initial MVP unless required by an actual client**.

---

# 5. Backward Planning

Working backwards from that long-term outcome, the underlying systems we need are:

1. durable customer identity;
2. lead lifecycle;
3. sales activity history;
4. commercial documents;
5. communication infrastructure;
6. tasks/reminders;
7. permissions;
8. immutable historical records;
9. reporting;
10. integrations;
11. reusable client configuration.

The MVP therefore needs the smallest slice that establishes those foundations.

---

# 6. MVP Definition

The MVP is complete when this exact tracer bullet works:

```text
Bricks Form
     ↓
Authenticated Webhook
     ↓
Lead Created
     ↓
Appears on CRM Dashboard
     ↓
Staff Reviews Lead
     ↓
Lead Qualified
     ↓
Quote Created
     ↓
Quote Finalised
     ↓
Quote Sent through SendPulse
     ↓
Follow-up Task Created
     ↓
Waiting on Client
     ↓
Staff follows up
     ↓
Client agrees
     ↓
Lead marked Won
     ↓
Client record created
     ↓
Entire history visible in Activity Timeline
```

The alternative terminal route must also work:

```text
Lead
 ↓
Declined / Unsuccessful
 ↓
Lost reason required
 ↓
Open tasks closed
 ↓
History retained
```

---

# 7. Scope Boundaries

## Included in MVP

- authentication;
- users and roles;
- website lead intake;
- manual lead creation;
- lead list;
- lead detail;
- pipeline states;
- waiting states;
- tasks;
- reminders;
- notes;
- activity timeline;
- client conversion;
- clients;
- quotes;
- quote items;
- quote revisions;
- quote sending;
- SendPulse delivery status;
- lost reasons;
- dashboard;
- basic sales analytics;
- configuration;
- branding;
- security;
- backup/export strategy;
- deployment documentation.

## Explicitly excluded initially

- marketing email campaigns;
- mass mailing;
- inbound mailbox;
- WhatsApp;
- SMS;
- telephone integration;
- accounting;
- payments;
- invoices;
- subscriptions;
- project management;
- AI agents;
- workflow builder;
- arbitrary custom fields;
- public customer portal;
- electronic signatures;
- advanced document generation;
- multi-company SaaS tenancy.

These can be added later without corrupting the core domain.

---

# 8. Deployment Strategy

## Recommended: One Client = One Stack

```text
Client A
├── Cloudflare project
├── Supabase project
├── SendPulse account
└── CRM configuration

Client B
├── Cloudflare project
├── Supabase project
├── SendPulse account
└── CRM configuration
```

This provides infrastructure-level isolation.

Benefits:

- no accidental cross-client data access;
- simpler RLS;
- simpler backups;
- simpler offboarding;
- separate usage quotas;
- separate email reputation;
- separate DNS;
- separate ownership;
- clients can take ownership of their complete system;
- one compromised client cannot expose another client's database.

Do **not** initially build multi-tenancy purely to save infrastructure costs.

That would exchange a small infrastructure saving for significantly greater:

- authorization complexity;
- support risk;
- migration risk;
- billing complexity;
- privacy risk;
- blast radius.

---

# 9. Cost Architecture

Current free-tier economics make small deployments attractive.

## Cloudflare

Cloudflare Pages currently offers on its Free plan:

- $0 hosting;
- unlimited static requests;
- unlimited bandwidth;
- 500 builds/month;
- custom domains.



Because the CRM frontend can operate primarily as a static application, normal frontend navigation should create almost no compute cost.

If Pages Functions or Workers are later needed, the current Workers Free tier provides 100,000 requests/day.

## Supabase

Current Free allocation includes:

- $0/month;
- 500 MB database;
- 1 GB file storage;
- 5 GB egress;
- 50,000 monthly active users;
- 500,000 Edge Function invocations;
- 2 million Realtime messages;
- 200 peak Realtime connections.



For an internal CRM with perhaps 2–30 employees, those limits are large relative to expected usage.

### Important Free-plan limitations

Current limitations include:

- only two active projects across organizations where the account is owner/admin;
- projects may pause after a week of inactivity;
- automatic backups are not included on Free.



Those are real limitations.

A serious production client should eventually consider Supabase Pro even if their usage remains tiny.

## SendPulse

Current transactional email Free allocation includes:

- up to 12,000 messages/month;
- 50 messages/hour;
- API sending;
- SMTP relay;
- DKIM/SPF/DMARC support;
- two sending domains.



That is more than sufficient for many small quoting businesses.

## Other costs

Potential non-zero costs remain:

- domain registration;
- Bricks licence;
- premium Supabase when required;
- paid SendPulse volume;
- support/maintenance;
- backup infrastructure;
- optional monitoring;
- optional Cloudflare paid services.

### Business conclusion

The infrastructure can be approximately $0/month for a small client.

That does **not** mean the product should be sold for $0.

The commercial value is in:

- setup;
- customization;
- workflow design;
- integration;
- support;
- hosting management;
- backups;
- ongoing improvements.

---

# 10. Domain Map

The application should contain the following bounded domains.

```text
CRM
│
├── Identity & Access
│
├── Lead Management
│
├── Client Management
│
├── Quoting
│
├── Tasks & Follow-up
│
├── Communications
│
├── Activity & Audit
│
├── Integrations
│
├── Reporting & Analytics
│
└── Configuration
```

---

# 11. Domain 1 — Identity & Access

## Responsibility

Determine:

- who can sign in;
- what they can see;
- what they can modify.

## Resources

### Profile

Represents an authenticated staff member.

Fields:

- `id`
- `full_name`
- `email`
- `role`
- `status`
- `timezone`
- `created_at`
- `updated_at`

The ID should reference the corresponding Supabase Auth user.

## Roles

### Owner

Can:

- access everything;
- configure integrations;
- manage users;
- change settings;
- reopen terminal records;
- perform administrative corrections.

### Admin

Can:

- manage leads;
- manage clients;
- manage quotes;
- manage tasks;
- view reports;
- manage most settings;
- manage users if explicitly enabled.

### Sales

Can:

- view leads;
- update leads;
- create quotes;
- send quotes;
- manage tasks;
- convert leads;
- mark leads lost.

### Viewer

Read-only.

Useful for:

- management;
- accountants;
- assistants;
- reporting users.

## User States

```text
invited
active
suspended
```

No public registration.

---

# 12. Domain 2 — Lead Management

This is the heart of the CRM.

## Lead Resource

Recommended fields:

- `id`
- `lead_number`
- `source_id`
- `external_submission_id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `company`
- `message`
- `pipeline_stage`
- `attention_state`
- `assigned_to`
- `lost_reason_id`
- `lost_notes`
- `converted_client_id`
- `last_activity_at`
- `lock_version`
- `created_at`
- `updated_at`

### Attribution fields

Also capture where possible:

- `landing_page`
- `referrer`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

This gives us future marketing attribution without Google Analytics being required.

## Lead Source

Configurable examples:

```text
website
manual
telephone
email
referral
facebook
instagram
google_ads
walk_in
other
```

Use a table rather than a hardcoded enum if clients need configurable sources.

---

# 13. Lead Pipeline State Machine

Recommended stages:

```text
NEW
 ↓
QUALIFICATION
 ↓
PROPOSAL
 ↓
DECISION
 ↓
WON
```

At relevant stages:

```text
→ LOST
```

## `new`

Lead has entered the CRM but has not been reviewed.

## `qualification`

Staff are establishing:

- what the customer wants;
- whether the enquiry is legitimate;
- whether the business can service them;
- whether sufficient information exists to prepare a quote.

## `proposal`

The opportunity is qualified and commercial preparation has begun.

Usually:

- quote preparation;
- scope clarification;
- internal costing.

## `decision`

A commercial proposal has been presented.

Usually:

- quote sent;
- customer considering;
- negotiation;
- revisions;
- final decision pending.

## `won`

The opportunity converted.

A client is created if necessary.

## `lost`

The opportunity did not convert.

A reason is mandatory.

---

# 14. Allowed Lead Transitions

| Current | Allowed Next |
|---|---|
| New | Qualification, Lost |
| Qualification | Proposal, Lost |
| Proposal | Decision, Lost |
| Decision | Proposal, Won, Lost |
| Won | Terminal |
| Lost | Terminal |

Administrative `reopen` may move:

```text
Lost → Qualification
```

A Won lead should generally remain Won.

Administrative correction can exist, but it must generate an audit/activity event.

---

# 15. Attention State

Pipeline position does not tell us who owes the next action.

Use:

```text
none
waiting_on_client
waiting_on_us
follow_up_scheduled
paused
```

## none

No special waiting state.

## waiting_on_client

Examples:

- client must send measurements;
- client is reviewing quote;
- client must confirm dates;
- client promised feedback.

## waiting_on_us

Examples:

- staff must prepare quote;
- supplier pricing is required;
- manager approval is required;
- design work is outstanding.

## follow_up_scheduled

A future follow-up task exists.

## paused

Opportunity intentionally paused.

This should require:

- reason;
- optional resume date.

---

# 16. Derived Attention

Do not store:

```text
overdue
```

as a permanent state.

It is derived from Tasks.

For example:

```text
open task
AND
due_at < current time
=
overdue
```

Likewise:

```text
open follow-up task
AND
due_at <= current time
=
needs follow-up
```

That eliminates status drift.

---

# 17. Lost Reasons

Recommended defaults:

```text
price
budget
timing
competitor
no_response
not_a_fit
duplicate
project_cancelled
service_unavailable
outside_service_area
invalid_enquiry
other
```

Lost reason should be a configurable resource.

Fields:

- `id`
- `code`
- `label`
- `active`
- `sort_order`

`other` requires notes.

---

# 18. Domain 3 — Clients

A significant modeling decision:

**Do not automatically create a Client for every website submission.**

A website enquiry is a Lead.

Otherwise:

- spam becomes clients;
- duplicated enquiries become clients;
- irrelevant enquiries become clients;
- reporting becomes polluted.

The recommended lifecycle is:

```text
Form
 ↓
Lead
 ↓
Qualified Opportunity
 ↓
Won
 ↓
Client
```

---

# 19. Client Resource

Fields:

- `id`
- `client_number`
- `type`
- `display_name`
- `company_name`
- `email`
- `phone`
- `tax_number`
- `registration_number`
- `billing_address_line_1`
- `billing_address_line_2`
- `billing_city`
- `billing_region`
- `billing_postal_code`
- `billing_country`
- `status`
- `source_lead_id`
- `converted_at`
- `created_at`
- `updated_at`

Client types:

```text
individual
company
```

Client states:

```text
active
inactive
archived
```

---

# 20. Client Contacts

For businesses with multiple contacts, use:

### ClientContact

Fields:

- `id`
- `client_id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `job_title`
- `is_primary`
- `created_at`
- `updated_at`

The original lead contact becomes the primary ClientContact during conversion when appropriate.

---

# 21. Conversion Action

Conversion must be one transactional domain operation.

The operation should:

1. verify the lead is eligible;
2. find or create the client;
3. create the primary contact if applicable;
4. link the lead to the client;
5. mark lead Won;
6. optionally mark selected quote Accepted;
7. close irrelevant open sales tasks;
8. record `lead_won`;
9. record `client_created`;
10. return the resulting client.

Running the conversion twice must **not create duplicate clients**.

---

# 22. Domain 4 — Quoting

Quoting is the most commercially sensitive part of the system.

Quotes need:

- reliable totals;
- stable numbering;
- history;
- revisions;
- immutable sent versions.

---

# 23. Quote Resource

Recommended fields:

- `id`
- `base_quote_number`
- `revision_number`
- `lead_id`
- `client_id`
- `status`
- `currency`
- `subject`
- `introduction`
- `terms`
- `tax_label`
- `tax_rate`
- `subtotal`
- `tax_amount`
- `total`
- `valid_until`
- `sent_at`
- `accepted_at`
- `declined_at`
- `cancelled_at`
- `supersedes_quote_id`
- `document_path`
- `document_hash`
- `created_by`
- `lock_version`
- `created_at`
- `updated_at`

Amounts use proper decimal/numeric database types.

Never use floating-point arithmetic for money.

---

# 24. Quote Item

Fields:

- `id`
- `quote_id`
- `position`
- `name`
- `description`
- `quantity`
- `unit_price`
- `taxable`
- `line_subtotal`
- `created_at`
- `updated_at`

The server/database must be authoritative for totals.

Do not trust a total calculated only in the browser.

---

# 25. Quote States

Recommended state machine:

```text
draft
 ↓
ready
 ↓
sent
 ├── accepted
 ├── declined
 ├── expired
 ├── cancelled
 └── superseded
```

## Draft

Editable.

## Ready

Commercially complete and ready to send.

Can return to Draft.

## Sent

Immutable commercial snapshot.

It must not be silently edited.

## Accepted

Customer has agreed.

Can trigger conversion.

## Declined

Customer rejected this particular proposal.

The overall Lead may or may not immediately become Lost.

## Expired

Validity period ended.

## Cancelled

Business intentionally withdrew the quote.

## Superseded

A newer revision replaced it.

---

# 26. Quote Immutability

This is a major rule.

Once a quote has been sent:

> It must not be edited in place.

If changes are required:

```text
Q-2026-0042
       ↓
Create Revision
       ↓
Q-2026-0042-R1
```

The old quote remains preserved.

This provides:

- auditability;
- customer dispute protection;
- historical accuracy;
- correct sales analytics.

---

# 27. Quote Revision Action

`revise_quote` should:

1. verify original quote is Sent;
2. create new Draft quote;
3. copy current commercial content;
4. copy line items;
5. increment revision;
6. reference previous quote;
7. record activity;
8. leave old quote unchanged.

Once the new revision is sent:

```text
old quote → superseded
new quote → sent
```

---

# 28. Quote Numbering

Recommended pattern:

```text
Q-2026-000001
Q-2026-000002
Q-2026-000003
```

Revisions:

```text
Q-2026-000003-R1
Q-2026-000003-R2
```

Number allocation must happen server-side/database-side.

Never determine:

```text
MAX(number) + 1
```

in browser code.

That creates race conditions.

---

# 29. Quote Configuration

Business configuration should control:

- quote prefix;
- currency;
- tax label;
- default tax rate;
- default validity;
- company details;
- company registration;
- tax registration;
- banking/payment text;
- quote footer;
- terms;
- sender;
- logo.

Settings are copied into the quote snapshot when finalised.

Historic quotes should not change merely because company settings later change.

---

# 30. Quote Document

The final sent quote should produce a frozen document.

Recommended MVP:

```text
Quote
 ↓
Finalise
 ↓
Generate PDF
 ↓
Private Supabase Storage
 ↓
Send through SendPulse
```

The database stores:

- storage path;
- generated timestamp;
- cryptographic document hash.

Use a Deno-compatible/pure-JavaScript PDF approach for Supabase Edge Functions unless another runtime is explicitly introduced.

Avoid designing the MVP around headless Chromium unless its runtime compatibility is first proven.

---

# 31. Domain 5 — Tasks & Follow-up

Tasks are the real operational engine of the CRM.

## Task Resource

Fields:

- `id`
- `lead_id`
- `client_id`
- `quote_id`
- `type`
- `title`
- `description`
- `assigned_to`
- `status`
- `due_at`
- `completed_at`
- `cancelled_at`
- `notification_sent_at`
- `created_by`
- `created_at`
- `updated_at`

Task types:

```text
review_lead
call_client
prepare_quote
send_quote
follow_up
confirm_acceptance
custom
```

---

# 32. Task States

Keep the state machine small:

```text
open
completed
cancelled
```

Snoozing is not a separate lifecycle state.

Snoozing updates:

- `due_at`;
- optional `snoozed_at`;
- activity history.

This prevents unnecessary state complexity.

---

# 33. Automatic Follow-up

When Quote becomes Sent:

1. mark Lead as Decision;
2. mark Attention as Waiting on Client;
3. create follow-up task;
4. calculate due date using client configuration;
5. record activity.

Example:

```text
Quote sent Friday
 ↓
Default follow-up = 3 days
 ↓
Task due Monday/Tuesday depending configured rules
```

Business-day calculation can be Phase 2.

MVP may use calendar days.

---

# 34. Reminders

Supabase hosted projects support `pg_cron`, and Supabase documents combining `pg_cron` and `pg_net` to periodically invoke Edge Functions.

Recommended architecture:

```text
Postgres Cron
      ↓
process-reminders Edge Function
      ↓
Find due tasks
      ↓
Mark dashboard attention
      ↓
Optionally send internal email
```

The system should never rely on someone opening the dashboard for reminders to become active.

---

# 35. Reminder Rules

Initial configurable rules:

### Quote follow-up

Default:

```text
3 days after quote sent
```

### New lead

Warn when:

```text
new lead untouched for X hours
```

### Stale opportunity

Warn when:

```text
no activity for X days
```

### Quote expiry

Warn:

```text
1 day before validity expires
```

All should eventually be client-configurable.

---

# 36. Domain 6 — Communications

Do not treat email as merely:

```text
sendEmail()
```

Communication should be first-class business data.

---

# 37. Outbound Message Resource

Fields:

- `id`
- `lead_id`
- `client_id`
- `quote_id`
- `channel`
- `purpose`
- `provider`
- `recipient_email`
- `recipient_name`
- `subject`
- `provider_message_id`
- `status`
- `attempt_count`
- `last_error`
- `submitted_at`
- `delivered_at`
- `failed_at`
- `created_at`
- `updated_at`

Channels initially:

```text
email
```

Possible later:

```text
sms
whatsapp
```

---

# 38. Email Delivery State

Recommended primary state:

```text
pending
 ↓
sending
 ↓
submitted
 ├── delivered
 ├── bounced
 └── failed
```

Do not make:

```text
opened
clicked
```

delivery states.

They are engagement events.

---

# 39. Message Events

Resource:

### MessageEvent

Fields:

- `id`
- `outbound_message_id`
- `provider_event_id`
- `event_type`
- `occurred_at`
- `metadata`
- `deduplication_hash`
- `created_at`

Events:

```text
delivered
opened
clicked
soft_bounce
hard_bounce
spam
unsubscribed
```

SendPulse supports transactional webhooks for delivery and subscriber-activity events.

Important:

Email opens are useful signals, not absolute truth.

Modern email clients, privacy proxies and security scanners can distort open/click data.

Do not tell sales staff:

> "The customer definitely read your quote."

Instead:

> "SendPulse reported an open event."

---

# 40. SendPulse Architecture

Use the **SendPulse transactional API** for application email.

SMTP remains useful for:

- Supabase Auth custom SMTP;
- simple fallback sending.

API sending is preferable for CRM-generated messages because it provides cleaner application-level integration with:

- provider IDs;
- templates;
- errors;
- events.

SendPulse currently supports transactional sending through both API and SMTP.

---

# 41. SendPulse Templates

Initial templates:

```text
quote_sent
quote_revision
quote_reminder
internal_task_reminder
```

Template content may live in SendPulse.

The CRM stores only:

- template identifier;
- template purpose;
- active/inactive status if needed.

Do not duplicate the entire email builder inside the CRM.

That would recreate functionality SendPulse already provides.

---

# 42. SendPulse Domain Authentication

Every client deployment should configure:

- sender verification;
- SPF;
- DKIM;
- DMARC;
- optional branded tracking domain.

SendPulse specifically supports domain authentication for transactional mail.

Email sending is **not production-ready** until sender-domain authentication is verified.

---

# 43. Domain 7 — Activity Timeline

Activity should be first-class from Day 1.

This is what makes the CRM feel like a CRM.

## Activity Resource

Fields:

- `id`
- `lead_id`
- `client_id`
- `quote_id`
- `actor_id`
- `event_type`
- `summary`
- `metadata`
- `occurred_at`

Activity is append-only.

Do not permit normal users to edit historical events.

---

# 44. Activity Types

Examples:

```text
lead_created
lead_imported
lead_assigned
pipeline_changed
attention_changed
note_added

task_created
task_completed
task_rescheduled

quote_created
quote_ready
quote_sent
quote_revised
quote_accepted
quote_declined
quote_expired

email_submitted
email_delivered
email_opened
email_clicked
email_bounced

lead_won
lead_lost
lead_reopened

client_created
client_updated
```

---

# 45. Example Activity Timeline

```text
JOHN SMITH
────────────────────────────────────────

Status
Decision

Waiting
Client

Next task
Follow up — 25 August 09:00


ACTIVITY
────────────────────────────────────────

21 Aug 09:12
Website enquiry received

21 Aug 09:18
Lead reviewed by Sarah

21 Aug 09:20
Moved to Qualification

21 Aug 10:35
Moved to Proposal

21 Aug 11:41
Quote Q-2026-0042 created

21 Aug 12:08
Quote sent

21 Aug 12:09
Email submitted to SendPulse

21 Aug 12:10
Delivery confirmed

21 Aug 14:52
SendPulse open event received

25 Aug 09:00
Follow-up due
```

---

# 46. Notes

A note can be represented as an Activity:

```text
event_type = note_added
```

Metadata may contain structured supporting data.

Do not build a separate rich notes subsystem until needed.

This keeps the initial model small.

---

# 47. Domain 8 — Integrations

Integrations are boundary adapters, not business logic.

Initial integrations:

```text
Bricks
SendPulse
Supabase Auth
Supabase Storage
Supabase Cron
```

Future:

```text
WhatsApp
Xero
Sage
QuickBooks
Google Calendar
Microsoft 365
Stripe
PayFast
```

Business actions should not know SendPulse-specific implementation details.

Conceptually:

```text
Communication.send_quote()
```

not:

```text
CRM.call_sendpulse_api_everywhere()
```

Provider-specific logic stays within the integration boundary.

---

# 48. Bricks Webhook Intake

Bricks supports webhook form actions that can submit JSON or form data to external URLs and supports custom request headers.

Recommended flow:

```text
Bricks
 ↓
POST JSON
 ↓
ingest-bricks-lead
 ↓
Authentication
 ↓
Validation
 ↓
Idempotency
 ↓
Normalisation
 ↓
Create Lead
 ↓
Create Activity
 ↓
Return Success
```

---

# 49. Webhook Authentication

Use a strong shared secret.

Example conceptually:

```text
Authorization:
Bearer <CLIENT_SPECIFIC_SECRET>
```

The secret lives:

- in Bricks webhook configuration;
- in Supabase Edge Function secrets.

Never in:

- Svelte source;
- public environment variables;
- database rows visible through Data API.

---

# 50. Lead Intake Payload

Recommended data contract:

```text
submission_id
form_id
source

first_name
last_name
email
phone
company
message

landing_page
referrer

utm_source
utm_medium
utm_campaign
utm_content
utm_term
```

The precise contract must be documented and versioned.

---

# 51. Idempotency

Webhook retries must not create duplicate leads.

Best option:

Bricks form includes a unique submission UUID.

The intake function stores:

```text
external_submission_id
```

with a unique index.

If a genuine source identifier cannot be obtained, deliberately add one to the form.

Do not use:

```text
email
```

as the idempotency key.

A customer may legitimately contact the business multiple times.

---

# 52. Inbound Submission Resource

Maintain an integration record.

Fields:

- `id`
- `source`
- `external_submission_id`
- `form_id`
- `status`
- `payload_hash`
- `lead_id`
- `error_message`
- `received_at`
- `processed_at`

Optional raw payload retention should be short-lived because it can contain personal information.

---

# 53. Inbound Submission States

```text
received
 ↓
accepted
```

Alternative terminal states:

```text
duplicate
rejected
failed
```

---

# 54. Validation

Validate at the integration boundary.

Examples:

- valid email;
- sane lengths;
- valid phone where supplied;
- required first/last/name field;
- maximum message length;
- expected form ID;
- known source;
- payload size.

Never insert arbitrary WordPress payload fields directly into the database.

---

# 55. Domain 9 — Configuration

Use an AppSettings resource.

Recommended fields/settings:

## Identity

- company name;
- trading name;
- registration number;
- tax number.

## Brand

- logo;
- primary color;
- accent color;
- quote logo;
- document footer.

## Locale

- timezone;
- currency;
- date format;
- locale.

## Quotes

- quote prefix;
- tax label;
- tax rate;
- default validity days;
- default terms;
- banking/payment instructions.

## Sales

- default lead owner;
- default quote follow-up days;
- stale lead threshold.

## Email

- sender name;
- sender address;
- reply-to address;
- SendPulse template IDs.

Secrets must **not** be stored here.

---

# 56. Domain 10 — Reporting & Analytics

Analytics should initially use Postgres queries/views.

Do not introduce a separate analytics database for a small CRM.

Recommended KPIs:

## Leads

- new leads today;
- new leads this week;
- new leads this month;
- leads by source;
- leads by stage.

## Follow-up

- overdue tasks;
- tasks due today;
- stale leads;
- leads waiting on client;
- leads waiting on us.

## Quotes

- quotes created;
- quotes sent;
- quote value;
- accepted value;
- declined value;
- expired value;
- acceptance rate.

## Sales

- leads won;
- leads lost;
- conversion rate;
- average lead-to-win time;
- average quote-to-win time;
- pipeline value.

## Lost business

- lost reason distribution;
- lost value by reason;
- lost leads by source.

## Marketing attribution

- leads by UTM source;
- conversion by source;
- revenue by source;
- quote value by campaign.

---

# 57. Dashboard Design

The dashboard should answer:

> What requires my attention right now?

Before answering:

> How many charts can we show?

Recommended structure:

```text
┌─────────────────────────────────────────────────┐
│ Good morning, Sarah                             │
│ 7 items require attention                       │
└─────────────────────────────────────────────────┘

┌─────────┬─────────┬─────────┬─────────┐
│ New     │ Due     │ Quotes  │ Won     │
│   8     │   5     │   12    │ R84k    │
└─────────┴─────────┴─────────┴─────────┘

NEEDS ATTENTION
──────────────────────────────────────────────────
John Smith       Follow-up overdue
ABC Holdings     New lead — 4 hours old
Jane Botha       Quote expires tomorrow
XYZ              Waiting on us


PIPELINE
──────────────────────────────────────────────────

New       Qualification    Proposal    Decision
 8             6              4           11


RECENT ACTIVITY
──────────────────────────────────────────────────
14:10 Quote sent
13:55 Lead converted
13:43 Website lead received
```

---

# 58. Daily Workflow

A staff member should be able to work largely from one screen.

## Morning

Open:

```text
Dashboard → Needs Attention
```

Process:

1. overdue follow-ups;
2. new leads;
3. quotes awaiting preparation;
4. quotes nearing expiry;
5. leads waiting on us.

## During the day

As enquiries arrive:

```text
New lead
 ↓
Review
 ↓
Qualification
 ↓
Create next task
```

## After sending a quote

The system automatically creates the next follow-up.

## End of day

Dashboard should ideally have:

```text
No unassigned new leads
No overdue high-priority tasks
Every active opportunity has an owner
```

---

# 59. Weekly Workflow

Management reviews:

- new leads;
- conversion rate;
- quote acceptance;
- lost reasons;
- overdue follow-ups;
- source performance;
- pipeline value.

The goal is not merely record keeping.

The CRM should make it difficult for opportunities to disappear through neglect.

---

# 60. Frontend Information Architecture

Recommended routes:

```text
/login

/
  Dashboard

/leads
/leads/[id]

/clients
/clients/[id]

/quotes
/quotes/new
/quotes/[id]

/tasks

/reports

/settings
/settings/general
/settings/quotes
/settings/email
/settings/users
/settings/integrations
```

---

# 61. Application Navigation

Sidebar:

```text
Dashboard

Sales
├── Leads
├── Quotes
├── Clients
└── Tasks

Insights
└── Reports

Administration
└── Settings
```

Do not create 20 top-level menu items.

---

# 62. Lead List

Recommended columns:

```text
Lead
Company
Stage
Waiting
Owner
Next Task
Age
Value
```

Filters:

- stage;
- owner;
- source;
- waiting state;
- overdue;
- date range;
- lost reason.

Search:

- name;
- email;
- phone;
- company;
- lead number.

---

# 63. Lead Detail Screen

Recommended layout:

```text
┌────────────────────────────────────────────┐
│ John Smith                [Decision]        │
│ ABC Holdings                              │
│ john@example.com                          │
│ +27 ...                                   │
└────────────────────────────────────────────┘

[Overview] [Quotes] [Tasks] [Activity]

─────────────────────────────────────────────

Pipeline
Decision

Waiting
Client

Next Action
Follow up 25 Aug 09:00

─────────────────────────────────────────────

Quote
Q-2026-0042
R17,250
Sent

─────────────────────────────────────────────

Activity Timeline
...
```

---

# 64. Quote Editor

Recommended user flow:

```text
Create Quote
 ↓
Client/Lead details
 ↓
Add Items
 ↓
Terms
 ↓
Preview
 ↓
Mark Ready
 ↓
Send
```

Example:

```text
DESCRIPTION                   QTY      PRICE

Website Development            1      R15,000
Hosting                       12         R300
SEO Setup                      1       R5,000

─────────────────────────────────────────────
Subtotal                              R23,600
Tax                                    R3,540
TOTAL                                 R27,140
```

Controls:

```text
Save Draft
Preview
Mark Ready
Send Quote
```

---

# 65. Design System

Do not scatter project-specific CSS throughout components.

Use semantic design tokens.

## Primitive tokens

- spacing;
- radii;
- typography;
- shadows.

## Semantic colors

```text
--color-background
--color-surface
--color-border

--color-text
--color-text-muted

--color-primary
--color-accent

--color-success
--color-warning
--color-danger
--color-info
```

## Status tokens

Pipeline states must use semantic tokens rather than hardcoded colors.

Example:

```text
new
qualification
proposal
decision
won
lost
```

The design system should allow an entire client brand to be changed by editing a small number of variables.

---

# 66. Core UI Components

Recommended reusable components:

```text
AppShell
Sidebar
Topbar

PageHeader
SectionHeader

Button
IconButton
Input
Select
Textarea
Checkbox
DatePicker

Card
StatCard
DataTable
FilterBar

Badge
PipelineBadge
AttentionBadge

Modal
Dialog
Drawer

EmptyState
LoadingState
ErrorState

Timeline
TimelineItem

TaskRow
LeadRow

QuoteEditor
QuoteItemRow
MoneyInput
QuoteTotals
```

Avoid building a massive proprietary component library before the application proves what components it actually needs.

---

# 67. Recommended Project Structure

```text
crm/
│
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── leads/
│   │   │   ├── clients/
│   │   │   ├── quotes/
│   │   │   ├── tasks/
│   │   │   └── dashboard/
│   │   │
│   │   ├── domain/
│   │   │   ├── leads/
│   │   │   ├── clients/
│   │   │   ├── quotes/
│   │   │   ├── tasks/
│   │   │   └── communications/
│   │   │
│   │   ├── services/
│   │   │   └── supabase/
│   │   │
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   │
│   └── routes/
│       ├── login/
│       ├── leads/
│       ├── clients/
│       ├── quotes/
│       ├── tasks/
│       ├── reports/
│       └── settings/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── ingest-bricks-lead/
│   │   ├── send-quote/
│   │   ├── process-reminders/
│   │   ├── sendpulse-webhook/
│   │   └── invite-user/
│   │
│   ├── seed.sql
│   └── config.toml
│
├── static/
│   └── brand/
│
├── tests/
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DOMAIN_MODEL.md
    ├── DEPLOYMENT.md
    ├── CLIENT_ONBOARDING.md
    └── OPERATIONS.md
```

---

# 68. Naming Conventions

## Database

Use:

```text
snake_case
plural table names
```

Examples:

```text
leads
clients
quotes
quote_items
tasks
activities
outbound_messages
```

## TypeScript

Types:

```text
PascalCase
```

Functions:

```text
camelCase
```

## Svelte Components

```text
PascalCase.svelte
```

Examples:

```text
LeadCard.svelte
QuoteEditor.svelte
ActivityTimeline.svelte
```

## Routes

Use human-readable kebab-case.

## Actions

Use verbs:

```text
qualifyLead
markLeadLost
convertLead
finaliseQuote
sendQuote
reviseQuote
completeTask
```

Avoid vague names such as:

```text
process
handle
executeThing
manager
helper
```

unless context genuinely makes them clear.

---

# 69. Database Relationship Map

```text
auth.users
    │
    └── profiles

lead_sources
    │
    └── leads
          │
          ├── quotes
          │     └── quote_items
          │
          ├── tasks
          │
          ├── activities
          │
          └── converted_client
                    │
                    └── client_contacts

quotes
  │
  ├── outbound_messages
  └── activities

outbound_messages
       │
       └── message_events

inbound_submissions
       │
       └── lead

lost_reasons
       │
       └── leads
```

---

# 70. Critical Database Constraints

Database constraints matter even with an excellent frontend.

Recommended invariants:

### Lead

- valid pipeline stage;
- valid attention state;
- lost lead requires lost reason;
- Won lead must have conversion metadata;
- one conversion result per lead.

### Quote

- valid status;
- currency required;
- valid date;
- revision >= 0;
- unique quote/revision;
- sent quotes immutable through normal actions;
- accepted quote cannot also be declined;
- monetary fields cannot contain invalid floats;
- quote must contain at least one item before finalisation.

### Quote Item

- quantity > 0;
- valid money value;
- deterministic sort position.

### Tasks

- due date required for actionable task;
- completed tasks require completion timestamp.

### Inbound Submissions

- unique external submission identifier where available.

### Message Events

- deduplication against repeated provider events.

---

# 71. Optimistic Locking

Leads and Quotes should carry:

```text
lock_version
```

or equivalent optimistic-concurrency protection.

Scenario:

```text
Salesperson A opens lead
Salesperson B opens same lead

B updates it

A later submits stale data
```

The application should not silently overwrite B's changes.

Instead:

> This record changed while you were editing it. Reload the latest version.

For a small CRM this is inexpensive and prevents surprisingly common data loss.

---

# 72. Database Indexes

Initial indexes should support actual critical queries.

## Leads

- `pipeline_stage`;
- `attention_state`;
- `assigned_to`;
- `created_at`;
- `last_activity_at`;
- normalized email;
- phone where appropriate.

## Quotes

- `lead_id`;
- `client_id`;
- `status`;
- `valid_until`;
- `sent_at`;
- quote number/revision unique index.

## Tasks

- `assigned_to`;
- `due_at`;
- `status`;
- partial/open-task index.

## Activity

Composite:

```text
lead_id + occurred_at DESC
```

## Outbound messages

- provider message ID;
- quote ID;
- status.

## Inbound submissions

Unique:

```text
external_submission_id
```

where supplied.

Do not index every column pre-emptively.

---

# 73. Authentication Architecture

Use Supabase Auth.

Supabase Auth integrates directly with Row Level Security and JWT-based authorization.

Recommended:

- no public sign-up;
- staff invitation only;
- email/password or magic link;
- MFA available for higher-risk deployments;
- short enough session lifetime for internal business data.

---

# 74. Row Level Security

RLS is mandatory on all Data API business tables.

Supabase explicitly recommends enabling RLS on exposed schemas and keeping service-role/secret credentials off the frontend.

The browser receives only:

```text
Supabase publishable key
```

Never:

```text
service role key
SendPulse secret
Bricks webhook secret
database password
```

---

# 75. Permission Matrix

| Resource | Owner | Admin | Sales | Viewer |
|---|---|---|---|---|
| Leads Read | Yes | Yes | Yes | Yes |
| Leads Write | Yes | Yes | Yes | No |
| Clients Read | Yes | Yes | Yes | Yes |
| Clients Write | Yes | Yes | Yes | No |
| Quotes Read | Yes | Yes | Yes | Yes |
| Quotes Write | Yes | Yes | Yes | No |
| Send Quote | Yes | Yes | Yes | No |
| Tasks | Yes | Yes | Yes | Read |
| Reports | Yes | Yes | Yes | Yes |
| Users | Yes | Optional | No | No |
| Business Settings | Yes | Yes | No | No |
| Integration Settings | Yes | Restricted | No | No |

---

# 76. Trusted Domain Actions

Some operations are too important to trust entirely to arbitrary browser updates.

Use trusted database functions or Edge Functions for:

```text
convert_lead
mark_lead_lost
reopen_lead
finalise_quote
send_quote
revise_quote
accept_quote
```

Simple editable fields may use normal RLS-secured Data API updates.

The business workflow must not depend on the frontend remembering to update five different tables correctly.

---

# 77. Realtime

Supabase Realtime can optionally update:

- dashboard counters;
- new lead lists;
- task lists;
- quote statuses.

This is useful when multiple sales staff work simultaneously.

Do not poll the database every few seconds.

Use Realtime only for screens where immediate updates actually improve the workflow.

---

# 78. Performance Architecture

This application should **not** inherit the architecture of a flash-sale ticketing system.

Its data profile is completely different.

Most CRM data belongs in:

```text
COLD / DURABLE
PostgreSQL
```

Examples:

- leads;
- clients;
- quotes;
- activities;
- tasks.

## Hot

Only local UI state:

- current filters;
- current edit state;
- selected lead;
- current dashboard counts.

## Warm

Short-lived browser query state where useful.

## Cold

Postgres remains authoritative.

---

# 79. Caching

Recommended MVP:

### Browser

In-memory:

```text
30–60 second
```

query reuse where useful.

### localStorage

Only:

- UI preference;
- sidebar state;
- harmless filter preference.

Do not deliberately persist complete lead/client datasets into browser storage.

### IndexedDB

Not required initially.

### CDN

Cloudflare caches:

- JavaScript;
- CSS;
- icons;
- static brand assets.

### Redis

None.

There is no rational reason to introduce Redis into the initial CRM.

If the system later becomes a shared SaaS platform at significant scale, revisit:

- rate limiting;
- hot analytics;
- distributed locks;
- transient queues;
- high-frequency counters.

---

# 80. 100k Concurrent User Review

Is the free architecture designed for 100,000 concurrent CRM users?

**No.**

Nor should it be.

The business target is approximately:

```text
1–50 internal users per client
```

Optimizing the MVP for 100,000 concurrent users would be architecture theatre.

If the product becomes SaaS at that scale, reassess:

- Supabase tier;
- Postgres compute;
- read replicas;
- Redis;
- connection pooling;
- dedicated job processing;
- analytics infrastructure;
- multi-tenancy;
- rate limiting.

---

# 81. Analytics Performance

For normal client deployments:

Use:

- indexed SQL queries;
- SQL views;
- small aggregate queries.

Do not introduce materialized views immediately.

Threshold for reconsideration:

- large activity history;
- thousands/millions of records;
- dashboard latency becomes measurably poor.

Then introduce:

- materialized views;
- cached aggregates;
- precomputed daily metrics.

Never optimise from imagination alone.

---

# 82. Security Review

Required controls:

## Authentication

- authenticated staff only;
- no public signup;
- optional MFA.

## Database

- RLS everywhere;
- least privilege;
- no service key in browser.

## Edge Functions

- validate JWT where staff-facing;
- validate webhook secret where machine-facing;
- strict payload validation.

## Bricks

- shared authentication secret;
- known form ID validation;
- request limits;
- idempotency.

## SendPulse

- API secret server-side only;
- authenticated sending domain;
- provider events deduplicated.

## Application

- sanitize untrusted text;
- prevent stored XSS;
- escape content in emails/PDFs;
- sensible CSP;
- secure headers.

## Logs

Do not deliberately log:

- passwords;
- access tokens;
- service keys;
- complete sensitive payloads.

---

# 83. Cloudflare Access

Cloudflare Access can optionally add a second perimeter around the CRM.

Cloudflare describes Access as an identity-aware proxy and currently offers its Zero Trust Free plan for teams under 50 users.

This is useful if a client wants:

```text
crm.example.com
```

to be inaccessible before passing an organization-level identity check.

It should be considered defense-in-depth.

Supabase Auth and RLS remain the application's authorization system.

Do not make Cloudflare Access integration a mandatory MVP dependency.

---

# 84. Backups & Disaster Recovery

This is the biggest challenge to the "$0 production CRM" assumption.

Supabase Free currently does not include automatic backups.

Therefore production launch requires one of two decisions.

## Option A — Supabase Pro

Best for business-critical clients.

Benefits include managed backups and no inactivity pausing.

## Option B — Free plan + External Backup Procedure

Acceptable for very small clients if properly implemented.

At minimum:

- automated database export;
- off-platform encrypted storage;
- retention policy;
- documented restoration procedure;
- periodic restore test.

A backup that has never been restored is not proven.

---

# 85. Backup Launch Gate

**STOP PRODUCTION DEPLOYMENT** if:

- there is no database backup strategy;
- restoration has never been tested;
- the client assumes Supabase Free provides business-grade managed recovery.

This should be explicit in the client onboarding documentation.

---

# 86. Privacy

CRM data contains personal information.

Minimise collection.

Do not collect information merely because a form can.

Potential sensitive data:

- names;
- email;
- telephone;
- address;
- business information;
- conversation notes.

Define:

- retention;
- deletion;
- export;
- authorized users;
- breach response;
- backup retention.

Applicable privacy legislation depends on the client and jurisdiction.

---

# 87. Soft Delete vs Hard Delete

Normal workflow should use:

```text
archive
```

rather than destructive deletion.

For:

- leads;
- clients;
- quotes.

Actual personal-data erasure should be a deliberate administrative action with defined consequences.

Never allow accidental hard deletes through ordinary list-screen buttons.

---

# 88. Integration Failure Handling

## Bricks unavailable → Supabase

Bricks should report webhook failure.

Submission should ideally remain available in WordPress if form submission storage is enabled.

## Edge Function unavailable

Return failure rather than false success.

## SendPulse unavailable

Do not mark Quote Sent merely because the button was clicked.

Store email attempt.

Show:

```text
Send failed
```

with retry.

## SendPulse accepted but webhook delayed

Show:

```text
Submitted
```

not:

```text
Delivered
```

## Duplicate webhook

Return successful idempotent response.

Do not create another lead.

---

# 89. Outbox Pattern

For reliable communication:

```text
Create outbound_message
        ↓
pending
        ↓
Attempt SendPulse
        ↓
submitted / failed
        ↓
Provider webhook
        ↓
delivered / bounced
```

This means external API failure does not corrupt the Quote domain.

---

# 90. Quote Send Transaction

Recommended sequence:

1. validate quote;
2. finalise commercial snapshot;
3. generate document;
4. create pending outbound message;
5. invoke SendPulse;
6. receive provider acknowledgement;
7. mark message Submitted;
8. mark quote Sent;
9. create follow-up task;
10. update lead to Decision;
11. set Waiting on Client;
12. create Activity events.

Failure before provider acceptance must leave enough state to retry safely.

---

# 91. Reminder Processing

Recommended scheduled processor:

```text
Every 5 minutes
       ↓
Claim due tasks
       ↓
Check task still Open
       ↓
Check notification not already sent
       ↓
Create notification
       ↓
Mark notification timestamp
```

Avoid duplicated reminder emails through idempotent processing.

---

# 92. Quote Expiry Processing

Daily task:

```text
Find quotes:
status = sent
AND
valid_until < current date
```

Then:

```text
mark expired
record activity
```

Do not expire:

- accepted;
- declined;
- cancelled;
- superseded quotes.

---

# 93. Observability

The system should answer:

### Integrations

- When did Bricks last successfully submit?
- When did the last Bricks failure happen?
- When was the last SendPulse email accepted?
- When was the last SendPulse webhook received?
- When did the reminder processor last run?

### Application

- Edge Function errors;
- failed outbound messages;
- rejected submissions;
- overdue jobs.

Build a small admin diagnostics screen later rather than requiring the client to inspect raw cloud logs.

---

# 94. Testing Strategy

Testing should focus on business invariants, not arbitrary coverage percentages.

## Database Tests

Verify:

- constraints;
- RLS;
- state transitions;
- conversion;
- numbering;
- quote immutability;
- lost reason requirement;
- idempotency.

## Unit Tests

Verify:

- money calculations;
- formatting;
- status rules;
- validation;
- mapping functions.

## Integration Tests

Verify:

```text
Bricks payload → Lead
```

```text
Quote → outbound message
```

```text
SendPulse event → message event
```

## Browser Tests

Critical user journeys:

1. sign in;
2. open lead;
3. qualify;
4. create quote;
5. send;
6. complete follow-up;
7. convert;
8. mark lost.

---

# 95. Critical Regression Scenarios

Always preserve tests for:

### Duplicate website submission

Must not create duplicate lead.

### Two users editing same quote

Must detect stale write.

### Sent quote edited

Must reject.

### Lost lead without reason

Must reject.

### Conversion executed twice

Must not create second client.

### Email webhook delivered twice

Must not duplicate business state.

### Reminder processor runs twice

Must not duplicate reminders.

### Unauthorized sales user modifies settings

Must reject.

---

# 96. Client Configuration Strategy

Do not fork the entire design for every client.

Maintain one product baseline.

Client differences should primarily be configuration:

```text
brand
company details
tax
currency
quote terms
email
form integration
sales rules
```

The long-term objective is:

```text
ONE CODEBASE
      +
CLIENT CONFIGURATION
      =
CLIENT DEPLOYMENT
```

This is much easier to maintain than ten unrelated CRM forks.

---

# 97. Client Onboarding Procedure

Once the template is stable:

## Step 1

Create or obtain client Cloudflare account.

## Step 2

Create client Supabase account/project.

Important:

The client should preferably own it.

## Step 3

Configure production environment.

## Step 4

Apply migrations.

## Step 5

Create Owner account.

## Step 6

Configure business settings.

## Step 7

Create SendPulse account.

## Step 8

Complete SendPulse sender approval.

## Step 9

Configure:

- SPF;
- DKIM;
- DMARC;
- sender.

## Step 10

Create Bricks webhook secret.

## Step 11

Configure Bricks payload.

## Step 12

Test submission.

## Step 13

Create sample quote.

## Step 14

Send test email.

## Step 15

Verify delivery webhook.

## Step 16

Verify reminders.

## Step 17

Verify backup.

## Step 18

Deploy production domain.

---

# 98. Definition of Done for a Client

A deployment is not complete merely because:

```text
the website loads
```

It is complete when:

- staff login works;
- RLS tests pass;
- real Bricks submission works;
- duplicate submission protection works;
- lead appears correctly;
- quote can be created;
- quote calculation is correct;
- PDF/document is correct;
- SendPulse send succeeds;
- delivery event returns;
- follow-up task is created;
- lead can convert;
- lost lead requires reason;
- client is created correctly;
- reports display;
- production domain works;
- sender DNS authenticates;
- backup has been verified.

---

# 99. Implementation Phases

## Phase 0 — Architecture & Scaffold

Outcome:

A reproducible project exists with:

- frontend;
- Supabase;
- environments;
- CI;
- documentation;
- design tokens.

No business feature is implemented yet.

---

## Phase 1 — Identity & Database Foundation

Outcome:

- Supabase Auth;
- profiles;
- roles;
- RLS;
- settings;
- lead source;
- lost reasons.

---

## Phase 2 — Lead Tracer Bullet

Outcome:

```text
Bricks
 ↓
Edge Function
 ↓
Lead
 ↓
CRM List
 ↓
Lead Detail
```

This is the first true vertical slice.

Do not build quotes before this works end-to-end.

---

## Phase 3 — Lead Workflow

Outcome:

- pipeline;
- attention;
- tasks;
- activity;
- assignment;
- lost workflow.

---

## Phase 4 — Client Conversion

Outcome:

```text
Lead Won
 ↓
Client
 ↓
Primary Contact
```

Transactionally and idempotently.

---

## Phase 5 — Quote Domain

Outcome:

- quote;
- quote items;
- totals;
- numbering;
- states;
- revision;
- immutable sent snapshots.

---

## Phase 6 — Quote UI

Outcome:

Salesperson can build and preview a professional quote.

---

## Phase 7 — Communications

Outcome:

```text
Quote
 ↓
Document
 ↓
SendPulse
 ↓
Customer
```

Provider status is recorded.

---

## Phase 8 — Follow-up Automation

Outcome:

- automatic follow-up tasks;
- overdue reminders;
- quote expiry;
- scheduled processing.

---

## Phase 9 — Dashboard & Analytics

Outcome:

Staff immediately see:

- new leads;
- tasks;
- pipeline;
- quotes;
- sales metrics.

---

## Phase 10 — Security & Operations Hardening

Outcome:

- security review;
- RLS audit;
- backup;
- restoration;
- errors;
- diagnostics;
- deployment documentation.

---

## Phase 11 — Reusable Client Template

Outcome:

A new client can be deployed primarily through configuration rather than new coding.

---

# 100. Horizontal Expansion Strategy

Each vertical slice should subsequently be hardened horizontally.

For example:

## Lead Tracer Bullet

First:

```text
Webhook → Lead → UI
```

Then horizontally expand:

```text
Validation
Idempotency
RLS
Activity
Assignment
Error handling
Search
Filters
Indexes
Analytics
Observability
```

## Quote Tracer Bullet

First:

```text
Create → Send
```

Then:

```text
Validation
Money rules
PDF
Revisions
Immutability
Delivery tracking
Expiry
Analytics
Security
```

This prevents building half of ten features without completing one.

---

# 101. Performance & Scaling Review

For each slice ask:

1. Is the data hot, warm or cold?
2. Is Postgres sufficient?
3. Are we creating unnecessary database calls?
4. Is an index required?
5. Should the result be streamed/paginated?
6. Is Realtime justified?
7. Is client persistence safe for this PII?
8. What happens if two staff perform this action simultaneously?
9. Can the integration retry safely?
10. Is Redis genuinely needed?

For this CRM, the normal answer to number 10 should initially be:

> No.

---

# 102. Failure Modes & Risk Register

## Critical

### Weak RLS

Risk:

Customer data exposure.

Mitigation:

Policy tests and deny-by-default design.

### Service key exposed

Risk:

Full database compromise.

Mitigation:

Secrets only in backend/Edge Function environment.

### No backup

Risk:

Permanent loss of CRM history.

Mitigation:

Hard production launch gate.

### Quote mutation after sending

Risk:

Commercial dispute.

Mitigation:

Immutable sent quotes.

### Duplicate conversion

Risk:

Duplicate clients.

Mitigation:

Transactional/idempotent conversion.

---

## High

### Duplicate Bricks submissions

Mitigation:

Idempotency key.

### Email provider timeout

Mitigation:

Outbox and status state machine.

### Two staff overwrite each other

Mitigation:

Optimistic locking.

### Spam leads

Mitigation:

WordPress-side anti-spam plus validation.

### Reminder duplication

Mitigation:

Atomic processing/idempotency.

---

## Moderate

### Supabase project pauses

Relevant on Free deployment.

Mitigation:

Active usage or Pro upgrade.

### Free plan exhausted

Mitigation:

Usage monitoring and upgrade path.

### Email volume exceeds free tier

Mitigation:

SendPulse paid plan.

### Client changes quote settings

Historical quotes remain snapshots.

---

# 103. What Success Looks Like

A successful MVP should feel boring.

That is good.

A salesperson should be able to understand it without training manuals.

The system should tell them:

```text
Who contacted us?
What do they want?
Where are we in the sale?
Who are we waiting for?
What must happen next?
When must it happen?
What did we quote?
Was it sent?
What happened afterward?
Did we win?
If not, why?
```

If those questions can be answered in seconds, the CRM is succeeding.

---

# 104. Estimated Implementation Effort

For an experienced AI-assisted development workflow:

| Area | Approximate Effort |
|---|---:|
| Scaffold/config | 0.5–1 day |
| Database/Auth/RLS | 1–2 days |
| Lead tracer bullet | 1 day |
| Lead workflow/tasks/activity | 1–2 days |
| Client conversion | 0.5–1 day |
| Quote domain/UI | 2–3 days |
| SendPulse/document workflow | 1–2 days |
| Reminders | 0.5–1 day |
| Dashboard/reporting | 1–2 days |
| Hardening/deployment | 1–2 days |

A rough practical target:

```text
Functional MVP:
~7–10 focused development days

Reusable polished template:
~2–3 weeks
```

The largest danger to this timeline is not technical difficulty.

It is scope creep.

---

# 105. Recommended Future Expansion Order

After MVP:

## V1.1

- better quote PDF;
- customizable quote template;
- multiple contacts;
- attachments;
- improved analytics;
- automatic quote reminders.

## V1.2

- public quote viewing;
- accept/decline online;
- customer comments.

## V1.3

- calendar integration;
- WhatsApp;
- email conversation capture.

## V1.4

- deposits/payments;
- invoices;
- accounting integration.

## V2

- orders/projects;
- customer portal;
- advanced automation.

## V3

Only if commercially justified:

- multi-tenant SaaS;
- workflow builder;
- advanced AI.

---

# 106. Things We Should Explicitly Avoid

Do not:

- build a generic HubSpot clone;
- introduce Redis because "CRMs might scale";
- add Kafka;
- add microservices;
- create twenty workflow states;
- store secrets in Supabase public tables;
- expose service keys;
- allow public signup;
- mutate sent quotes;
- hard-delete sales history casually;
- use emails as unique customer identifiers;
- treat email opens as absolute proof;
- run unbounded table queries;
- poll every few seconds;
- build a custom email designer;
- build multi-tenancy before there is a SaaS requirement;
- promise business-grade disaster recovery on an unbacked-up free database.

---

# 107. Scaffolding TOON Prompt

| Field | Content |
|---|---|
| Task | Scaffold the complete CRM project baseline without implementing CRM business features. |
| Objective | Establish the stable SvelteKit + Cloudflare Pages + Supabase architecture upon which all future vertical slices will build. |
| Output | Create the SvelteKit project structure; `src/lib/components/`, `src/lib/domain/`, `src/lib/services/supabase/`, route groups, `supabase/migrations/`, `supabase/functions/`, `tests/`, and `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/DEPLOYMENT.md`, `docs/CLIENT_ONBOARDING.md`, `docs/OPERATIONS.md`. Configure local Supabase and Cloudflare-compatible static deployment. Do not create business resources yet. |
| Note | Keep dependencies minimal and use TypeScript. The frontend must remain static-first and must never contain service-role, SendPulse, database, or webhook secrets. Use semantic design tokens rather than client-specific raw styling. Performance: static assets belong at CDN layer; business data remains cold Postgres in future phases; Redis = none; browser persistent PII cache = none; PubSub/Realtime = none for scaffold. No DB index requirements yet. Tools: filesystem read/write, shell, git; use browser only for final smoke test. STOP when clean development/build/test commands pass and architecture folders/docs exist; do not proceed into Auth or CRM resources. |

---

# 108. TOON Micro-Prompts

## Configuration

### CRM-001 — Environment Contract

| Field | Content |
|---|---|
| Task | Define and validate the project's public and secret environment-variable contract. |
| Objective | Prevent secrets from leaking into the Svelte browser bundle and make deployments repeatable. |
| Output | Environment example files and typed environment access under the existing configuration structure; documentation in `docs/DEPLOYMENT.md`. |
| Note | Public frontend values may include Supabase URL and publishable key only. SendPulse credentials, service-role keys and webhook secrets must exist only in Supabase Edge Function secrets or equivalent trusted runtime. Do not commit real credentials. Cache: none; TTL N/A; Redis: none; invalidation N/A; PubSub: none; indexes: none. Tools: filesystem, shell. STOP immediately if a secret would need to be exposed to browser code. |

---

## Database

### CRM-002 — Identity Tables

| Field | Content |
|---|---|
| Task | Add database resources for staff profiles and application roles. |
| Objective | Establish the authorization model before business data is exposed. |
| Output | New migration(s) under `supabase/migrations/` defining profiles, role/status constraints, timestamps and auth-user relationship; focused database tests. |
| Note | Roles: owner, admin, sales, viewer. User status: invited, active, suspended. No public self-registration workflow. Index authenticated profile lookups as needed. Business data remains cold Postgres. Browser caching: session/user profile only in memory where practical. Redis: none. PubSub: none. STOP when migration, rollback/local reset, constraints and focused tests pass; do not create Leads yet. |

### CRM-003 — CRM Core Schema

| Field | Content |
|---|---|
| Task | Create the Lead, LeadSource, LostReason, Client, ClientContact, Task and Activity database resources. |
| Objective | Establish the complete sales-domain data model before UI implementation. |
| Output | Migrations under `supabase/migrations/` plus database tests for constraints and relationships. |
| Note | Encode lead pipeline stages and attention states exactly as defined in this blueprint. Lost requires reason. Activity is append-only. Include optimistic-lock field on Lead. Required indexes: lead stage, attention, owner, created/last activity, task status/due/owner, activity lead/time. Cache: Postgres authoritative; no Redis; browser cache limited to transient query results; invalidation on mutation; PubSub later through Supabase Realtime only. STOP if a field duplicates Task state unnecessarily or if referential integrity cannot be enforced cleanly. |

### CRM-004 — Quote Schema

| Field | Content |
|---|---|
| Task | Create Quote and QuoteItem database resources with immutable-sent-quote foundations. |
| Objective | Provide commercially safe quoting with revisions, exact money values and deterministic numbering. |
| Output | Quote-related migration(s), constraints, indexes and focused tests. |
| Note | Use decimal/numeric money types, not floats. States: draft, ready, sent, accepted, declined, expired, cancelled, superseded. Include optimistic locking, revision linkage, document metadata and configurable tax snapshot. Index lead, client, status, validity and quote number/revision. Cold=Postgres. Redis=none. Browser totals may preview but DB/trusted action remains authoritative. Invalidate quote query cache after mutation. PubSub may broadcast quote changes later. STOP if sent quotes can be edited through ordinary updates. |

---

## Security

### CRM-005 — RLS Policies

| Field | Content |
|---|---|
| Task | Implement and test RLS policies for every exposed CRM table. |
| Objective | Make direct browser-to-Supabase access safe under least privilege. |
| Output | RLS migration(s) and authorization tests covering owner, admin, sales, viewer and anonymous access. |
| Note | Deny anonymous business-data access. Viewer is read-only. Sales cannot manage integration/business settings. Never rely on frontend route hiding as authorization. Required indexes must support policy predicates. Cache must never bypass authorization. Redis=none. Realtime subscriptions must obey RLS if later enabled. STOP on any anonymous read/write path or privilege escalation finding; do not proceed until fixed. |

---

## Authentication

### CRM-006 — Private Authentication UI

| Field | Content |
|---|---|
| Task | Implement staff sign-in, sign-out, session handling and protected application routing. |
| Objective | Ensure only authorized staff can enter CRM workflows. |
| Output | `/login`, auth/session service in `src/lib/services/supabase/`, protected application shell and focused tests. |
| Note | No public signup. Do not place authorization rules solely in Svelte. Keep service-role credentials out of frontend. Cache only the authenticated session/profile required by Supabase; do not cache CRM PII in localStorage. Redis=none. PubSub=none. Indexes supplied by profile/auth schema. Tools: filesystem, shell, browser for login smoke test. STOP when unauthorized route/data access is blocked and sign-in/out tests pass. |

---

## Lead Intake

### CRM-007 — Bricks Lead Webhook

| Field | Content |
|---|---|
| Task | Implement the authenticated Bricks webhook ingestion function. |
| Objective | Reliably turn a valid WordPress enquiry into exactly one Lead. |
| Output | `supabase/functions/ingest-bricks-lead/`, validation contract, inbound-submission persistence and integration tests. |
| Note | Require client-specific secret; validate expected form ID and payload; prefer explicit submission UUID; never use email as idempotency key; normalize inputs; create Lead and Activity atomically. Unique index on external submission ID. Retain raw payload only if justified and with short retention. Hot/warm cache=none; cold=Postgres; Redis=none; invalidation via newly created Lead; PubSub: if Realtime enabled later, allow Lead insert notification but never raw webhook payload. STOP on authentication ambiguity, duplicate lead creation, or if retries are not idempotent. |

---

## Lead UI

### CRM-008 — Lead List

| Field | Content |
|---|---|
| Task | Implement the authenticated Lead list with search and essential filters. |
| Objective | Let staff find and triage opportunities efficiently. |
| Output | `/leads`, lead table components under `src/lib/components/leads/`, query layer and focused UI tests. |
| Note | Filters: stage, waiting state, owner, source, overdue and date. Paginate rather than loading an unbounded table. Use existing lead indexes; add only proven missing indexes. Browser query cache 30–60 seconds maximum and invalidate after mutations. Do not persist lead records to localStorage/IndexedDB. Redis=none. Realtime optional for inserted/updated leads; no polling loop. STOP when list, pagination, filters, empty/error/loading states and authorization work. |

### CRM-009 — Lead Detail Workflow

| Field | Content |
|---|---|
| Task | Implement Lead detail workflow for pipeline, attention state, assignment, tasks and activity. |
| Objective | Give staff one operational screen for managing an opportunity. |
| Output | `/leads/[id]`, Lead detail components, mutation actions and focused tests. |
| Note | Respect state-machine transitions. Overdue/follow-up due is derived from tasks. Use optimistic locking to prevent stale overwrites. Activity entries are append-only. Index task and activity queries. Browser cache transient only; invalidate lead/task/activity queries on mutation. Redis=none. Supabase Realtime may refresh the active lead when another staff member changes it. STOP on silent stale-write overwrite or invalid state transition. |

---

## Client Conversion

### CRM-010 — Lead Conversion Action

| Field | Content |
|---|---|
| Task | Implement the single trusted Lead-to-Client conversion operation. |
| Objective | Convert won opportunities without duplicate customers or partial state. |
| Output | Trusted database/Edge action plus focused transactional and idempotency tests. |
| Note | Create/find client, primary contact, link Lead, mark Won, optionally accept selected quote, close obsolete tasks and append activities in one atomic domain operation. Required indexes: source lead, client lookup fields used by the action. Cold=Postgres. Cache invalidation: lead/client/tasks/dashboard. Redis=none. PubSub: broadcast affected Lead/Client if Realtime enabled. STOP if running conversion twice creates duplicates or leaves partial state after failure. |

---

## Quoting

### CRM-011 — Quote Domain Actions

| Field | Content |
|---|---|
| Task | Implement trusted Quote state transitions, totals, numbering and revision operations. |
| Objective | Protect commercial integrity independently of frontend behavior. |
| Output | Database/trusted actions and tests for create, ready, revise, accept, decline, cancel and expiry semantics. |
| Note | Sent quotes immutable. Revisions clone to a new Draft. Money calculation authoritative outside browser. Quote number concurrency must be safe. Index quote identity/status/lead/client/validity. Cache invalidation on every transition. Redis=none; PubSub: broadcast Quote state change where Realtime is active. STOP on any MAX+1 browser numbering, mutable sent quote, float money arithmetic or race-prone revision allocation. |

### CRM-012 — Quote Editor UI

| Field | Content |
|---|---|
| Task | Build the Quote editor and preview UI for Draft/Ready quotes. |
| Objective | Allow sales staff to create a professional quote quickly and accurately. |
| Output | `/quotes/new`, `/quotes/[id]`, components under `src/lib/components/quotes/`, line-item editing, calculated preview and focused browser tests. |
| Note | Client-side totals are previews only; trusted Quote actions remain authoritative. Disable editing after Sent. Use semantic money/date formatting and design tokens. Query cache transient and invalidated immediately after saves. Redis=none. Realtime optional for conflict notification. Required DB indexes already established. STOP when create/edit/ready/revision flows work and a Sent quote is read-only. |

### CRM-013 — Quote Document Generation

| Field | Content |
|---|---|
| Task | Generate and store the immutable quote document when a Quote is finalised for sending. |
| Objective | Preserve exactly what the customer received. |
| Output | Trusted document-generation function, private Supabase Storage integration, document path/hash persistence and tests. |
| Note | Use a runtime-compatible pure-JS/Deno-compatible solution unless another runtime is deliberately approved. Never expose Storage buckets publicly; use trusted retrieval/signed access where needed. Document settings/tax/terms are snapshots. Storage is cold. CDN cache only immutable nonsensitive brand assets; quote PDFs private. Redis=none. PubSub not required. STOP if generated documents can change after Sent or if private documents become anonymously accessible. |

---

## Communications

### CRM-014 — SendPulse Quote Sending

| Field | Content |
|---|---|
| Task | Implement trusted quote delivery through the SendPulse transactional API. |
| Objective | Send quotes reliably while retaining provider and failure state in CRM. |
| Output | `supabase/functions/send-quote/`, outbound-message integration and focused SendPulse adapter tests/mocks. |
| Note | Credentials are server secrets only. Use the OutboundMessage state machine. Do not mark Delivered at provider submission. Create follow-up only after successful send semantics defined by the domain. Index provider message ID/status. Cold=Postgres; warm cache=none; Redis=none. Invalidate quote/message/activity/dashboard queries. PubSub may broadcast message/quote state changes. STOP on secret exposure, uncontrolled duplicate send risk, or if SendPulse failure incorrectly marks Quote Sent. |

### CRM-015 — SendPulse Event Webhook

| Field | Content |
|---|---|
| Task | Implement SendPulse transactional-event ingestion. |
| Objective | Track delivery, bounce, open and click events without corrupting Quote state. |
| Output | `supabase/functions/sendpulse-webhook/`, MessageEvent persistence, mapping logic and idempotency tests. |
| Note | Treat provider events as untrusted input; validate structure; deduplicate repeated events; store raw metadata only when useful; opens/clicks remain events, not delivery truth. Unique dedupe index required. Cold=Postgres. Cache invalidation: outbound message/activity. Redis=none. PubSub may append Activity event updates. STOP if duplicate webhook delivery produces duplicate business transitions. |

---

## Reminders

### CRM-016 — Scheduled Follow-up Processor

| Field | Content |
|---|---|
| Task | Implement scheduled processing for due tasks and reminder notifications. |
| Objective | Ensure follow-ups happen even when no user has the CRM open. |
| Output | `supabase/functions/process-reminders/`, Supabase Cron configuration/migration and focused idempotency tests. |
| Note | Claim/process tasks atomically; do not duplicate notifications across overlapping job executions. Partial index on open/due tasks required. Postgres is source of truth. Redis=none at current scale; if future high concurrency requires claim queues, reevaluate Redis ZSET. Invalidate task/dashboard data; PubSub broadcast task changes if Realtime active. STOP if two simultaneous processor runs can send duplicate reminders. |

---

## Dashboard

### CRM-017 — Operational Dashboard

| Field | Content |
|---|---|
| Task | Build the primary dashboard focused on actionable sales work. |
| Objective | Make overdue work, new leads and commercial pipeline visible immediately. |
| Output | `/` dashboard, dashboard components, aggregate query/view layer and tests. |
| Note | Prioritize Needs Attention over decorative charts. Avoid full-table client-side aggregation. Add SQL views/queries and only indexes proven necessary. Browser aggregate cache 30–60 seconds; invalidate on lead/task/quote changes. Redis=none for MVP; if future analytics load becomes significant, introduce cached aggregates/materialized views before Redis. Supabase Realtime may refresh counters; no high-frequency polling. STOP when dashboard answers new/due/waiting/pipeline/quote/won questions with bounded queries. |

---

## Reporting

### CRM-018 — Basic Sales Reports

| Field | Content |
|---|---|
| Task | Implement the first reporting views for conversion, quotes, lost reasons and lead sources. |
| Objective | Turn operational CRM data into management insight without creating a separate analytics platform. |
| Output | `/reports`, SQL views/aggregate queries and focused calculation tests. |
| Note | Use indexed bounded queries. No large unfiltered scans during normal dashboard use. Cold=Postgres. Cache report results briefly in memory if necessary; TTL 1–5 minutes. Redis=none until measurable reporting pressure; future scale may use materialized/cached aggregates. Invalidate relevant reports on Lead/Quote terminal transitions rather than attempting per-event micro-caching. PubSub not necessary for historical reports. STOP if report formulas cannot be reconciled back to authoritative Leads/Quotes. |

---

## Operations

### CRM-019 — Backup & Recovery Procedure

| Field | Content |
|---|---|
| Task | Establish and prove the production backup and restore procedure. |
| Objective | Prevent client CRM history from depending on an unverified free-tier recovery assumption. |
| Output | `docs/OPERATIONS.md`, backup procedure, retention policy, restore procedure and evidence from a successful disposable restore test. |
| Note | Never commit database credentials or unencrypted customer dumps. Free Supabase deployment is not production-approved until external backup exists; paid Supabase managed backup is an acceptable alternative. Backup data is cold/off-platform; CDN/browser cache N/A; Redis N/A; PubSub N/A; indexes N/A. Tools: Supabase CLI/database backup tooling, filesystem, shell; use only tools needed for backup/restore verification. STOP immediately on inability to restore successfully. |

---

## Hardening

### CRM-020 — End-to-End Release Gate

| Field | Content |
|---|---|
| Task | Validate the complete MVP tracer bullet and all critical regression/security gates before production release. |
| Objective | Prove the system works end-to-end rather than declaring completion from isolated unit tests. |
| Output | Automated/recorded verification covering Auth → Bricks → Lead → Quote → SendPulse → Follow-up → Won/Client and Lost paths; release checklist in `docs/DEPLOYMENT.md`. |
| Note | Run focused tests, full suite, type checks, production build, migration reset, RLS tests and critical browser journeys. Verify indexes on critical query paths; ensure no unbounded queries. Cache behaviour must not serve stale authorization-sensitive data. Redis remains absent unless a proven need emerged. Realtime must never substitute for persisted truth. Tools: shell, browser, Supabase tooling, git; no unrelated external tooling. STOP on any security, data-integrity, backup, idempotency, migration or quote-immutability failure. Do not deploy until every launch gate passes. |

---

# 109. Global Agent STOP Conditions

Every coding-agent task must stop when its requested outcome is complete.

The agent must **not continue expanding scope** simply because adjacent improvements are possible.

Immediate STOP conditions:

1. destructive migration with ambiguous data impact;
2. RLS uncertainty;
3. secret potentially entering browser bundle;
4. inability to preserve existing data;
5. change would violate immutable sent quotes;
6. unclear business state transition;
7. unexpected production infrastructure change;
8. task would require introducing an unapproved dependency;
9. task begins turning single-tenant architecture into multi-tenant architecture;
10. requested task has passed its tests and quality gates.

The agent should report the blocker rather than inventing new architecture.

---

# 110. Recommended Agent Tool Policy

Use the **least tools required**.

Normal implementation task:

```text
filesystem/read
filesystem/write
shell
git
```

Database task:

```text
filesystem
shell
Supabase CLI
git
```

UI task:

```text
filesystem
shell
browser
git
```

External integration task:

```text
filesystem
shell
official provider documentation if contract is uncertain
git
```

Do not perform web research if the repository and pinned dependency documentation already answer the question.

Do not let an agent wander through unrelated services.

---

# 111. Final Architectural Position

The recommended final shape is:

```text
                  CLIENT WEBSITE
                WordPress + Bricks
                       │
                       ▼
              Supabase Edge Function
                       │
                       ▼
                 PostgreSQL
                       │
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
  SvelteKit CRM               Scheduled Jobs
Cloudflare Pages              Supabase Cron
         │                            │
         └──────────────┬─────────────┘
                        ▼
                 Edge Functions
                        │
                        ▼
                    SendPulse
```

The architecture has only four major moving pieces:

```text
Cloudflare
Supabase
WordPress
SendPulse
```

That is desirable.

---

# 112. Final Recommendation

Build this as a reusable product.

But keep the first version ruthlessly focused.

The value proposition should be:

> **No lead forgotten. No quote lost. No follow-up missed.**

Not:

> We built another CRM with 175 features.

The technical stack is particularly attractive for small-client deployments because the frontend can be essentially static, PostgreSQL provides durable business truth, Supabase supplies Auth/RLS/functions/scheduling/storage, Cloudflare handles global static delivery, Bricks gives you a simple webhook boundary, and SendPulse handles transactional email.

The central architectural decisions to freeze before implementation are:

1. **single client per deployment;**
2. **Lead before Client;**
3. **Pipeline, Attention and Tasks are separate concepts;**
4. **Activity is append-only and first-class;**
5. **sent Quotes are immutable;**
6. **Quote revisions create new snapshots;**
7. **business-critical transitions use trusted actions;**
8. **browser access is protected by RLS;**
9. **secrets exist only server-side;**
10. **external integrations are idempotent;**
11. **Postgres is the business source of truth;**
12. **no Redis/microservices unless actual scale proves a need;**
13. **production requires a real backup strategy;**
14. **one codebase should eventually serve every client deployment through configuration.**

If those fourteen rules remain intact, this can stay remarkably simple while still growing into a very capable commercial system.