# P1 Independent Audit Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Phase 1 toolchain, public-environment, trusted-secret-scan, and release-evidence gaps without changing CRM business/domain behavior, migrations, pilot state, production state, or the 229 mandatory IDs.

**Architecture:** Keep Bun, SvelteKit/Vite, Supabase, Wrangler, and the existing project-owned adapters as the only approved toolchain. Replace the deprecated icon package with the frozen `@lucide/svelte` package, make the existing validated public configuration projection explicit in the security authorities, derive bundle-secret scanning from one trusted-environment key source, and give every P1 evidence entry an executable command plus criterion-specific source proof.

**Tech Stack:** Bun 1.2.22, Svelte 5/SvelteKit 2/Vite 8, `@lucide/svelte` 1.33.0, TypeScript/Vitest, Node/Bun project scripts, local Supabase CLI, generated release evidence, GitHub PR checks.

---

### Task 1: Establish failing contract checks before implementation

**Files:**
- Modify: `src/lib/config/client-config.spec.ts`
- Modify: `src/lib/config/env.spec.ts`
- Create: `scripts/test-p1-toolchain.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the public-projection contract test.**

Extend the existing public configuration test to assert the exact returned top-level fields (`version`, `brand`, `locale`, `quotes`), absence of `sales`, `email`, `integrations`, roles, states, and secret references, and preservation of quote presentation defaults without treating them as authoritative totals.

- [ ] **Step 2: Add the scanner-drift contract test.**

Extend the environment contract test to read `scripts/check-public-bundle.mjs` and assert that every `trustedEnvironmentKeys` entry is represented by the scanner. This must fail against the current scanner because sender-domain/DNS, webhook, automation, and other trusted keys are currently missing.

- [ ] **Step 3: Add the P1 toolchain contract script and package entry.**

Create `scripts/test-p1-toolchain.mjs` with deterministic assertions that package metadata contains exact `@lucide/svelte` 1.33.0, contains no `lucide-svelte`, all application imports use `@lucide/svelte`, the approved Vitest/Playwright/svelte-check/ESLint/Prettier stack is present, and prohibited Jest/Cypress/parallel icon packages are absent. Add `test:p1:toolchain` to `package.json`.

- [ ] **Step 4: Run the focused red checks.**

Run:

```sh
bun run test:p1:toolchain
bun run test:unit -- --run src/lib/config/env.spec.ts src/lib/config/client-config.spec.ts
```

Expected: failure caused by the deprecated Lucide package/imports and the incomplete bundle scanner, not by a test syntax error.

### Task 2: Correct the frozen Lucide package and prove compatibility

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/routes/system/+page.svelte`
- Modify: `src/lib/components/shell/Topbar.svelte`
- Modify: `src/lib/components/shell/Sidebar.svelte`
- Modify: `src/lib/components/ui/Drawer.svelte`
- Modify: `src/lib/components/ui/Modal.svelte`
- Modify: `docs/TOOLCHAIN_PROOF.md`
- Modify: `docs/DEPENDENCY_BASELINE.md`

- [ ] **Step 1: Replace the dependency with the exact stable package.**

Run `bun remove lucide-svelte` followed by `bun add @lucide/svelte@1.33.0`, preserving all unrelated exact dependency versions and regenerating `bun.lock` through Bun.

- [ ] **Step 2: Replace every application import.**

Change only the five existing `lucide-svelte` import specifiers to `@lucide/svelte`; preserve icon names, props, layout, and UI behavior.

- [ ] **Step 3: Record the proven version.**

Update the Lucide row in `docs/TOOLCHAIN_PROOF.md` and the maintained dependency summary in `docs/DEPENDENCY_BASELINE.md` to `@lucide/svelte 1.33.0`. Do not change the frozen technology choice in `DEPENDENCY_BASELINE_v1.0.0.md`.

- [ ] **Step 4: Run the green focused checks.**

Run:

```sh
bun install --frozen-lockfile
bun run test:p1:toolchain
bun run check
```

Expected: all commands exit 0, with no `lucide-svelte` package or import remaining.

### Task 3: Reconcile the public environment boundary

**Files:**
- Modify: `docs/SECURITY_MODEL.md`
- Modify: `docs/LOCAL_DEVELOPMENT.md`
- Modify: `docs/CLIENT_DEPLOYMENT.md`
- Modify: `.env.example`
- Modify: `src/lib/config/client-config.spec.ts`
- Modify: `scripts/test-p13-template.mjs`

- [ ] **Step 1: Freeze the safe public projection in tests.**

Make the browser fixture pass only `parsePublicClientConfiguration(...)` output through `PUBLIC_CLIENT_CONFIG_JSON`. Assert that the serialized projection contains only `version`, `brand`, `locale`, and quote presentation defaults; it must not contain trusted environment names/references, credentials, roles, lifecycle state, or server-owned prices/totals.

- [ ] **Step 2: Amend the security authority minimally.**

Add `PUBLIC_CLIENT_CONFIG_JSON` to the browser-readable boundary as a validated non-secret projection. Enumerate the allowed presentation/configuration fields, state that it is not authority for roles, status/state transitions, prices/totals, or secrets, and retain the complete trusted-only boundary.

- [ ] **Step 3: Reconcile local and P13 documentation/examples.**

Update `docs/LOCAL_DEVELOPMENT.md`, `docs/CLIENT_DEPLOYMENT.md`, and `.env.example` so the optional JSON is explicitly limited to the validated public subset and never carries trusted values, private operational configuration, credentials, API/webhook secrets, or environment-key references.

