# Zephyr CRM State Machines

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.2.2 (v1.3.2 hardening amendment)

These are the only canonical lifecycle states and legal transitions. Pipeline state, attention state, and Task state remain separate.

## Lead pipeline

Canonical values are uppercase:

```text
NEW → QUALIFICATION → PROPOSAL → DECISION → WON
```

Any non-terminal commercial stage may transition to `LOST`:

```text
NEW → LOST
QUALIFICATION → LOST
PROPOSAL → LOST
DECISION → LOST
```

The complete transition matrix is:

| Current | Legal next states | Required evidence |
|---|---|---|
| `NEW` | `QUALIFICATION`, `LOST` | `LOST` requires LostReason |
| `QUALIFICATION` | `PROPOSAL`, `LOST` | `LOST` requires LostReason |
| `PROPOSAL` | `DECISION`, `LOST` | `LOST` requires LostReason |
| `DECISION` | `PROPOSAL`, `WON`, `LOST` | `LOST` requires LostReason; `WON` requires conversion policy |
| `WON` | none | terminal except Owner/Admin correction |
| `LOST` | none | terminal except Owner/Admin `reopen_lead` |

`reopen_lead` is an administrative action from `LOST` to `QUALIFICATION`, requires a reason, and appends Activity. A Won Lead remains Won under ordinary operations.

## Lead attention

Attention values are lowercase and independent of pipeline state:

```text
none
waiting_on_client
waiting_on_us
```

An open Task determines the next action. `overdue` and `needs_follow_up` are derived conditions from Task due time; they are not Attention values. A pause is orthogonal state represented by `paused_at`, `pause_reason`, and optional `resume_at`; it does not become an Attention value. A scheduled follow-up is a `Task` with `type = follow_up`, never an Attention value. Sending a Quote normally sets pipeline to `DECISION`, attention to `waiting_on_client`, and creates a follow-up Task.

## Quote lifecycle

Canonical values are lowercase:

```text
draft → ready → sent
```

Terminal states from `sent` are:

```text
accepted
declined
expired
cancelled
superseded
```

Legal transitions:

| Current | Legal next states | Rules |
|---|---|---|
| `draft` | `ready` | valid commercial snapshot and at least one valid item |
| `ready` | `draft`, `sent` | `sent` runs trusted finalization/send boundary |
| `sent` | `accepted`, `declined`, `expired`, `cancelled`, `superseded` | commercial content immutable |
| `accepted` | none | terminal |
| `declined` | none | terminal |
| `expired` | none | terminal |
| `cancelled` | none | terminal |
| `superseded` | none | terminal |

Changing a sent proposal creates a new `draft` revision linked to the original. When the new revision is sent, the prior sent revision becomes `superseded`; the old Quote remains unchanged and historically readable.

## Task lifecycle

Canonical values are lowercase:

```text
open → completed
open → cancelled
```

`completed` and `cancelled` are terminal. Rescheduling changes `due_at` and appends Activity; it does not create a new state. The derived overdue condition is `status = open AND due_at < now()`.

## Outbound Message lifecycle

Canonical `delivery_status` values are lowercase:

```text
pending → claimed → submitting
                         ├── submitted
                         │     ├── delivered
                         │     ├── bounced
                         │     └── failed
                         ├── failed
                         └── submission_unknown
```

`pending` is a persisted logical send intent. `claimed` records that one
trusted worker owns the logical message and its current attempt, and
`submitting` means that the provider request is in progress. `submitted`
requires a provider acknowledgement. `failed` is a definitive failure,
while `submission_unknown` means that the request may have reached the
provider but no definitive acknowledgement was received.

From `submitted`, provider observations may produce:

```text
delivered
bounced
failed
```

The primary state is delivery/submission state. Engagement events such as
`opened` and `clicked` are MessageEvent types and never replace the delivery
state. A `submission_unknown` message must not be blindly resent: provider
correlation and an authorised reconciliation decision are required before any
controlled retry. A controlled retry creates a new attempt under the same
logical message and never creates a second logical initial-send intent. Hard
bounce requires remediation evidence and must not be silently treated as
successful delivery.

## Outbound Message Attempt lifecycle

Each logical message keeps append-only attempt evidence. The submission
lifecycle of an attempt is:

