# Zephyr CRM Architecture

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.2.2 (v1.3.2 hardening amendment)
**Deployment model:** One isolated stack per client

`CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md` and
`docs/FULFILMENT_ARCHITECTURE.md` are the additive v1.4.0 authority for the
Sales-to-Fulfilment extension. The original v1.3.2 boundary remains historical
evidence for P0-P14; the marked v1.4.0 amendment below governs only the new
scope.

## Product boundary

Zephyr CRM is a focused sales-workflow system for small businesses. Its bounded workflow is:

```text
Lead → Qualification → Quote → Follow-up → Won/Lost → Client
```

It receives enquiries, helps staff qualify them, creates and sends quotes, tracks follow-up work, records communication history, and closes opportunities as won or lost. A website enquiry remains a `Lead` until a deliberate commercial conversion creates or links a `Client`.

Zephyr CRM is not a generic CRM, marketing suite, accounting system, ERP, helpdesk, project-management system, customer portal, or multi-tenant SaaS platform.

## Deployment topology

Each client owns or is assigned one complete isolated stack:

```text
one client
  ├── one Cloudflare Workers deployment with Static Assets
  ├── one Supabase project
  │     ├── PostgreSQL
  │     ├── Auth
  │     ├── private Storage
  │     ├── Edge Functions
  │     └── Cron schedules
  └── one SendPulse configuration
```

The client owns the Cloudflare account/project, Supabase project, domains and DNS, SendPulse account, sender-domain authentication, credentials, billing, backups, and offboarding decision. The application repository contains reusable product code and typed client configuration; it does not contain client secrets.

## Runtime topology

The SvelteKit application is built by Vite with the Cloudflare adapter for a Cloudflare Worker backed by Static Assets. Wrangler owns the `wrangler.jsonc` binding and local Worker artifact. The browser uses the Supabase publishable key for ordinary RLS-secured reads and writes. Trusted operations run in Supabase Edge Functions or hardened PostgreSQL functions.

```text
WordPress/Bricks form
        │ authenticated HTTPS request
        ▼
ingest-bricks-lead Edge Function
        │ validate → normalize → idempotently persist
        ▼
Supabase PostgreSQL + Activity
        ▲
        │ RLS-secured browser access
SvelteKit CRM Worker + Static Assets
        │ trusted action request
        ▼
Edge Functions / PostgreSQL domain actions
        │ provider adapter
        ▼
SendPulse transactional API
```

PostgreSQL is the durable business source of truth. Browser state, Realtime messages, provider responses, and generated documents are not authoritative replacements for persisted database state.

## Bounded domains

The product has exactly these domains:

1. Identity & Access
2. Lead Management
3. Client Management
4. Quoting
5. Tasks & Follow-up
6. Communications
7. Activity & Audit
8. Integrations
9. Reporting & Analytics
10. Configuration

Each domain and its canonical resources are defined in `docs/DOMAIN_MODEL.md`. Lifecycle states are defined only in `docs/STATE_MACHINES.md`.

## Access and mutation architecture

All exposed business tables have Row Level Security enabled. Anonymous access is denied. Authenticated access is granted by role and active-user status. Simple editable fields use RLS-secured Data API operations. Business actions that span resources, allocate numbers, use secrets, or establish authoritative state transitions use trusted Edge Functions or hardened PostgreSQL functions.

Trusted domain actions are:

```text
convert_lead
mark_lead_lost
reopen_lead
finalise_quote
send_quote
revise_quote
accept_quote
process_reminders
process_quote_expiry
```

## Database-centric application layering

```text
Canonical Product Law
        ↓
PostgreSQL / trusted domain actions
        ↓
SvelteKit server orchestration
        ↓
Svelte components / browser
```

PostgreSQL remains authoritative for lifecycle transitions, relationship
invariants, role checks, optimistic concurrency, exact money, idempotency,
cross-resource transactions, append-only Activity, quote snapshots, provider
uncertainty, conversion, Task integrity, and Client lifecycle. TypeScript owns
request parsing, UI orchestration, projections, provider adapters, PDF
rendering, email composition, and pure deterministic helpers. TypeScript
domain classes must not mirror database rows or compete with SQL authority.

Dashboard is the v1 reporting surface. Reports and Settings are not separate
v1 capabilities, and `/system` is a private local/test Component Lab disabled
by default. Quote documents render locally from frozen Quote snapshot branding.

Release state has one machine authority; human readiness is a projection that
must fail closed when it disagrees with the machine state.

The browser may request these actions but never supplies the resulting authority. The server/database validates role, current state, lock version, required relationships, idempotency key, and all authoritative totals.

## Integration boundaries

Integrations are adapters around domain operations:

- Bricks: authenticated lead-intake boundary only.
- SendPulse: transactional email adapter and event boundary only.
- Supabase Auth: invitation-only staff identity.
- Supabase Storage: private quote-document artifacts.
- Supabase Cron: scheduler that invokes trusted processors.

Provider-specific request and response details stay within adapter modules. Core
domain code consumes the logical submission states `pending`, `claimed`,
`submitting`, `submitted`, `failed`, and `submission_unknown`, plus provider
observations such as `delivered` and `bounced`; it does not call provider APIs
directly. An uncertain acknowledgement is reconciled by provider correlation
before any controlled retry.

## Data and document authority

PostgreSQL stores business records, relationships, lifecycle state, activity evidence, idempotency records, provider references, configuration, and document metadata. Private Storage stores generated quote artifacts; the database stores their path, provenance, and cryptographic hash. Sent quote commercial content and snapshots are immutable. SendPulse is authoritative only for provider event observations, not for CRM state transitions.

