# Zephyr CRM v1.3.1 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the current v1.3.1 Zephyr CRM checkout into a reproducible, security-hardened, CI-enforced release candidate that is ready for a controlled pilot but has not started pilot or production work.

**Architecture:** Use additive PostgreSQL migrations and narrow trusted actions at the Data API boundary, while preserving authority-permitted ordinary business CRUD. Replace release claims with tracked evidence metadata plus exact current-SHA execution, then reuse those gates in CI. Keep all provider operations behind the existing SendPulse adapter and make ambiguous outcomes non-retryable until trusted reconciliation.

**Tech Stack:** Bun 1.2.22, SvelteKit/Vite, Svelte 5, Supabase/PostgreSQL migrations and local CLI, Vitest, Playwright, Wrangler Cloudflare Workers + Static Assets, project-owned SendPulse REST adapter, GitHub Actions.

---

## Working rules

- Work from the authority baseline `21922d9` plus the local design checkpoint `ffae58b`; do not use the stale pre-sync checkout as authority.
- Treat `CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md`, the v1.3.1 frozen authority documents, and phase authorities as product law.
- Treat the complete RH01–RH06 programme supplied in the active `/goal` as the remediation brief because the named re-audit file is absent from the checkout, `origin/main`, and local refs. Record this provenance in `.agent/goal-loop/handoffs/STARTUP_RECONCILIATION.md`.
- Use forward-only migrations. Do not edit historical migration files.
- Before each production behavior change, add a focused failing test or deterministic static assertion, run it to observe the intended failure, then implement the smallest change and rerun it.
- Use local Supabase only. Use a deterministic fake SendPulse HTTP server. Never call live SendPulse, Bricks, DNS, production Supabase, or client infrastructure.
- Stage explicit paths only. Do not use `git add -A`.

## Task 1: Establish current-goal state and hardening reconciliation

**Files:**
- Create: `.agent/goal-loop/STATE.json`
- Create: `.agent/goal-loop/STATE.md`
- Create: `.agent/goal-loop/handoffs/STARTUP_RECONCILIATION.md`
- Create: `.agent/goal-loop/handoffs/RH01.md` through `.agent/goal-loop/handoffs/RH06.md` as each slice closes
- Modify: `.git/info/exclude` only if `.agent/` is not already excluded

- [ ] Record `HEAD=21922d9d1bc6f4e62ee746488ac4b9282414cda1`, `origin/main` equality, clean pre-existing status, and the audited SHA ancestor result.
- [ ] Record the absent hardening-document evidence and the operative source (`/goal` RH01–RH06 text) without modifying frozen authority.
- [ ] Hash current root/normative/phase authority files with `sha256sum` and copy the exact map from `docs/AUTHORITY_HASHES.json` into loop state; do not replace tracked hashes.
- [ ] Classify each applicable remediation item in the user brief as `OPEN`, `PARTIALLY_FIXED`, `ALREADY_FIXED`, `SUPERSEDED`, or `NOT_APPLICABLE`, including the reason and evidence path.
- [ ] Persist `current_phase=RH01`, `phase_status=PLANNING`, `execution_stage=PHASE_LOOP`, `goal_status=IN_PROGRESS`, `local_build_status=IN_PROGRESS`, `release_status=NOT_READY`, `pilot_status=NOT_STARTED`, and `production_status=NOT_LAUNCHED`.
- [ ] Run `bun run authority:registry`, `bun run authority:coverage`, and `bun run authority:verify`; record all three PASS results and the existing `release:state` result as stale-only evidence, not current-goal completion proof.

## Task 2: RH01 release state machine and evidence registry

**Files:**
- Create: `docs/release/TEST_EVIDENCE.json`
- Create: `docs/release/RELEASE_MANIFEST.json`
- Create: `scripts/verify-test-evidence.mjs`
- Create: `scripts/write-release-evidence.mjs`
- Modify: `scripts/test-p14-release.mjs`
- Modify: `scripts/check-release-state.mjs`
- Modify: `package.json`
- Modify: `Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md` only if a tracked non-authority clarification is needed; never change its frozen mandatory criteria to hide a defect
- Test: `scripts/verify-test-evidence.mjs` fixtures or a focused Node test under `scripts/`

