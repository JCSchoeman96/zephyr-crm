# v1.4.0 Patchlist Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable item in `docs/V1.4.0_REVIEW_PATCHLIST.md`, preserve frozen P0-P14 behavior where v1.4 does not explicitly supersede it, and leave a verifiable v1.4 release gate.

**Architecture:** Add one forward-only corrective migration for database trust boundaries and compatibility wrappers. Keep domain invariants in PostgreSQL, error classification in a small server helper, queue completeness in server loaders, and browser synchronization in explicit route/test contracts. Extend existing scripts and tests instead of adding a second framework or dependency.

**Tech Stack:** Bun 1.2.22, SvelteKit/Svelte 5, Supabase/PostgreSQL migrations, generated Supabase TypeScript types, Vitest, Playwright, ESLint, Prettier, and the committed Cloudflare workflow.

---

## File map

- Create one corrective SQL migration through `bunx supabase migration new` for the four database blockers, compatibility policy, lineage rules, and any needed indexes.
- Extend the existing database contract scripts, especially `scripts/test-p17-sales-fulfilment.mjs`, `scripts/test-p7-quotes.mjs`, and a new focused review contract if the assertions do not fit an existing phase contract.
- Modify `src/lib/server/fulfilment.ts` and `src/lib/server/sales-queue.ts` only after tests prove the cap/reconciliation failures.
- Add a shared timezone conversion module under `src/lib/time/` with Vitest coverage, then use it in the Fulfilment route and page.
- Extend `src/lib/server/action-errors.ts` and route tests without exposing database messages.
- Make narrow Playwright helper and locator changes in the existing domain tests. Do not touch the protected Bricks files in the original checkout.
- Extend the existing v1.4 release scripts and `.github/workflows/ci.yml` only after the focused and phase gates pass.
- Update the patchlist with a dated disposition and evidence for every item. Never mark an item complete from a declaration alone.

## Task 1: Establish the red tests and migration boundary

**Files:**

- Create: `supabase/migrations/<generated>_v140_review_hardening.sql`
- Create or modify: `scripts/test-v140-review-hardening.mjs`
- Modify: `package.json`
- Test: local Supabase reset plus the new contract script

- [ ] Write tests for: two-argument acceptance producing a complete handoff; two-argument decline being rejected or complete; direct generic Quote terminal mutation being rejected; AAL1 reopen being rejected; forged qualification fields on Lead INSERT being rejected; and compatibility-stage transitions enforcing qualification evidence.
- [ ] Run `bun run db:reset && bun run test:v140:review-hardening` and confirm each test fails for the current migration behavior, not because of a fixture or setup error.
- [ ] Generate the migration with `bunx supabase migration new v140_review_hardening`; do not invent its timestamp.

## Task 2: Close P0 database trust-boundary defects

**Files:**

- Modify: generated corrective migration from Task 1
- Modify: `scripts/test-v140-review-hardening.mjs`
- Modify: `scripts/test-p17-sales-fulfilment.mjs` only where the v1.4 authority supersedes the old two-argument Quote contract

- [ ] Make `accept_quote(uuid,bigint)` call the canonical four-argument handoff with an explicit compatibility source, and make accepted-state idempotency return a complete case/task result.
- [ ] Retire authenticated access to generic `transition_quote_status` and the two-argument decline wrapper, or make the wrapper require complete canonical lost evidence. Update frozen Quote callers to the evidence-bearing action where the v1.4 authority explicitly changes the old path.
- [ ] Restore `require_current_session_aal2()` and `record_security_audit()` to the final `reopen_lead` definition.
- [ ] Extend the Lead initial-state trigger to reject non-null qualification notes and timestamps for ordinary authenticated INSERTs.
- [ ] Run the new contract after each single SQL change, then run `bun run test:p16:persistence` and `bun run test:p17:sales-fulfilment`.

## Task 3: Resolve public workflow policy without breaking historical contracts

**Files:**

- Modify: corrective migration
- Modify: `docs/DOMAIN_MODEL.md`, `docs/SECURITY_MODEL.md`, `docs/FULFILMENT_ARCHITECTURE.md`, `docs/STATE_MACHINES.md`
- Modify: relevant P4-P7/P14 contract fixtures only where v1.4 is the explicit higher-priority amendment

- [ ] Retain `convert_lead` as a compatibility recovery action for the existing Owner/Admin/Sales contract, document that it is not the ordinary decision control, and add an explicit recovery audit/source marker without changing the frozen two-argument caller contract.
- [ ] Keep `transition_lead` public for frozen early-stage callers, but apply the same contact/enquiry evidence checks as `ready_lead_for_quote` for `QUALIFICATION → PROPOSAL`; retain the prohibition on generic `DECISION → WON`.
- [ ] Add direct tests proving generic Lead transitions cannot reach `WON`, missing qualification evidence is rejected, and the accepted Quote path remains the only ordinary win path.
- [ ] Run all affected P4-P7 and P14 regression contracts before updating any authority wording.