## Operational invariants

- Pipeline position, attention responsibility, and next task remain separate concepts. Attention is only `none`, `waiting_on_client`, or `waiting_on_us`; pause facts and follow-up Tasks are orthogonal.
- A `Lead` precedes a `Client`; conversion is explicit and transactional.
- Sent `Quote` records are immutable; revisions are new drafts linked to the prior quote.
- Money uses exact decimal/numeric arithmetic and server-authoritative totals. Quantity/unit price/tax scales, line rounding and document aggregation follow `docs/MONEY_CONTRACT.md`.
- External events and retries are idempotent.
- Concurrent writes use optimistic locking and reject stale updates.
- All timestamps are stored in UTC; user-facing interpretation uses configured IANA time zones.
- Activity is append-only evidence for material business actions; privileged corrections also produce durable security audit evidence.
- Private documents are never publicly accessible.

## Deferred scope

The current product deliberately excludes marketing campaigns, mass mailing, inbound mailbox, WhatsApp, SMS, telephone integration, accounting, payments, invoices, subscriptions, project management, AI agents, workflow builders, arbitrary custom fields, public customer portals, electronic signatures, advanced document generation, and multi-company SaaS tenancy. These are future product decisions, not hidden current requirements.

## Authority rule

This document describes structure and boundaries. Resource definitions belong in `docs/DOMAIN_MODEL.md`, states and transitions belong in `docs/STATE_MACHINES.md`, security rules belong in `docs/SECURITY_MODEL.md`, and phase sequence belongs in `docs/ROADMAP.md`. If implementation code appears to conflict with these documents, the frozen authority documents take precedence until a formally authorized change is recorded. The v1.4.0 additive boundary authority is the formally recorded change for the Sales-to-Fulfilment extension.

## v1.4.0 additive Sales-to-Fulfilment boundary

The v1.4.0 extension changes the product boundary at one event:

```text
Quote accepted
─────────────── Sales ends / Fulfilment begins ───────────────
```

Sales still owns the Lead and the immutable accepted Quote. The trusted
acceptance action also creates or links the Client and creates exactly one
`FulfilmentCase` for that accepted Quote. A Client is a long-lived customer
record; a FulfilmentCase is one accepted sale. One Client may therefore have
many FulfilmentCases over time.

Fulfilment tracks manual operational evidence through independent
`FulfilmentStep` records and `PaymentMilestone` records. A payment milestone
means that an authorised user recorded a business fact. It does not mean that
Zephyr processed a payment, reconciled a bank transaction, posted a ledger,
calculated VAT, or issued an invoice.

The additive domain is:

```text
Profile
  └──< Lead
       ├──< Quote ──< QuoteItem
       ├──< Task
       ├──< Activity
       └──> Client ──< ClientContact
                    └──< FulfilmentCase
                         ├──< FulfilmentStep
                         ├──< PaymentMilestone
                         ├──< Task
                         └──< Activity
```

For v1.4.0, Fulfilment is an additional bounded domain. It owns
FulfilmentCase, FulfilmentStep, and PaymentMilestone records and consumes the
accepted Quote and Client lineage. It does not own commercial pricing,
customer identity, accounting, inventory, or provider logistics.

The complete v1.4.0 boundary, state, security, metric, and route definitions
are in `docs/FULFILMENT_ARCHITECTURE.md`. It explicitly supersedes the old
"ends at Client" and "payments deferred" wording for this additive roadmap
only. It does not add Redis, queues, microservices, inventory, logistics
provider integrations, payment gateways, accounting, or multi-client tenancy.

## v1.5.0 additive Product Catalogue and Quote Document boundary

The v1.5.0 extension preserves the v1.4.0 Sales-to-Fulfilment boundary and
adds one catalogue-to-quote preparation boundary:

```text
Product Catalogue
      │ server-side selection while Quote is draft
      ▼
QuoteItem commercial snapshot
      ▼
ready Quote → canonical presentation model
      ├── responsive browser preview
      └── professional A4 PDF → private immutable Storage → SendPulse
```

Products are catalogue authority only. They are never live dependencies of a
final Quote. Product price, description, taxable flag, category, kind, and
lifecycle changes do not cascade into QuoteItems. A QuoteItem contains its own
commercial snapshot, and existing custom Quote lines remain legal.

The additive resources, fields, lifecycle, and snapshot contract are defined
in `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md` and
`docs/DOMAIN_MODEL.md`. Product persistence and state changes remain
PostgreSQL/trusted-action authority; SvelteKit only orchestrates authorized
requests and projects server-owned data.

The document boundary is also additive. The server builds one
`QuotePresentationModel` from frozen Quote data, QuoteItems, seller/recipient
snapshots, branding, terms, and bank details. `QuoteDocumentPreview.svelte`
and the versioned `pdf-lib` Template v2 consume that same model. Neither the
browser preview nor the renderer calculates authoritative money or reads
current Product values. Internal Product notes, source-review metadata,
private Storage paths, and secrets are excluded from the model.

Template v2 is fixed A4 portrait with safe wrapping, repeated table headers,
multi-page flow, Unicode-capable customer text, deterministic PDF bytes,
explicit template/generator provenance, and a SHA-256 matching the private
stored artifact. Existing stored PDFs are immutable and are never regenerated
in place. SendPulse remains the only provider boundary and the attached PDF
remains commercial authority.

P21-P26 are the strict additive sequence defined by
`CRM_IMPLEMENTATION_ROADMAP_v1.5.0.md`. v1.5.0 adds no inventory, ERP, price
books, FX, Redis, Browser Rendering, public quote portal, electronic
signature, online payment, or multi-company tenancy.
