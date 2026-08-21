# CRM Implementation Roadmap

**Version:** 1.1.0  
**Architecture:** SvelteKit + Cloudflare Pages + Supabase + PostgreSQL + SendPulse + WordPress/Bricks  
**Deployment model:** Isolated single-client deployment  
**Primary workflow:** Lead → Qualification → Quote → Follow-up → Won / Lost → Client

---

# 1. Roadmap at a Glance

I would turn the architecture into **five major milestones and fourteen explicit phases**.

The key implementation rule is:

> **Prove the complete business workflow thinly first. Then harden and expand each part horizontally.**

**Autonomous-loop boundary:** Phases 0–14 are designed to complete locally. Real remote deployment, live DNS changes, real-client pilot observation, and production launch are handled by the separate `POST_BUILD_PILOT_PROGRAMME.md` unless the `/goal` explicitly authorizes those actions.

That means we do **not** spend three weeks perfecting the Lead module before discovering that quote delivery, reminders, or conversion require architectural changes.

| Milestone | Phase | Outcome |
|---|---|---|
| **M0 — Foundation** | 0 | Architecture and scope frozen |
| | 1 | Project scaffold, environments and quality gates |
| | 2 | Design system and application shell |
| | 3 | Database, Auth, RLS and permissions |
| **M1 — Workflow Proof** | 4 | Complete end-to-end tracer bullet |
| **M2 — Production CRM Core** | 5 | Lead management hardened |
| | 6 | Client/contact conversion hardened |
| | 7 | Quote domain and quote editor hardened |
| | 8 | Documents and SendPulse communications |
| | 9 | Tasks, reminders and scheduled automation |
| | 10 | Dashboard and analytics |
| **M3 — Production Hardening** | 11 | UX, realtime and performance hardening |
| | 12 | Security, backup, observability and release gates |
| **M4 — Productisation** | 13 | Reusable client deployment template & local deployment readiness |
| | 14 | Local release candidate & pilot readiness |

The critical path is:

```text
Architecture
    ↓
Scaffold
    ↓
Design System
    ↓
Auth + Database + RLS
    ↓
FULL TRACER BULLET
    ↓
Lead Hardening
    ↓
Client Conversion
    ↓
Quotes
    ↓
Email
    ↓
Reminders
    ↓
Analytics
    ↓
Production Hardening
    ↓
Reusable Client Template
    ↓
Local Release Candidate
    ↓
PILOT READY
```

---

# MILESTONE 0 — FOUNDATION

# Phase 0 — Architecture & Product Contract

## Objective

Turn the existing blueprint into a **frozen implementation authority**.

No implementation should begin while fundamental domain decisions are still moving.

## Lock down

### Product boundary

The product is:

```text
Lead
→ Qualification
→ Quote
→ Follow-up
→ Won / Lost
→ Client
```

Not:

```text
Generic CRM
Marketing Suite
Project Management
Accounting
ERP
Helpdesk
```

### Deployment model

Freeze:

```text
1 Client
=
1 Cloudflare deployment
+
1 Supabase project
+
1 SendPulse configuration
```

### Core technology

```text
Frontend:
SvelteKit + TypeScript

Hosting:
Cloudflare Pages

Database:
Supabase PostgreSQL

Authentication:
Supabase Auth

Authorization:
PostgreSQL RLS

Backend trusted operations:
Supabase Edge Functions / Postgres functions

Storage:
Supabase Storage

Scheduling:
Supabase Cron

Email:
SendPulse Transactional API

Website ingestion:
Bricks Webhook
```

## Freeze the domains

```text
Identity & Access
Lead Management
Client Management
Quoting
Tasks & Follow-up
Communications
Activity & Audit
Integrations
Reporting & Analytics
Configuration
```

## Freeze Lead Pipeline

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

With:

```text
NEW → LOST
QUALIFICATION → LOST
PROPOSAL → LOST
DECISION → LOST
```

## Freeze Attention State

```text
none
waiting_on_client
waiting_on_us
follow_up_scheduled
paused
```

## Freeze Quote State

```text
draft
 ↓
ready
 ↓
sent
 ├─ accepted
 ├─ declined
 ├─ expired
 ├─ cancelled
 └─ superseded
```

