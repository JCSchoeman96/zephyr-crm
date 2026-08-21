# Phase 14 — Local Release Candidate & Pilot Readiness

**Project:** Small Business CRM  
**Roadmap Version:** 1.1.0  
**Phase:** 14  
**Milestone:** M4 — Productisation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Pages + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the final execution authority inside the autonomous **local-only** build loop. Actual remote deployment, live DNS mutation, real-client pilot observation, and production launch belong to the separate post-build pilot programme unless the `/goal` explicitly authorizes them.

---

# Exact Goal

Produce and prove a complete **local v1.0.0 release candidate** that is ready for real client deployment and pilot use: fresh local provisioning, production build artifact, full synthetic/contract end-to-end workflows, security, migration, backup/restore, diagnostics, requirements coverage, and complete pilot/deployment instructions.

The successful terminal state of this phase is **LOCAL_BUILD_COMPLETE / PILOT_READY**, not a false claim that a real pilot has already occurred.

# Preconditions

Phase 13 local productisation and deployment-readiness tests pass completely.

# Phase Boundary

This phase owns final local release-candidate validation and preparation of the external pilot package. It does not own real staff observation, live client data, production DNS changes, remote Cloudflare/Supabase provisioning, or production launch under the default local-only goal.

# MUST Happen

- Provision a fresh local/disposable client instance from the Phase 13 procedure.
- Run the complete Lead → Quote → Send/communication-contract → Follow-up → Won → Client path with deterministic local/synthetic integration inputs.
- Run the complete Lead → Lost path with required reason and task/activity cleanup.
- Run quote revision, immutability, concurrency, idempotency, and permission regression suites.
- Prove Bricks intake using a canonical Bricks-compatible request fixture/contract against the real local ingestion boundary; if a local WordPress/Bricks instance is already available, an additional smoke test may run but is not required for local closure.
- Prove SendPulse integration through adapter/contract tests and deterministic provider-response fixtures; if approved test credentials are available, an additional real test send may run, but absence of credentials must not make the local build falsely incomplete.
- Re-run backup creation and restore into a disposable local environment using pilot-like synthetic data.
- Rehearse migration from a representative prior local schema/data state to current.
- Run the authoritative full project quality/security/build/database/browser gates from a clean local checkout/state.
- Reconcile every roadmap/phase MUST, MUST NOT, and mandatory test against implementation truth.
- Produce a `PILOT_READINESS.md` (or equivalent documented path) that lists exact remote steps still required: client-owned accounts, remote Supabase/Cloudflare provisioning, DNS, SendPulse sender-domain authentication, Bricks connection, backup choice, smoke tests, staff onboarding, observation, feedback classification, and production launch criteria.
- Create a post-v1 backlog area/template without implementing future features.
- Mark the local loop complete only after all local release-candidate gates pass.

# MUST NOT Happen

- Do not claim a real client pilot was completed when only local/synthetic validation occurred.
- Do not deploy/publish or mutate production/shared infrastructure under the default local-only goal.
- Do not require unavailable external credentials to pass tests that can be correctly proven through local contract/fixture validation.
- Do not treat contract tests as proof of DNS authentication, live provider deliverability, or human workflow observation; those remain explicit pilot checks.
- Do not add v1.1 features during release-candidate stabilization.
- Do not weaken completed-phase tests to obtain a green final gate.
- Do not ignore data-integrity, security, migration, backup/restore, or requirements-coverage failures.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P14.1 Fresh Local Client Provisioning** | New disposable client instance starts from zero using Phase 13 docs/config only. |
| **P14.2 Full Local Won/Lost E2E** | Both core commercial paths pass without direct database manipulation. |
| **P14.3 External-Contract Validation** | Bricks and SendPulse integration boundaries are proven with canonical local fixtures/contracts; optional real test calls are supplemental only. |
| **P14.4 Integrity & Concurrency Regression** | Quote immutability/revisions, duplicate protection, conversion idempotency, reminders, permissions, and concurrency remain correct. |
| **P14.5 Recovery & Migration Rehearsal** | Backup/restore and forward migration work on disposable pilot-like local data. |
| **P14.6 Final Security & Quality Gate** | Full RLS/security/static/test/build/db/browser/diff gate passes from clean state. |
| **P14.7 Requirements Reconciliation** | Every P0–P14 MUST/MUST NOT/test is accounted for against implementation evidence. |
| **P14.8 Pilot Readiness Package** | Exact remote deployment, pilot observation, feedback, and production-launch checklist is produced. |
| **P14.9 Local Release Candidate Freeze** | Local build is marked `PILOT_READY` / `LOCAL_BUILD_COMPLETE`; no new v1 scope remains. |

# Mandatory Test Matrix

