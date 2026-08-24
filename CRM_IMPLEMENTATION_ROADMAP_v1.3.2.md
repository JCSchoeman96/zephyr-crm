# CRM Implementation Roadmap — Additive v1.3.2 Hardening Amendment

**Version:** 1.3.2
**Base authority:** `CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md`
**Hardening authority:** `docs/hardening/ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md`
**Status:** Frozen additive implementation authority

This patch-level roadmap preserves the ordered P0–P14 roadmap, every completed
P0–P13 semantic requirement, and every existing mandatory test ID. It adds the
P14 hardening extension P14-T22 through P14-T35 and the ZH-001 through ZH-018
acceptance obligations defined by the frozen hardening authority. The hardening
authority is the exact product/implementation authority for this amendment;
`AGENTS.md` remains execution authority.

## Ordered execution

P0 through P13 remain complete and frozen regression authority. P14 remains the
only active phase and executes H0 through H6:

```text
H0 authority amendment
  → H1 release-proof foundation
  → H2 database/trusted mutation law
  → H3 staff UI and capability truth
  → H4 customer-facing PDF/email
  → H5 canonical browser journeys
  → H6 reconciliation and final validation
```

P14 closes non-terminally. Only `FINAL_PROJECT_VALIDATION` may persist
`goal_status=COMPLETE`, `LOCAL_BUILD_COMPLETE`, and `PILOT_READY`.

## Additive P14 hardening scope

- ZH-001–ZH-018 are mandatory and must be proven locally.
- P14-T01–P14-T21 remain unchanged mandatory regression gates.
- P14-T22–P14-T35 are appended and must map to actual files, commands, and assertions.
- PostgreSQL remains durable business authority; historical migrations are immutable and all schema fixes are additive.
- No remote deployment, live DNS/email verification, real customer data, real SendPulse credentials, human pilot, or production launch is part of this roadmap.

## Completion state

After P14 close, the project enters `FINAL_PROJECT_VALIDATION` with P14
complete but release state non-terminal. The final local state is valid only
after the global gate passes:

```text
goal_status = COMPLETE
execution_stage = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```