## Freeze Task State

```text
open
completed
cancelled
```

## Freeze Message State

```text
pending
 ↓
sending
 ↓
submitted
 ├─ delivered
 ├─ bounced
 └─ failed
```

## Produce

```text
docs/
├── ARCHITECTURE.md
├── DOMAIN_MODEL.md
├── STATE_MACHINES.md
├── SECURITY_MODEL.md
└── ROADMAP.md
```

## Success looks like

There should be no ambiguity around:

- what a Lead is;
- what a Client is;
- when conversion occurs;
- pipeline state;
- waiting state;
- quote immutability;
- quote revisions;
- permissions;
- infrastructure ownership;
- integration boundaries.

### Agent tools

```text
filesystem
git
```

No database, browser or external API tools needed.

### Phase Boundary / Close Rule

Stop before implementation.

Do **not** scaffold features during Phase 0.

---

# Phase 1 — Project Scaffold & Quality Gates

## Objective

Create the technical skeleton that every later phase builds upon.

## Project structure

```text
src/
├── lib/
│   ├── components/
│   │   ├── ui/
│   │   ├── leads/
│   │   ├── clients/
│   │   ├── quotes/
│   │   ├── tasks/
│   │   └── dashboard/
│   │
│   ├── domain/
│   │   ├── leads/
│   │   ├── clients/
│   │   ├── quotes/
│   │   ├── tasks/
│   │   └── communications/
│   │
│   ├── services/
│   │   └── supabase/
│   │
│   ├── types/
│   └── utils/
│
└── routes/

supabase/
├── migrations/
├── functions/
├── seed.sql
└── config.toml

tests/

docs/
```

## Configure

- SvelteKit;
- TypeScript;
- Supabase local development;
- Cloudflare-compatible build;
- linting;
- formatting;
- type checks;
- unit testing;
- browser testing framework;
- environment validation;
- Git workflow;
- CI.

## Environment boundary

Public:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_PUBLISHABLE_KEY
PUBLIC_SITE_URL
```

Trusted only:

```text
SUPABASE_SERVICE_ROLE_KEY
SENDPULSE_CLIENT_ID
SENDPULSE_CLIENT_SECRET
BRICKS_WEBHOOK_SECRET
```

Never allow trusted secrets into browser bundles.

## Quality gate

Every future phase must be able to run:

```text
check
test
build
database tests
git diff --check
```

Exact script names should be standardized in this phase.

## Success

A blank but production-buildable application can:

```text
local development
→ build
→ test
→ deploy
```

without CRM functionality.

### Agent tools

```text
filesystem
shell
git
```

Browser only for final smoke test.

### Phase Boundary / Close Rule

Stop when scaffold and quality gates pass.

Do not start Auth or CRM domain implementation.

---

# Phase 2 — Design System & Application Shell

I would move this **earlier** than the previous document implied.

Otherwise every subsequent screen creates design debt.

## Objective

Freeze the visual language before building CRM screens.

## Establish tokens

### Typography

```text
font families
font sizes
line heights
weights
```

### Spacing

For example:

```text
xs
sm
md
lg
xl
2xl
```

### Semantic colours

```text
background
surface
surface-raised
border

text
text-muted

primary
accent

success
warning
danger
info
```

### Pipeline colours

Tokens for:

```text
new
qualification
proposal
decision
won
lost
```

Do not hard-code arbitrary colours throughout components.

# Base Components

Build only high-value primitives:

```text
Button
IconButton
Input
Textarea
Select
Checkbox

Badge
Card
StatCard

DataTable
FilterBar

Modal
Drawer

PageHeader
SectionHeader

