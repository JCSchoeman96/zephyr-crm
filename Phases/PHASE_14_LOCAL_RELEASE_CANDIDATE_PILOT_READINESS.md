# Phase 14 — Local Release Candidate & Pilot Readiness

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 14  
**Milestone:** M4 — Productisation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the final execution authority inside the autonomous **local-only** build loop. Actual remote deployment, live DNS mutation, real-client pilot observation, and production launch belong to the separate post-build pilot programme unless the `/goal` explicitly authorizes them.

---

# Exact Goal

Produce and prove a complete **local pre-release candidate for `v1.0.0`** (conceptually `v1.0.0-rc.1`, or the next RC number) that is ready for real client deployment and pilot use: fresh local provisioning, production build artifact, full synthetic/contract end-to-end workflows, security, migration, backup/restore, diagnostics, requirements coverage, and complete pilot/deployment instructions.

The successful state of **Phase 14 itself** is `P14=COMPLETE` with the project still non-terminal and ready for `FINAL_PROJECT_VALIDATION`. `LOCAL_BUILD_COMPLETE / PILOT_READY` is persisted only after the separate global final gate passes. A stable production `v1.0.0` tag/version is outside this local phase and may be frozen only after the post-build pilot/release gate.

# Preconditions

Phase 13 local productisation and deployment-readiness tests pass completely.

# Phase Boundary

This phase owns final local release-candidate validation and preparation of the external pilot package. It does not own real staff observation, live client data, production DNS changes, remote Cloudflare/Supabase provisioning, or production launch under the default local-only goal.

# MUST Happen

- Verify final dependency/toolchain drift against `DEPENDENCY_BASELINE_v1.0.0.md`, `docs/TOOLCHAIN_PROOF.md`, exact `package.json`, `bun.lock`, and `wrangler.jsonc`.

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
- Before P14 closes, persist the final-gate readiness state: `P0–P13=COMPLETE`, `P14=VALIDATING`, `blocked=false`, `goal_status=IN_PROGRESS`, `local_build_status=FINAL_VALIDATION_PENDING`, `release_status=NOT_READY`, `pilot_status=NOT_STARTED`, `production_status=NOT_LAUNCHED`. After P14 tests pass, mark **P14 only** `COMPLETE`, write its handoff, and let `AGENTS.md` transition into `FINAL_PROJECT_VALIDATION`.

- Re-run the frozen money edge-case, protected-mutation, Activity immutability, Quote snapshot/provenance, provider-uncertainty, metric-definition and timezone regressions.
- Validate the complete recovery set includes representative private Storage documents and Auth reconstruction, not database rows alone.
- Ensure pilot readiness explicitly includes Owner/Admin MFA and POPIA-oriented privacy/incident/cross-border/retention responsibilities.

# MUST NOT Happen

