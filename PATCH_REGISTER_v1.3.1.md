# Zephyr CRM — Patch Register v1.3.1

**Patch type:** Authority/loop correctness and security hardening
**Baseline:** v1.3.0 Toolchain & Dependency Freeze
**Scope:** Documentation and autonomous execution-authority pack only; no CRM feature implementation
**Rule:** Preserve every v1.3.0 mandatory test ID and every v1.3 toolchain/dependency decision.

## Forward-Port Decision

The supplied patchlist targeted the older v1.2.0 → v1.2.1 line. It remains substantively relevant, but its version names, filenames and expected 209-test count are obsolete after v1.3.0. This release forward-ports the applicable law to v1.3.1. The v1.3.0 baseline has 218 mandatory tests; 11 new gates are appended, producing 229. Existing IDs are not reused.

## Patch Checklist

- [x] **PATCH-001 — Break Phase 14 / final-gate circular dependency.** P14 now closes on its own mandatory tests/regression tier; global final validation starts only after P14 is COMPLETE and may reopen defective work.
- [x] **PATCH-002 — Correct `P14-T16`.** ID retained; semantic changed to a satisfiable `FINAL_VALIDATION_PENDING` readiness-state test while P14 is VALIDATING.
- [x] **PATCH-003 — Fix Phase 0 pre-scaffold quality-gate contradiction.** P0 runs only authority/static/Git gates that exist at P0; Phase 1-created application commands are not P0 prerequisites.
- [x] **PATCH-004 — Freeze deterministic Git bootstrap.** Existing Git state is captured; absent Git may be locally initialised under strict workspace rules; explicit-path staging only; `git add -A` prohibited for autonomous checkpoints; never push.
- [x] **PATCH-005 — Freeze trusted PostgreSQL function security law.** INVOKER by default; DEFINER only for documented elevation with safe search path, qualified objects and internal authorization/domain checks.
- [x] **PATCH-006 — Restrict function EXECUTE privileges.** Protected functions revoke inappropriate PUBLIC/default EXECUTE and grant selectively according to the mutation matrix.
- [x] **PATCH-007 — Harden SECURITY DEFINER functions.** Safe explicit search path, fully-qualified sensitive references, minimum elevation and documented reason are mandatory.
- [x] **PATCH-008 — Freeze application role/status authority.** `auth.users.id` → protected `profiles.id`; `profiles.role/status` authoritative; user-controlled `raw_user_meta_data` cannot grant privileges.
- [x] **PATCH-009 — Disable/test public signup.** Invitation/admin-provisioned access only; unauthenticated self-registration is test-backed as denied.
- [x] **PATCH-010 — Require AAL2 for privileged Owner/Admin operations.** MFA enrollment alone is insufficient; trusted boundaries deny AAL1 for privileged actions.
- [x] **PATCH-011 — Secure analytics views.** Browser/Data-API views use `security_invoker=true` or an equivalently secured trusted RPC boundary.
- [x] **PATCH-012 — Add hard-bounce operational remediation.** Current actionable hard bounce preserves Quote history, sets message bounced, returns attention to `waiting_on_us`, and ensures exactly one corrective Task; stale/duplicate events are safe.
- [x] **PATCH-013 — Hash all frozen normative authorities.** State model now carries a complete `authority_sha256` map in addition to roadmap/bootstrap and phase hashes.
- [x] **PATCH-014 — Revalidate completed phase-authority hashes.** Every new phase boundary checks all frozen authorities, every completed phase authority and the current phase authority.
- [x] **PATCH-015 — Add dedicated Unexpected Authority Drift execution stop.** Drift is not silently rehashed and has a specific blocker report contract.
- [x] **PATCH-016 — Make Auth recovery semantics concrete.** Identity/profile/role/status/suspension reconstruction, ID preservation/remap contract, password/re-invite/MFA expectations, Storage mapping and Auth configuration are explicit.
- [x] **PATCH-017 — Rename Phase 12 production-launch wording.** Phase 12 is a local production-readiness hardening gate; actual launch remains post-build.
- [x] **PATCH-018 — Use release-candidate semantics before pilot.** Local output is a pre-release candidate such as `v1.0.0-rc.1`; stable `v1.0.0` is post-pilot only.
- [x] **PATCH-019 — Regenerate portable v1.3.0 → v1.3.1 patch.** Release produces a Git-style `a/` / `b/` patch and validates `git apply --check` plus tree equivalence.
- [x] **PATCH-020 — Add loop-state-machine consistency validation.** Release validation proves reachable P0–P14 completion, P14-before-final sequencing, terminal-state reachability only after the global gate, and reopen behavior.
- [x] **PATCH-021 — Preserve frozen tests and append new gates.** 218/218 v1.3.0 IDs preserved; 11 appended; 229 total; no duplicates; phase-local numbering contiguous. `P14-T16` keeps its ID with documented impossible-contract correction.
- [x] **PATCH-022 — Version authority pack consistently.** Pack/Roadmap = v1.3.1; phase headers = Roadmap 1.3.1; architecture blueprint = v1.2.1; v1.3.0 release controls preserved under History.
- [x] **PATCH-023 — Create v1.3.1 release artifacts.** Patch register, release notes, validation report, manifest, portable patch, checksum and archive are produced and verified.

## New Mandatory Tests

Because v1.3.0 already occupied IDs proposed by the older patchlist, collision-safe append-only IDs are used:

```text
P0-T15 Trusted database function security contract
P0-T16 Authorization/MFA assurance contract
P0-T17 Authority-hash coverage contract

P3-T14 Trusted function EXECUTE boundary
P3-T15 SECURITY DEFINER hardening
P3-T16 Role/status authority
P3-T17 Public signup disabled
P3-T18 Privileged AAL2 enforcement

P8-T18 Hard-bounce remediation
P10-T12 Analytics view authorization
P12-T22 Auth reconstruction fidelity
```

`P14-T16` remains the same frozen ID, but is corrected because its v1.3.0 condition was logically circular/impossible.

## Expected Registry

```text
P0  T01–T17
P1  T01–T20
P2  T01–T11
P3  T01–T18
P4  T01–T11
P5  T01–T16
P6  T01–T12
P7  T01–T16
P8  T01–T18
P9  T01–T11
P10 T01–T12
P11 T01–T11
P12 T01–T22
P13 T01–T13
P14 T01–T21
```

**Total:** 229 unique mandatory tests.
