# Zephyr CRM Autonomous Loop v1.3.1 — Release Notes

## Purpose

v1.3.1 is a documentation/execution-authority hardening release on top of v1.3.0. It does not implement CRM features or mutate remote infrastructure. It preserves the complete v1.3 Toolchain & Dependency Freeze while fixing remaining loop-correctness and security-authority gaps identified in the older v1.2.1 patch proposal.

## Critical fixes

- Removes the Phase 14 / global-final-validation circular dependency.
- Corrects `P14-T16` so it can pass while P14 is still VALIDATING.
- Makes global final validation a distinct post-P14 execution stage and allows it to reopen defective phases.
- Removes Phase 0 dependency on Phase 1-created application quality tooling.
- Adds deterministic local Git bootstrap/provenance and explicit-path autonomous staging.

## Security hardening

- Trusted PostgreSQL functions default to `SECURITY INVOKER`.
- `SECURITY DEFINER` requires documented elevation, safe explicit search path, qualified sensitive references, internal actor/role/status/domain checks and minimum EXECUTE exposure.
- Protected RPC/function EXECUTE privileges are explicitly restricted; inappropriate PUBLIC/default access is revoked.
- `profiles.role` / `profiles.status` are the server-controlled application authorization authority; user-controlled `raw_user_meta_data` is prohibited for privilege decisions.
- Public signup is explicitly disabled and tested.
- Privileged Owner/Admin operations require current authenticated-session AAL2; enrollment-only MFA semantics are insufficient.
- Supabase Data API reporting views use security-invoker semantics or an equivalent trusted authorization boundary.

## Domain and operational hardening

- A definitive hard bounce for the current actionable Quote communication preserves Quote history, marks the message bounced, returns attention to `waiting_on_us`, and ensures exactly one corrective contact-verification Task.
- Authority drift protection now hashes every frozen normative authority plus completed/current phase authorities and has a dedicated Unexpected Authority Drift stop.
- Auth recovery now distinguishes application-data restore from identity-plane recovery/reconstruction, including profile/role/status mapping, suspension, password/re-invite, MFA re-enrollment expectations and Storage mapping.
- Phase 12 is explicitly a local production-readiness hardening gate, not production launch.
- Local completion produces a pre-release candidate such as `v1.0.0-rc.1`; stable `v1.0.0` remains post-pilot.

## Regression preservation

v1.3.0 contained 218 unique mandatory tests. v1.3.1 preserves all 218 IDs and appends 11 new gates for a total of 229. No existing test ID is removed or renumbered. `P14-T16` retains its ID and is semantically corrected because the prior condition was circular.

## Version authorities

- Authority pack / roadmap: **v1.3.1**
- Architecture blueprint: **v1.2.1**
- Dependency baseline: **v1.0.0** (unchanged; still authoritative)
- Phase headers: **Roadmap Version 1.3.1**
- Prior v1.3.0 release-control artifacts: preserved under `History/v1.3.0/`