- Do not claim a real client pilot was completed when only local/synthetic validation occurred.
- Do not deploy/publish or mutate production/shared infrastructure under the default local-only goal.
- Do not require unavailable external credentials to pass tests that can be correctly proven through local contract/fixture validation.
- Do not treat contract tests as proof of DNS authentication, live provider deliverability, or human workflow observation; those remain explicit pilot checks.
- Do not add post-v1.2 scope during release-candidate stabilization.
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
| **P14.9 Local Release-Candidate Freeze** | Local RC contents are frozen and P14 can close; project terminal state still awaits the global final validation gate. |

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
| `P14-T08` | SendPulse contract | Integration | Adapter request construction, definitive/ambiguous provider outcome mapping including `submission_unknown`, webhook reconciliation, controlled retry and deduplication pass deterministic contract/fixture tests without exposing secrets. |
| `P14-T09` | Complete recovery | Operations | Pilot-like database plus representative private Storage artifacts are restored into a disposable local environment; concrete Auth identity/profile/role/status reconstruction, suspension behavior, credential/MFA reset expectations and critical relationships/artifact hashes are proven. |
| `P14-T10` | Migration rehearsal | DB | Representative prior local schema/data migrates forward to current without unintended loss and current tests pass afterward. |
| `P14-T11` | Diagnostics | Operations | Documented diagnostics expose latest intake/send/webhook/reminder failures/status without requiring hidden manual database surgery. |
| `P14-T12` | Production build artifact | Build | Cloudflare Workers-compatible production build succeeds locally from clean configuration; no publication is required. |
| `P14-T13` | Full project quality gate | Automated | Authoritative format/lint/type/unit/integration/database/browser/build/`git diff --check` gates all pass. |
| `P14-T14` | Requirements coverage reconciliation | Review/evidence | Every roadmap/phase MUST is satisfied, every MUST NOT remains respected, every mandatory test is accounted for, and no required work is silently deferred. |
| `P14-T15` | Pilot readiness package | Documentation | Exact remote/client-owned steps and pass/fail pilot criteria exist, including DNS/email auth, deployment, real Bricks/SendPulse smoke, staff use observation, feedback classification, recovery ownership, and launch gate. |
| `P14-T16` | Final-gate readiness state | Loop state | While P14 is `VALIDATING`, state records P0–P13 complete, no blocker, `goal_status=IN_PROGRESS`, `local_build_status=FINAL_VALIDATION_PENDING`, `release_status=NOT_READY`, `pilot_status=NOT_STARTED`, and `production_status=NOT_LAUNCHED`; this test does not require P14 or the project to be terminal. |
| `P14-T17` | Cross-cutting law regression | Automated/DB | Money, mutation, Activity immutability, snapshot/provenance, association and attention/task separation tests all pass. |
| `P14-T18` | Metric/time regression | DB/domain | Frozen KPI formulas and UTC/IANA timezone fixtures pass with no revision double-counting. |
| `P14-T19` | Privacy/MFA pilot gate | Documentation/security | Pilot package blocks launch until named privacy/incident/cross-border/retention ownership and Owner/Admin MFA prerequisites are satisfied. |
| `P14-T20` | Authority drift check | Static/loop state | Roadmap/bootstrap plus the complete frozen `authority_sha256` map and every completed/current phase authority hash match current files; unexpected drift invokes the dedicated stop and no hash is silently replaced. |
| `P14-T21` | Final toolchain/dependency drift | Static/build | Dependency baseline, toolchain proof, exact package pins, Bun lockfile, Cloudflare config/compatibility date and installed build all agree; no unapproved package-manager/framework/tooling drift exists. |

# Definition of Done

- Every local roadmap phase P0–P14 is complete.
- The release candidate passes complete local functional, security, integrity, migration, backup/restore, build, and requirements-coverage gates.
- The application can be freshly provisioned locally for a client without a code fork.
- External deployment/pilot work is explicitly documented rather than falsely claimed complete.
- The autonomous local build loop can terminate normally without requiring remote production mutation or elapsed human pilot observation.

# Handoff to Global Final Validation

Write the Phase 14 handoff, mark P14 `COMPLETE`, and return control to `AGENTS.md` with the project still non-terminal. `AGENTS.md` then runs `FINAL_PROJECT_VALIDATION`; only that passing global gate may persist `LOCAL_BUILD_COMPLETE` / `PILOT_READY`.

After global final validation succeeds, the next lifecycle is the separate **Post-Build Pilot Programme**. It requires an explicit future goal because it may involve client-owned remote accounts, live DNS, real SendPulse/Bricks connectivity, real users, elapsed observation time, and production launch decisions.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] The AGENTS.md-required regression tier for this phase passes; completed-phase tests remain frozen and none were weakened, skipped, or removed merely to make this phase pass.
- [ ] Project-wide format/lint/type/test/build/database/browser/diff gates pass.
- [ ] Migrations are deterministic and clean.
- [ ] Security/RLS requirements remain proven.
- [ ] Backup/restore is proven locally.
- [ ] No secrets are exposed.
- [ ] Requirements coverage P0–P14 is reconciled.
- [ ] Pilot-readiness documentation is complete.
- [ ] P14 readiness state is non-terminal and satisfies `P14-T16`; terminal COMPLETE / LOCAL_BUILD_COMPLETE / PILOT_READY fields are reserved for the post-P14 global final gate in `AGENTS.md`.

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
- Supabase CLI for local database/Auth/Edge Function/database tests
- browser for local UI/E2E verification
- deterministic local fixtures/contract tests for Bricks and SendPulse

Real remote deployment/provider calls are supplemental only when explicitly authorized and safely configured; they are not required by this local phase.