```text
claimed → submitting → submitted
                         ├── failed
                         └── submission_unknown
```

Trusted completion and reconciliation may add provider identifiers, terminal
timestamps, and provider observations to the attempt; ordinary browser
updates and deletes are prohibited. A provider `delivered` or `bounced`
observation is recorded as MessageEvent evidence and updates the logical
OutboundMessage delivery state according to the provider contract. A retry
after a controlled decision appends a new attempt number and idempotency key
under the same logical message. No automatic resend is allowed from
`submission_unknown`.

## User lifecycle

Canonical Profile status values are lowercase:

```text
invited → active → suspended
```

An invitation may be reissued while `invited`. A suspended Profile cannot perform normal CRM access. Owner-only administration can restore an appropriate status with audit evidence; no public signup path exists.

## InboundSubmission lifecycle

Canonical intake values are lowercase:

```text
received → accepted
```

Alternative terminal outcomes are `duplicate`, `rejected`, and `failed`. The unique `(source, external_submission_id)` boundary makes retries deterministic. A duplicate request returns the original accepted/duplicate outcome and never creates a second Lead.

## Activity rules

Activity has no editable lifecycle. It is append-only evidence. Material transitions and trusted actions append the canonical events defined in `docs/DOMAIN_MODEL.md` inside the same transaction as the state change. Ordinary users cannot update or delete Activity rows.

## Transition implementation rules

- The database stores the current state.
- Trusted actions validate the current state and requested transition server-side.
- RLS does not rely on browser metadata for authority.
- Optimistic `lock_version` checks reject stale updates.
- Idempotency records guard external retries and scheduled processors.
- All state transition attempts that alter business meaning produce an Activity record, including administrative reopen/correction.

## Client lifecycle

Client creation is not a standalone lifecycle action; it is the conversion
result of an eligible Decision Lead. Once converted, legal transitions are:

```text
active ─────→ inactive
  │             │
  │             └────→ active
  │
  └────→ archived

inactive ─────→ archived

archived ──Owner/Admin + restore reason──→ inactive
```

Sales may not archive. Archive requires a non-empty reason, Owner/Admin
authority, the expected `lock_version`, and no open Task or non-terminal Quote
through the Client or its source Lead lineage. Archived Clients are read-only
under ordinary operations; direct restore to `active` is illegal.

## ClientContact lifecycle

```text
active ↔ inactive
```

New contacts start active. An inactive contact cannot be primary. A primary
switch clears the previous primary atomically; inactivating the current primary
requires an active replacement when another active contact exists. Contact
history is retained and ordinary hard delete is prohibited.

## v1.4.0 additive Sales-to-Fulfilment state authority

This section is an additive amendment to the v1.3.2 state machines. Existing
Lead, Quote, Task, message, user, intake, Client, and ClientContact values
remain unchanged except for the explicitly amended Quote decision path.

### Qualification evidence and Lead decision path

Qualification is a meaningful working stage, not a ceremonial click. The
trusted Start Qualification action moves `NEW → QUALIFICATION` and records
`qualification_started_at`. The trusted Ready for Quote action moves
`QUALIFICATION → PROPOSAL`, records `qualified_at`, and requires:

- a usable contact method, meaning a non-blank email or phone; and
- meaningful enquiry information, meaning a non-blank Lead `message` or
  `qualification_notes`.

The ordinary v1.4.0 path from `DECISION → WON` is only the trusted acceptance
of the current valid sent Quote. A normal browser action may not call a generic
Lead transition to win an opportunity. `convert_lead` remains an authorised
migration/recovery boundary where policy permits it. Existing Lost transitions
remain valid, but definitive Quote decline uses the atomic Quote-decline
action described below.

#### v1.4 compatibility decisions

The v1.4 policy retains the two-argument `convert_lead` RPC for frozen v1.3.2
callers and migration/recovery work. It is not a normal Sales decision button;
ordinary `WON` is reached through `accept_quote`. The compatibility boundary
retains the historical Owner/Admin/Sales grant so completed P0–P14 contracts
do not break, writes a `lead_converted_compatibility` security-audit event, and
marks the resulting `lead_won` Activity with `conversion_policy` evidence.
Operators must supply any case-specific recovery rationale through the
surrounding incident or migration record. A future strict policy amendment may
retire this compatibility surface after those callers are migrated.

