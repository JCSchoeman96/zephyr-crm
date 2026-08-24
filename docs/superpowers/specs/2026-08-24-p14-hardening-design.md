# Zephyr CRM P14 Hardening Design

**Source authority:** `docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md`

**Goal:** Bring the existing v1 CRM implementation to a truthful, locally proven pilot-ready release candidate without moving transactional authority out of PostgreSQL or performing remote/production actions.

## Design

The hardening pass keeps PostgreSQL and trusted database actions authoritative for lifecycle transitions, relationship integrity, concurrency, idempotency, snapshots, audit evidence, and provider state. SvelteKit server modules parse requests and orchestrate those actions; Svelte components render and submit product flows; pure TypeScript is limited to deterministic presentation calculations, document rendering, and adapters.

The work proceeds as additive, test-backed slices:

1. version and reconcile the roadmap/architecture/evidence authorities;
2. make machine release state singular and human readiness mechanically checked;
3. add a non-recursive P14 gate and stateful local browser harness;
4. add additive Client, ClientContact, Task, and Data API mutation-boundary law;
5. expose Client/contact maintenance and useful Task context while removing dead navigation;
6. replace the one-page quote prototype with a deterministic multi-page branded renderer and safe quote email;
7. prove canonical Won/Lost journeys with real authenticated browser actions;
8. reconcile evidence, close P14 non-terminally, and run the global final gate.

## Locked boundaries

- Client creation remains conversion-only.
- Client status is `active ↔ inactive`; Owner/Admin archive/restore is reasoned and guarded by direct and source-Lead work.
- ClientContact is `active ↔ inactive`, preserves history, and has one active primary at most.
- Quote-linked Task context is derived from the Quote and cannot be forged with caller-supplied relationships.
- Direct authenticated Data API mutations cannot bypass trusted-only actions.
- Quote documents use frozen snapshot branding and deterministic local generation; sent artifacts remain immutable.
- SendPulse browser proof uses a local configurable provider fixture and never introduces a production test-success branch.
- Reports, Settings, and the Component Lab are not ordinary v1 capabilities.
- Historical migrations remain immutable; every schema correction is additive.

## Verification model

Every slice begins with a failing focused test or contract assertion, then the smallest implementation, then focused and cumulative regression checks. P14-T22 through P14-T35 are appended to the existing registry; no P0-P13 or P14-T01-P14-T21 test is deleted, renamed, weakened, or silently reused. The final state is written only after P14 closes and `GLOBAL_FINAL` passes.