EmptyState
LoadingState
ErrorState
```

# Application Shell

```text
Sidebar
Topbar
Main Content
Responsive Layout
```

Navigation:

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

## Success

Every future CRM screen can be built primarily through existing:

- tokens;
- layout rules;
- primitives.

### Tools

```text
filesystem
shell
browser
git
```

### Phase Boundary / Close Rule

Do not build CRM-specific business functionality.

Avoid creating a 100-component design framework before real screens expose actual requirements.

---

# Phase 3 — Database, Identity, Permissions & RLS

## Objective

Build the security and persistence foundation **before exposing CRM data**.

# Resources

Implement the structural minimum for:

```text
profiles
app_settings
lead_sources
lost_reasons
```

And the initial business resources required by the coming tracer bullet:

```text
leads
clients
client_contacts
quotes
quote_items
tasks
activities
outbound_messages
inbound_submissions
```

The tables may initially expose only the fields required by Phase 4, while migrations establish clean domain boundaries.

# Authentication

Use Supabase Auth.

Initial user states:

```text
invited
active
suspended
```

No public signup.

# Roles

```text
owner
admin
sales
viewer
```

# RLS

Enable RLS on every exposed business table.

Minimum rule:

```text
anonymous:
DENY

authenticated:
ALLOW according to role
```

Viewer remains read-only.

Sales users cannot alter:

- integration settings;
- system configuration;
- user permissions.

# Optimistic locking

Introduce:

```text
lock_version
```

for at least:

```text
leads
quotes
```

from the start.

# Seed Configuration

Initial values:

```text
Lead Sources
Lost Reasons
Owner User
Basic App Settings
```

## Success

Tests must prove:

```text
Anonymous user cannot read leads.
Viewer cannot update leads.
Sales user cannot modify configuration.
Admin can operate CRM data.
Owner can administer application.
```

### Tools

```text
filesystem
shell
Supabase CLI
git
```

### Phase Boundary / Close Rule

Any unresolved RLS or authorization failure blocks Phase 4.

---

# MILESTONE 1 — WORKFLOW PROOF

# Phase 4 — Complete CRM Tracer Bullet

This is the **most important phase in the roadmap**.

Do not perfect individual modules yet.

Build the thinnest production-evolutionary version of the entire business workflow.

# Tracer Bullet

```text
BRICKS-COMPATIBLE AUTHENTICATED REQUEST
      ↓
Webhook
      ↓
Lead Created
      ↓
CRM Lead List
      ↓
Open Lead
      ↓
Qualify
      ↓
Create Simple Quote
      ↓
Send Through SendPulse Adapter
      ↓
Follow-up Task Created
      ↓
Waiting on Client
      ↓
Mark Won
      ↓
Client Created
```

And:

```text
Lead
 ↓
Lost
 ↓
Reason Required
```

# Keep it deliberately thin

For example, the first quote implementation does not need:

- beautiful PDF generation;
- complex quote templates;
- revisions;
- advanced reporting;
- full customer portal.

But it must represent the **real domain model**.

Do not build throwaway fake architecture.

# Activity

At minimum capture:

```text
lead_created
pipeline_changed
quote_created
quote_sent
task_created
lead_won
lead_lost
client_created
```

# End-to-end proof

This phase validates all major boundaries:

```text
WordPress
Cloudflare
Svelte
Supabase Auth
RLS
Postgres
Edge Functions
SendPulse
```

## Success

You should physically be able to:

1. submit a canonical Bricks-compatible authenticated request to the real local ingestion boundary;
2. see the lead;
3. open it;
4. qualify it;
5. create a quote;
6. send through the real SendPulse adapter using deterministic provider-contract responses;
7. see follow-up created;
8. mark it Won;
9. see the Client;
10. inspect the activity history.

## This is the first major release gate

Call it:

```text
MVP-TRACER-001
```

### Tools

```text
filesystem
shell
Supabase CLI
browser
git
```

Real external SendPulse access is supplemental only when approved test credentials exist; local phase closure uses deterministic provider-contract validation through the real adapter.

### Phase Boundary / Close Rule

Do not start polishing individual modules until this entire flow works.

If the tracer bullet exposes an architectural contradiction, fix the architecture before continuing.

---

# MILESTONE 2 — PRODUCTION CRM CORE

We now horizontally expand the parts proven by the tracer bullet.

# Phase 5 — Lead Management Hardening

## Objective

Turn the thin Lead implementation into the complete working CRM opportunity module.

# Expand Lead fields

Add:

```text
lead_number

first_name
last_name
email
phone
company
message

source
external_submission_id

landing_page
referrer

utm_source
utm_medium
utm_campaign
utm_content
utm_term

pipeline_stage
attention_state
assigned_to

last_activity_at

lost_reason
lost_notes

