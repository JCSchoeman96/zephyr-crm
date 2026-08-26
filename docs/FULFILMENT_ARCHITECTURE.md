# Zephyr CRM Sales-to-Fulfilment architecture

**Status:** Frozen additive v1.4.0 architecture authority
**Base authority:** v1.3.2 P0-P14 implementation authority
**Roadmap:** `CRM_IMPLEMENTATION_ROADMAP_v1.4.0.md`
**Deployment model:** One isolated stack per client

This document freezes the v1.4.0 extension from the existing Lead and Quote
workflow into the first operational work after a sale. It is additive. The
v1.3.2 authorities remain the historical and regression authority for P0-P14.
This document explicitly supersedes only the old statements that the product
ends at Client conversion, that ordinary Quote acceptance may be followed by a
separate normal conversion action, and that all payment-related work is
deferred. Every other v1.3.2 rule remains in force.

Within v1.4.0, this is the canonical cross-domain definition. The additive
sections in the architecture, domain, state, security, metrics, task, and
roadmap documents repeat only their responsibility-specific constraints and
must agree with this document.

## Product boundary

The canonical internal Lead pipeline remains:

```text
NEW → QUALIFICATION → PROPOSAL → DECISION → WON
                                              │
                              Client + FulfilmentCase

NEW / QUALIFICATION / PROPOSAL / DECISION → LOST
```

Sales ends and Fulfilment begins at the trusted acceptance of the current
valid sent Quote:

```text
Quote accepted
─────────────── Sales ends / Fulfilment begins ───────────────
```

Sales owns the enquiry, qualification evidence, Quote revisions, and customer
decision. Fulfilment owns the accepted sale's operational work. A `Client` is
the long-lived customer record. A `FulfilmentCase` is one accepted sale. One
Client can have many cases over time.

The staff-facing Sales queues are derived from the canonical Lead and Quote
state:

| Screen | Canonical population | Meaning |
|---|---|---|
| New Enquiries | `Lead.pipeline_stage = NEW` | Nobody has started qualification. |
| Qualification | `Lead.pipeline_stage = QUALIFICATION` | Staff are confirming requirements and quoting readiness. |
| Quotes to Prepare | `Lead.pipeline_stage = PROPOSAL` | Staff owe the customer a quote. |
| Awaiting Feedback | `Lead.pipeline_stage = DECISION` with the current sent Quote | The customer owes a decision. |

`WON` leaves active Sales work after the acceptance handoff. `LOST` remains a
closed opportunity population. Fulfilment is never represented as an extra
Lead state.

## Qualification semantics

`NEW` means that qualification has not started. The primary action is
`Start Qualification`, which moves the Lead to `QUALIFICATION` and records
`qualification_started_at`.

Qualification means that staff are checking whether the enquiry is genuine,
collecting enough information for a sensible quote, and identifying missing
contact or request details. The additive Lead evidence is:

```text
qualification_notes
qualification_started_at
qualified_at
```

`Ready for Quote` moves `QUALIFICATION` to `PROPOSAL`, records `qualified_at`,
and requires a usable contact method plus meaningful enquiry information. A
usable contact method is a non-blank email or phone. Meaningful information is
a non-blank original Lead `message` or `qualification_notes`. No large
questionnaire is required, and these fields do not form a second status
system.

## Quote decision contract

The existing Quote lifecycle and immutable sent content remain in force. The
v1.4.0 cross-resource decision contract is:

| Action | Quote | Lead | Attention | Required side effects |
|---|---|---|---|---|
| Send | `sent` | `DECISION` | `waiting_on_client` | Create or preserve the configured follow-up Task. |
| Adjust / Requote | New `draft` revision | `PROPOSAL` | `waiting_on_us` | Preserve the sent revision; ensure quote-preparation work. |
| Send revision | Current revision `sent`; prior sent revision `superseded` | `DECISION` | `waiting_on_client` | Preserve the old revision as history. |
| Accept | Current sent Quote `accepted` | `WON` | `none` | Convert/link Client, create one FulfilmentCase, close obsolete Sales Tasks, create planning work, and append Activity atomically. |
| Decline | Current sent Quote `declined` | `LOST` | `none` | Require valid LostReason, close obsolete Sales Tasks, and append Quote/Lead Activity atomically. |

The current valid sent Quote is the latest actionable sent revision for the
Lead. It is not terminal or superseded, and it has no newer draft revision
awaiting send. Acceptance and decline require the Lead to be in `DECISION`,
lock Quote and Lead in deterministic order, and check expected lock versions.
Ordinary users cannot reach `WON` through a generic Lead transition. The
existing `convert_lead` action remains an authorised migration/recovery path
where policy permits it, not the normal decision button.

Acceptance is idempotent. A repeated request after a committed acceptance
returns the existing result and cannot create another Client, ClientContact,
FulfilmentCase, planning Task, or handoff Activity. A simultaneous acceptance
and decline has exactly one legal winner.

## Resource graph

