# Phase 0 — Architecture & Product Contract

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 0  
**Milestone:** M0 — Foundation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Freeze the product, domain model, state machines, deployment model, security boundaries, integration boundaries, and implementation sequence so later agents build against one stable authority rather than inventing architecture during implementation.

# Preconditions

The high-level CRM blueprint and roadmap exist. No implementation work from later phases should be treated as authoritative until this phase is closed.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Create and/or reconcile `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md`, `docs/SECURITY_MODEL.md`, `docs/MONEY_CONTRACT.md`, `docs/METRICS_CONTRACT.md`, `docs/PRIVACY_OPERATIONS.md`, `docs/RECOVERY_CONTRACT.md`, and `docs/ROADMAP.md`.
- Freeze the product boundary: Lead → Qualification → Quote → Follow-up → Won/Lost → Client.
- Freeze the deployment model: one client = one Cloudflare deployment + one Supabase project + one SendPulse configuration.
- Freeze the technology and dependency-governance contract through `DEPENDENCY_BASELINE_v1.0.0.md`, including Bun/Vite/SvelteKit/Cloudflare/Tailwind/ShadCN/Supabase/SendPulse/test-tool responsibilities and the exact-pin proof process.
- Freeze the domains: Identity & Access, Lead Management, Client Management, Quoting, Tasks & Follow-up, Communications, Activity & Audit, Integrations, Reporting & Analytics, Configuration.
- Freeze Lead pipeline states and legal transitions.
- Freeze Attention states independently from pipeline stage.
- Freeze Quote lifecycle and immutability rules.
- Freeze Task and Outbound Message state machines.
- Define resource ownership and authoritative source of truth for every domain.
- Define which operations are direct RLS-secured CRUD versus trusted database/Edge Function actions.
- Define client ownership/offboarding model for Cloudflare, Supabase, domain, and SendPulse.
- Record explicit deferred scope so future agents cannot quietly add it.

- Freeze the corrected Attention contract: only `none`, `waiting_on_client`, and `waiting_on_us`; follow-up is Task-derived; pause is represented separately by `paused_at`, required `pause_reason`, and optional `resume_at`.
- Freeze exact money precision, currency boundary, calculation order, rounding mode, negative/zero-value rules, and server/database authority.
- Freeze trusted PostgreSQL function security: `SECURITY INVOKER` by default; `SECURITY DEFINER` only for documented necessary elevation, with safe explicit `search_path`, fully qualified objects, internal actor/role/status/domain checks, minimum privilege, and selective EXECUTE grants after revoking inappropriate PUBLIC/default access.
- Freeze server-controlled role/status authority (`auth.users.id` → `profiles.id`; `profiles.role` / `profiles.status`), explicitly prohibit authorization from user-controlled `raw_user_meta_data`, and require invitation-only Auth with public signup disabled.
- Freeze privileged Owner/Admin AAL2 enforcement for user/role administration, integrations/security settings, exceptional reopen/correction, recovery/admin actions and any other action classified privileged by `SECURITY_MODEL`.
- Freeze exposed reporting-view security: browser/Data-API views use `security_invoker=true` or an equivalently secured trusted RPC boundary.
- Freeze complete authority-hash coverage and unexpected-drift stop semantics for the autonomous loop.
- Freeze an explicit field/action mutation matrix separating direct RLS-secured CRUD from trusted database/Edge Function transitions; RLS alone is not sufficient authority for protected columns.
- Freeze Activity append-only semantics plus privileged security/operational audit requirements.
- Freeze Quote seller/recipient/commercial snapshots, acceptance evidence, document template/generator provenance, and immutable association rules.
- Freeze outbound-message logical idempotency, attempt records, `submission_unknown`, provider reconciliation, and controlled retry semantics.
- Freeze Client/ClientContact canonical identity rules, quote Lead/Client association, UTC + IANA timezone semantics, and phone normalisation.
- Freeze exact KPI definitions in `docs/METRICS_CONTRACT.md`.
- Freeze POPIA-oriented privacy operations and full recovery scope across database, Storage artifacts, Auth reconstruction, migrations/configuration, retention and secret-restoration procedure.
- Freeze production Owner/Admin MFA requirement.
- Freeze reproducible toolchain/runtime version policy and authority supersession rules.

# MUST NOT Happen