## Task 4: Fix server data completeness and task lineage

**Files:**

- Modify: `src/lib/server/fulfilment.ts`
- Modify: `src/lib/server/sales-queue.ts`
- Modify: `supabase/migrations/<generated>_v140_review_hardening.sql` if a view/RPC/index is required
- Test: `src/lib/server/fulfilment.spec.ts`, `src/lib/server/sales-queue.spec.ts`, and database lineage contract

- [ ] Add failing fixtures above the 100-case relation limits and above the 250-quote limit, asserting that a visible case/Lead never appears empty because another parent consumed a global cap.
- [ ] Replace global relation caps with parent-scoped loading or a bounded aggregate that returns explicit continuation/truncation metadata.
- [ ] Enforce the chosen Quote-null rule for Fulfilment Tasks by type and test accepted and rejected lineage combinations.
- [ ] Add detail pagination or an explicit truncation indicator for Activities and other capped relations.
- [ ] Run focused tests, then `bun run test:p18:sales-queues` and `bun run test:p19:fulfilment`.

## Task 5: Fix time, privilege UX, and Realtime claims

**Files:**

- Create: `src/lib/time/zoned-datetime.ts` and its Vitest spec
- Modify: `src/routes/fulfilment/[id]/+page.server.ts`
- Modify: `src/routes/fulfilment/[id]/+page.svelte`
- Modify: `src/lib/server/action-errors.ts`
- Modify: `src/lib/realtime/RealtimeStatus.svelte`, Fulfilment page routes, and the selective Realtime migration if coverage is expanded

- [ ] Write round-trip tests for the configured IANA timezone, a UTC browser, and a DST transition before changing date parsing.
- [ ] Replace `new Date(datetime-local)` and UTC string slicing with the shared conversion contract; show the active timezone beside scheduling controls.
- [ ] Add typed SQLSTATE/action error mapping for 40001, 42501/AAL2, P0002, and validation errors; log only safe server diagnostics and return stable user messages/statuses.
- [ ] Add AAL1/AAL2 route tests and preserve database-level AAL2 enforcement.
- [ ] Either subscribe/publish every table represented by Fulfilment live-update copy or narrow the copy to `tasks`/`quotes`, then add a browser/contract assertion for the chosen promise.

## Task 6: Stabilize browser tests and deployment parity

**Files:**

- Modify: `tests/e2e/domain/lost-flow.e2e.ts`
- Modify: `tests/e2e/domain/product-flow.e2e.ts`
- Modify: `tests/e2e/domain/helpers.ts`, P18/P19 cleanup helpers
- Modify: `playwright.config.ts` and deployment configuration documentation after external form-ID verification

- [ ] Replace Realtime-sensitive `networkidle` waits and ambiguous summary/button locators with stable readiness assertions and scoped controls.
- [ ] Make Product task fixtures isolated from the first-50 queue window, and expose a deterministic filter/pagination contract.
- [ ] Make cleanup failures visible while keeping cleanup idempotent.
- [ ] Verify the Bricks form identifier through approved configuration evidence before aligning `wrangler.jsonc` and Playwright; do not guess or change protected local files.
- [ ] Run the Lost journey, Product journey, P18/P19/P20 browser tests, and the complete domain browser suite.

## Task 7: Make v1.4 release gates execute what they claim

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`, `scripts/check-ci-contract.mjs`
- Modify: `scripts/verify-v140-release-evidence.mjs` and evidence generation/reconciliation scripts
- Test: all v1.4 release commands

- [ ] Add the P16-P20 database, server, browser, metrics, authority, and evidence checks to the authoritative local/CI release gate.
- [ ] Make evidence records include command result provenance that the verifier can check, while keeping external pilot/production boundaries false.
- [ ] Run the release gate from a clean local reset and reconcile evidence only from successful runs.
- [ ] Run `bun run ci:contract`, `bun run authority:v140:verify`, `bun run release:evidence:v140:verify:complete`, `bun run test:release:contract`, and the final v1.4 state gate.

## Task 8: Final audit and check-off

**Files:**

- Modify: `docs/V1.4.0_REVIEW_PATCHLIST.md`
- Create: `.agent/goal-loop/handoffs/PATCHLIST-HARDENING.md` only if the local loop requires a handoff record

- [ ] Run formatting, lint, Svelte/TypeScript checks, unit tests, database lint/types/security, all P0-P14 regression contracts, all P16-P20 contracts, browser journeys, build, release checks, and `git diff --check`.
- [ ] Inspect the diff for unrelated changes and verify the original checkout still contains its protected uncommitted files unchanged.
- [ ] Check off only items supported by current test output or an explicit recorded policy decision. Leave no `Decision required` label for a resolved item.
- [ ] Commit agent-owned changes with explicit paths in bounded checkpoints; never stage protected or unrelated worktree files and never push automatically.
