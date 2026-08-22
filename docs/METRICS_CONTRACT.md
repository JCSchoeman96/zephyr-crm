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
