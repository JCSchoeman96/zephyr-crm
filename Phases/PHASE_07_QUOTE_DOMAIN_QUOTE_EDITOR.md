# Phase 7 — Quote Domain & Quote Editor

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 7  
**Milestone:** M2 — Production CRM Core  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Make quoting commercially trustworthy: exact money arithmetic, concurrency-safe numbering, explicit state transitions, immutable sent snapshots, revisions, validation, and a production-capable editor/preview.

# Preconditions

Lead and Client domains are stable. The thin quote path from Phase 4 still passes.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Complete Quote and QuoteItem schemas.
- Use PostgreSQL `numeric`/decimal semantics for all money fields.
- Implement authoritative totals outside the browser-only preview.
- Implement concurrency-safe quote number allocation.
- Implement revision numbering and `supersedes_quote_id` relationship.
- Fully enforce Quote state machine: draft → ready → sent → accepted/declined/expired/cancelled/superseded.
- Make sent Quotes immutable through normal writes.
- Implement trusted revision action that clones a sent Quote into a new Draft.
- Snapshot relevant terms/tax/company text used for the quote.
- Build Quote editor, line items, totals, validation, preview, and read-only sent view.
- Add optimistic concurrency handling to editing.

- Implement the Phase 0 Money Contract exactly: numeric scales, supported currency precision, ROUND_HALF_UP, line-before-document rounding, non-negative v1 amounts, and server/database-authoritative totals.
- Freeze immutable seller, recipient and commercial snapshots at finalisation/send so sent history does not depend on mutable Lead/Client/Contact data.
- Store document template/generator versions and artifact identity fields required by Phase 8.
- Enforce Quote association: originating `lead_id` is mandatory/immutable; `client_id` is nullable until a trusted conversion/link action.
- Record Quote acceptance with `accepted_at`, recorded actor, `acceptance_source`, and optional evidence/note through a trusted transition.

# MUST NOT Happen

