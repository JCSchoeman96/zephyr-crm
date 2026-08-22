# Zephyr CRM Dashboard Metric Contract

Phase 10 dashboard values are PostgreSQL aggregates. The browser renders the returned values and does not load CRM rows to calculate them.

## Date window

Every dashboard RPC accepts an inclusive UTC calendar date window:

```text
[from 00:00:00 UTC, (to + 1 day) 00:00:00 UTC)
```

The default window is the current UTC calendar date and the preceding 29 dates (30 calendar days). The maximum accepted window is 367 calendar days. Missing, malformed, reversed, future, or overlong UI input falls back to that default. Database RPCs reject missing, reversed, or overlong arguments rather than silently widening the query.

## Operational Needs Attention

- **New Leads**: Leads whose current `pipeline_stage` is `NEW` and whose `created_at` falls in the selected window.
- **Overdue Tasks**: Tasks with `status = 'open'`, a `due_at` before the current database time, and a due timestamp in the selected window.
- **Due today**: Open Tasks whose due timestamp is in the current database calendar date. The count is zero when the selected window does not include the current date.
- **Waiting on us**: Non-terminal Leads with `attention_state = 'waiting_on_us'` and `created_at` in the selected window.
- **Waiting on client**: Non-terminal Leads with `attention_state = 'waiting_on_client'` and `created_at` in the selected window.
- **Expiring Quotes**: Quotes with `status = 'sent'` and `valid_until` in the selected window.

## Sales KPIs

- **Leads**: All Leads created in the selected window, regardless of current pipeline stage.
- **Quotes sent**: Every Quote with a non-null `sent_at` in the selected window. Each immutable Quote revision is a separate commercial submission.
- **Quote value**: The exact sum of `total` for Quotes counted as Quotes sent.
- **Accepted value**: The exact sum of `total` for Quotes with `status = 'accepted'` and `accepted_at` in the selected window.
- **Won / Lost**: Terminal Leads whose `last_activity_at` falls in the selected window and whose current stage is `WON` or `LOST` respectively.
- **Conversion rate**: `Won / (Won + Lost) * 100`, rounded to two decimal places. It is exactly `0.00%` when the denominator is zero.
- **Pipeline value**: For Leads created in the selected window whose current stage is `QUALIFICATION`, `PROPOSAL`, or `DECISION`, select the latest Quote by `(created_at, id)` whose status is `ready` or `sent`; sum at most one Quote per Lead. Draft, accepted, declined, expired, cancelled, superseded, terminal Lead, and duplicate Quote values do not contribute.

## Lost analysis

Lost analysis uses Leads whose current stage is `LOST` and whose `last_activity_at` falls in the selected window. It groups by the configured lost reason and by configured Lead source. A missing reason or source is reported as `unknown`. Lost value is the `total` of the latest non-draft Quote for each lost Lead, counted at most once.

## Source and UTM attribution

Attribution groups Leads created in the selected window by source code, `utm_source`, `utm_medium`, and `utm_campaign`. Missing or blank UTM values are reported as `(none)`. Each group returns:

- Lead count for all Leads in the group;
- Won count for Leads whose current stage is `WON`;
- revenue equal to accepted Quote `total` values whose `accepted_at` falls in the selected window.

## Security and query boundaries

The four dashboard RPCs are `SECURITY INVOKER`, execute only for `authenticated`, and read through the existing RLS policies. Anonymous callers have no execute privilege. Reporting views are also security-invoker and only granted to `authenticated`. Each RPC validates the date window and returns aggregate JSON with bounded `limit` values where rows are grouped. Empty result sets are deterministic zeroes or empty arrays.

The dashboard uses the existing Lead, Quote, and Task state machines as the authority for inclusion. No browser state, Realtime state, provider state, or separate analytics store changes these definitions.
