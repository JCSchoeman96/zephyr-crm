# Zephyr CRM metrics contract

Dashboard metrics are PostgreSQL aggregates behind `SECURITY INVOKER` RPCs and
views. The browser never loads CRM rows to calculate KPIs, and Realtime/provider
state cannot alter a metric definition.

## Time and revision rules

Inputs are inclusive UTC calendar dates interpreted as
`[from 00:00:00Z, (to + 1 day) 00:00:00Z)`. The default is the current UTC date
and preceding 29 dates; the maximum is 367 calendar days. User-facing labels
use the configured IANA timezone, but storage and aggregate boundaries remain
UTC. Invalid, reversed, future, or overlong windows are rejected or normalized
to the documented default at the boundary.

Each immutable quote revision is a separate commercial submission. Pipeline
value selects at most the latest `ready` or `sent` quote by `(created_at, id)`
for each eligible lead. Draft, terminal, duplicate and superseded values do
not contribute. Won/Lost counts use the current terminal pipeline state and
the lead activity timestamp; conversion is `Won / (Won + Lost) * 100`, rounded
to two decimal places and exactly zero when the denominator is zero.

## Operational definitions

- New leads: leads created in the window with current stage `NEW`.
- Overdue: open tasks whose due timestamp is before database `now()` and inside
  the selected window.
- Waiting on us/client: non-terminal leads with the matching current attention
  value and creation timestamp in the window.
- Quotes sent: quotes with non-null `sent_at` in the window.
- Accepted value: accepted quotes with `accepted_at` in the window.
- Lost analysis: current `LOST` leads by configured reason/source, with missing
  values reported as `unknown` and at most one latest non-draft quote per lead.
- Attribution: lead creation window grouped by source and UTM dimensions;
  missing UTM values are `(none)` and revenue is accepted quote total by
  acceptance timestamp.

Reporting views use `security_invoker=true`; anonymous callers have no execute
privilege and ordinary RLS remains the row-level authority.

## v1.4.0 additive Sales and Fulfilment metrics

These metrics are defined before implementation. Each population is derived
from canonical PostgreSQL state, not from browser queue labels. Snapshot
metrics use the current UTC instant; event metrics use the named event
timestamp. User-facing dates use the configured IANA timezone.

| Metric | Population and timestamp basis |
|---|---|
| New enquiries waiting | Current `Lead.pipeline_stage = NEW`; snapshot at query time. |
| Qualification backlog | Current `Lead.pipeline_stage = QUALIFICATION`; snapshot at query time. |
| Quotes needing preparation | Current `Lead.pipeline_stage = PROPOSAL`; snapshot at query time, grouped for presentation by no Quote, latest draft, or latest ready Quote. |
| Quotes awaiting decision | Current `Lead.pipeline_stage = DECISION` with its latest actionable sent Quote; snapshot at query time. |
| Average quote response time | Mean of `decision_at - sent_at` for current accepted or declined Quote decisions in the selected window; exclude records without both timestamps and do not count superseded revisions twice. |
| Accepted value | Exact decimal `total` from accepted current Quote revisions whose `accepted_at` falls in the selected window. This is accepted commercial value, not received cash. |
| Open fulfilments | Current `FulfilmentCase.status = open`; snapshot at query time. |
| Upcoming installations | Non-cancelled installation steps with `status = scheduled` and `scheduled_for` in the selected bounded window. |
| Awaiting dispatch | Non-cancelled courier steps with `status = awaiting_dispatch`; snapshot at query time. |
| Awaiting collection | Non-cancelled pickup steps with `status = ready_for_collection`; snapshot at query time. |
| Payments awaiting follow-up | Awaiting PaymentMilestones with an open or overdue `payment_follow_up` Task requirement under the documented queue query; snapshot at query time. The milestone remains `awaiting`. |
| Completed fulfilments | `FulfilmentCase.status = completed` with `completed_at` in the selected window. |

`PaymentMilestone.status = received` measures an authorised user's recorded
CRM fact at `received_at`. It is not reconciled revenue, a bank settlement,
payment-provider confirmation, invoice settlement, or a ledger posting. No
metric may use email opens/clicks to infer Quote acceptance.

The v1.4.0 queue/detail query paths require bounded filters and only the
indexes justified by those populations: Lead stage/activity, Quote lead/status
and revision ordering, FulfilmentCase status/client/accepted Quote,
FulfilmentStep case/type/status/schedule, PaymentMilestone case/type/status,
and Task case/status/due time.
