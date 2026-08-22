# Phase 3 — Database, Identity, Permissions & RLS

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.1
**Phase:** 3  
**Milestone:** M0 — Foundation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Create the secure persistence and identity foundation required by the tracer bullet: deterministic migrations, Auth-backed profiles, role policy, core schema foundations, constraints, indexes, RLS, and optimistic concurrency.

# Preconditions

Phase 0 architecture is frozen; Phase 1 scaffold and Phase 2 shell pass all gates.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Implement Supabase Auth integration with invitation-only staff access; configure public signup disabled in local/project configuration and carry the same requirement into remote provisioning.
- Use `auth.users.id` mapped to protected `profiles.id`; `profiles.role` and `profiles.status` are the authorization source of truth. Never authorize from user-controlled `raw_user_meta_data`.
- Create `profiles`, app settings foundations, lead sources, lost reasons, and the minimum structurally correct core business tables required by Phase 4.
- Define roles: owner, admin, sales, viewer.
- Define user states: invited, active, suspended.
- Enable RLS on every exposed business table.
- Implement deny-by-default anonymous access.
- Implement viewer read-only and sales/admin/owner permissions according to the frozen matrix.
- Create required foreign keys, check constraints, uniqueness constraints, timestamps, and optimistic locking fields.
- Create only indexes needed by known critical paths and RLS predicates.
- Make migrations resettable from zero and seed baseline configuration deterministically.

- Implement the Phase 0 mutation matrix with database privileges/RLS/functions so protected columns and domain transitions cannot be changed through generic browser CRUD merely because a row is accessible.
- Make Activity append-only for ordinary application roles at database level; ordinary UPDATE/DELETE must fail.
- Separate privileged operational/security audit events where required and ensure actor/timestamp/action evidence is durable.
- Use `timestamptz` for instants and establish the configured IANA client-timezone boundary for later business-date calculations.
- Make trusted SQL functions `SECURITY INVOKER` by default. Permit `SECURITY DEFINER` only for documented privilege elevation; set a safe explicit `search_path` that excludes untrusted writable schemas (prefer empty with fully qualified references where practical), fully qualify sensitive objects, re-check `auth.uid()`, profile role/status, AAL when required, and domain preconditions internally.
- Revoke inappropriate default/PUBLIC EXECUTE from protected functions and grant EXECUTE only to database roles permitted by the mutation/action matrix; exposed functions must still enforce application-role/status checks internally. Anonymous and Viewer roles must not invoke privileged mutation RPCs.
- Require current-session `aal2` at the trusted boundary for privileged Owner/Admin operations identified in `SECURITY_MODEL`; route/UI checks alone are not enforcement.

# MUST NOT Happen

- Do not rely on frontend route hiding for authorization.
- Do not expose service-role credentials to the browser.
- Do not allow public self-registration.
- Do not weaken RLS to make UI development easier.
- Do not implement later-phase advanced workflows or analytics.
- Do not use application-only validation where a durable database invariant is required.
- Do not create unbounded admin bypass policies.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P3.1 Auth/Profile Schema** | Map Supabase Auth users to profiles and role/state metadata. |
| **P3.2 Core Schema Foundations** | Create minimum Leads/Clients/Quotes/Tasks/Activities/Message/Inbound structures needed by the tracer bullet. |
| **P3.3 Constraints & Indexes** | Enforce durable invariants and known critical query paths. |
| **P3.4 RLS Policies** | Implement explicit role-aware access. |
| **P3.5 Seed & Reset** | Create deterministic baseline sources/reasons/settings and local reset. |
| **P3.6 Auth UI Wiring** | Connect login/logout/session handling to the permanent shell without full CRM screens. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P3-T01` | Fresh migration reset | Supabase CLI | Database resets from zero with all migrations and seed data successfully. |
| `P3-T02` | Anonymous denial | DB/API test | Anonymous user cannot select/insert/update/delete protected CRM rows. |
| `P3-T03` | Viewer read-only | DB/API test | Viewer can read allowed data and cannot mutate business data. |
| `P3-T04` | Sales boundary | DB/API test | Sales can perform permitted CRM operations but cannot mutate users, secrets, or protected settings. |
| `P3-T05` | Admin/owner access | DB/API test | Admin and owner have exactly documented privileges; owner-only actions remain owner-only where specified. |
| `P3-T06` | Suspended user | Auth/RLS test | Suspended user cannot continue normal CRM access. |
| `P3-T07` | Optimistic lock field | DB test | Lead/Quote concurrency version fields exist and reject stale trusted writes once used. |
| `P3-T08` | Constraint enforcement | DB test | Invalid role/state/required relationship values fail at database level. |
| `P3-T09` | Secret boundary | Static/runtime | No service-role or provider secret is available in browser output. |
| `P3-T10` | Project quality gate | Automated | All established format/check/test/build/diff gates pass. |
| `P3-T11` | Protected field mutation | DB/API security | A role with row access cannot directly mutate protected role/status, totals, revision, conversion, provider, immutable snapshot, or lock fields outside their trusted actions. |
| `P3-T12` | Activity append-only | DB/RLS | Ordinary application roles can create allowed Activity through the approved path but cannot UPDATE/DELETE existing Activity rows. |
| `P3-T13` | Timestamp contract | DB | Business instants use `timestamptz`; fixture round-trip preserves the same instant independent of session timezone. |
| `P3-T14` | Trusted function EXECUTE boundary | DB/API security | Protected RPC/functions cannot be invoked by anonymous or unauthorized application roles even when the function exists in an exposed schema; Viewer cannot invoke mutation RPCs. |
| `P3-T15` | SECURITY DEFINER hardening | DB/static security | Every SECURITY DEFINER function has documented elevation need, safe explicit search path, fully qualified sensitive object references, selective EXECUTE grants and internal actor/role/status/domain checks. |
| `P3-T16` | Role/status authority | Auth/RLS security | Changing user-controlled metadata cannot grant CRM privileges or bypass a suspended `profiles.status`; protected role/status mutation succeeds only through trusted actions. |
| `P3-T17` | Public signup disabled | Auth/config integration | An unauthenticated external actor cannot self-create a CRM account through the public application/Auth signup path; invitation/admin provisioning remains possible. |
| `P3-T18` | Privileged AAL2 enforcement | Auth/DB/API security | An authorized Owner/Admin at AAL1 cannot execute an AAL2-protected privileged action; the same authorized actor at AAL2 can, while ordinary non-privileged access follows the frozen role matrix. |

# Definition of Done

- The application has a secure identity boundary.
- RLS behaviour is proven by tests rather than assumed.
- The schema is ready for the tracer bullet without speculative later-phase implementation.

# Handoff to Next Phase

Phase 4 may implement the thinnest real end-to-end workflow on top of these secure foundations.

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
