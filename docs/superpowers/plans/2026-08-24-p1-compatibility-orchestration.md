# P1 Compatibility Orchestration Correction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make P1-T14 and P1-T20 use one self-contained Phase 1 compatibility command that owns Supabase setup, proof, cleanup, and lockfile non-mutation verification.

**Architecture:** Add one Node orchestration script that invokes existing Bun package commands in the required order. It captures command output, starts and resets local Supabase before database-dependent checks, always stops Supabase in `finally`, and compares the `bun.lock` hash before and after the run. Keep `quality` unchanged because this correction is scoped to the Phase 1 compatibility proof; P1-T14/T20 will point to the dedicated orchestration instead.

**Tech Stack:** Bun 1.2.22, Node ESM scripts, local Supabase CLI, Vitest, Playwright, SvelteKit/Vite, Wrangler, existing project quality commands, generated release evidence.

---

### Task 1: Add the failing release-contract expectation

**Files:**
- Modify: `scripts/test-release-contract.mjs`

- [x] **Step 1: Change the expected P1 proof commands.**

Change only the P1-T14 and P1-T20 expectations to:

```js
'P1-T14': 'bun run test:p1:compatibility',
'P1-T20': 'bun install --frozen-lockfile && bun run test:p1:compatibility'
```

Add `scripts/test-p1-compatibility.mjs` to both expected source arrays.

- [x] **Step 2: Run the release-contract test and confirm the intended red failure.**

Run:

```sh
bun run test:release:contract
```

Expected: failure because the generated evidence still contains the old `bun run quality` commands and does not yet reference the new orchestration.

### Task 2: Implement the deterministic compatibility orchestration

**Files:**
- Create: `scripts/test-p1-compatibility.mjs`
- Modify: `package.json`

- [x] **Step 1: Add the package command.**

Add:

```json
"test:p1:compatibility": "node scripts/test-p1-compatibility.mjs"
```

- [x] **Step 2: Add the ordered existing-command runner.**

The script must execute these existing commands in this order:

```text
bun run db:start
bun run db:reset
bun run test:p1:toolchain
bun run format:check
bun run lint
bun run check
bun run test:unit -- --run
bun run test:e2e
bun run build
bun run security:bundle
bun run db:test
bun run db:security
```

Use `execFileSync` with captured output so local credentials are not printed. Always invoke `bun run db:stop` from `finally`, preserve the first failure, and return non-zero for any failed step or cleanup failure. Hash `bun.lock` before and after the sequence and fail if it changes.

- [x] **Step 3: Run the new focused command and verify it passes.**

Run `bun run test:p1:compatibility` after ensuring the existing Playwright browser prerequisite is installed. Expected output includes one pass line per compatibility step and a final success line, with Supabase stopped afterward.

### Task 3: Update the frozen reproduction documentation

**Files:**
- Modify: `docs/TOOLCHAIN_PROOF.md`

- [x] **Step 1: Replace the non-sequential reproduction list.**

Document the one-time browser prerequisite separately:

```sh
bun run test:e2e:install
```

Then make the reproducible Phase 1 gate exactly:

```sh
bun install --frozen-lockfile
bun run test:p1:compatibility
```

State that the compatibility command owns Supabase start/reset/stop, includes the check/lint/unit/browser/build/public-bundle/database checks, and verifies `bun.lock` remains unchanged. Do not list `bun run test:p1:lifecycle` followed by database commands.

- [x] **Step 2: Run formatting on the changed documentation.**

Run `bun run format:check` after the documentation and script edits.

### Task 4: Regenerate criterion-level evidence and strengthen assertions

**Files:**
- Modify: `scripts/generate-test-evidence.mjs`
- Modify: `scripts/test-release-contract.mjs`
- Modify: `docs/release/TEST_EVIDENCE.json` (generated only)

- [x] **Step 1: Update the canonical P1 proof mappings.**

Set P1-T14 to `bun run test:p1:compatibility` and P1-T20 to `bun install --frozen-lockfile && bun run test:p1:compatibility`. Both mappings must cite `scripts/test-p1-compatibility.mjs`, `docs/TOOLCHAIN_PROOF.md`, and `package.json`; P1-T20 must additionally cite `bun.lock` and frozen/no-mutation tokens.

- [x] **Step 2: Regenerate evidence through the canonical generator.**

Run:

```sh
bun run release:evidence:generate
bun run release:evidence:verify
bun run test:release:contract
```

Expected: 229 entries, unchanged mandatory IDs, and both P1 entries referencing the orchestration script rather than `quality` or the Phase 1 authority title.

### Task 5: Run final local gates and prepare the existing PR

**Files:**
- Modify: `docs/AUTHORITY_HASHES.json` only if the authority hash tool reports an intentional changed normative document.
- Modify: `.agent/goal-loop/STATE.json`, `.agent/goal-loop/STATE.md`, `.agent/goal-loop/handoffs/P1.md` (ignored local state).

- [x] **Step 1: Confirm frozen installation does not mutate the lockfile.**

Record the `bun.lock` hash, run `bun install --frozen-lockfile`, run `bun run test:p1:compatibility`, and compare the hash again. The hashes must match.

- [x] **Step 2: Run the requested validation ladder.**

Run the authority, CI-contract, evidence, P14, quality, and `git diff --check` commands from the user request. Start Supabase explicitly before `bun run quality` if required by the existing quality script, and stop it afterward without exposing credentials.

- [x] **Step 3: Inspect scope and IDs.**

Confirm no CRM domain/migration paths changed, no Lucide/public-config correction was altered, `bun.lock` has only the pre-existing committed content, and the old/new mandatory ID sets are identical at 229 entries.

- [x] **Step 4: Commit, push, and verify PR #3.**

Stage only the orchestration, package, documentation, evidence-generator, release-contract, generated evidence, plan, and ignored-state handoff paths. Commit the focused correction, push the existing branch, and verify `static`, `database-domain-security`, `browser-build`, and `release-contract` pass at the new exact SHA for PR #3.