- Do not scaffold Svelte routes, Supabase tables, Edge Functions, or UI components.
- Do not introduce implementation dependencies.
- Do not design a generic HubSpot replacement.
- Do not introduce multi-tenancy.
- Do not add WhatsApp, accounting, invoicing, AI, workflow builders, project management, or customer portals.
- Do not leave two competing definitions for Lead, Client, Quote, Task, or Activity.
- Do not allow one overloaded `status` field to represent pipeline, waiting state, and work due.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P0.1 Product Contract** | Freeze product purpose, target user, bounded scope, explicit deferred scope. |
| **P0.2 Domain Model** | Define resources, relationships, invariants, ownership, and trusted actions. |
| **P0.3 State Machines** | Define legal states and transitions for Leads, Quotes, Tasks, Users, inbound submissions, and outbound messages. |
| **P0.4 Security Model** | Define Auth, roles, RLS responsibilities, secret boundaries, and privileged actions. |
| **P0.5 Deployment Contract** | Define single-client ownership, environment boundaries, and integration ownership. |
| **P0.6 Cross-Cutting Contracts** | Freeze money, metrics, privacy, recovery, mutation, audit, snapshot, time/identity and integration-reliability law. |
| **P0.7 Roadmap Reconciliation** | Ensure phase ordering and dependencies match the frozen domain model and historical blueprint sequencing is explicitly superseded. |
| **P0.8 Dependency Governance** | Freeze `DEPENDENCY_BASELINE_v1.0.0.md`: approved stack, responsibility split, exact-pin process, upgrade classes, ShadCN ownership, Cloudflare config/date law, and autonomous dependency gate. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P0-T01` | Architecture completeness review | Manual/document test | Every domain, state machine, trusted action boundary, and deployment boundary has exactly one canonical normative definition; summaries/references elsewhere agree with it and no unresolved TODOs remain. |
| `P0-T02` | Cross-document consistency | Document review/search | Lead, Quote, Task, role, and deployment terminology is identical across all authority docs. |
| `P0-T03` | Deferred-scope check | Document review | All known post-v1 items are explicitly marked deferred and do not appear as current requirements. |
| `P0-T04` | No implementation leakage | Git diff review | No production source code, migration, dependency, route, or integration implementation was added in Phase 0. |
| `P0-T05` | Roadmap dependency check | Manual review | No phase depends on functionality scheduled after it. |
| `P0-T06` | Attention separation | Document review | `attention_state` has only none/waiting_on_client/waiting_on_us; follow-up is Task-derived and pause fields are orthogonal everywhere. |
| `P0-T07` | Money contract completeness | Document review | Precision, rounding, currency boundary, calculation order and server/database authority are explicit with no implementation choice left open. |
| `P0-T08` | Mutation/audit contract | Document review | Protected fields/transitions are mapped to trusted actions and Activity ordinary UPDATE/DELETE is prohibited. |
| `P0-T09` | Quote/history contract | Document review | Seller/recipient/commercial snapshots, acceptance evidence, document provenance and quote association rules are explicit. |
| `P0-T10` | Integration uncertainty contract | Document review | Outbound logical idempotency, attempts, `submission_unknown`, reconciliation and controlled retry are explicit. |
| `P0-T11` | Privacy/recovery contract | Document review | POPIA operations and recovery of DB + Storage + Auth reconstruction + schema/config are explicitly covered. |
| `P0-T12` | Metrics/time/identity/toolchain contract | Document review | KPI formulas, UTC/IANA timezone, Client/Contact authority, phone normalisation and reproducible toolchain policy are frozen. |
| `P0-T13` | Dependency baseline authority | Document review | `DEPENDENCY_BASELINE_v1.0.0.md` exists and freezes Bun, Svelte/SvelteKit, Vite, Cloudflare adapter/Wrangler/config, Tailwind/ShadCN/Lucide, Supabase tooling, SendPulse adapter policy, validation, test and quality-tool choices. |
| `P0-T14` | Dependency-governance completeness | Document review | Exact-pin/lockfile law, compatibility-proof procedure, dependency classes, upgrade/security policy, autonomous-addition gate, ShadCN source ownership, state/forms/date/realtime defaults and prohibited drift are explicit. |
| `P0-T15` | Trusted database function security contract | Document review | INVOKER/DEFINER default/elevation rules, safe search-path law, fully qualified object law, actor/role/status/domain checks and selective EXECUTE privilege model are explicitly frozen. |
| `P0-T16` | Authorization/MFA assurance contract | Document review | Server-controlled role/status authority, public-signup prohibition and the exact Owner/Admin actions requiring current-session AAL2 are frozen; user-controlled metadata cannot be authorization authority. |
| `P0-T17` | Authority-hash coverage contract | Document/loop-state review | Every frozen normative authority is represented by the state hash model, completed/current phase hashes are retained, and unexpected drift has a dedicated stop path without silent hash replacement. |

# Definition of Done

- There is one authoritative definition for every core resource and lifecycle.
- Architecture contradictions are resolved rather than deferred to coding agents.
- All Phase 0 authority documents, including the dependency baseline, exist and agree.
- Implementation can begin without an agent needing to invent domain rules.

# Handoff to Next Phase

Phase 1 receives frozen architecture documents and may scaffold the technical project, but may not reinterpret the domain model.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] The AGENTS.md-required regression tier for this phase passes; completed-phase tests remain frozen and none were weakened, skipped, or removed merely to make this phase pass.
- [ ] Every authoritative validation gate that **exists at Phase 0** passes: document integrity, authority consistency, roadmap dependency checks, manifest/static checks where present, and Git diff validation where Git exists.
- [ ] Phase 1 scaffold-only commands (`format`, `lint`, `type/check`, application tests, build and database lifecycle commands) are explicitly **not** Phase 0 prerequisites when they do not yet exist.
- [ ] No placeholder application tooling was invented merely to close Phase 0.
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

Phase 0 closes only when all of the following are true:

- all Phase 0 MUST requirements are implemented or documented exactly as required;
- no Phase 0 MUST NOT requirement is violated;
- `P0-T01` through `P0-T17` each pass, with none skipped or replaced by an unverified assumption;
- applicable Phase-0 authority, document, static, and Git-integrity gates pass, including document integrity, authority consistency, roadmap dependency checks, manifest/static checks where present, and `git diff --check` where Git exists; and
- no unrelated scope was introduced.

Phase-1-created application format/lint/type/test/build and database lifecycle gates are not prerequisites to closing Phase 0 when those facilities do not yet exist. They become applicable when Phase 1 creates them and are validated under the later phase authorities.

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to the next dependency-valid phase.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`. Do not “improve” adjacent systems before advancing.

---
