# Phase 13 — Reusable Client Deployment Template & Local Deployment Readiness

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.1
**Phase:** 13  
**Milestone:** M4 — Productisation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Transform the production-ready CRM into a repeatable **local product template** where a new isolated client instance can be prepared from one codebase through configuration, credentials, branding, migrations, and documented integration setup — without client-specific source forks and without requiring a real remote deployment to close the autonomous local phase.

# Preconditions

Phase 12 production hardening passes completely.

# Phase Boundary

This phase owns productisation, configuration, local provisioning proof, deployment artifact/readiness validation, and client ownership procedures. Actual creation/mutation of remote Cloudflare/Supabase production projects, DNS changes, real client launch, and pilot observation are outside the local autonomous loop unless the `/goal` explicitly authorizes them.

# MUST Happen

- Define the one-codebase / many-isolated-deployments operating model.
- Make brand, locale, quote defaults, sales rules, sender settings, and integration identifiers configurable.
- Create configuration validation so missing/invalid client settings fail clearly before deployment.
- Provide a safe deterministic method to seed the Owner account and baseline settings locally.
- Create a deterministic fresh-client provisioning procedure covering Supabase, Cloudflare Workers, SendPulse, Bricks, DNS, backup, and client ownership steps.
- Define client ownership of Cloudflare, Supabase, domain, and SendPulse accounts.
- Create client onboarding, handoff, update, and offboarding procedures.
- Prove migrations from zero against a **fresh local/disposable Supabase instance**.
- Prove the Cloudflare Workers production build/artifact locally using the repository's deployment-compatible build path; do not require publication.
- Prove that Bricks and SendPulse integration configuration can be supplied per client without core source changes using local contract/configuration tests.
- Define the shared-code versioning/update strategy for deployed client instances.
- Define exactly which steps remain external/manual for a future real deployment and pilot.

- Provision/build using the pinned Phase 1 Node/package-manager/Supabase CLI/Wrangler toolchain contract; client onboarding must not depend on floating tool versions.
- Include configured IANA timezone, supported currency, quote/money settings, privacy/recovery ownership, Owner/Admin MFA prerequisite, and provider-integration ownership in the client configuration/deployment template.

# MUST NOT Happen

- Do not create ClientA/ClientB permanent source branches.
- Do not introduce multi-tenancy to solve deployment repetition.
- Do not place client secrets in source-controlled configuration.
- Do not allow per-client schema divergence without an explicit product architecture decision.
- Do not hard-code client names/branding inside reusable components.
- Do not make onboarding depend on undocumented manual database edits.
- Do not deploy to Cloudflare, create/mutate remote Supabase projects, change live DNS, or launch a real client as a mandatory phase action under the local-only goal.
- Do not claim a local build proves real production DNS/email-provider behavior; record those as pilot/deployment checks.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P13.1 Configuration Contract** | Brand, locale, quote, sales, email, and integration configuration is explicit, typed/validated, and client-independent. |
| **P13.2 Local Provisioning Contract** | Fresh local/disposable Supabase provisioning and Owner/baseline seed are deterministic. |
| **P13.3 Deployment Artifact Readiness** | Cloudflare Workers-compatible production build/artifact is reproducible locally without publication. |
| **P13.4 Integration Configuration Readiness** | Bricks/SendPulse per-client configuration contracts are validated without core-code edits or mandatory remote calls. |
| **P13.5 Client Ownership & Operations** | Account ownership, credentials, billing, DNS, support, backup, handoff, and offboarding responsibilities are documented. |
| **P13.6 Upgrade Strategy** | Shared-code upgrades and migrations can be applied to isolated client instances without configuration/data loss. |
| **P13.7 Fresh Template Dry Run** | A clean local instance is provisioned from documentation/configuration only and passes the production quality gate. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver authorized by a higher-priority authority, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P13-T01` | Fresh local Supabase provisioning | Supabase CLI/integration | A fresh local/disposable Supabase instance reaches the current schema and baseline settings from zero with no undocumented SQL/manual edits. |
| `P13-T02` | Local production build | Build | The Cloudflare Workers-compatible production build/artifact completes locally using the documented command and environment contract without publication. |
| `P13-T03` | Brand-only configuration | Browser | Changing approved brand configuration updates client identity without editing reusable component source. |
| `P13-T04` | Locale/quote configuration | Domain/browser | Currency, locale, tax labels/defaults, quote prefix, validity, and approved terms/defaults change through configuration. |
| `P13-T05` | Integration configuration contract | Integration/config | Bricks and SendPulse client-specific identifiers/secrets can be supplied through the documented trusted configuration boundaries without core-domain edits or secret leakage. |
| `P13-T06` | No client fork | Git/static review | A fresh client dry run requires no permanent client-specific source branch or duplicated application code. |
| `P13-T07` | Secret isolation | Static/runtime | Client secrets remain outside source control and browser bundles. |
| `P13-T08` | Offboarding dry run | Operations | Documentation proves a client instance can be exported/transferred independently without entangling another client. |
| `P13-T09` | Upgrade rehearsal | Local deployment/DB | A representative prior local instance upgrades to current code/migrations without losing configuration or data. |
| `P13-T10` | Fresh-template quality gate | Automated | The freshly provisioned local template passes the same format/check/test/build/database/diff gates as the baseline. |
| `P13-T11` | External-step boundary | Documentation review | All real remote deployment, DNS, sender-domain authentication, and pilot actions are explicitly identified as post-build/external steps rather than falsely marked locally complete. |
| `P13-T12` | Pinned provisioning toolchain | Shell/docs | Fresh-client procedure identifies and successfully uses the pinned/constrained toolchain rather than `latest`. |
| `P13-T13` | Client governance config | Documentation/config | Template explicitly captures timezone/currency, privacy/recovery ownership, MFA prerequisite and integration ownership without client-specific code forks. |

# Definition of Done

- A new client instance can be prepared locally without architecture or core-code changes.
- Client differences are configuration, not forks.
- Fresh local database provisioning and production build are deterministic.
- Ownership, update, backup, handoff, and offboarding responsibilities are explicit.
- Remote deployment/pilot requirements are clearly separated from the autonomous local build loop.

# Handoff to Next Phase

Phase 14 receives a reusable locally provisionable template and must prove the complete **local release candidate and pilot-readiness package**. It must not require a real client launch to close.

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
- local fixtures/contract tests for external integration configuration

Do not browse, deploy, publish, or call remote production services merely because they are available.

# Global Execution STOP Conditions

Execution may stop only under a genuine `AGENTS.md` **EXECUTION STOP** condition. Ordinary test/build/lint/migration failures, phase completion, or reaching this phase's scope boundary are not execution stops; diagnose/repair or close the phase as defined by `AGENTS.md`.

# Phase Close Condition

Once all required outcomes in this document are implemented, every mandatory phase test passes, the AGENTS.md-required phase regression tier passes, the project-wide quality gate passes, migrations are clean, and no unrelated scope was introduced:

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to Phase 14.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`.
