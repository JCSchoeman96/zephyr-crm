# Phase 18 — Sales funnel work queues

**Roadmap Version:** 1.4.0
**Status:** Planned
**Required predecessor:** P17
**Authority:** `docs/FULFILMENT_ARCHITECTURE.md`

## Objective

Give staff separate, plain-language Sales work queues while keeping
PostgreSQL state authoritative and reusing existing Lead and Quote behavior.

## Required work

- Add shared Lead queue query and presentation components.
- Add `/sales/enquiries` for canonical `NEW` Leads with `Start Qualification`.
- Add `/sales/qualification` for `QUALIFICATION` Leads with lightweight
  evidence capture and `Ready for Quote`.
- Add `/sales/proposals` for `PROPOSAL` Leads with derived Not Started, Draft,
  and Ready-to-Send presentation.
- Add `/sales/decisions` for current sent Quotes on `DECISION` Leads with
  Accept, Adjust / Requote, and Decline actions through trusted boundaries.
- Update the sidebar while preserving the commercial Quote register,
  customer register, and existing deep links.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P18-T01` | Shared Sales queue | The four Sales screens use shared derived queue logic with bounded queries and no client-side lifecycle authority. |
| `P18-T02` | New Enquiries | Only canonical `NEW` Leads appear and the primary action starts qualification without claiming that no Activity exists. |
| `P18-T03` | Qualification | Only canonical `QUALIFICATION` Leads appear; meaningful evidence and usable contact information guard `Ready for Quote`; no parallel status system exists. |
| `P18-T04` | Quotes to Prepare | Only canonical `PROPOSAL` Leads appear; quote status is derived from the latest valid Quote and the existing editor is reused. |
| `P18-T05` | Awaiting Feedback | Only current sent Quotes on `DECISION` Leads appear; accept, adjust, and decline call trusted actions and never infer a decision from delivery or engagement signals. |
| `P18-T06` | Sales navigation | Navigation, keyboard access, responsive behavior, and existing route regressions pass with separate Sales queues and registers. |

## Explicit non-goals

No new Lead states, duplicate Quote editor, browser lifecycle writes, or
Fulfilment queue is part of P18.

## Completion gate

Focused route/component tests, authenticated browser journeys at mobile/tablet/
desktop widths, type/lint/build checks, and P17/P0-P14 regressions pass.
