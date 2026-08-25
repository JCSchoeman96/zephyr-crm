# P14 Hardening Implementation Plan

> **For agentic workers:** Execute this plan autonomously under `AGENTS.md` and the frozen hardening authority. Do not pause between H0-H6.

**Goal:** Implement and locally prove ZH-001 through ZH-018 and P14-T01 through P14-T35, then pass the global final gate with `PILOT_READY` retained as a local readiness state only.

**Architecture:** Preserve PostgreSQL as canonical domain authority. Use additive migrations for trusted mutation boundaries and optimistic concurrency, SvelteKit server actions for orchestration, Svelte components for product UI, and deterministic local provider/document adapters.

**Tech Stack:** Bun, SvelteKit/Svelte 5, Vite/Cloudflare adapter, Supabase PostgreSQL/Auth/RLS, Vitest, Playwright, Zod, Lucide, exact-pinned `pdf-lib` only if its Worker/determinism/security proof passes.

---

### H0: Authority amendment and loop bootstrap

**Files:**

- Create `CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md` as an additive amendment to v1.3.1.
- Create `Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.2.md` as an additive architecture amendment.
- Modify all `Phases/PHASE_*.md` headers to carry roadmap metadata `1.3.2`; append P14-T22..P14-T35 only to Phase 14.
- Modify `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md`, `docs/SECURITY_MODEL.md`, and `docs/CLIENT_MANAGEMENT.md` with the locked hardening law.
- Modify authority hash/manifest/coverage scripts and state files to recognize v1.3.2 and the hardening authority.

**Checks:** verify the frozen hardening SHA, registry ID preservation, no duplicate IDs, all authority hashes, and `git diff --check` before beginning behavior work.

### H1: Release-proof foundation

**Files:**

- Create `scripts/check-pilot-readiness-parity.mjs` and focused unit/contract assertions for non-terminal/final state parity.
- Modify `scripts/test-p14-release.mjs`, `scripts/test-release-contract.mjs`, `scripts/check-ci-contract.mjs`, `package.json`, `.github/workflows/ci.yml`, and release evidence/manifests.
- Add `tests/e2e/helpers/auth.ts`, `tests/e2e/helpers/fixtures.ts`, and domain/browser suites with real session setup.
- Add server-side `/system` gating and test-only flag wiring.

**Checks:** P14-T22..P14-T24 focused tests, CI/gate non-recursion checks, build/bundle checks, and a fresh local authenticated browser smoke against Supabase.

### H2: Data law and trusted boundaries

**Files:**

- Create an additive `supabase/migrations/<timestamp>_p14_hardening_boundaries.sql` migration.
- Regenerate `src/lib/types/database.ts`.
- Extend `scripts/test-database-security.mjs`, `scripts/test-p6-clients.mjs`, `scripts/test-p9-automation.mjs`, and add focused P14 data-boundary tests.

**Behavior:** add Client/Contact locks/status/actions, conversion-only Client creation, archive lineage guards, primary-contact integrity, trusted Task relationship derivation, direct mutation revocations/triggers, and raw authenticated Data API parity tests.

**Checks:** reset/migrate local Supabase, run focused database/security tests, inspect effective privileges/RLS/triggers, then run P6/P9/P12 security regressions.

### H3: Staff UI and capability truth

**Files:**

- Create `src/lib/components/clients/ClientEditor.svelte`, `ClientStatusActions.svelte`, and contact maintenance components as needed.
- Modify `src/routes/clients/[id]/+page.server.ts`, `+page.svelte`, `src/routes/tasks/+page.server.ts`, `+page.svelte`, `Sidebar.svelte`, dashboard, reports/system routes, and styling.
- Add client/contact/task/navigation browser suites.

**Behavior:** support authorized Client identity/billing maintenance and lifecycle actions, contact active/inactive/primary management, Task Lead/Client/Quote contexts with human labels/links, and remove Reports/Settings dead capabilities.

**Checks:** focused Svelte tests, `svelte-check`, role/browser flows at 390/768/1280 widths, accessibility assertions, and no internal-link 404/loop proof.

### H4: Customer-facing documents and email

**Files:**

- Modify `package.json`, `bun.lock`, and create `DEPENDENCY_BASELINE_v1.0.1.md`/toolchain evidence only if `pdf-lib@1.17.1` passes review.
- Rewrite `src/lib/domain/quotes/document.ts` with test-first multi-page layout and snapshot branding.
- Extend document tests, `src/lib/server/quote-documents.ts`, `src/lib/server/quote-actions.ts`, SendPulse adapter tests, and configuration validation.

**Behavior:** deterministic multi-page PDF, long-content wrapping, frozen brand identity, supported-character failure without lossy replacement, exact attachment bytes, escaped client-facing email, and fail-fast sender identity.

**Checks:** 1/25/100-item fixtures, long intro/terms, deterministic bytes/hash, PDF parse/page count/content, Worker build/preview, public-bundle scan, and provider-fixture email assertions.

### H5: Canonical journeys and UX regression

**Files:**

- Create `tests/e2e/domain/won-flow.e2e.ts`, `lost-flow.e2e.ts`, `client-maintenance.e2e.ts`, `task-context.e2e.ts`, and `navigation.e2e.ts` plus role/responsive/accessibility coverage.
- Add deterministic Bricks HTTP fixture and configurable SendPulse provider fixture outside production business logic.

**Behavior:** real authenticated Bricks → Lead → Quote → send → follow-up → Won → Client browser flow; real Lost/reopen role flow; no direct lifecycle RPC/SQL substitutions within journeys.

**Checks:** fresh migrated/seeded Supabase per journey, authenticated browser persistence/reload, P14-T25/P14-T26/P14-T33, and all prior P4-P13 mandatory regressions.

### H6: Reconciliation and final validation

**Files:**

- Modify `docs/release/TEST_EVIDENCE.json`, `RELEASE_MANIFEST.json`, `PILOT_READINESS.md`, `docs/REQUIREMENTS_COVERAGE.md`, authority hashes, `.agent/goal-loop/STATE.*`, and create `.agent/goal-loop/handoffs/P14.md`.
- Add/modify recovery and migration rehearsal scripts only where evidence is currently missing.

**Checks:** P14-T34/P14-T35, fresh frozen install, Supabase reset, full quality/security/database/browser/build/recovery/toolchain gates, `git diff --check`, P14 close with non-terminal state, then `GLOBAL_FINAL` and terminal state parity.
