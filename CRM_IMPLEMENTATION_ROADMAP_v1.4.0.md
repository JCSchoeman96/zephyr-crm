# Zephyr CRM implementation roadmap v1.4.0

**Version:** 1.4.0
**Base authority:** `CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md`
**Architecture authority:** `docs/FULFILMENT_ARCHITECTURE.md`
**Status:** Frozen additive roadmap authority
**Deployment model:** One isolated stack per client

This roadmap extends the completed v1.3.2 CRM from sales through the first
operational work after a sale. It preserves the P0-P14 requirements, tests,
historical migrations, roles, quote immutability, optimistic locking, RLS,
Activity evidence, and single-client deployment model. It does not rewrite the
v1.3.2 roadmap or silently change a completed-phase requirement.

The v1.4.0 documents are the current authority for the additive Sales-to-
Fulfilment boundary. Where the v1.3.2 documents say that the product ends at
Client conversion or defer payment-related work, this roadmap and
`docs/FULFILMENT_ARCHITECTURE.md` explicitly supersede those statements for
the v1.4.0 scope only. Unchanged v1.3.2 rules remain in force.

## Ordered execution

Dependencies are strict. P15 must close before P16 starts, and each later
phase must pass its own gate before the next phase begins.

| Phase | Authority                                                   | Objective                                                                                                      | Required predecessor |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- |
| P15   | `docs/phases/PHASE_15_WORKFLOW_FULFILMENT_ARCHITECTURE.md`  | Freeze the Sales-to-Fulfilment boundary, resources, states, permissions, routes, metrics, and invariants       | P14                  |
| P16   | `docs/phases/PHASE_16_FULFILMENT_PERSISTENCE_FOUNDATION.md` | Add durable FulfilmentCase, FulfilmentStep, PaymentMilestone, Task lineage, RLS, indexes, and trusted actions  | P15                  |
| P17   | `docs/phases/PHASE_17_SALES_TO_FULFILMENT_TRACER_BULLET.md` | Make Quote acceptance atomically hand a sale to Client and Fulfilment, then prove one installation journey     | P16                  |
| P18   | `docs/phases/PHASE_18_SALES_FUNNEL_WORK_QUEUES.md`          | Add the four explicit Sales work queues and make accept, adjust, and decline obvious                           | P17                  |
| P19   | `docs/phases/PHASE_19_FULFILMENT_WORK_QUEUES.md`            | Add the Fulfilment queue/detail screens and installation, courier, pickup, payment, and follow-up interactions | P18                  |
| P20   | `docs/phases/PHASE_20_ANALYTICS_RELEASE_RECONCILIATION.md`  | Add defined operational metrics and complete v1.4.0 regression/release reconciliation                          | P19                  |

P0-P14 remain completed-phase regression authority. Their mandatory tests may
be extended by v1.4.0, but may not be deleted, weakened, renamed, or skipped.
The v1.4.0 tests are additive and use IDs P15-T01 through P20-T02.

## Product flow

The canonical internal Lead values remain:

```text
NEW → QUALIFICATION → PROPOSAL → DECISION → WON
                                              │
                              Client + FulfilmentCase

NEW / QUALIFICATION / PROPOSAL / DECISION → LOST
```

The staff-facing Sales queues are:

```text
New Enquiries      = NEW
Qualification      = QUALIFICATION
Quotes to Prepare  = PROPOSAL
Awaiting Feedback  = DECISION with the current sent Quote
```

`WON` is removed from active Sales work after the accepted Quote handoff.
`LOST` remains available as a closed opportunity view. Fulfilment is a
separate operational domain and never becomes another Lead pipeline state.

## Phase boundaries

### P15: Workflow and Fulfilment architecture

P15 is documentation only. It freezes the additive authority in
`docs/FULFILMENT_ARCHITECTURE.md`, the amended canonical domain and state
documents, and the phase authorities in `docs/phases/`.

P15 MUST:

- define the exact Quote-acceptance handoff from Sales to Fulfilment;
- define qualification evidence without creating a questionnaire or a new
  Lead state;
- define `FulfilmentCase`, `FulfilmentStep`, `PaymentMilestone`, Task lineage,
  Activity lineage, permissions, derived queues, metrics, and invariants;
- preserve sent Quote immutability and revision behavior;
- record explicit additive supersession of v1.3.2 clauses that conflict with
  the new boundary; and
- leave a dependency-ordered plan for P16-P20.

P15 MUST NOT add migrations, application source, routes, dependencies,
generated database types, provider integrations, payment processing, or
accounting behavior.

### P16: Persistence foundation

P16 adds one or more forward-only migrations only after P15 is frozen. It
creates the new durable records and trusted database actions, enables RLS,
adds only query-backed indexes, extends generated types, and proves legal,
illegal, stale, unauthorized, and duplicate requests. It has no polished UI.

### P17: Tracer bullet

P17 implements one complete path:

```text
NEW → QUALIFICATION → PROPOSAL → sent Quote → DECISION
→ accepted Quote → Client → FulfilmentCase
→ Installation → Deposit received → Final Balance received
→ Installation completed → FulfilmentCase completed
```

Acceptance is one trusted transaction. Repeated requests return the existing
result and cannot create duplicate Clients, Contacts, FulfilmentCases, or
initial planning Tasks. P18 cannot start until the deterministic end-to-end
journey passes.

### P18: Sales funnel work queues

P18 adds shared queue queries/components and the routes for New Enquiries,
Qualification, Quotes to Prepare, and Awaiting Feedback. Queue labels are
derived from PostgreSQL state. The existing Quote editor remains the document
register/editor; P18 does not duplicate it or invent Lead states for draft and
ready-to-send presentation.

### P19: Fulfilment work queues

P19 adds `/fulfilment` and `/fulfilment/[id]`, then expands the tracer bullet
to installation, courier, pickup, payment milestones, payment follow-up
Tasks, cancellation, and privileged correction. It does not add inventory,
logistics-provider, gateway, bank, or accounting integrations.

### P20: Analytics and release reconciliation

P20 defines and implements the operational metrics in the v1.4.0 authority,
reconciles the canonical docs and generated types, runs the complete P0-P20
test programme, and updates local release evidence. A recorded payment is
CRM evidence, not reconciled revenue. No pilot or production state may be
claimed by this local roadmap.

## Cross-phase implementation law

- PostgreSQL remains the durable business authority.
- RLS controls row visibility. Trusted PostgreSQL actions or trusted server
  boundaries control material transitions and cross-resource transactions.
- Every new mutable resource uses `lock_version` and rejects stale writes.
- Material transitions append Activity in the same transaction.
- Unique constraints and idempotent trusted actions prevent duplicate handoffs,
  milestones, and retry-created work.
- Follow-up is a Task. It is never a payment or lifecycle state.
- Sent Quote commercial content remains immutable. Adjustments create a new
  draft revision and preserve the old sent revision.
- Existing roles remain `owner`, `admin`, `sales`, and `viewer`.
- No Redis, queue, microservice, payment provider, accounting ledger,
  inventory system, courier API, or unrelated dependency is introduced.
- All migrations are forward-only once applied. No historical v1.3.2
  migration may be rewritten.

## Completion gate

The v1.4.0 roadmap is complete only when P15-P20 are complete, all P0-P14
mandatory tests still pass, every new mandatory test passes, the local quality
and database/security gates pass, the browser journeys pass, authority hashes
are reconciled, generated types are clean, and `git diff --check` passes.

The local terminal projection remains:

```text
goal_status = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

Hosted deployment, real sender/DNS proof, human pilot observation, and
production launch remain outside this local roadmap.
