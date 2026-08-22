# Phase 10 — Dashboard & Analytics

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.1
**Phase:** 10  
**Milestone:** M2 — Production CRM Core  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Provide trustworthy operational and management visibility using bounded PostgreSQL queries/views so staff immediately know what needs attention and management can reconcile pipeline, conversion, quote value, loss reasons, and attribution.

# Preconditions

Operational domains and terminal-state semantics are stable through Phase 9.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Build an operational dashboard centered on Needs Attention rather than decorative charts.
- Show new Leads, overdue Tasks, due-today work, waiting_on_us, waiting_on_client, and expiring Quotes.
- Implement sales KPIs: Leads, Quotes sent, quote value, accepted value, Won/Lost counts, conversion rate, pipeline value.
- Implement Lost reason analysis.
- Implement lead-source and UTM attribution metrics using already captured data.
- Use SQL views/aggregate queries and bounded date ranges. Any SQL view exposed through the Supabase Data API must use `security_invoker=true`; otherwise reporting must sit behind an explicitly secured trusted RPC/function boundary with equivalent authorization.
- Implement the frozen Phase 0 `METRICS_CONTRACT.md` exactly so management numbers are reproducible; dashboard code may not redefine denominator, date basis, revision selection, attribution snapshot, or monetary source.
- Add only indexes required by measured report/query paths.
- Ensure report results respect RLS/role permissions.
- Provide deterministic empty-state and date-range behavior.

- Evaluate time-window/business-day metrics using stored UTC instants and the configured IANA client timezone exactly as frozen.
- Use latest active/non-superseded Quote revision rules from the metrics contract; never sum historical revisions as independent pipeline opportunities.

# MUST NOT Happen

- Do not load all CRM rows into the browser and aggregate there.
- Do not introduce a dedicated analytics database.
- Do not introduce Redis merely for dashboard counts.
- Do not invent vanity metrics with unclear business definitions.
- Do not let dashboard formulas use different definitions than domain states.
- Do not run unbounded full-table scans in ordinary dashboard requests.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P10.1 Metric Contract** | Define formulas and inclusion/exclusion rules. |
| **P10.2 Operational Dashboard Queries** | Needs-attention and daily work projections. |
| **P10.3 Sales KPI Queries** | Pipeline, quote, conversion, Won/Lost. |
| **P10.4 Attribution** | Source/UTM metrics. |
| **P10.5 Lost Analysis** | Reason/value/source breakdown. |
| **P10.6 Dashboard UI** | Cards, tables, filters, bounded charts where useful. |
| **P10.7 Query Performance Review** | Indexes and representative EXPLAIN/query timing. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P10-T01` | Metric reconciliation | DB/domain | Dashboard counts reconcile exactly to known fixture Leads/Quotes/Tasks. |
| `P10-T02` | Conversion rate | Unit/DB | Formula matches documented numerator/denominator across edge cases including zero denominator. |
| `P10-T03` | Pipeline value | DB | Only documented eligible Quote/Lead states contribute. |
| `P10-T04` | Lost analysis | DB | Fixture loss reasons and values aggregate correctly. |
| `P10-T05` | Attribution | DB | UTM/source fixture data maps to expected Lead/Won/value results. |
| `P10-T06` | RLS reporting | Security | Viewer sees permitted aggregates only; anonymous user sees none. |
| `P10-T07` | Bounded query | DB/API | Dashboard/report endpoints use date/limit boundaries and do not return raw unbounded datasets. |
| `P10-T08` | Representative performance | DB | Critical dashboard queries meet the agreed small-client latency budget on representative seeded data. |
| `P10-T09` | Project quality gate | Automated | Full project tests and prior E2E flow remain green. |
| `P10-T10` | Revision-safe value metrics | DB | Superseded/historical revisions are included/excluded exactly according to METRICS_CONTRACT; no double-counting occurs. |
| `P10-T11` | Timezone boundary | DB/domain | Fixtures around local midnight/DST-equivalent timezone offsets fall into the documented business date/window using the configured IANA timezone while stored instants remain UTC. |
| `P10-T12` | Analytics view authorization | DB/API security | Every browser/Data-API reporting view uses security-invoker semantics or an equivalent trusted authorization boundary; aggregate/report access cannot exceed the caller's permitted underlying RLS scope. |

# Definition of Done

- Operational staff can answer 'what must I do today?' immediately.
- Management metrics are defined, testable, and reconcilable to source records.
- No separate analytics infrastructure is required.

# Handoff to Next Phase

Phase 11 may optimize UX, Realtime, accessibility, and measured performance without changing business definitions.

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
