# Phase 20 — Analytics and release reconciliation

**Roadmap Version:** 1.4.0
**Status:** Planned
**Required predecessor:** P19
**Authority:** `docs/FULFILMENT_ARCHITECTURE.md`

## Objective

Make the new Sales and Fulfilment queues measurable, then prove that v1.4.0
did not weaken the completed CRM or misrepresent operator-recorded payment
evidence as accounting data.

## Required work

- Implement only metrics with the written population and timestamp basis in
  `docs/METRICS_CONTRACT.md`.
- Reconcile queue counts, detail records, Activities, Tasks, and aggregates
  against deterministic fixtures.
- Reconcile the v1.4.0 roadmap, all phase authorities, canonical documents,
  generated database types, authority hashes, release evidence, and local
  state.
- Run all P0-P14 mandatory tests plus P15-P20 tests, database/security checks,
  browser journeys, build/type/lint/format checks, and diff checks.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P20-T01` | Fulfilment metrics | Each Sales and Fulfilment metric has a written definition, bounded/index-backed query path, deterministic fixture proof, and clear distinction between recorded CRM evidence and reconciled revenue. |
| `P20-T02` | Full reconciliation | All historical and v1.4.0 acceptance tests, authority hashes, generated types, database/security checks, browser journeys, build/quality checks, and local release evidence pass with no unproven lifecycle transition. |

## Explicit non-goals

No remote deployment, live DNS or sender proof, human pilot, production launch,
or accounting reconciliation is part of P20.

## Completion gate

Only a complete local P0-P20 validation programme may set the v1.4.0 goal to
terminal `LOCAL_BUILD_COMPLETE` / `PILOT_READY`. A failed historical gate
reopens the responsible phase; it is not waived as a v1.4.0 incompatibility.
