# Phase 19 — Fulfilment work queues

**Roadmap Version:** 1.4.0
**Status:** Planned
**Required predecessor:** P18
**Authority:** `docs/FULFILMENT_ARCHITECTURE.md`

## Objective

Provide one operational queue and detail record for each accepted sale, then
support every v1.4.0 Fulfilment step and payment-evidence workflow.

## Required work

- Add `/fulfilment` with derived Needs Planning, Installations, Courier,
  Pickup, Payment Attention, and Completed queues.
- Add `/fulfilment/[id]` with Overview, Work, Payments, Tasks, and Activity
  sections that display immutable accepted Quote and Client lineage.
- Add installation scheduling, rescheduling, completion, and reasoned
  cancellation.
- Add courier dispatch/delivery and pickup ready/collection controls.
- Add Deposit and Final Balance milestone controls for awaiting, received,
  not-due, and not-required evidence.
- Add payment follow-up Tasks without changing milestone status.
- Add privileged Fulfilment cancellation and payment correction with AAL2,
  reason, optimistic lock, and Activity/security evidence.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P19-T01` | Fulfilment work queue | Every queue count and row derives from canonical case/step/payment/task truth and reconciles to the detail records. |
| `P19-T02` | Fulfilment detail | Client, accepted immutable Quote, case status, work, payment, Task, and Activity lineage are visible without editable duplicate commercial data. |
| `P19-T03` | Installation UI | Awaiting schedule, scheduled, completed, reschedule, and cancellation guards match the canonical state machine and stale locks fail visibly. |
| `P19-T04` | Courier and Pickup UI | Courier and Pickup controls implement their independent legal lifecycles without provider or inventory integration. |
| `P19-T05` | Payment UI | Deposit and Final Balance controls record actor/time CRM evidence through trusted actions and never imply bank reconciliation or payment processing. |
| `P19-T06` | Payment follow-up | Follow-up creates/reuses the appropriate open Task, leaves the PaymentMilestone status unchanged, and does not create a payment `follow_up` state. |

## Explicit non-goals

No inventory, courier API, payment gateway, bank feed, ledger, invoice,
subscription, or project-management subsystem is part of P19.

## Completion gate

Focused database/server/UI tests, authenticated browser journeys, RLS and
trusted-mutation parity, type/lint/build checks, and all prior phase
regressions pass.