```text
Profile
  └──< Lead
       ├──< Quote ──< QuoteItem
       │       └──< OutboundMessage
       ├──< Task
       ├──< Activity
       └──> Client ──< ClientContact
                    └──< FulfilmentCase
                         ├──< FulfilmentStep
                         ├──< PaymentMilestone
                         ├──< Task
                         └──< Activity
```

`accepted_quote_id` is the commercial handoff link. It is unique on
`FulfilmentCase`. The accepted Quote stays immutable and remains the authority
for the commercial value and snapshot. The Client is not a place to store
installation, delivery, or payment fields.

## FulfilmentCase

`FulfilmentCase` represents one accepted Quote that needs operational work. Its
minimum durable fields are:

```text
id
fulfilment_number
client_id
lead_id
accepted_quote_id
status
created_at
updated_at
completed_at
cancelled_at
cancel_reason
lock_version
```

The case has one of these statuses:

```text
open → completed
open → cancelled
```

Only the trusted acceptance action creates a case. Only trusted actions can
complete or cancel it. Cancellation requires Owner/Admin authority, current
session AAL2/MFA, the expected lock version, and a non-blank reason. It keeps
all related operational and audit history.

## FulfilmentStep

`FulfilmentStep` models work that can coexist on one accepted sale. A case can
have installation and courier, for example. Its minimum fields are:

```text
id
fulfilment_case_id
type
status
scheduled_for
completed_at
tracking_reference
notes
created_at
updated_at
lock_version
```

There is at most one active step of a given type per case. A cancelled step
remains as history and does not count as an active step. Step types and their
successful terminal states are:

| Type | Lifecycle | Successful terminal |
|---|---|---|
| `installation` | `awaiting_schedule → scheduled → completed`; cancellation from `awaiting_schedule` or `scheduled` | `completed` |
| `courier` | `awaiting_dispatch → dispatched → delivered`; cancellation from `awaiting_dispatch` or `dispatched` | `delivered` |
| `pickup` | `preparing → ready_for_collection → collected`; cancellation from `preparing` or `ready_for_collection` | `collected` |

Rescheduling changes `scheduled_for`, checks the current lock, and appends an
Activity. It does not create a new status. Cancellation requires a reason.

## PaymentMilestone

`PaymentMilestone` records what an authorised user says is true about one
payment milestone. It is not a payment processor, bank feed, invoice, ledger,
VAT, refund, or reconciliation record. Its minimum fields are:

```text
id
fulfilment_case_id
type
status
requested_at
received_at
received_recorded_by
note
created_at
updated_at
lock_version
```

Types are `deposit` and `final_balance`. There is one of each type per case.
The v1.4.0 resource has no amount field. The accepted Quote remains the
commercial amount authority.

The normal status path is:

```text
not_due → awaiting → received
   └──────────────→ not_required
```

Requesting payment changes `not_due` to `awaiting`. Recording receipt changes
`awaiting` to `received` and stores actor/time evidence. A milestone can be
marked `not_required` from `not_due` through the ordinary trusted path.
Changing an awaiting milestone to not required, reversing a received fact, or
editing receipt evidence is a privileged correction with a reason, expected
lock, Activity, and security-audit evidence. No `follow_up` payment state
exists.

## Tasks and Activity

Tasks remain concrete next actions with the existing `open`, `completed`, and
`cancelled` lifecycle. A Fulfilment Task adds `fulfilment_case_id` and uses
one of these v1.4.0 types where applicable:

```text
plan_fulfilment
schedule_installation
complete_installation
dispatch_order
confirm_delivery
prepare_pickup
confirm_collection
payment_follow_up
```

The trusted Task boundary derives Client and Lead lineage from the
FulfilmentCase. Browser-supplied parent IDs that do not match are rejected.
An open `payment_follow_up` Task records work owed. It never changes the
PaymentMilestone status, and equivalent open follow-ups are reused or rejected
deterministically.

`Activity` gains `fulfilment_case_id` and remains append-only. Handoff, case,
step, payment, Task, cancellation, correction, and completion actions append
Activity in the same transaction as the state change. Privileged corrections
also append security-audit evidence.

## Completion guard

A case may become `completed` only when all of these conditions hold:

1. At least one non-cancelled FulfilmentStep exists in its successful terminal
   state.
2. Every required non-cancelled step is in its successful terminal state.
3. Every required PaymentMilestone is `received` or `not_required`.
4. The caller is authorised and supplies the current case `lock_version`.

A case with only cancelled steps cannot be completed. Completing a case does
not erase or rewrite the accepted Quote, Client, step, payment, Task, or
Activity history.

## Permissions and trusted boundaries

The existing roles remain `owner`, `admin`, `sales`, and `viewer`.

| Action | Sales | Admin | Owner | Viewer |
|---|---:|---:|---:|---:|
| Work Sales queues | yes | yes | yes | read |
| Create/send/revise Quote | yes | yes | yes | read |
| Accept/decline current Quote | yes | yes | yes | read |
| Fulfilment step updates | yes | yes | yes | read |
| Record payment received/not required | yes | yes | yes | read |
| Correct received payment evidence | no | yes | yes | read |
| Cancel FulfilmentCase | no | yes | yes | read |
| Complete FulfilmentCase | yes | yes | yes | read |

