# Phase 4 — Complete CRM Tracer Bullet

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 4  
**Milestone:** M1 — Workflow Proof  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Prove the complete business path end-to-end using the permanent architecture and real local integration boundaries: canonical Bricks-compatible authenticated request → Lead → qualification → simple Quote → SendPulse adapter/provider-contract success → follow-up Task → Won/Client, plus the Lost path. Real remote Bricks/SendPulse smoke tests are supplemental when approved test infrastructure exists, not mandatory for local phase closure.

# Preconditions

Phases 0–3 are closed. Authentication, RLS, schema foundations, shell, and quality gates are stable.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Receive a canonical Bricks-compatible authenticated request through the real local trusted webhook boundary; use a real local WordPress/Bricks instance additionally if one already exists.
- Create exactly one Lead from a valid submission and append `lead_created` Activity.
- Show the Lead in the authenticated CRM list and detail screen.
- Allow the Lead to move through the minimum legal qualification path.
- Create the simplest real Quote using the permanent Quote resource rather than a throwaway mock.
- Send the quote through the real SendPulse adapter/integration boundary using deterministic provider-contract responses; perform a real approved test send additionally if credentials are available.
- Create a follow-up Task after successful quote sending.
- Set the Lead to Decision / waiting_on_client after send.
- Allow the Lead to be marked Won through the real conversion boundary and create/link a Client.
- Implement the alternative Lost path with a mandatory reason.
- Append minimum Activity events for every major state change.
- Verify the entire path in one end-to-end run.

# MUST NOT Happen

- Do not fully polish Leads, Quotes, documents, analytics, or reminders yet.
- Do not replace the SendPulse adapter with a fake application path. Deterministic provider fixtures/mocks must exercise the real adapter contract; a real remote smoke test is supplemental unless the `/goal` explicitly authorizes/requires it.
- Do not bypass RLS or trusted-action rules just to complete the flow.
- Do not duplicate Lead/Client/Quote models that will later be replaced.
- Do not build advanced quote revisions, rich PDF templates, dashboards, or marketing attribution yet.
- Do not allow webhook retries to create duplicate Leads.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P4.1 Bricks Intake Thin Slice** | Authenticated webhook creates one Lead and Activity. |
| **P4.2 Lead Thin UI** | Authenticated list/detail and minimum stage transition. |
| **P4.3 Quote Thin Slice** | Create a real minimal Quote and item. |
| **P4.4 SendPulse Thin Slice** | Send the quote through trusted provider integration. |
| **P4.5 Follow-up Thin Slice** | Create one real follow-up Task and attention-state update. |
| **P4.6 Win/Loss Thin Slice** | Prove conversion to Client and mandatory Lost reason. |
| **P4.7 Full E2E Gate** | Run the complete business journey without manual DB edits. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P4-T01` | Bricks happy path | Integration | One valid canonical Bricks-compatible authenticated request through the real local ingestion function creates exactly one Lead and one lead-created activity. |
| `P4-T02` | Bricks retry | Integration | Replaying the same submission identifier does not create a second Lead. |
| `P4-T03` | Authenticated visibility | Browser | Authorized staff can see/open the new Lead; anonymous access remains denied. |
| `P4-T04` | Minimum stage path | Domain/browser | Lead can move only through legal tracer-bullet transitions. |
| `P4-T05` | Quote creation | Domain/browser | A real Quote and line item persist and are linked to the Lead. |
| `P4-T06` | SendPulse adapter contract | Integration | A test Quote sent through the real SendPulse adapter against deterministic provider-contract responses stores the provider acknowledgement/message ID and correct Submitted state; optional approved real test send may supplement this. |
| `P4-T07` | Follow-up creation | Domain | Successful send creates exactly one expected follow-up Task and waiting state. |
| `P4-T08` | Won conversion | E2E | Winning the Lead creates/links exactly one Client and records conversion Activity. |
| `P4-T09` | Lost validation | Domain/browser | Lost transition is rejected without a LostReason and succeeds with one. |
| `P4-T10` | Complete tracer bullet | Browser/E2E | Canonical Bricks-compatible intake → Lead → Quote → SendPulse adapter-contract success → Task → Won → Client completes without direct DB manipulation. |
| `P4-T11` | Project quality gate | Automated | All existing checks and focused tests pass. |

# Definition of Done

- The complete commercial workflow has been proven on the chosen architecture.
- All major internal boundaries and external-provider contracts have been exercised once; real remote smoke tests remain supplemental unless explicitly authorized.
- No module is yet overbuilt.

# Handoff to Next Phase

Phase 5 begins horizontal hardening of Lead Management while preserving the proven tracer-bullet path.

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