- Do not use floating point for currency.
- Do not allocate quote numbers using browser-side `MAX + 1` logic.
- Do not mutate a sent Quote in place.
- Do not let changing app settings rewrite historical Quote terms/tax/company data.
- Do not implement public customer acceptance portal yet.
- Do not mark a Quote delivered based on Quote-domain state alone.
- Do not bypass trusted actions for state transitions.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P7.1 Quote Schema Completion** | Money, revision, snapshot, validity, lifecycle fields. |
| **P7.2 Money & Totals** | Authoritative subtotal/tax/total calculation and validation. |
| **P7.3 Number Allocation** | Concurrency-safe base and revision numbering. |
| **P7.4 State Actions** | Ready/send eligibility/accept/decline/cancel/expire/supersede. |
| **P7.5 Immutability** | Block ordinary mutation after sent. |
| **P7.6 Revision Action** | Clone sent snapshot into new Draft and supersede appropriately. |
| **P7.7 Quote Editor** | Production UI with line-item controls, preview, validation, conflict UX. |
| **P7.8 Quote Performance/Integrity Review** | Indexes, bounded item loading, concurrency tests. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P7-T01` | Money precision | Unit/DB | Representative decimal quantities/prices/tax values produce exact expected totals with no float drift. |
| `P7-T02` | Server authority | Domain | Tampered client-provided totals are ignored/rejected and authoritative totals are persisted. |
| `P7-T03` | Concurrent numbering | DB/concurrency | Parallel quote creation never produces duplicate quote numbers. |
| `P7-T04` | State matrix | Domain | Allowed Quote transitions succeed; illegal transitions fail. |
| `P7-T05` | Ready validation | Domain | Quote cannot become Ready/Sent without all required commercial data and at least one valid item. |
| `P7-T06` | Sent immutability | DB/domain/API | Ordinary updates to sent commercial content are rejected. |
| `P7-T07` | Revision cloning | Domain | Revision copies the correct snapshot/items into a new Draft with correct revision number and source linkage. |
| `P7-T08` | Historical settings snapshot | Domain | Changing current tax/terms/settings does not alter an already-sent Quote. |
| `P7-T09` | Optimistic conflict | Browser/domain | Stale Quote edits are rejected with visible conflict handling. |
| `P7-T10` | Quote list/detail indexes | DB | Critical Quote lookups use expected indexes. |
| `P7-T11` | Project quality gate | Automated | All prior CRM tests and full E2E remain green. |
| `P7-T12` | Decimal edge cases | Unit/DB | Fractional quantity/unit-price/tax fixtures reproduce the frozen ROUND_HALF_UP and line/document aggregation contract exactly. |
| `P7-T13` | Negative money rejection | DB/domain | Negative v1 quantity/price/tax/amount states are rejected; zero-value behavior follows the frozen contract. |
| `P7-T14` | Snapshot historical integrity | Domain/DB | After finalisation, changing Lead/Client/Contact/settings cannot change stored seller/recipient/commercial snapshot values on the sent revision. |
| `P7-T15` | Quote association integrity | DB/domain | Existing Quote `lead_id` cannot be reassigned; only trusted linking/conversion can populate permitted `client_id`. |
| `P7-T16` | Acceptance evidence | Domain | Accepted Quote records timestamp, authorised recorder/source and optional evidence/note; direct generic status mutation is denied. |

# Definition of Done

- A sent Quote is a durable commercial snapshot.
- Money and numbering are concurrency-safe.
- Revisions preserve complete history rather than overwriting it.

# Handoff to Next Phase

Phase 8 may generate immutable documents and harden SendPulse communications around this trusted Quote lifecycle.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] The AGENTS.md-required regression tier for this phase passes; completed-phase tests remain frozen and none were weakened, skipped, or removed merely to make this phase pass.
- [ ] Project-wide format/lint/type/test/build/database/diff gates pass.
- [ ] Migrations are deterministic and clean where applicable.
- [ ] Security/RLS assumptions are test-backed where applicable.
- [ ] No secrets are exposed.
- [ ] No unrelated feature scope was introduced.
- [ ] Git diff is reviewable and limited to this phase's outcomes.
- [ ] Phase documentation is updated to match the implemented truth.

# Global Rules Inherited by This Phase

The following rules apply to every phase:

1. **One codebase, isolated client deployments.**
2. **PostgreSQL is the durable source of truth.**
3. **RLS is mandatory for exposed business data.**
4. **Secrets must never enter browser code or public environment variables.**
5. **Sent quotes are immutable.**
6. **External integrations must be retry-safe and idempotent.**
7. **Do not introduce Redis, microservices, Kafka, background infrastructure, or a separate analytics system unless a measured requirement proves they are necessary.**
8. **Use the smallest number of tools and dependencies necessary.**
9. **Do not implement functionality allocated to a later phase.**
10. **Regression coverage is cumulative, but cadence is tiered: focused/affected + phase/core regression at each phase close; all completed-phase mandatory tests at milestone gates; the complete suite at Phase 14/final release. Completed tests are never weakened or deleted merely to obtain green status.**
11. **`DEPENDENCY_BASELINE_v1.0.0.md` is binding: do not change the approved package manager, framework/build/UI/platform/test responsibilities or introduce unapproved dependencies merely for convenience.**
12. **Once Phase 1 freezes exact pins, package/toolchain upgrades must follow the dependency governance and regression policy rather than floating semver drift.**

# Standard Agent Tool Policy

Use only the tools required by the current task.

**Default tools**
- filesystem read/write
- shell
- git

**Add only when required**
- Supabase CLI for schema, migrations, Edge Functions, Auth/RLS, or database tests
- browser for UI or end-to-end verification
- SendPulse/API access only for the communication integration phase and explicit end-to-end verification
- WordPress/Bricks access only for webhook integration verification

Do not browse, install dependencies, or call external services merely because they are available.

# Global Execution STOP Conditions

Execution may stop only under a genuine `AGENTS.md` **EXECUTION STOP** condition. Ordinary test/build/lint/migration failures, phase completion, or reaching this phase's scope boundary are not execution stops; diagnose/repair or close the phase as defined by `AGENTS.md`.

# Phase Close Condition

Once all required outcomes in this document are implemented, every mandatory phase test passes, the AGENTS.md-required phase regression tier passes, the project-wide quality gate passes, migrations are clean, and no unrelated scope was introduced:

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to the next dependency-valid phase.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`. Do not “improve” adjacent systems before advancing.

---
