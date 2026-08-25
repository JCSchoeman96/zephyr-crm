# Phase 9 — Tasks, Follow-ups & Automation

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 9  
**Milestone:** M2 — Production CRM Core  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Ensure every active opportunity has an explicit next action or waiting owner, with reliable scheduled processing that cannot duplicate reminders when jobs overlap or retry.

# Preconditions

Lead, Quote, Client, and communication states are stable and fully tested.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Complete Task types and states.
- Create automatic follow-up Task after successful Quote send according to configured rules.
- Update Lead attention to `waiting_on_client` after successful Quote send while deriving follow-up scheduling exclusively from the created Task; never write `follow_up_scheduled` into `attention_state`.
- Implement `has_follow_up`, `next_task_due_at`, and due/overdue derivation from Task state and time rather than permanent Lead statuses. Preserve separate `paused_at`/`pause_reason`/`resume_at` semantics.
- Implement Supabase Cron → `process-reminders` scheduled processing.
- Make reminder processing atomic/claim-safe against overlapping executions.
- Implement new-lead aging, follow-up due, stale opportunity, and quote-expiry rules as explicitly configured.
- Provide staff-visible Tasks view and actionable dashboard projections.
- Record task creation/completion/reschedule/cancellation Activities where material.
- Ensure terminal Won/Lost flows close/cancel obsolete Tasks.
- Preserve the Phase 8 hard-bounce remediation invariant: the current actionable Quote hard bounce yields exactly one open corrective contact-verification Task and `waiting_on_us`; repeated provider events remain idempotent and stale-message bounces cannot overwrite newer attention.

# MUST NOT Happen

- Do not store `overdue` or `follow_up_scheduled` as durable Lead statuses/attention values.
- Do not create duplicate reminder emails or tasks when the scheduler runs twice.
- Do not rely on a browser tab being open for reminders.
- Do not implement arbitrary workflow builders.
- Do not add Redis/ZSET scheduling at this scale.
- Do not auto-close business opportunities merely because a reminder fired.
- Do not silently modify completed Tasks.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P9.1 Task Completion** | Finalize schema, types, due/completed/cancelled semantics. |
| **P9.2 Automatic Follow-up** | Generate next task from Quote send. |
| **P9.3 Reminder Scheduler** | Configure Supabase Cron and trusted processor. |
| **P9.4 Claim/Idempotency** | Make overlapping runs safe. |
| **P9.5 Aging Rules** | New Lead, stale opportunity, quote expiry warnings. |
| **P9.6 Task UI** | List/filter/complete/reschedule/cancel. |
| **P9.7 Terminal Cleanup** | Close obsolete work on Won/Lost. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P9-T01` | Quote follow-up | Domain | Successful Quote send creates exactly one configured follow-up Task. |
| `P9-T02` | Derived overdue | Unit/domain | Open past-due Task appears overdue; completing/rescheduling it removes overdue status without changing Lead pipeline. |
| `P9-T03` | Cron happy path | Integration | Due Task is processed when scheduler invokes the function. |
| `P9-T04` | Overlapping processors | Concurrency | Two simultaneous reminder runs do not send/create duplicate notifications. |
| `P9-T05` | Retry safety | Integration | Retry after partial provider failure follows documented state and does not duplicate completed work. |
| `P9-T06` | Stale opportunity rule | Domain | Configured inactivity threshold identifies the correct active Leads only. |
| `P9-T07` | Quote expiry rule | Domain | Only eligible sent Quotes expire; accepted/declined/cancelled/superseded quotes do not. |
| `P9-T08` | Won/Lost cleanup | Domain | Obsolete open Tasks are closed/cancelled exactly once on terminal Lead transition. |
| `P9-T09` | Task permissions | RLS | Viewer cannot mutate Tasks; permitted staff can manage assigned/allowed Tasks. |
| `P9-T10` | Project quality gate | Automated | All prior tests and complete tracer-bullet journey remain green. |
| `P9-T11` | Follow-up projection | Domain/DB | `has_follow_up` and `next_task_due_at` reflect open Task truth and change correctly on complete/reschedule/cancel without rewriting Lead attention. |

# Definition of Done

- No active Lead can become invisible because a next action was forgotten.
- Scheduled automation runs server-side and is duplicate-safe.
- Attention state and Task due state remain conceptually separate.

# Handoff to Next Phase

Phase 10 may build operational dashboards and analytics from now-stable domain definitions.

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
