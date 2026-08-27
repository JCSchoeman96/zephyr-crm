# Phase 15 — Workflow and Fulfilment architecture

**Roadmap Version:** 1.4.0
**Status:** Current architecture phase
**Required predecessor:** P14 from `CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md`
**Authority:** `docs/FULFILMENT_ARCHITECTURE.md`

## Objective

Freeze the additive Sales-to-Fulfilment product boundary before any migration
or application implementation. The accepted Quote is the one handoff event.
Sales owns the enquiry and commercial decision; Fulfilment owns the accepted
sale's operational work; payment milestones record operator-entered CRM
evidence only.

## Scope

P15 defines qualification evidence, the Quote decision contract,
`FulfilmentCase`, `FulfilmentStep`, `PaymentMilestone`, Task and Activity
lineage, role permissions, derived work queues, metrics, routes, indexes, and
cross-resource invariants. It also defines the P16-P20 dependency order.

P15 changes documentation only. It MUST NOT add SQL migrations, generated
database types, application source, routes, dependencies, provider
integrations, payment processing, accounting, inventory, or logistics APIs.

## Deliverables

- `CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md`, defining P15-P20 and their gates.
- `docs/FULFILMENT_ARCHITECTURE.md`, the additive boundary authority.
- Additive v1.4.0 sections in `docs/ARCHITECTURE.md`,
  `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md`,
  `docs/SECURITY_MODEL.md`, `docs/METRICS_CONTRACT.md`,
  `docs/TASK_AUTOMATION.md`, and `docs/ROADMAP.md`.
- The P15-P20 phase authorities under `docs/phases/`.

## Mandatory acceptance requirements

| ID | Name | Exact pass criterion | Evidence |
|---|---|---|---|
| `P15-T01` | Product boundary | The authority defines Sales ending at acceptance, Fulfilment beginning at acceptance, qualification meaning, user-facing queue names, resource ownership, in-scope CRM payment evidence, and explicit non-goals. | `docs/FULFILMENT_ARCHITECTURE.md`, `CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md` |
| `P15-T02` | State-machine authority | Lead/Quote decision behavior, FulfilmentCase, Installation, Courier, Pickup, and PaymentMilestone states and guards have one additive canonical definition; follow-up is Task-derived; corrections are separate privileged actions. | `docs/STATE_MACHINES.md`, `docs/FULFILMENT_ARCHITECTURE.md` |
| `P15-T03` | Resource and invariant authority | The resource graph, fields, ownership, unique relationships, trusted actions, role matrix, concurrency rules, queue derivations, and metric populations are defined without schema or application code. | `docs/DOMAIN_MODEL.md`, `docs/SECURITY_MODEL.md`, `docs/METRICS_CONTRACT.md`, `docs/FULFILMENT_ARCHITECTURE.md` |

## Completion gate

- Every P15 mandatory requirement is satisfied by the named documents.
- v1.3.2 documents remain intact except for clearly marked additive
  amendments and references.
- No migration, source, route, dependency, generated type, or provider file
  is changed for P15.
- P15-P20 have explicit dependency-ordered authorities and no placeholder
  acceptance criteria.
- Authority hashes and loop state record the intentional v1.4.0 amendment.
- The protected pre-existing worktree changes are not staged or overwritten.

## Next phase

P16 — Fulfilment persistence foundation. P16 may begin only after this
architecture phase is recorded as complete and the P16 migration scope is
reviewed against this authority.