converted_client_id
```

# Pipeline

Fully enforce:

```text
New
Qualification
Proposal
Decision
Won
Lost
```

# Attention

Implement:

```text
none
waiting_on_client
waiting_on_us
follow_up_scheduled
paused
```

# Lead List

Add:

- pagination;
- search;
- source filter;
- owner filter;
- stage filter;
- waiting filter;
- overdue filter;
- date range;
- sorting.

# Lead Detail

Tabs:

```text
Overview
Quotes
Tasks
Activity
```

# Bricks hardening

Add:

- strong authentication;
- form ID validation;
- schema validation;
- input normalisation;
- idempotency;
- inbound submission logging;
- duplicate protection;
- error handling.

# Critical rule

Email address is **not** an idempotency key.

Use a submission UUID.

# Performance

Indexes:

```text
pipeline_stage
attention_state
assigned_to
created_at
last_activity_at
external_submission_id
```

Do not add Redis.

## Success

Lead intake and management must now be production-worthy independently of Quotes.

### Phase Boundary / Close Rule

Stop once:

```text
capture
search
filter
assign
transition
lose
reopen
audit
```

all behave correctly.

Do not drift into quote improvements.

---

# Phase 6 — Client & Contact Domain

## Objective

Harden the transition from Opportunity to Customer.

# Client

Support:

```text
individual
company
```

Fields include:

- client number;
- display name;
- company;
- email;
- telephone;
- registration/tax details;
- billing address;
- status.

# Contacts

Implement:

```text
client_contacts
```

Supporting:

- primary contact;
- multiple business contacts.

# Conversion

Implement one trusted operation:

```text
convertLead()
```

It should atomically:

```text
verify Lead
 ↓
find/create Client
 ↓
create Contact
 ↓
link Lead
 ↓
mark Lead Won
 ↓
close obsolete tasks
 ↓
record Activity
```

# Idempotency

Calling conversion twice must not create:

```text
Client A
Client B
```

for the same conversion.

## Success

The distinction is now clean:

```text
Lead = commercial opportunity

Client = actual customer relationship
```

### Tools

```text
filesystem
shell
Supabase CLI
git
```

Browser for conversion journey verification.

### Phase Boundary / Close Rule

Duplicate-client or partial-conversion behaviour blocks progression.

---

# Phase 7 — Quote Domain & Quote Editor

This is likely the biggest individual application phase.

# Quote Schema

Complete:

```text
quote_number
revision_number

lead_id
client_id

status

currency

subject
introduction
terms

tax_rate
tax_amount

subtotal
total

valid_until

sent_at
accepted_at
declined_at

supersedes_quote_id

document_path
document_hash

created_by
lock_version
```

# Quote Item

```text
name
description
quantity
unit_price
taxable
line_subtotal
position
```

# Money

Use:

```text
PostgreSQL NUMERIC
```

Never floating point.

# Quote Numbering

Example:

```text
Q-2026-000001
Q-2026-000002
```

Revisions:

```text
Q-2026-000002-R1
```

Numbering must be concurrency-safe.

Never:

```text
SELECT MAX(number) + 1
```

from the browser.

# Quote Immutability

Once:

```text
status = sent
```

normal editing stops.

Changes create:

```text
Revision
```

# Quote State Machine

Fully enforce:

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

# Quote Editor

Build:

```text
Header
Customer
Line Items
Terms
Tax
Totals
Validity
Preview
```

Actions:

```text
Save Draft
Preview
Mark Ready
Send
Revise
```

## Success

Quote lifecycle should now survive commercial scrutiny.

### Phase Boundary / Close Rule

Any ability to silently edit a sent quote blocks release.

---

# Phase 8 — Documents & Communications

## Objective

Turn Quote sending into a reliable transactional workflow.

# Document generation

Create:

```text
Quote
 ↓
Finalise
 ↓
Generate document
 ↓