**Every test below is a release gate for the autonomous local build.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P14-T01` | Fresh local client bootstrap | Supabase CLI/integration | A disposable client instance is created from zero using only documented configuration/migrations/seed and reaches a usable authenticated CRM state. |
| `P14-T02` | Won end-to-end | Browser/integration | Canonical Bricks-compatible local intake → Lead → Quote → communication-contract success → follow-up → Won → Client completes without direct DB edits. |
| `P14-T03` | Lost end-to-end | Browser/integration | Lead → Lost requires valid reason, records Activity, and closes/cancels obsolete Tasks exactly as defined. |
| `P14-T04` | Quote history integrity | Domain/DB/browser | Sent Quote immutability, revision lineage, money totals, number uniqueness, and historical snapshots all pass regression tests. |
| `P14-T05` | Duplicate/idempotency regression | Integration/concurrency | Bricks retries, provider-event retries, reminder overlaps, and conversion retries do not duplicate business state. |
| `P14-T06` | Authorization regression | Security | Anonymous/Viewer/Sales/Admin/Owner behavior matches the frozen matrix across protected resources/actions. |
| `P14-T07` | Bricks contract | Integration | Canonical Bricks-compatible payload, headers/authentication, invalid payloads, and duplicate submission cases pass against the real local ingestion function. |
| `P14-T08` | SendPulse contract | Integration | Adapter request construction, provider acknowledgement/failure mapping, webhook mapping, and deduplication pass deterministic contract/fixture tests without exposing secrets. |
| `P14-T09` | Backup/restore | Operations | Pilot-like synthetic database state is backed up and successfully restored into a disposable local environment with critical relationships intact. |
| `P14-T10` | Migration rehearsal | DB | Representative prior local schema/data migrates forward to current without unintended loss and current tests pass afterward. |
| `P14-T11` | Diagnostics | Operations | Documented diagnostics expose latest intake/send/webhook/reminder failures/status without requiring hidden manual database surgery. |
| `P14-T12` | Production build artifact | Build | Cloudflare Pages-compatible production build succeeds locally from clean configuration; no publication is required. |
| `P14-T13` | Full project quality gate | Automated | Authoritative format/lint/type/unit/integration/database/browser/build/`git diff --check` gates all pass. |
| `P14-T14` | Requirements coverage reconciliation | Review/evidence | Every roadmap/phase MUST is satisfied, every MUST NOT remains respected, every mandatory test is accounted for, and no required work is silently deferred. |
| `P14-T15` | Pilot readiness package | Documentation | Exact remote/client-owned steps and pass/fail pilot criteria exist, including DNS/email auth, deployment, real Bricks/SendPulse smoke, staff use observation, feedback classification, recovery ownership, and launch gate. |
| `P14-T16` | Local completion state | Loop state | `STATE.json` and `STATE.md` record all P0–P14 phases complete, no blocker, and final local status `LOCAL_BUILD_COMPLETE` / `PILOT_READY`. |

# Definition of Done

- Every local roadmap phase P0–P14 is complete.
- The release candidate passes complete local functional, security, integrity, migration, backup/restore, build, and requirements-coverage gates.
- The application can be freshly provisioned locally for a client without a code fork.
- External deployment/pilot work is explicitly documented rather than falsely claimed complete.
- The autonomous local build loop can terminate normally without requiring remote production mutation or elapsed human pilot observation.

# Handoff After the Autonomous Local Roadmap

Write the final local project handoff and mark the loop `LOCAL_BUILD_COMPLETE` / `PILOT_READY`.

The next lifecycle is the separate **Post-Build Pilot Programme**. It requires an explicit future goal because it may involve client-owned remote accounts, live DNS, real SendPulse/Bricks connectivity, real users, elapsed observation time, and production launch decisions.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] All prior-phase regression tests still pass and none were weakened, skipped, or removed merely to make this phase pass.
- [ ] Project-wide format/lint/type/test/build/database/browser/diff gates pass.
- [ ] Migrations are deterministic and clean.
- [ ] Security/RLS requirements remain proven.
- [ ] Backup/restore is proven locally.
- [ ] No secrets are exposed.
- [ ] Requirements coverage P0–P14 is reconciled.
- [ ] Pilot-readiness documentation is complete.
- [ ] Local loop state records `LOCAL_BUILD_COMPLETE` / `PILOT_READY`.

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
9. **Do not implement post-v1 functionality during release-candidate hardening.**
10. **Every phase closes with focused tests plus the complete existing project quality gate.**

# Standard Agent Tool Policy

Use only the tools required by the current task.

**Default tools**
- filesystem read/write
- shell
- git

**Add only when required**
- Supabase CLI for local database/Auth/Edge Function/database tests
- browser for local UI/E2E verification
- deterministic local fixtures/contract tests for Bricks and SendPulse

Real remote deployment/provider calls are supplemental only when explicitly authorized and safely configured; they are not required by this local phase.

# Global Execution STOP Conditions

Execution may stop only under a genuine `AGENTS.md` **EXECUTION STOP** condition. Ordinary test/build/lint/migration failures, phase completion, or reaching this phase's scope boundary are not execution stops; diagnose/repair or close the phase as defined by `AGENTS.md`.

# Phase Close Condition

Once all required outcomes in this document are implemented, every mandatory phase test passes, all completed-phase regression gates still pass, and the final project-level completion gate passes:

1. **STOP WORK ON THE LOCAL ROADMAP.**
2. Mark Phase 14 `COMPLETE`.
3. Persist the final handoff and loop state.
4. Create a safe local release-candidate checkpoint commit when permitted and isolatable.
5. Mark final local status `LOCAL_BUILD_COMPLETE` / `PILOT_READY`.
6. End the autonomous local build loop normally.

This is successful completion, not a blocker.
