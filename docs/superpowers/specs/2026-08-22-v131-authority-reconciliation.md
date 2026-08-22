# Zephyr CRM v1.3.1 Authority Reconciliation Design

## Context

The existing implementation at `2d76e12` is complete and internally passing against the v1.1 authority set. The preserved v1.3.1 pack adds security, domain, recovery, toolchain, deployment, authority-drift and final-gate requirements without introducing a new CRM product scope.

## Decisions

1. **Preserve the implementation and use forward corrections.** Existing migrations and valid data contracts remain intact. New database law is added in a forward migration; historical migrations are not rewritten.
2. **Adopt Workers + Static Assets.** The v1.3.1 architecture is authoritative. The existing SvelteKit adapter output already contains a Worker entrypoint and static asset directory, so Wrangler configuration, preview commands, tests and operator documentation will be moved to the Workers model together.
3. **Keep PostgreSQL as business truth.** Attention is reduced to `none`, `waiting_on_client`, and `waiting_on_us`; follow-up remains Task-derived; pause fields are separate. Outbound messaging gains explicit logical idempotency, attempt uncertainty, reconciliation and hard-bounce remediation without changing quote history.
4. **Enforce privileged security at trusted boundaries.** AAL2 is read from the current JWT session claim, role/status comes from `profiles`, public signup remains disabled, exposed RPC execute privileges are narrowed, and every remaining `SECURITY DEFINER` function is documented and hardened.
5. **Make recovery concrete without exporting credentials.** Backups include non-secret Auth reconstruction evidence and configuration/mapping evidence; disposable restore proves deterministic profile reconstruction, suspension semantics, Storage mapping, and password-reset/re-invite plus MFA re-enrolment expectations.
6. **Freeze the actual local toolchain.** Bun remains the sole runner/package manager, Vite remains the application bundler, direct dependencies and the project-local Supabase CLI are exact-pinned, and a reproducible proof is checked into `docs/TOOLCHAIN_PROOF.md`.
7. **Import authorities only after truth is repaired.** The v1.3.1 root authority files and phase authorities are copied from the preserved pack after implementation and documentation gates pass. Hashes, coverage, state and release evidence are regenerated against those final files.

## Non-goals

No remote deployment, pilot activity, production mutation, new CRM feature family, provider SDK, alternate package manager, or post-v1 backlog item is included.

## Acceptance

The reconciled repository must pass the complete local quality/security/database/browser/build gate, explicit Won and Lost journeys, v1.3.1 authority/hash/coverage checks, and final state validation with `PILOT_READY`, `NOT_STARTED`, and `NOT_LAUNCHED` statuses.
