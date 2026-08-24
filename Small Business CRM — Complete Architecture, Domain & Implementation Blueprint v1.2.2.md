# Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.2

**Amendment:** Patch-level v1.2.2 to the frozen v1.2.1 blueprint
**Base:** `Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.1.md`
**Execution authority:** `CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md` and the frozen P14 hardening authority

This document is an additive architecture amendment. The v1.2.1 blueprint
remains historical context; the following decisions are now canonical for the
P14 release candidate.

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

PostgreSQL owns lifecycle transitions, relationship invariants, role checks,
optimistic concurrency, exact money, idempotency, cross-resource transactions,
append-only Activity, quote snapshots, provider uncertainty, conversion, Task
integrity, and Client lifecycle. TypeScript owns request parsing, UI
orchestration, display projections, provider adapters, local PDF rendering,
email composition, and pure deterministic helpers. TypeScript domain classes
must not mirror database rows or compete with SQL authority.

## Client and ClientContact

Client creation remains conversion-only through `convert_lead`. Client status
law is `active ↔ inactive`; Owner/Admin may archive active/inactive Clients with
a reason only when no open Task or non-terminal Quote exists through either the
Client or its `source_lead_id` lineage. Restore is `archived → inactive` with a
reason. Client and ClientContact writes use positive optimistic `lock_version`
values. ClientContact status is `active ↔ inactive`, no ordinary hard delete is
available, and an inactive contact cannot be primary.

## Product surfaces and documents

Dashboard is the v1 reporting surface; the separate Reports and Settings menu
capabilities are removed. `/system` is a private local/test Component Lab and
returns 404 unless explicitly enabled. Quote documents use frozen snapshot
branding, deterministic local multi-page rendering, private Storage, and
recorded hashes. Customer-facing email requires configured sender identity and
attaches the exact frozen PDF.

## Trusted mutation parity

Every trusted-only business operation is tested against the fully migrated
Data API boundary. Ordinary authenticated direct inserts, patches, and deletes
cannot bypass Client conversion, Client/Contact lifecycle, Task relationship or
lifecycle, Lead pipeline, Quote lifecycle/commercial, Activity, or outbound
communication authority. Useful RLS-secured reads remain available.
