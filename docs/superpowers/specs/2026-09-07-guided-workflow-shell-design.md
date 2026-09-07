# Guided workflow shell

Status: authorized presentation authority under
`docs/goals/ZEPHYR_GUIDED_WORKFLOW_UX_OVERHAUL_GOAL.md`.
Starting origin/main: `358babc382118b699c4c3ab2869212862f3df1a0`.

## Authority amendment

Reports and Settings are now separate presentation routes only. No new bounded
domain, persistence authority, permission model, metric definition, or business
capability is introduced.

This amendment supersedes the Dashboard-only reporting presentation in
`docs/ARCHITECTURE.md`. Home is operational work at `/`; existing reporting
projections move to `/reports` with the same active-staff authorization.
Existing Owner/Admin Quote configuration moves from `/operations` to
`/settings`, preserving `set_app_setting`, input validation and current-session
AAL2. `/operations` becomes System Health and retains technical diagnostics.

The older plain-language enquiry design remains vocabulary authority. Its
stage-queue navigation and direct conversion presentation are superseded by
the goal's record workflow. Ordinary confirmation uses current sent Quote
acceptance and its atomic Customer/Fulfilment handoff.

The v1.5.1 design and OA-03/OA-04 acceptance remain historical evidence. Their
requirements for a visible Quick custom quote form and defaults in Operations
are superseded. The Product architecture's corresponding shortcut sentence is
also superseded only as presentation. One Builder creates catalogue and custom
lines. The old server action remains compatible. Its implementation composes
`save_quote_draft` and `mark_quote_ready`, which the Builder already exposes.
Subject, item, quantity, price and tax inputs remain represented in the Builder.

No lifecycle, transition guard, permission, optimistic lock, commercial snapshot,
document/hash, Product dimension, revision, Activity, SendPulse, recovery or
release rule changes. The current Product architecture includes dimensions and
catalogue-first creation; its amendments govern those existing capabilities.
All historic mandatory tests remain regression authority except explicit
presentation assertions replaced with equivalent new-workflow evidence.

## Route inventory and disposition

| Route | Existing visible responsibility | Disposition |
| --- | --- | --- |
| `/` | Operational counts, reporting filters/KPIs/attribution, recent follow-ups | KEEP operational counts/work; MOVE analytics to Reports |
| `/sales/[queue]` | Stage-specific lists and qualification/decision forms | KEEP compatibility and actions; REMOVE FROM PRIMARY UX |
| `/sales` | New presentation entry | MERGE work selection into one selected bounded view |
| `/leads` | Searchable enquiry register | KEEP as All enquiries linked from Sales |
| `/leads/[id]` | Contact/request, next step, quote shortcuts, responsibility, history | KEEP record work; MERGE next action; DEMOTE exceptional controls; remove quick form from ordinary UX |
| `/quotes` | Quote register and new-quote entry | KEEP secondary search/reference; REPHRASE technical copy |
| `/quotes/new` | Catalogue-first pending lines and custom lines, header, preview | KEEP sole ordinary Builder; DEMOTE rarely changed header values |
| `/quotes/[id]` | Editor/preview, readiness/send/response/cancel, snapshot, history/delivery | KEEP trusted actions; MERGE response selection; DEMOTE evidence/history/cancellation |
| `/tasks` | Global context selector, list, inline lifecycle forms | KEEP Follow-ups; DEMOTE global creation and reschedule/cancel; contextual creation links |
| `/clients` | Customer register and source provenance | RENAME Customers; DEMOTE provenance from list |
| `/clients/[id]` | Maintenance before identity, contacts, billing, history | KEEP all maintenance semantics; MOVE current information first; DEMOTE lifecycle controls |
| `/fulfilment` | All queues and their counts/rows | KEEP selected queue only; bounded server filtering |
| `/fulfilment/[id]` | Overview, case completion/cancel, steps, payments, tasks, history | KEEP independent obligations; MOVE next actions first; DEMOTE cancellation/corrections |
| `/products` | Catalogue management/search and lifecycle | KEEP existing read population and admin mutation gates; REPHRASE and DEMOTE advanced/archive controls |
| `/operations` | Technical diagnostics and Quote defaults | MOVE defaults to Settings; RENAME System Health; DEMOTE diagnostic detail |
| `/reports` | Intentional 404 | Replace presentation boundary with existing analytics |
| `/settings` | New presentation entry | Existing Quote-default form with unchanged trusted write authority |

Products remain visible to the current read-authorized staff population in the
Administration group. Group placement does not introduce an admin-only read
restriction. Settings and System Health retain Owner/Admin access. Primary
business destinations are Home, Sales, Customers, Fulfilment and Reports.
Detail routes highlight their containing business destination. Topbar remains
page context, mobile navigation and sign-out, without competing destinations.

## Implementation boundaries

Reuse PageHeader, Card, Button, Badge, EmptyState, ErrorState, inputs, existing
form actions and realtime invalidation. Use native disclosure for bounded
secondary work. Introduce only small shared presentation mappings or components
used by more than one page. Do not create a generic workflow engine.

Home fetches operational facts and a short due-work list. Reports reuses the
existing date normalization and analytics RPC definitions. Sales queries the
selected view with server-side filters and a fixed result bound. Lists link
directly to the record that owns the action. They do not embed decision forms.
No full CRM load, client aggregation of business metrics, or polling is allowed.

Fulfilment filters one selected work population before decorating rows. Detail
guidance derives from persisted case/step/payment facts and existing completion
rules. Truncated data must never claim readiness. Database actions remain the
final guard. Independent installation/delivery/payment obligations may each
have one next action. Successful terminal work and history stay readable.

Enquiry prioritizes resume when paused, review for New, qualification details
and Ready for quote, a direct Builder/current Quote link, response handling on
the current Quote, and Customer/Fulfilment links after acceptance. Closed
enquiries expose reopening only under existing authority. Quote responses reveal
only selected evidence fields and explain the resulting customer decision.

Follow-up creation carries the record context to the existing trusted Task
boundary. Global creation remains secondary. Current work precedes history;
record maintenance and dangerous actions remain available with their original
role, reason and lock requirements.

## Validation contract

Baseline frozen install and 164 unit tests passed. Baseline v1.3.2 and v1.4.0
tracked authority verification passed. These are starting evidence, not final
acceptance of the new interface.

Each implementation slice gets focused mapping/server tests and the relevant
browser journey. Changed obsolete presentation assertions are listed in the
acceptance record with their replacements. Existing domain/security assertions
remain intact. Final proof requires `bun run quality`,
`bun run test:e2e:domain`, focused guided-workflow tests and `bun run diff:check`.

Browser evidence covers Won, Lost, revision, contextual follow-up and at least
one full Fulfilment journey. Inspect desktop 1440×900, tablet 1024×768 and
mobile 390×844 for purpose, state, next action, expected outcome, keyboard use,
focus, labelled errors, touch targets and absence of horizontal operational
tables. Usability tasks describe business outcomes without prescribing routes.
Automated browser evidence does not claim an external staff pilot.

Final delivery is one pushed PR with current protected checks passing at its
exact HEAD. Do not merge, deploy or begin follow-on work. The governing goal's
hard STOP conditions remain in force.
