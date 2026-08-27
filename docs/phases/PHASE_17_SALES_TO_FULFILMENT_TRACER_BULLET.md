# Phase 17 — Sales-to-Fulfilment tracer bullet

**Roadmap Version:** 1.4.0
**Status:** Planned
**Required predecessor:** P16
**Authority:** `docs/FULFILMENT_ARCHITECTURE.md`

## Objective

Prove one complete accepted-sale journey across the existing Lead and Quote
domains and the new Fulfilment domain before adding horizontal queue UX.

## Required work

- Make Quote acceptance the single ordinary Won action.
- Require the current valid sent Quote and a Decision Lead.
- Lock Quote and Lead in deterministic order and run conversion, Quote
  acceptance, FulfilmentCase creation, Task closure/creation, and Activity
  appends in one trusted transaction.
- Reuse idempotent Client conversion and enforce one FulfilmentCase per
  accepted Quote.
- Return the existing result on a repeated acceptance request.
- Make Quote adjustment create a new draft revision, return the Lead to
  Proposal, and leave the sent revision immutable.
- Make definitive Quote decline close the Quote and Lead together with a
  required LostReason.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P17-T01` | Atomic Quote acceptance | Acceptance atomically records evidence, accepts the current sent Quote, wins the Lead, links/creates the Client, creates exactly one FulfilmentCase, closes obsolete Sales Tasks, creates planning work, and appends Activity. |
| `P17-T02` | Quote revision handback | Adjusting a sent Quote creates a new draft revision, preserves the sent Quote, moves the Lead to Proposal, and re-sending supersedes only the prior sent revision. |
| `P17-T03` | Quote decline closure | Declining the current sent Quote requires valid loss evidence and atomically marks the Quote declined, Lead lost, attention none, closes Sales Tasks, and appends both histories. |
| `P17-T04` | Complete tracer journey | A deterministic end-to-end test proves the accepted path through Client creation/linkage, Installation, Deposit, Final Balance, Installation completion, and FulfilmentCase completion, asserting durable state after each material action. |

## Explicit non-goals

No four-screen Sales expansion, Fulfilment queue, courier/pickup UI, payment
gateway, accounting, or logistics integration is part of P17.

## Completion gate

Focused database/server tests and the real local authenticated browser journey
pass consistently after a clean local reset. P18 cannot start if acceptance can
partially commit, duplicate a handoff, mutate a sent Quote, or bypass a guard.