RLS controls row visibility. Trusted PostgreSQL actions control material
transitions, protected fields, lock versions, lineage, idempotency, and
cross-resource transactions. The action boundary is responsible for:

```text
start_lead_qualification
ready_lead_for_quote
accept_quote
revise_quote
decline_quote
create_fulfilment_step
dispatch_fulfilment_step
ready_fulfilment_step
schedule_fulfilment_step
reschedule_fulfilment_step
complete_fulfilment_step
cancel_fulfilment_step
request_payment_milestone
record_payment_received
mark_payment_not_required
correct_payment_milestone
complete_fulfilment
cancel_fulfilment
create_task
```

Every action validates active identity, role, current state, expected lock,
required relationships, and idempotency where retries are possible. Browser
state never grants authority. Raw Data API writes cannot bypass the trusted
boundary.

## Work queues and routes

The v1.4.0 routes are:

```text
/sales/enquiries
/sales/qualification
/sales/proposals
/sales/decisions
/fulfilment
/fulfilment/[id]
```

Existing `/leads`, `/quotes`, and `/clients` remain accessible as registers
and deep-link-compatible detail surfaces. `/quotes` remains the commercial
document register/editor. `/clients` remains the customer register.

`/fulfilment` derives these queues without persisting duplicate queue labels:

| Queue | Derived population |
|---|---|
| Needs Planning | Open cases with no active step. |
| Installations | Open non-cancelled installation steps that are awaiting schedule or scheduled. |
| Courier | Open non-cancelled courier steps that are awaiting dispatch, dispatched, or delivered according to the selected work view. |
| Pickup | Open non-cancelled pickup steps that are preparing or ready for collection. |
| Payment Attention | Open cases with an awaiting PaymentMilestone requiring work or an open/overdue payment follow-up Task. |
| Completed | Cases with status `completed`. |

The detail page has Overview, Work, Payments, Tasks, and Activity sections.
It always shows the Client and accepted immutable Quote lineage. Commercial
values are displayed from the accepted Quote and are not edited in
Fulfilment.

## Metrics

The v1.4.0 metrics use canonical database state and the written timestamp
basis below. Queue labels are projections, not durable facts.

| Metric | Definition |
|---|---|
| New enquiries waiting | Current Leads in `NEW`. |
| Qualification backlog | Current Leads in `QUALIFICATION`. |
| Quotes needing preparation | Current Leads in `PROPOSAL`, grouped by no Quote, latest draft, or latest ready Quote. |
| Quotes awaiting decision | Current `DECISION` Leads with their current sent Quote. |
| Average quote response time | Mean sent-to-accepted/declined duration for decisions in the selected bounded window, excluding incomplete timestamps and duplicate revisions. |
| Accepted value | Exact Quote totals for accepted current revisions by `accepted_at` in the selected window. It is not received cash. |
| Open fulfilments | Current `FulfilmentCase.status = open`. |
| Upcoming installations | Scheduled non-cancelled installation steps within the selected bounded window. |
| Awaiting dispatch | Current non-cancelled courier steps in `awaiting_dispatch`. |
| Awaiting collection | Current non-cancelled pickup steps in `ready_for_collection`. |
| Payments awaiting follow-up | Awaiting milestones with the documented open/overdue `payment_follow_up` requirement. The milestone remains `awaiting`. |
| Completed fulfilments | Cases completed by `completed_at` in the selected window. |

Accepted value and recorded received milestones are CRM facts. They must never
be presented as reconciled revenue or bank settlement.

## Concurrency and performance

Acceptance, decline, step transitions, payment recording, correction, and case
completion use PostgreSQL transactions, deterministic row-lock order,
optimistic `lock_version`, unique constraints, and append-only Activity. The
important races are:

```text
accept versus decline       → exactly one legal decision
repeated accept             → one Client and one FulfilmentCase
stale payment record        → lock conflict, no silent overwrite
repeated case completion    → one legal terminal transition
```

The documented query paths justify indexes on Lead stage/activity, Quote
lead/status/revision, FulfilmentCase status/client/accepted Quote,
FulfilmentStep case/type/status/schedule, PaymentMilestone case/type/status,
and Task case/status/due time. v1.4.0 adds no Redis, queue service,
microservice, or global Realtime layer.

## Explicit non-goals

The v1.4.0 extension does not include accounting, bank reconciliation,
payment gateways, invoicing, subscriptions, refunds, inventory management,
courier-provider APIs, logistics integrations, project management, customer
portals, electronic signatures, multi-company tenancy, or production/pilot
deployment. Payment milestones are manual CRM evidence only.

## Authority and phase boundary

P15 is documentation only. It freezes this document, the additive sections in
the canonical architecture/domain/state/security/metrics/task documents, and
the P15-P20 phase authorities. P16 may add migrations only after P15 is
closed. No P15 file creates schema, application, route, dependency, or
provider behavior.