# Global Execution STOP Conditions

Execution may stop only under a genuine `AGENTS.md` **EXECUTION STOP** condition. Ordinary test/build/lint/migration failures, phase completion, or reaching this phase's scope boundary are not execution stops; diagnose/repair or close the phase as defined by `AGENTS.md`.

# Phase Close Condition

Once all required outcomes in this document are implemented, every P14 mandatory test passes, and the required P14/completed-phase regression tier passes:

1. Stop adding Phase 14 scope.
2. Mark **Phase 14 `COMPLETE`**.
3. Persist the P14 handoff and non-terminal readiness state.
4. Create a safe local release-candidate checkpoint commit when permitted and isolatable.
5. Return control to `AGENTS.md`, which MUST transition to `FINAL_PROJECT_VALIDATION`.

Do **not** set `goal_status=COMPLETE`, `LOCAL_BUILD_COMPLETE`, or `PILOT_READY` inside the Phase 14 close. Those terminal fields are written only after the global final completion gate passes. This is successful phase completion, not a blocker.

# P14 Hardening Extension — v1.3.2

The frozen `docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md`
adds the following append-only mandatory tests. P14-T01 through P14-T21 retain
their existing semantics and remain mandatory regression gates.

| ID | Mandatory test | Type | Exact pass criterion |
|---|---|---|---|
| `P14-T22` | Release truth parity | Static/release | Machine release state and human readiness projection agree for valid non-terminal and terminal fixtures; stale readiness fails closed. |
| `P14-T23` | P14 gate semantic integrity | Static/CI | P14 release proof is non-recursive, required browser jobs are protected prerequisites, and every P14 ID maps to real evidence. |
| `P14-T24` | Authenticated stateful browser harness | Browser/integration | A real authenticated CRM browser session persists and reloads business state against fresh local Supabase and a local provider fixture. |
| `P14-T25` | Canonical Won browser E2E | Browser/integration | Real Bricks intake → Lead → Quote → deterministic send → follow-up → Won → Client completes through product boundaries with frozen PDF and evidence. |
| `P14-T26` | Canonical Lost/reopen browser E2E | Browser/integration | Lost requires reason and cleanup; Sales cannot reopen; Owner/Admin reopens with reason to QUALIFICATION and preserves history. |
| `P14-T27` | Client lifecycle and maintenance integrity | DB/browser | Client lifecycle, archive lineage guard, conversion-only creation, protected fields, concurrency, identity/type law, and Activity evidence pass. |
| `P14-T28` | ClientContact lifecycle and primary integrity | DB/browser | Contact create/edit/status/primary actions are concurrent, role-safe, history-preserving, and cannot be bypassed or hard-deleted. |
| `P14-T29` | Task relationship and context integrity | DB/browser | Lead/Client/Quote parent relationships are valid and derived at trusted boundaries; raw bypasses fail; UI shows useful context. |
| `P14-T30` | Quote document production fitness | Unit/integration | Long deterministic multi-page PDFs preserve branding, supported characters, first/last items, exact totals, and immutable artifact hashes. |
| `P14-T31` | Quote email presentation and sender safety | Unit/integration | Escaped client-facing email contains required quote identity, sender config fails closed, and attachment bytes equal the frozen PDF. |
| `P14-T32` | Navigation/internal route capability truth | Browser/static | Reports/Settings dead capabilities are absent, visible internal links resolve, and Component Lab is 404 unless explicitly enabled. |
| `P14-T33` | Role/responsive/accessibility product-flow regression | Browser | Viewer, Sales, and Owner/Admin permissions plus 390/768/1280 responsive and core accessibility assertions pass. |
| `P14-T34` | Hardening authority/evidence reconciliation | Static/release | Every hardening requirement is implemented, explicitly deferred by authority, or tied to a genuine defined stop; no silent omission exists. |
| `P14-T35` | Trusted-mutation boundary parity | DB/security | Fully migrated current-schema raw authenticated Data API attempts cannot bypass trusted-only Client, Contact, Task, Lead, Quote, Activity, or outbound boundaries. |

The extension does not create a Phase 15, does not remove any previous test,
and does not authorize remote deployment, live provider credentials, or a real
pilot.
