# UX, Realtime & Performance Hardening

Phase 11 records the measured local baseline and the deliberately bounded browser
behaviour for the intended 1–50-user client profile. PostgreSQL remains the source
of truth; Realtime only tells an already-open screen to revalidate its server load.

## Baseline captured before Phase 11 changes

The baseline was captured on 2026-08-22 against the disposable local Supabase
stack with 512 Leads, 31 Tasks, and 38 Quotes left by the preceding focused
quality fixtures.

| Path | Baseline observation |
| --- | --- |
| Leads, Clients, Quotes index loads | Each was already limited to 25 rows. |
| Tasks index load | The task query had no bound; a representative unbounded query returned 31 rows in 0.177 ms. |
| Lead detail history | Quotes, Tasks, Activities, lost reasons, and staff queries had no explicit bound. |
| Client detail history | Contacts, Activities, and source-Lead Activities had no explicit bound. |
| Quote detail history | Quote items (100), Activities (50), and outbound messages (10) were already bounded. |
| Dashboard aggregate | `dashboard_sales_kpis` executed in 4.041 ms on the representative local fixture. |
| Realtime publication | The local `supabase_realtime` publication had no CRM tables. |
| Browser storage and polling | No `localStorage`, `sessionStorage`, IndexedDB, or interval polling usage was present. |

The baseline is a local engineering measurement, not a production capacity claim.

## Implemented bounds and budgets

- Tasks are capped at 50 rows per filtered work-queue load.
- Lead detail quote, task, and activity streams plus supporting lookup lists are
  capped at 100 rows.
- Client detail contacts and activity streams are capped at 100 rows.
- Existing index-page and Quote-detail bounds remain unchanged.
- Representative list queries and dashboard RPCs have a 250 ms local execution
  budget. The browser target for a permitted Realtime refresh is one second of
  perceived update latency after the 250 ms event coalescing window.
- The application API `max_rows = 1000` remains a second defensive ceiling; it is
  not used as a substitute for route-level bounds.

## Selective Realtime contract

Only `leads`, `tasks`, and `quotes` are added to `supabase_realtime`. Screens use
the smallest useful subscription set:

| Screen | Tables | Immediate value |
| --- | --- | --- |
| Dashboard | Leads, Tasks, Quotes | New Leads, attention counts, overdue/due work, and Quote status. |
| Lead index | Leads | New and changed Lead rows. |
| Lead detail | Leads, Tasks, Quotes | Active Lead, follow-up, and Quote changes for the open Lead. |
| Task index | Tasks, Leads | Task changes and the Lead lookup used by the work queue. |
| Quote index/detail | Quotes | Quote status and revision/send changes. |

Each subscription is authenticated through the existing browser Supabase client,
so delivery remains subject to the table's RLS policies. A received event only
coalesces a short-lived in-memory `invalidateAll()` call; the browser never treats
the event payload as authoritative CRM data. No polling interval is used, and no
other table is made realtime.

## Conflict and storage decisions

Lead and Quote mutations retain their `lock_version` contract. A stale RPC result
is returned as HTTP 409 with an explicit message telling the user that another
session changed the record and that the page must be reloaded. The server never
retries the write with a newer version and never silently overwrites the newer
record.

No query cache was added: the measured dashboard and bounded list queries are
well below the 250 ms budget, and Realtime invalidation is the more useful
freshness mechanism for this client profile. If future measurements justify a
cache, it must be user-scoped, in-memory only, and have a 30–60 second TTL. CRM
PII is not written to localStorage, sessionStorage, IndexedDB, or another
persistent browser store.

## Accessibility and responsive pass

- The mobile navigation trigger exposes `aria-expanded` and `aria-controls`.
- The navigation landmark has a stable id and each active route exposes
  `aria-current="page"`.
- Existing focus-visible outlines, labelled controls, alert/status semantics,
  dialog controls, and mobile/tablet/desktop viewport smoke tests remain in the
  project quality suite.
- The shell is checked at 390, 768, and 1280 CSS-pixel widths with no horizontal
  overflow; the keyboard smoke test opens navigation and focuses a route link.

## Regression measurement

The Phase 11 focused gate checks publication membership, authenticated versus
anonymous Realtime delivery, absence of polling and browser persistence, route
bounds, stale-write messaging, and representative query plans. The complete
quality gate reruns the existing browser, database, security, domain, workflow,
automation, and analytics tests.
