# Phase 16 — Fulfilment persistence foundation

**Roadmap Version:** 1.4.0
**Status:** Planned
**Required predecessor:** P15
**Authority:** `docs/FULFILMENT_ARCHITECTURE.md`

## Objective

Add the smallest forward-only database foundation that can represent an
accepted sale's operational work without changing the historical v1.3.2
migrations or adding polished UI.

## Required work

- Add `qualification_notes`, `qualification_started_at`, and `qualified_at`
  to Lead through an additive migration, with trusted guards for meaningful
  qualification evidence.
- Add `fulfilment_cases`, `fulfilment_steps`, and `payment_milestones` with
  foreign keys, unique accepted-Quote and milestone relationships, valid
  type/status constraints, UTC timestamps, and `lock_version`.
- Add `fulfilment_case_id` to Tasks and Activities. Trusted Task creation
  derives the Lead and Client lineage from the FulfilmentCase and rejects
  mismatching caller hints.
- Enable RLS and restrict raw lifecycle/relationship writes. Add only indexes
  required by the documented queue/detail queries.
- Regenerate and verify database types.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P16-T01` | Additive fulfilment schema | The local schema enforces the documented FulfilmentCase, FulfilmentStep, and PaymentMilestone fields, foreign keys, unique relationships, valid combinations, locks, and RLS without rewriting historical migrations. |
| `P16-T02` | Task and Activity lineage | A FulfilmentCase Task/Activity carries server-derived Client/Lead lineage, rejects mismatched parent hints, and preserves existing non-Fulfilment Task rules. |
| `P16-T03` | Trusted fulfilment actions | Legal and illegal case/step/payment transitions, authorization, stale locks, Activity evidence, and completion guards are proven through trusted database actions. |

## Explicit non-goals

No browser UI, payment provider, accounting ledger, inventory, courier API,
queue worker, or unrelated dependency is part of P16.

## Completion gate

`bun run db:reset`, database lint/types/security checks, focused P16 tests,
and the applicable P0-P14 integrity regressions pass. P17 cannot start while
any direct-write, stale-lock, duplicate, lineage, or illegal-transition test
fails.