Private Supabase Storage
```

Store:

```text
path
hash
generated_at
```

# SendPulse Integration

Use transactional API.

Create:

```text
OutboundMessage
```

before attempting delivery.

# Outbox workflow

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

# SendPulse Events

Capture:

```text
delivered
opened
clicked
soft_bounce
hard_bounce
spam
unsubscribe
```

Remember:

```text
Open event ≠ guaranteed human read
```

# Webhook idempotency

SendPulse may retry events.

Each event requires deduplication.

# Domain authentication

Production sending requires:

```text
SPF
DKIM
DMARC
```

## Success

CRM can answer:

```text
Was the quote generated?
Was it submitted?
Was it delivered?
Did the provider report engagement?
Did it bounce?
```

### Phase Boundary / Close Rule

Do not call a quote "delivered" merely because SendPulse accepted an API request.

---

# Phase 9 — Tasks, Follow-ups & Automation

## Objective

Make it difficult for opportunities to be forgotten.

# Task Domain

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

States:

```text
open
completed
cancelled
```

# Automatic Follow-up

When:

```text
Quote → Sent
```

automatically:

```text
Lead → Decision
Attention → waiting_on_client
Create Follow-up Task
```

# Scheduled Processor

Use:

```text
Supabase Cron
       ↓
process-reminders
```

Examples:

### New Lead

```text
untouched for X hours
```

### Follow-up

```text
due today
```

### Stale Opportunity

```text
no activity for X days
```

### Quote Expiry

```text
validity ending
```

# Concurrency

Two scheduled jobs must not produce:

```text
two reminders
two emails
two state changes
```

## Success

Every active Lead should either have:

```text
someone waiting
```

or:

```text
something scheduled
```

There should be no invisible orphan opportunities.

### Phase Boundary / Close Rule

Duplicate reminder behavior is a blocker.

---

# Phase 10 — Dashboard & Analytics

Do this after the workflow is stable.

Otherwise you're building analytics on moving definitions.

# Dashboard objective

Answer:

> What must I do today?

# Operational section

```text
New Leads
Overdue Tasks
Due Today
Waiting on Us
Waiting on Client
Quotes Expiring
```

# Sales KPIs

```text
New Leads
Quotes Sent
Quote Value
Accepted Value
Won Leads
Lost Leads
Conversion Rate
Pipeline Value
```

# Attribution

Use captured:

```text
utm_source
utm_medium
utm_campaign
```

to calculate:

```text
Leads by source
Conversions by source
Revenue by source
```

# Lost Analysis

```text
Lost by reason
Lost value
Lost by source
```

# Performance

Use:

```text
SQL aggregate queries
views
proper indexes
bounded date ranges
```

Not:

```text
load 50,000 leads into browser
then calculate totals in JavaScript
```

## Success

Management can understand:

```text
What came in?
What needs attention?
What did we quote?
What converted?
Why are we losing?
Where do our good leads originate?
```

### Phase Boundary / Close Rule

Do not introduce a separate analytics database unless measurements prove PostgreSQL insufficient.

---

# MILESTONE 3 — PRODUCTION HARDENING

# Phase 11 — UX, Realtime & Performance

## Objective

Now make the proven CRM feel fast and polished.

# Realtime

Use Supabase Realtime selectively for:

```text
new leads
active lead updates
task changes
quote status
dashboard attention counts
```

Do not make everything realtime because the feature exists.

# Browser caching

Short-lived query cache:

```text
30–60 seconds
```

where useful.

Do not persist complete CRM datasets into:

```text
localStorage
IndexedDB
```

without an explicit offline requirement.

# Pagination

All potentially large lists:

```text
Leads
Clients
Quotes
Activity
Tasks
```

must be bounded.

# Optimistic concurrency

Verify conflict UX for:

```text
Lead
Quote
```

# Accessibility

Harden:

- keyboard navigation;
- focus states;
- form labels;
- error messaging;
- contrast;
- responsive layouts.

# Performance target

For typical CRM interactions:

```text
sub-second perceived UI response
```

should be easily achievable.

No Redis.

No GenServers.

No Kafka.

No microservices.

## Success

The application feels immediate for a small business team without unnecessary infrastructure.

### Phase Boundary / Close Rule

Do not optimise theoretical 100,000-user scenarios.

---

# Phase 12 — Security, Backup & Operational Hardening

This is the **production-readiness gate**. Actual remote launch remains outside the local-only loop.

# Security Review

Verify:

```text
RLS
role permissions
secret boundaries
CSP
input validation
XSS handling
webhook authentication
storage privacy
email authentication
```

# Backup Strategy

Free Supabase without a tested external recovery strategy should not be treated as production-complete.

Implement either:

```text
Supabase paid managed backup
```

or:

```text
external automated backup
+
retention
+
restore procedure
```

# Restore Drill

Actually restore into a disposable environment.

Do not merely verify that a backup file exists.

# Diagnostics

Provide visibility into:

```text
last Bricks webhook
last failed Bricks webhook

