# Phase 1 — Project Scaffold & Quality Gates

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 1  
**Milestone:** M0 — Foundation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Create a clean, reproducible SvelteKit/Supabase project skeleton with deterministic local development, deployment-compatible configuration, a CI configuration that mirrors local commands, and quality gates before any CRM business feature is implemented.

# Preconditions

Phase 0 is closed and architecture documents are frozen.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Create the agreed Svelte 5 + SvelteKit 2 + strict TypeScript project structure using Bun.
- Create `src/lib/components`, `src/lib/domain`, `src/lib/services/supabase`, `src/lib/types`, `src/lib/utils`, and route placeholders only where needed for the shell.
- Initialize local Supabase structure: `supabase/migrations`, `supabase/functions`, `supabase/seed.sql`, `supabase/config.toml`.
- Configure local environment handling with a strict public/secret variable contract.
- Configure the approved quality stack: Prettier, ESLint, strict TypeScript, `svelte-check`, Vitest, Playwright, and the SvelteKit/Vite production build.
- Create deterministic package scripts for the full quality gate.
- Create CI configuration that invokes the same canonical quality commands developers run locally. Remote CI execution is not required to close a local-only autonomous phase; configuration parity must be statically/local validated.
- Verify Cloudflare Workers-compatible production output.
- Provide `.env.example` / `.dev.vars.example` without real credentials.
- Document local setup and exact commands.

- Apply `DEPENDENCY_BASELINE_v1.0.0.md` exactly: Bun is the sole package manager/local runner and `bun.lock` the sole JavaScript lockfile.
- Preserve Vite 8 as the SvelteKit build authority; Bun invokes scripts but does not replace Vite's build pipeline.
- Configure Tailwind CSS 4 through `@tailwindcss/vite`.
- Initialise shadcn-svelte using the approved `new-york` configuration; commit `components.json`; generated components become project-owned source.
- Use `@lucide/svelte` as the single icon system.
- Establish Zod as the single ordinary boundary/schema validation library.
- Install `@supabase/supabase-js` and the project-local Supabase CLI package; do not rely on a global CLI version.
- Configure exact-pinned `@sveltejs/adapter-cloudflare` and Wrangler for Cloudflare Workers with Static Assets using committed `wrangler.jsonc`.
- Freeze the Worker `compatibility_date` after the successful proof; it must not track the current date automatically.
- Execute the Phase 1 full-stack compatibility proof. Record exact proven versions in `docs/TOOLCHAIN_PROOF.md`, exact-pin every direct dependency, set exact `packageManager: "bun@..."`, generate/commit `bun.lock`, and rerun the gate from a frozen clean install.
- Remove/prohibit `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, legacy `bun.lockb`, floating dependency ranges/tags, and undocumented global CLI assumptions.

# MUST NOT Happen

- Do not create Lead, Client, Quote, Task, Activity, or integration business logic.
- Do not commit real keys, tokens, passwords, or client data.
- Do not expose service-role, SendPulse, database, or webhook secrets through public variables.
- Do not add any second/general UI library; shadcn-svelte is the approved source kit and Tailwind the approved CSS system.
- Do not add Redis, queues, background services, or analytics infrastructure.
- Do not create fake future tables just to anticipate later phases.
- Do not add Redux/Zustand/MobX/XState-style state management, a large form framework, a date library, a second validation library, Jest/Cypress, another icon set, or any convenience SendPulse SDK.
- Do not create `wrangler.toml` as a competing Cloudflare configuration authority.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P1.1 Repository Baseline** | Create directories, Bun-only package scripts/metadata, single-lockfile rules, and README/setup contract. |
| **P1.2 Environment Contract** | Separate browser-safe variables from trusted runtime secrets. |
| **P1.3 Supabase Local Baseline** | Make local Supabase start/reset/test deterministic. |
| **P1.4 Quality Toolchain** | Configure Prettier, ESLint, strict TypeScript, svelte-check, Vitest, Playwright, Vite build and diff checks. |
| **P1.5 CI Configuration** | Mirror canonical local quality commands in CI configuration without requiring remote execution for local closure. |
| **P1.6 Deployment Smoke** | Verify a blank production build is compatible with Cloudflare Workers with Static Assets through adapter-cloudflare/Wrangler and committed `wrangler.jsonc`. |
| **P1.7 Compatibility Freeze** | Prove the complete stack together, write `docs/TOOLCHAIN_PROOF.md`, exact-pin direct dependencies and Bun, commit `bun.lock`, then repeat the gate from a frozen clean install. |

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
| `P1-T08` | CI configuration parity | Static/local CI contract | CI configuration invokes the same canonical local quality commands; local/static validation proves parity. Remote CI execution is supplemental and not required by the local-only loop. |
| `P1-T09` | Toolchain reproducibility | Shell/static | Documented exact runtime/package-manager/Supabase CLI/Wrangler versions plus the canonical lockfile reproduce a clean install/build without floating `latest`. |
| `P1-T10` | Workers artifact contract | Build | SvelteKit Cloudflare adapter/Wrangler configuration produces the documented Workers-with-Static-Assets artifact locally. |
| `P1-T11` | Bun authority | Shell/static | `packageManager` names exact Bun; canonical scripts run through Bun; no npm/pnpm/yarn command or lockfile is build authority. |
| `P1-T12` | Exact direct pins | Static | Every direct dependency/devDependency is exact-pinned; no `^`, `~`, `latest`, `next`, prerelease or floating Git ref exists without an explicit architecture amendment. |
| `P1-T13` | Single lockfile | Shell/static | `bun.lock` is committed and `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, and legacy `bun.lockb` are absent. |
| `P1-T14` | Full-stack compatibility proof | Automated/document | Clean install + check + lint + Vitest + Playwright smoke + Vite/SvelteKit build + Workers artifact + local Supabase lifecycle all pass together and exact proven versions are recorded in `docs/TOOLCHAIN_PROOF.md`. |
| `P1-T15` | Cloudflare config authority | Static/build | `wrangler.jsonc` is committed as the sole canonical Wrangler config; there is no competing `wrangler.toml`; configuration matches the generated Workers artifact. |
| `P1-T16` | Compatibility-date freeze | Static | `compatibility_date` is explicit and stable; no script automatically rewrites it to the current date. |
| `P1-T17` | Svelte/Vite responsibility | Static/build | SvelteKit builds through Vite; Bun is installer/script runner and does not replace Vite as application bundler. |
| `P1-T18` | Supabase tool authority | Shell/static | `supabase` CLI is an exact project dev dependency, invoked through canonical scripts/Bun; no global CLI version is required for reproducibility. |
| `P1-T19` | Approved quality stack | Static | Vitest, Playwright, svelte-check, ESLint and Prettier are configured as the primary tools and no parallel Jest/Cypress/second formatter-linter stack is introduced. |
| `P1-T20` | Frozen reinstall | Shell/CI | After exact pins and `bun.lock` are committed, a clean frozen install (`bun ci` or proven equivalent) followed by the full Phase 1 gate succeeds without lockfile mutation. |

# Definition of Done

- A fresh developer can clone, configure, start, test, build, and stop the project from documentation.
- No CRM business feature exists yet.
- All future phases inherit one stable quality gate.
- `package.json`, `bun.lock`, `docs/TOOLCHAIN_PROOF.md`, `wrangler.jsonc`, and the dependency baseline agree on the frozen implementation toolchain.

# Handoff to Next Phase

Phase 2 receives a clean technical skeleton and may establish the visual system without implementing CRM business workflows.

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