`transition_lead` remains a compatibility workflow API for non-terminal Lead
stages and `LOST`. It cannot reach `WON`; its `QUALIFICATION → PROPOSAL` path
enforces the same usable-contact and meaningful-enquiry evidence required by
`ready_lead_for_quote`. The dedicated evidence-bearing actions remain the
preferred browser contract.

### Quote decision contract

| Action | Quote result | Lead result | Attention | Cross-resource result |
|---|---|---|---|---|
| Send | `sent` | `DECISION` | `waiting_on_client` | follow-up Task remains/creates |
| Adjust / Requote | new `draft` revision | `PROPOSAL` | `waiting_on_us` | old sent Quote remains immutable; prepare-quote Task is ensured |
| Send revision | current revision `sent`; previous sent revision `superseded` | `DECISION` | `waiting_on_client` | old revision remains readable |
| Decline | current sent Quote `declined` | `LOST` | `none` | LostReason required; obsolete Sales Tasks close |
| Accept | current sent Quote `accepted` | `WON` | `none` | Client conversion/link, one FulfilmentCase, planning Task, and Activity occur atomically |

The current valid sent Quote is the latest actionable sent revision for the
Lead, is not terminal or superseded, and has no newer draft revision awaiting
send. Acceptance or decline locks the Quote and Lead in deterministic order,
checks both current `lock_version` values, and rejects a stale or conflicting
request. A repeated request returns the existing terminal handoff result when
the same acceptance has already committed.

### FulfilmentCase lifecycle

Canonical values are lowercase:

```text
open → completed
open → cancelled
```

`completed` and `cancelled` are terminal. Only a trusted action can create a
case or change its lifecycle. Completion requires at least one successful
non-cancelled FulfilmentStep, all required non-cancelled steps in successful
terminal states, and each required PaymentMilestone in `received` or
`not_required`. Cancellation requires an Owner/Admin-authorised reason and
does not erase step, payment, Task, or Activity history.

### FulfilmentStep lifecycles

Steps use lowercase type and status values. A case may hold independent
installation, courier, and pickup steps. At most one active step of a given
type may exist for a case.

| Type | Legal states and transitions | Successful terminal state |
|---|---|---|
| `installation` | `awaiting_schedule → scheduled → completed`; `awaiting_schedule → cancelled`; `scheduled → cancelled` | `completed` |
| `courier` | `awaiting_dispatch → dispatched → delivered`; `awaiting_dispatch → cancelled`; `dispatched → cancelled` | `delivered` |
| `pickup` | `preparing → ready_for_collection → collected`; `preparing → cancelled`; `ready_for_collection → cancelled` | `collected` |

Rescheduling an installation changes `scheduled_for`, checks the current
`lock_version`, and appends `fulfilment_step_rescheduled`; it does not create
a new status. Cancellation requires a non-blank reason and trusted action.

### PaymentMilestone lifecycle

Each FulfilmentCase has at most one `deposit` and one `final_balance`
milestone. Canonical statuses are lowercase:

```text
not_due → awaiting → received
   └──────────────→ not_required
```

`not_due → not_required` is the ordinary waived-milestone path. A trusted
action may request payment with `not_due → awaiting`, and an authorised user
may record `awaiting → received` with `received_at` and
`received_recorded_by`. Marking an awaiting milestone not required, reversing
a received fact, or changing its evidence is a privileged correction with a
reason, current lock, Activity, and security-audit evidence. There is no
`follow_up` payment status. An open `payment_follow_up` Task is the only
follow-up evidence.

### Fulfilment transition rules

- The accepted Quote remains immutable and is the commercial source for the
  case.
- Acceptance, decline, and revision handback use the existing Quote/Lead
  trusted-action boundary and append Activity transactionally.
- Case and step actions validate active Profile, role, current state,
  expected `lock_version`, required relationships, and idempotency where
  retries are possible.
- Fulfilment Tasks derive Client and Lead lineage from the case. Browser hints
  that disagree with that lineage are rejected.
- Payment evidence is a CRM fact, not a payment processor or accounting
  event.
- A case may not complete merely because all payment milestones are done; a
  successful operational step is required as well.