last SendPulse send
last SendPulse webhook

failed outbound emails

last reminder execution
failed reminders
```

# End-to-end regression

Test:

```text
Login
 ↓
Bricks
 ↓
Lead
 ↓
Quote
 ↓
Send
 ↓
Reminder
 ↓
Conversion
 ↓
Client
```

And:

```text
Lead
 ↓
Lost
 ↓
Reason
```

# Critical security tests

Verify:

```text
anonymous data access = DENIED

Viewer write = DENIED

Sales settings write = DENIED

sent quote mutation = DENIED

duplicate conversion = DENIED

duplicate webhook side effect = DENIED
```

## Success

The system is safe enough to hold real customer and commercial data.

### Phase Boundary / Close Rule

Production readiness fails if any of these fail; repair them before Phase 13:

- RLS;
- authentication;
- backup/restore;
- quote immutability;
- webhook idempotency;
- conversion idempotency;
- migration integrity;
- secret protection.

---

# MILESTONE 4 — PRODUCTISATION

# Phase 13 — Reusable Client Deployment Template & Local Deployment Readiness

Turn the production-ready CRM into a repeatable product **without requiring remote deployment to close the autonomous local loop**.

## Principle

```text
ONE CODEBASE
+
CLIENT CONFIGURATION
=
ISOLATED CLIENT INSTANCE
```

Not permanent client-specific source branches.

## Required configurable data

### Brand

```text
logo
colors
company name
```

### Locale

```text
timezone
currency
date format
```

### Quotes

```text
quote prefix
tax
default validity
terms
bank details
```

### Sales

```text
follow-up days
stale lead rules
default owner
```

### Email / integrations

```text
sender
reply-to
template IDs
Bricks identifiers
SendPulse trusted configuration
```

## Local provisioning proof

The phase must prove locally:

```text
Fresh disposable Supabase
 ↓
Run migrations
 ↓
Seed Owner + baseline configuration
 ↓
Apply client configuration
 ↓
Build Cloudflare Pages production artifact
 ↓
Validate Bricks/SendPulse configuration contracts
 ↓
Run full quality gate
```

No Cloudflare publication, remote Supabase project creation, live DNS mutation, or real-client launch is required under the default local-only `/goal`.

## Client ownership contract

```text
Client owns:
Cloudflare
Supabase
SendPulse
Domain

You manage:
Deployment procedure
Configuration
Updates
Support
```

## Success

A new client requires primarily:

```text
configuration
credentials
branding
integration setup
local/provisioning validation
```

rather than custom application development.

### Phase Boundary / Close Rule

If onboarding requires changing core domain code, determine whether the requirement belongs in reusable configuration. Do not create a client-specific fork to force the phase closed.

---

# Phase 14 — Local Release Candidate & Pilot Readiness

This is the final phase inside the autonomous local roadmap.

## Objective

Produce a complete **local v1.0.0 release candidate** that is ready for a real client pilot without falsely claiming that remote deployment or human observation already occurred.

## Final local validation

Run:

```text
Fresh local client provisioning
 ↓
Canonical Bricks-compatible intake
 ↓
Lead
 ↓
Quote
 ↓
SendPulse adapter/provider-contract success
 ↓
Follow-up
 ↓
Won → Client
```

And:

```text
Lead
 ↓
Lost
 ↓
