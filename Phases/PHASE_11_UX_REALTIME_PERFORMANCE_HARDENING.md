# Phase 11 — UX, Realtime & Performance Hardening

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.1
**Phase:** 11  
**Milestone:** M3 — Production Hardening  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Polish the proven CRM for daily use: selective realtime updates, conflict UX, bounded loading, accessibility, responsive behavior, and measured performance without introducing infrastructure designed for a vastly larger system.

# Preconditions

All core CRM workflows and analytics are functionally complete.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Keep Supabase Realtime feature-driven: enable it only where a measured/tested UX requirement justifies it; persisted PostgreSQL state remains authoritative.

- Measure critical UI/query paths before optimizing.
- Use Supabase Realtime only where immediate cross-user updates materially help: new Leads, active Lead changes, Task changes, Quote status, attention counts.
- Ensure Realtime subscriptions remain subject to RLS.
- Implement user-visible optimistic-concurrency conflict handling.
- Paginate/bound every potentially large list and activity stream.
- Use short-lived in-memory/browser query caching only where justified.
- Keep CRM PII out of localStorage/IndexedDB unless a later explicit offline requirement is approved.
- Harden responsive behavior across mobile/tablet/desktop.
- Perform keyboard, focus, labels, error, and contrast accessibility pass.
- Set and verify practical performance budgets for typical internal-client usage.

# MUST NOT Happen

- Do not add polling where Realtime/events already solve the need.
- Do not make every table realtime.
- Do not persist whole CRM datasets in browser storage.
- Do not add Redis, Kafka, GenServers, microservices, or a CDN data cache for private CRM data.
- Do not optimize for 100,000 concurrent internal CRM users.
- Do not hide concurrency conflicts by automatically overwriting newer data.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P11.1 Baseline Measurement** | Record current latency/query/render baselines. |
| **P11.2 Bounded Data Loading** | Pagination/virtualization only where measured useful. |
| **P11.3 Realtime Selection** | Add subscriptions only to justified screens. |
| **P11.4 Conflict UX** | Surface stale-edit conflicts clearly. |
| **P11.5 Accessibility Pass** | Keyboard/focus/labels/errors/contrast/responsive. |
| **P11.6 Performance Tuning** | Fix measured bottlenecks with smallest change. |
| **P11.7 Regression Measurement** | Compare final performance to baseline. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P11-T01` | No unbounded lists | Code/API review | All Leads/Clients/Quotes/Tasks/Activities list paths are paginated or otherwise bounded. |
| `P11-T02` | Realtime RLS | Security/integration | Unauthorized user cannot receive protected realtime row data. |
| `P11-T03` | Cross-user update | Browser integration | A permitted change by User B updates a subscribed User A view without polling on selected realtime screens. |
| `P11-T04` | No polling regression | Code review/network test | No high-frequency interval polling exists for realtime-covered state. |
| `P11-T05` | Conflict UX | Browser/concurrency | Stale Lead/Quote save presents a clear conflict and does not overwrite silently. |
| `P11-T06` | Browser storage audit | Static/runtime | No bulk CRM PII is intentionally persisted to localStorage/IndexedDB. |
| `P11-T07` | Responsive smoke | Browser | Critical workflows remain usable at agreed mobile/tablet/desktop widths. |
| `P11-T08` | Accessibility smoke | Browser/a11y | Critical workflows are keyboard-operable and major automated accessibility issues are absent. |
| `P11-T09` | Performance budget | Browser/DB | Critical list/detail/save interactions meet the agreed budget on representative data and network conditions. |
| `P11-T10` | Project quality gate | Automated | All prior functional/security tests remain green. |
| `P11-T11` | Realtime dependency restraint | Static/browser | Realtime is enabled only for explicitly documented features, does not become durable truth, and no global realtime layer is introduced by default. |

# Definition of Done

- The CRM feels immediate for the intended 1–50 user client profile.
- Realtime is selective and secure.
- No speculative high-scale infrastructure was introduced.

# Handoff to Next Phase

Phase 12 may perform production security, backup, recovery, observability, and release hardening.

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