- [ ] Write a failing verifier test proving a mandatory ID with a non-empty label but no executable/static/composed/external proof is rejected.
- [ ] Write a failing verifier test proving an external-only ID cannot be recorded as local `PASS`.
- [ ] Implement the registry schema with exactly 229 unique IDs, `classification` in `AUTOMATED|STATIC|COMPOSED|EXTERNAL`, exact command/assertion or deterministic file/content proof for local entries, and explicit external gate metadata for external entries.
- [ ] Generate or hand-author every P0–P14 row from the frozen phase authorities; verify missing, duplicate, removed, or renumbered IDs fail closed.
- [ ] Replace `mapQualityEvidence()` in `scripts/test-p14-release.mjs` with registry-backed command execution and assertion checks. Remove `assert(phrase.length > 0)` and console-only P14-T02–T12 claims.
- [ ] Make P14 write/read non-terminal readiness fields before P14-T16, mark only P14 `COMPLETE` after its own gate, and transition to `FINAL_PROJECT_VALIDATION` without requiring terminal global state.
- [ ] Make `scripts/check-release-state.mjs` assert the post-global terminal state only when explicitly invoked as the final gate; add a non-terminal P14 readiness assertion for P14-T16.
- [ ] Add `release:verify`, `release:evidence`, and `release:final` package scripts without recursive calls between them.
- [ ] Make `RELEASE_MANIFEST.json` declare authority version `v1.3.1`, application version `v1.0.0-rc.N`, required registry count, expected commands, and no stable `v1.0.0` claim.
- [ ] Run the focused evidence/state tests and `bun run authority:registry && bun run authority:verify && bun run release:verify && bun run test:p14:release` after the implementation is green.

## Task 3: RH02 protected mutation and evidence boundaries

**Files:**
- Create: `supabase/migrations/20260823100000_rh02_trusted_boundaries.sql`
- Modify: `scripts/test-database-security.mjs`
- Modify: `scripts/test-v131-security.mjs`
- Modify: `src/lib/types/database.ts` after generated-type verification
- Test: focused negative/positive Data API probes in `scripts/test-database-security.mjs`

- [ ] Add a failing security probe for authenticated raw Lead INSERT with `pipeline_stage=WON`, forged conversion/lock/pause fields, and a valid normal Lead INSERT that must remain allowed.
- [ ] Add a failing security probe for arbitrary Client `source_lead_id` and raw conversion-lineage update while preserving Client/Contact CRUD with no source Lead.
- [ ] Add a failing security probe for Task `created_by`, automation/reminder/claim fields, parent links, and lock fields while preserving manual Task creation.
- [ ] Add a failing security probe for authenticated OutboundMessage INSERT/UPDATE and arbitrary Activity system event INSERT.
- [ ] Implement trusted initial-state defaults/guards for Lead INSERT; derive normalized phone server-side and reject or normalize protected values according to the frozen policy.
- [ ] Revoke authenticated OutboundMessage INSERT/UPDATE and Activity INSERT; add narrow trusted creation paths for system events and a bounded `add_activity_note` action only if existing note UI needs it.
- [ ] Protect Client conversion provenance and Task automation/reminder fields with INSERT/UPDATE triggers and/or narrowed policies, leaving explicitly editable fields available.
- [ ] Audit every `SECURITY DEFINER` introduced or changed in the migration for explicit `search_path`, qualified sensitive objects, actor/profile/status/role/domain checks, AAL2 where required, and exact EXECUTE grants.
- [ ] Extend privilege introspection to detect missing RLS, anonymous protected execute, authenticated system-table writes, unsafe definers, public execute, and non-invoker reporting views.
- [ ] Run `bun run db:reset`, `bun run db:security`, `bun run test:v131:security`, `bun run test:p4:domain`, `bun run test:p4:tracer`, `bun run test:p5:leads`, and the affected P6–P9 regressions.