Required reason
```

Then re-run:

```text
Quote immutability/revisions
Idempotency/concurrency
RLS/permissions
Backup/restore
Migration rehearsal
Diagnostics
Production build
Full project quality gate
Requirements coverage P0–P14
```

## Pilot-readiness package

Create an exact external checklist for a future explicit pilot goal covering:

- client-owned Cloudflare/Supabase/SendPulse/domain accounts;
- remote project provisioning;
- DNS;
- SendPulse SPF/DKIM/DMARC verification;
- real Bricks webhook smoke tests;
- real transactional email smoke/reconciliation;
- staff onboarding;
- workflow observation;
- feedback classification;
- backup/recovery ownership;
- production launch criteria.

## Successful terminal state

```text
LOCAL_BUILD_COMPLETE
PILOT_READY
```

Do not claim:

```text
PILOT_COMPLETE
PRODUCTION_LAUNCHED
```

unless a separate explicit future goal actually performs and validates those external actions.

### Phase Boundary / Close Rule

Once all P0–P14 local MUST/MUST NOT/test requirements and the final project completion gate pass, close Phase 14 and end the autonomous local loop normally. Actual pilot work moves to `POST_BUILD_PILOT_PROGRAMME.md`.

---

# Post-Build Pilot Programme — Outside the Autonomous Local Loop

The real client pilot remains important, but it is a separate lifecycle because it may require remote infrastructure mutation, live DNS, real provider credentials, real staff, and elapsed observation time.

Use `POST_BUILD_PILOT_PROGRAMME.md` as the authority for that future explicit goal.

---

# 2. Milestone Gates

I would explicitly track these five gates.

## Gate M0 — Foundation Ready

Must have:

```text
Architecture frozen
Scaffold passes
Design system baseline
Auth/RLS proven
```

Then proceed.

## Gate M1 — Workflow Proven

Must prove:

```text
Bricks
→ Lead
→ Quote
→ SendPulse
→ Follow-up
→ Won
→ Client
```

Then horizontal expansion can safely begin.

## Gate M2 — CRM Complete

Must have:

```text
Leads
Clients
Quotes
Communications
Tasks
Reminders
Dashboard
Reports
```

functionally complete.

## Gate M3 — Production Ready

Must pass:

```text
Security
Backup
Restore
RLS
Concurrency
Idempotency
Regression
Performance
```

## Gate M4 — Local Product / Pilot Ready

Must prove:

```text
Fresh local client provisioning
without architecture changes
+
production build artifact
+
complete local release-candidate validation
+
pilot-readiness package
```

A real client pilot is intentionally outside this local gate.

---

# 3. Dependency Map

```text
P0 Architecture
 │
 ▼
P1 Scaffold
 │
 ▼
P2 Design System
 │
 ▼
P3 Auth + DB + RLS
 │
 ▼
P4 FULL TRACER BULLET
 │
 ├───────────────┐
 ▼               ▼
P5 Leads       P6 Clients
 │               │
 └───────┬───────┘
         ▼
       P7 Quotes
         │
         ▼
 P8 Communications
         │
         ▼
   P9 Automation
         │
         ▼
   P10 Analytics
         │
         ▼
P11 UX / Performance
         │
         ▼
P12 Production Hardening
         │
         ▼
P13 Local Productisation
         │
         ▼
P14 Local RC + Pilot Readiness
```

---

# 4. How Each Phase Should Be Implemented

Every phase should follow the same internal sequence.

```text
1. DB / Migration
      ↓
2. Domain Rules
      ↓
3. Trusted Actions
      ↓
4. RLS / Policies
      ↓
5. Integration Boundary
      ↓
6. Frontend
      ↓
7. Activity / Audit
      ↓
8. Analytics Exposure
      ↓
9. Performance Review
      ↓
10. Tests
      ↓
