# Zephyr CRM State Machines

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.0.0

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
follow_up_scheduled
paused
```

An open Task determines the next action. `overdue` and `needs_follow_up` are derived conditions from Task due time; they are not Attention values. `paused` requires a reason and may include a resume time. Sending a Quote normally sets pipeline to `DECISION`, attention to `waiting_on_client`, and creates a follow-up Task.

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

Canonical values are lowercase:

```text
pending → sending → submitted
```

From `submitted`, provider observations may produce:

```text
delivered
bounced
failed
```

The primary state is delivery/submission state. Engagement events such as `opened` and `clicked` are MessageEvent types and never replace the delivery state. A provider acknowledgement can be `submitted` while delivery remains uncertain until a provider event arrives. Hard bounce requires remediation evidence and must not be silently treated as successful delivery.

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