## Task 4: RH03 Bricks boundary

**Files:**
- Modify: `src/lib/server/bricks-intake.ts`
- Modify: `scripts/test-p5-leads.mjs`
- Modify: `scripts/test-p4-tracer.mjs` only for affected explicit assertions
- Modify: `docs/SECURITY_MODEL.md` or operational docs only to state the selected unknown-field and external edge-rate-limit policies, followed by an intentional authority/hash update if a frozen document is amended
- Test: Bricks route integration probes covering all required rejection/acceptance cases

- [ ] Write a failing UUID-policy probe for an arbitrary text submission ID.
- [ ] Write a failing unknown-field-policy probe and choose the explicit frozen policy: reject unknown fields.
- [ ] Add explicit method, authorization, content-type, malformed JSON/form, oversize, form ID, UUID, required field, email, bounds, duplicate, canonical valid, and repeated-distinct-ID assertions.
- [ ] Enforce `form_id` and `external_submission_id` bounds and UUID validation before the database call; keep the 64 KiB body cap.
- [ ] Keep full phone display text and normalize only unambiguous international/E.164 values; add unit coverage for ambiguous local numbers.
- [ ] Preserve one Lead/inbound row for duplicate valid IDs and separate rows for distinct legitimate enquiries.
- [ ] Classify hosted WAF/rate limiting as `EXTERNAL` in the registry and document the exact deployment gate without adding an in-memory Worker limiter.
- [ ] Run the Bricks-focused tests, `bun run test:p5:leads`, `bun run test:p4:tracer`, `bun run test:v131:security`, and `bun run diff:check`.

## Task 5: RH04 provider reliability and automation runs

**Files:**
- Create: `supabase/migrations/20260823110000_rh04_delivery_reliability.sql`
- Modify: `src/lib/server/quote-actions.ts`
- Modify: `src/routes/api/automation/process-reminders/+server.ts`
- Modify: `src/lib/domain/communications/sendpulse-adapter.ts` and its spec only for tested provider/fault injection seams
- Modify: `scripts/test-p8-documents.mjs`
- Modify: `scripts/test-p9-automation.mjs`
- Modify: `scripts/test-v131-communications.mjs`
- Modify: `scripts/test-p12-hardening.mjs` for diagnostics assertions
- Modify: generated `src/lib/types/database.ts`
- Test: deterministic local fake SendPulse server and fault-injection cases

- [ ] Add a failing quote fault-injection test for provider success followed by forced `complete_quote_send` failure; assert one provider call and a blocked second retry.
- [ ] Add failing reminder tests for definitive failure, disconnect, malformed response, provider success plus persistence failure, retry-after-definitive-failure, no-retry-after-unknown, overlap, stale claim, reconciliation, and one logical intent.
- [ ] Extend outbound attempts to reminders with unique logical/idempotency keys and explicit attempt state; do not reset `submission_unknown` to retryable failure.
- [ ] Add trusted reconciliation for uncertain reminders and quote finalization that preserves provider identity and is idempotent.
- [ ] Update automation run upsert/finalization so duplicate completed `run_id` returns its existing result, successful zero-failure work is `succeeded`, mixed outcomes are `partial_failure`, and processor-level failure is `failed`.
- [ ] Add diagnostics for uncertain/stale submissions, reconciliation failures, partial runs, and bounded latest errors without secrets or unnecessary PII.
- [ ] Run `bun run test:p8:documents`, `bun run test:v131:communications`, `bun run test:p9:automation`, `bun run test:p12:hardening`, and relevant P4/P7 regressions.

## Task 6: RH05 CI, type drift, and governance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/check-generated-db-types.mjs`
- Modify: `package.json`
- Modify: `scripts/test-database-security.mjs` and authority/release verifiers for CI-facing checks
- Test: workflow syntax/static checks and local command matrix

