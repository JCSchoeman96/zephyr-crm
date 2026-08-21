# Phase 1 — Project Scaffold & Quality Gates

**Project:** Small Business CRM  
**Roadmap Version:** 1.1.0  
**Phase:** 1  
**Milestone:** M0 — Foundation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Pages + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Create a clean, reproducible SvelteKit/Supabase project skeleton with deterministic local development, deployment-compatible configuration, CI, and quality gates before any CRM business feature is implemented.

# Preconditions

Phase 0 is closed and architecture documents are frozen.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Create the agreed SvelteKit + TypeScript project structure.
- Create `src/lib/components`, `src/lib/domain`, `src/lib/services/supabase`, `src/lib/types`, `src/lib/utils`, and route placeholders only where needed for the shell.
- Initialize local Supabase structure: `supabase/migrations`, `supabase/functions`, `supabase/seed.sql`, `supabase/config.toml`.
- Configure local environment handling with a strict public/secret variable contract.
- Configure formatter, linter, type checking, unit test runner, browser test runner, and production build.
- Create deterministic package scripts for the full quality gate.
- Configure CI to run the same checks developers run locally.
- Verify Cloudflare Pages-compatible production output.
- Provide `.env.example` / `.dev.vars.example` without real credentials.
- Document local setup and exact commands.

# MUST NOT Happen

- Do not create Lead, Client, Quote, Task, Activity, or integration business logic.
- Do not commit real keys, tokens, passwords, or client data.
- Do not expose service-role, SendPulse, database, or webhook secrets through public variables.
- Do not add a large UI library unless explicitly approved.
- Do not add Redis, queues, background services, or analytics infrastructure.
- Do not create fake future tables just to anticipate later phases.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P1.1 Repository Baseline** | Create directories, scripts, package metadata, and README/setup contract. |
| **P1.2 Environment Contract** | Separate browser-safe variables from trusted runtime secrets. |
| **P1.3 Supabase Local Baseline** | Make local Supabase start/reset/test deterministic. |
| **P1.4 Quality Toolchain** | Configure format, lint, type checks, unit, browser, build, diff checks. |
| **P1.5 CI** | Mirror local quality gates in CI. |
| **P1.6 Deployment Smoke** | Verify a blank production build is compatible with Cloudflare Pages. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P1-T01` | Clean install | Shell/CI | A fresh checkout installs with the documented package manager and no manual patching. |
| `P1-T02` | Type/compile gate | Automated | Project type/check command exits 0. |
| `P1-T03` | Unit test gate | Automated | Baseline tests exit 0. |
| `P1-T04` | Production build | Automated | Cloudflare-compatible production build exits 0. |
| `P1-T05` | Supabase local lifecycle | Supabase CLI | Local Supabase starts, resets, and stops using documented commands. |
| `P1-T06` | Secret boundary | Static/env test | Build artifacts contain no trusted secret names or values; only approved public variables are browser-readable. |
| `P1-T07` | Git hygiene | Shell | `git diff --check` passes and generated/local-secret files are ignored. |
| `P1-T08` | CI parity | CI | CI runs the same required quality commands and passes on a clean branch. |

# Definition of Done

- A fresh developer can clone, configure, start, test, build, and stop the project from documentation.
- No CRM business feature exists yet.
- All future phases inherit one stable quality gate.

# Handoff to Next Phase

Phase 2 receives a clean technical skeleton and may establish the visual system without implementing CRM business workflows.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] All prior-phase regression tests still pass and none were weakened, skipped, or removed merely to make this phase pass.
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
10. **Every phase closes with focused tests plus the complete existing project quality gate.**

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

Once all required outcomes in this document are implemented, every mandatory phase test passes, all completed-phase regression gates still pass, the project-wide quality gate passes, migrations are clean, and no unrelated scope was introduced:

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to the next dependency-valid phase.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`. Do not “improve” adjacent systems before advancing.

---
