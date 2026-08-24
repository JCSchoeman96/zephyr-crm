# Phase 5 — Lead Management Hardening

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 5  
**Milestone:** M2 — Production CRM Core  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Turn the thin Lead slice into a production-worthy opportunity-management domain with robust intake, search, filtering, assignment, state transitions, attention handling, lost/reopen rules, activity history, idempotency, and bounded query performance.

# Preconditions

The Phase 4 tracer bullet passes end-to-end.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Complete Lead fields including source, attribution, contact details, ownership, stage, attention, lost metadata, conversion link, and last activity.
- Fully enforce the Lead pipeline state machine.
- Fully implement `attention_state` strictly as `none`, `waiting_on_client`, or `waiting_on_us`, independently from pipeline stage and from Task scheduling.
- Implement pausing orthogonally with `paused_at`, required `pause_reason`, optional `resume_at`, trusted pause/resume transitions, and Activity; pausing must not overwrite meaningful attention ownership.
- Implement lost reason requirements and controlled reopen action.
- Harden Bricks intake with Turnstile/honeypot production configuration, JSON payloads, a long random Bearer secret, strict POST/content-type, bounded body size, rate limiting, known form-ID checks, mandatory submission UUID idempotency, explicit unknown-field/schema policy, normalisation, minimal inbound submission recording, and deterministic failure handling.
- Bricks saved submissions are not CRM truth; if enabled as a temporary failure spool, restrict access and define short retention. Otherwise document the chosen retry/failure-spool alternative.
- Implement paginated Lead list, search, filters, sorting, assignment, and deterministic empty/loading/error states.
- Implement Lead detail Overview/Quotes/Tasks/Activity navigation.
- Update last activity consistently through trusted domain actions.
- Add or verify indexes for stage, attention, owner, created time, last activity, and external submission ID.
- Preserve Activity history for material Lead changes.

- Preserve contact phone display text and store separately normalised E.164 form when validly determinable; ambiguous numbers must not receive invented country codes.
- Derive follow-up/overdue projections from Tasks rather than persisting `follow_up_scheduled` or `overdue` on Lead.

# MUST NOT Happen

- Do not use email address as an idempotency key or rely on Turnstile/honeypot alone as API authentication.
- Do not accept arbitrary form IDs, content types, unbounded request bodies, or unknown payload fields without the frozen policy.
- Do not retain full raw Bricks payloads indefinitely merely for debugging.

- Do not use email address as webhook idempotency key.
- Do not encode overdue/follow-up due as permanent Lead statuses.
- Do not hard-delete Leads in normal workflow.
- Do not implement quote hardening or communication features allocated to later phases.
- Do not load an unbounded Lead table into the browser.
- Do not weaken RLS for search/filter convenience.
- Do not add Redis for Lead lists.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P5.1 Lead Resource Completion** | Add production fields, constraints, and indexes. |
| **P5.2 Intake Hardening** | Validate, normalize, authenticate, deduplicate, record inbound submissions. |
| **P5.3 Pipeline Actions** | Enforce legal transitions, loss, pause, reopen, assignment. |
| **P5.4 Lead List** | Paginated search/filter/sort with bounded queries. |
| **P5.5 Lead Detail** | Operational overview with tasks/quotes/activity links. |
| **P5.6 Activity Integrity** | Ensure material actions append consistent events. |
| **P5.7 Lead Performance Review** | Inspect indexes/query plans for critical list/detail paths. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P5-T01` | Pipeline transition matrix | Domain/DB | Every allowed transition succeeds and every illegal transition is rejected. |
| `P5-T02` | Attention independence | Domain | Waiting/attention can change without corrupting pipeline stage. |
| `P5-T03` | Lost reason requirement | Domain/DB | Lost requires configured reason; `other` requires notes if frozen rule specifies it. |
| `P5-T04` | Reopen control | Domain/RLS | Only authorized roles can reopen and an activity record is appended. |
| `P5-T05` | Webhook schema validation | Integration | Malformed/oversized/unrecognized form submissions are rejected safely. |
| `P5-T06` | Webhook idempotency | Integration | Same external submission ID produces one Lead and one accepted inbound record. |
| `P5-T07` | Repeated human enquiry | Integration | Two distinct submission IDs with the same email may create two legitimate Leads. |
| `P5-T08` | Pagination | Browser/API | Lead list never fetches the entire dataset and page boundaries are stable. |
| `P5-T09` | Search/filter correctness | Browser/API | Filters return only matching authorized records and can be combined. |
| `P5-T10` | Assignment authorization | RLS/domain | Only permitted users can change ownership. |
| `P5-T11` | Lead concurrency | Domain | A stale Lead update is rejected rather than silently overwriting newer data. |
| `P5-T12` | Index/query review | DB | Critical list/detail queries use appropriate indexes at representative data volume. |
| `P5-T13` | Project quality gate | Automated | All full-project gates and prior tracer-bullet E2E continue to pass. |
| `P5-T14` | Attention/pause orthogonality | Domain/DB | A Lead can be waiting_on_client while paused or while a future follow-up Task exists; no follow-up/overdue value is persisted in `attention_state`. |
| `P5-T15` | Phone normalisation | Unit/domain | Valid fixture numbers normalise to expected E.164 while original display values are preserved; ambiguous input remains un-invented. |
| `P5-T16` | Bricks boundary hardening | Integration/security | Wrong method/content type/secret/form ID, oversized body, malformed/unknown-field payload and duplicate UUID cases follow the frozen rejection/idempotency policy; valid canonical JSON creates one Lead. |

# Definition of Done

- Lead intake is retry-safe and production-worthy.
- Staff can efficiently find, assign, manage, pause, lose, and reopen Leads.
- No active opportunity status is inferred from a fragile overloaded field.

# Handoff to Next Phase

Phase 6 may harden Client/Contact and conversion semantics without changing the frozen Lead lifecycle.

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