11. Quality Gate
```

Not every phase will require all eleven layers.

The agent should use only those that apply.

---

# 5. Tracer Bullet → Vertical Slice → Horizontal Expansion

This should become the standard methodology.

For example, Leads:

## Tracer Bullet

```text
Bricks → Lead → Lead screen
```

## Vertical Slice

Add the complete working path:

```text
validation
database
RLS
domain action
UI
activity
tests
```

## Horizontal Expansion

Then harden:

```text
search
filters
assignment
idempotency
analytics
performance
error handling
observability
```

The same approach applies to Quotes:

```text
Create → Send
```

then:

```text
revisions
immutability
PDF
delivery events
expiry
analytics
concurrency
```

---

# 6. What I Would Explicitly Defer Until After v1

Do not allow these into the local v1 roadmap unless the later real pilot explicitly proves they are required:

```text
WhatsApp
SMS
Calendar integration
Invoices
Payments
Accounting
Projects
Customer portal
AI summaries
AI lead scoring
AI quote generation
Workflow builder
Custom fields engine
Multi-tenancy
Mobile app
Offline mode
Redis
Dedicated analytics system
```

Some will eventually be valuable.

None are prerequisites for proving this CRM.

---

# 7. Rough Development Weight

Rather than promising exact days, size phases like this:

| Phase | Weight |
|---|---:|
| P0 Architecture | Small |
| P1 Scaffold | Small |
| P2 Design system | Medium |
| P3 Auth/DB/RLS | Medium |
| **P4 Tracer bullet** | **Large** |
| P5 Leads | Medium |
| P6 Clients | Small–Medium |
| **P7 Quotes** | **Large** |
| P8 Communications | Medium |
| P9 Automation | Medium |
| P10 Analytics | Medium |
| P11 UX/performance | Medium |
| **P12 Hardening** | **Large** |
| P13 Local productisation | Medium |
| P14 Local release candidate | Medium–Large |

The technically hardest areas are likely:

```text
RLS/security
quote immutability/revisions
external-email reliability
idempotency
concurrency
backup/recovery
```

Not the CRUD screens.

---

# 8. Recommended Branch / PR Strategy

One phase should **not** equal one massive PR.

Use:

```text
Phase
  ↓
Sub-phase
  ↓
Small focused PR
```

For example:

```text
Phase 7 — Quotes

P7.1 Quote schema
P7.2 Quote domain actions
P7.3 Quote item calculations
P7.4 Quote numbering
P7.5 Quote editor
P7.6 Quote preview
P7.7 Quote revision
P7.8 Quote hardening
```

Each can independently pass its quality gates.

---

# 9. Global Agent Tool Policy

Default:

```text
filesystem
shell
git
```

Add:

```text
Supabase CLI
```

only when the task actually touches Supabase.

Add:

```text
browser
```

only for real UI/end-to-end verification.

Use provider/API access only when actually working on that integration.

Do **not** let the agent freely explore unrelated tools or services.

---

# 10. Global STOP Conditions

Every phase and sub-phase should inherit these.

**STOP immediately if:**

1. a destructive migration has uncertain data impact;
2. RLS behaviour is unclear;
3. a secret could leak into browser code;
4. sent Quote history could become mutable;
5. duplicate webhook processing can create duplicate records;
6. conversion is not idempotent;
7. concurrent edits can silently overwrite data;
8. the requested task requires changing the frozen domain model;
9. an unapproved infrastructure dependency becomes necessary;
10. a phase starts expanding into functionality allocated to a later phase.

And the positive stop condition is:

> **Once the requested phase outcome works, focused tests pass, project quality gates pass, migrations are clean, and no unrelated scope was introduced, PHASE CLOSE: persist the handoff and advance automatically. Execution stops only for a genuine `AGENTS.md` blocker or final local project completion.**

---

# 11. Recommended Final Roadmap

```text
M0 — FOUNDATION
├── P0 Architecture Freeze
├── P1 Scaffold & Quality
├── P2 Design System
└── P3 Auth / DB / RLS

M1 — PROVE THE BUSINESS FLOW
└── P4 End-to-End Tracer Bullet

M2 — BUILD THE PRODUCTION CRM
├── P5 Lead Management
├── P6 Clients & Conversion
├── P7 Quotes
├── P8 Communications
├── P9 Tasks & Automation
└── P10 Dashboard & Analytics

M3 — HARDEN
├── P11 UX / Realtime / Performance
└── P12 Security / Backup / Operations

M4 — TURN IT INTO A PRODUCT
├── P13 Reusable Client Template & Local Deployment Readiness
└── P14 Local Release Candidate & Pilot Readiness
```

---

# 12. Planning Rule for the Next Step

Freeze this roadmap before implementation.

The next planning layer should be:

```text
Phase 0
  ↓
Explicit sub-phases
  ↓
Outcome definitions
  ↓
Granular coding-agent TOON prompts
```

Only after Phase 0 is fully defined and completed should the same process be repeated for Phase 1.

This avoids prematurely generating hundreds of implementation prompts while the architecture is still being refined.