- [ ] Write a failing generated-type drift test by comparing current local Supabase output to a temporary file rather than mutating `src/lib/types/database.ts`.
- [ ] Implement explicit CI jobs/steps with timeouts for static, DB/domain/security, browser/build, release-contract, type drift, and diff checks. Keep `permissions: contents: read`, pin third-party actions to immutable SHAs where available, and clean Supabase with `if: always()`.
- [ ] Make the CI command list materially cover authority registry/coverage/verify, format/lint/check/unit, security bundle, db security/lint, auth, P4–P13, v1.3.1 cross-cutting suites, build/browser/artifact checks, generated types, and diff hygiene without recursive quality calls.
- [ ] Run the local representative matrix and inspect workflow YAML for valid syntax, clear step names, bounded job timeouts, and no secret output.
- [ ] Only after local workflow validation, inspect current repository governance capability and configure main protection with PR-required hardened checks, no force pushes, no deletion, and no impossible second-human approval. If GitHub permissions are insufficient, record that exact external blocker after all local work is complete.

## Task 7: RH06 pilot auth/readiness

**Files:**
- Modify: `supabase/config.toml`
- Modify: `scripts/test-auth-session.mjs`
- Modify: `scripts/test-database-security.mjs`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/PILOT_READINESS.md`
- Modify: `docs/CLIENT_DEPLOYMENT.md`
- Modify: `README.md`
- Modify: `package.json` only for explicit RC/version/release scripts
- Test: local Auth/MFA/browser flow where supported by the pinned local stack

- [ ] Add a failing config/static assertion for the intended minimum password length and strongest supported password requirements; keep public signup disabled and secure password changes enabled where the pinned CLI supports the field.
- [ ] Determine the supported local Supabase MFA/TOTP configuration from the pinned CLI/config schema before editing; do not invent unsupported fields.
- [ ] Add a failing real-flow test for Owner/Admin AAL1 denial, TOTP enrollment/verification to AAL2, privileged action success, logout, and recovery/re-enrollment semantics where local Auth supports it; retain synthetic AAL2 DB boundary tests.
- [ ] Verify suspended-session denial, invitation-only access, password reset/re-invite, role/status browser authority, secure cookie deployment behavior, and cross-origin mutation behavior.
- [ ] Document exact hosted controls for Bricks WAF/rate limiting, auth abuse protection, webhook protection, and automation endpoint protection as external deployment gates.
- [ ] Review durable constraints for all specified user/provider-controlled fields and add only constraints required by the frozen contract.
- [ ] Document Worker + Static Assets deployment, provider uncertainty/reconciliation, MFA prerequisites, RC `v1.0.0-rc.N`, current `PILOT_READY` local state, `pilot_status=NOT_STARTED`, and `production_status=NOT_LAUNCHED`.

## Task 8: Final validation and terminal state

**Files:**
- Modify: `.agent/goal-loop/STATE.json`
- Modify: `.agent/goal-loop/STATE.md`
- Create/update: `.agent/goal-loop/handoffs/RH01.md` through `.agent/goal-loop/handoffs/RH06.md`
- Modify: tracked release evidence generated for the exact final SHA

- [ ] Verify every RH slice handoff is `COMPLETE`, every applicable hardening finding is closed/superseded/not-applicable, and no Critical/High finding remains.
- [ ] Run the complete authority registry/coverage/hash, format, lint, type, unit, browser/E2E, build, security, token, database reset/lint/security, P4–P13, v1.3.1 security/communications/recovery, release evidence, and diff checks against the exact current SHA.
- [ ] Run the final temporary-marker scan and inspect `git status --short`, the full diff, and staged diff for secrets/debug artifacts/unrelated changes.
- [ ] Set `execution_stage=FINAL_PROJECT_VALIDATION` before the global gate; only after every global check passes set `execution_stage=COMPLETE`, `goal_status=COMPLETE`, `local_build_status=LOCAL_BUILD_COMPLETE`, `release_status=PILOT_READY`, `pilot_status=NOT_STARTED`, and `production_status=NOT_LAUNCHED`.
- [ ] Create a local final checkpoint commit with explicit agent-owned paths; leave the working tree clean and do not push/deploy/launch.