- [ ] **Step 4: Run the projection tests.**

Run:

```sh
bun run test:unit -- --run src/lib/config/client-config.spec.ts
bun run test:p13:template
```

Expected: the public subset is applied in the browser fixture and no trusted configuration is exposed by the projection test.

### Task 4: Make trusted environment scanning canonical and lifecycle proof deterministic

**Files:**
- Modify: `src/lib/config/env.spec.ts`
- Modify: `scripts/check-public-bundle.mjs`
- Create: `scripts/test-p1-lifecycle.mjs`
- Modify: `package.json`
- Modify: `docs/TOOLCHAIN_PROOF.md`
- Modify: `docs/LOCAL_DEVELOPMENT.md`

- [ ] **Step 1: Keep the trusted-key list canonical in `src/lib/config/env.ts`.**

Retain the complete current `trustedEnvironmentKeys` list as the application contract, including `SUPABASE_URL`, service-role, all SendPulse credential/configuration/sender-domain/DNS/authentication keys, `AUTOMATION_CRON_SECRET`, and Bricks form/webhook keys. The scanner remains a small Node-compatible duplicate because it runs outside the TypeScript application module.

- [ ] **Step 2: Derive scanner coverage from the contract test.**

Make `scripts/check-public-bundle.mjs` scan every trusted name and non-empty trusted value, while separately retaining `CLIENT_CONFIG_JSON` as a private configuration marker. Extend `src/lib/config/env.spec.ts` to compare every canonical `trustedEnvironmentKeys` entry against the scanner source so the scanner cannot silently drift. Keep explicitly authorised `PUBLIC_*` names out of the forbidden exact-name matches.

- [ ] **Step 3: Add guaranteed-cleanup Supabase lifecycle proof.**

Create `scripts/test-p1-lifecycle.mjs` that runs `bun run db:start`, `bun run db:reset`, verifies local status, and always attempts `bun run db:stop` from a `finally` block. Add `test:p1:lifecycle` to `package.json` and document it as the P1 lifecycle proof.

- [ ] **Step 4: Run the focused green checks.**

Run:

```sh
bun run test:unit -- --run src/lib/config/env.spec.ts
bun run security:bundle
bun run test:p1:lifecycle
```

Expected: the scanner covers every shared trusted key and the lifecycle script leaves local Supabase stopped even when a lifecycle assertion fails.

### Task 5: Replace ceremonial P1 evidence with criterion-level mappings

**Files:**
- Modify: `scripts/generate-test-evidence.mjs`
- Modify: `scripts/test-release-contract.mjs`
- Modify: `docs/TOOLCHAIN_PROOF.md`
- Modify: `docs/release/TEST_EVIDENCE.json` (generated only)

- [ ] **Step 1: Add explicit P1 proof definitions.**

Define mappings for all `P1-T01` through `P1-T20` in the canonical generator. Use frozen install proof for T01/T09/T20, `bun run check` for T02, unit tests for T03, build/Workers artifact sources for T04/T10/T15/T16/T17, `test:p1:lifecycle` for T05, scanner plus public projection sources for T06, `.gitignore` plus `git diff --check` for T07, `ci:contract` plus workflow for T08, package/lock/toolchain sources for T11–T13/T18–T19, and the complete compatibility command/documentation for T14.

- [ ] **Step 2: Add release-contract assertions for every P1 mapping.**

Assert the generated P1 entries have the expected command, classification, source paths, and exact content/assertion tokens. Explicitly reject the Phase 1 authority document/title as the sole proof source for any P1 criterion.

- [ ] **Step 3: Regenerate and verify evidence.**

Run:

```sh
bun run release:evidence:generate
bun run release:evidence:verify
bun run test:release:contract
```

Expected: generated evidence has 229 entries, every P1 entry has criterion-specific proof, and the mandatory ID set is unchanged.

### Task 6: Update authority hashes, run all local gates, and inspect scope

**Files:**
- Modify: `docs/AUTHORITY_HASHES.json` (intentional generated hash update)
- Modify: `.agent/goal-loop/STATE.json` and `.agent/goal-loop/STATE.md` (local ignored state)
- Modify: `.agent/goal-loop/handoffs/P1.md` (local ignored handoff)

- [ ] **Step 1: Intentionally regenerate authority hashes.**

Run `node scripts/verify-authority-hashes.mjs --write`, then verify the recorded hashes for `docs/SECURITY_MODEL.md`, `docs/TOOLCHAIN_PROOF.md`, and any other changed normative authority.

- [ ] **Step 2: Run the complete requested validation ladder.**

Run every command supplied by the user, including frozen install, authority/CI/evidence gates, format/lint/check/unit/E2E/build/security, local Supabase start/reset/test/stop, P14 release, quality, and `git diff --check`.

- [ ] **Step 3: Inspect scope and mandatory IDs.**

Confirm the final diff has no `src/lib/domain/**` or `supabase/migrations/**` changes, no unrelated dependency updates, no pilot/production state changes, and exactly 229 mandatory IDs with the old/new ID sets identical.

- [ ] **Step 4: Commit, push, create the single PR, and verify exact-SHA CI.**

Create one focused commit on `fix/phase1-scaffold-toolchain-security-evidence-correction`, push it, open one PR against protected `main`, and require `static`, `database-domain-security`, `browser-build`, and `release-contract` to pass at the exact PR head SHA.
