# Phase 6 — Client & Contact Domain

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 6  
**Milestone:** M2 — Production CRM Core  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Create a durable customer model and make Lead → Client conversion atomic, idempotent, auditable, and safe from duplicate or partial customer creation.

# Preconditions

Lead Management is hardened and Phase 5 tests pass.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Complete Client schema for individual/company types, identity, tax/registration, billing address, status, and source Lead.
- Implement ClientContact with primary-contact semantics and multiple contacts.
- Implement a single trusted `convertLead` operation.
- Perform conversion atomically: validate Lead, find/create Client, create/link primary contact, link Lead, mark Won, close obsolete Tasks, append Activity.
- Make conversion idempotent across retries and repeated clicks.
- Define and enforce duplicate-detection strategy without incorrectly collapsing distinct people/businesses.
- Implement Client list/detail minimum production UI.
- Preserve original Lead history after conversion.

- Enforce Client as account/customer aggregate and ClientContact as canonical person-level contact for company Clients; Client email/phone remains the account/general channel.
- Enforce at most one primary active ClientContact per Client and deterministic promotion/replacement behavior.
- On conversion/linking, populate eligible Quote `client_id` only through the trusted operation while preserving immutable originating `lead_id`; never rewrite quote lineage.

# MUST NOT Happen

- Do not create a Client for every incoming website submission.
- Do not use email alone as a universal unique Client identity.
- Do not allow partially converted state if any conversion step fails.
- Do not delete or rewrite the source Lead after conversion.
- Do not add accounting, projects, invoices, subscriptions, or customer portals.
- Do not silently merge Clients based on weak heuristics.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P6.1 Client Schema** | Complete individual/company client fields and status rules. |
| **P6.2 Contact Schema** | Implement contacts and primary-contact invariant. |
| **P6.3 Conversion Transaction** | Implement atomic idempotent Lead conversion. |
| **P6.4 Duplicate Strategy** | Define exact safe matching/selection rules. |
| **P6.5 Client UI** | List/detail and source Lead history links. |
| **P6.6 Conversion Audit** | Ensure Activities and task closure are deterministic. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P6-T01` | Individual conversion | Domain/E2E | Eligible Lead converts to exactly one individual Client with expected contact data. |
| `P6-T02` | Company conversion | Domain/E2E | Company Lead converts to one company Client and a primary ClientContact. |
| `P6-T03` | Conversion retry | Domain | Running conversion twice returns/reuses the same result and creates no duplicate Client/contact. |
| `P6-T04` | Atomic rollback | DB/domain | Forced failure mid-conversion leaves Lead, Client, Contact, Tasks, and Activity in the pre-conversion consistent state. |
| `P6-T05` | Primary contact invariant | DB | A Client cannot end with conflicting primary-contact state beyond the documented rule. |
| `P6-T06` | Unauthorized conversion | RLS/domain | Viewer/unauthorized users cannot convert Leads. |
| `P6-T07` | Historical preservation | E2E | Converted Client links back to original Lead and original Lead Activity remains intact. |
| `P6-T08` | No email-only dedupe | Domain | Distinct legitimate customers sharing an email pattern are not merged solely because of email. |
| `P6-T09` | Project quality gate | Automated | All prior tests and tracer-bullet flow still pass. |
| `P6-T10` | Contact authority | Domain/DB | Company Client person-level email/phone is resolved from ClientContact while account/general channels remain on Client with no ambiguous silent overwrite. |
| `P6-T11` | Primary contact uniqueness | DB/concurrency | Concurrent attempts cannot leave more than one primary active ClientContact for one Client. |
| `P6-T12` | Quote association on conversion | Domain/DB | Conversion may populate eligible Quote `client_id` exactly once while every existing Quote keeps its original `lead_id`. |

# Definition of Done

- Lead and Client meanings are distinct and enforced.
- Conversion cannot create duplicate or partial customer state.
- Client/contact history remains traceable to the opportunity.

# Handoff to Next Phase

Phase 7 may fully harden the Quote domain against the stable Lead/Client model.

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
