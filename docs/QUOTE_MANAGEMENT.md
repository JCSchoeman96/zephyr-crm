# Quote management

Zephyr Quotes are durable commercial snapshots. PostgreSQL is authoritative for quote money, lifecycle state, numbering, revision history, and optimistic concurrency; the browser preview is advisory only.

## Money and numbering

- `quotes` and `quote_items` use PostgreSQL `numeric` columns. Quantities allow four decimal places, unit prices and line subtotals use cents, and tax rates allow four decimal places.
- `save_quote_draft` recalculates every line subtotal, subtotal, tax amount, and total from the submitted item descriptions. Client-provided totals or line subtotals are ignored.
- The TypeScript preview uses the same decimal contract with integer arithmetic and never uses floating-point currency calculations.
- A new quote receives its `base_quote_number` from the PostgreSQL identity. The generated display number is `Q-YYYY-NNNNNN`; revisions reuse the base number and display `Q-YYYY-NNNNNN-R<n>`. Revision allocation is protected by a transaction advisory lock and the `(base_quote_number, revision_number)` constraint.

## Trusted lifecycle

The allowed lifecycle is:

```text
draft → ready → sent → accepted
                    ↘ declined / expired / cancelled / superseded
```

Authenticated staff cannot insert or update Quote or QuoteItem rows directly. The approved RPC boundary is:

- `save_quote_draft` — create or edit a draft with a required lock version for existing quotes;
- `mark_quote_ready` — validate validity, snapshot, and line items and persist authoritative totals;
- `prepare_quote_send` and `complete_quote_send` — preserve the idempotent SendPulse handoff;
- `accept_quote`, `decline_quote`, `expire_quote`, `cancel_quote`, and `supersede_quote` — terminal state actions;
- `revise_quote` — clone a sent quote and its snapshot/items into a new draft.

Database triggers reject illegal transitions, direct ready/sent inserts, sent commercial mutation, and QuoteItem mutation after a Quote leaves draft. `lock_version` is incremented by trusted actions and stale edits return a conflict error.

## Commercial snapshots

Saving a draft captures the current company identity setting alongside the quote terms, tax label/rate, currency, and validity date in `quote_snapshot`. Sending never reads current settings back into the historical row, so later company or tax setting changes cannot rewrite a sent Quote. PDF generation and delivery evidence remain Phase 8 responsibilities.

## Application routes

- `/quotes` — bounded searchable/status-filtered quote list;
- `/quotes/new` — Lead/Client-aware editor for a new draft;
- `/quotes/[id]` — editable draft/ready quote, exact-money preview, lifecycle actions, and read-only sent/terminal view.

Line item controls and preview totals are intentionally useful before saving, but every save and ready transition is recalculated in PostgreSQL. A stale form submission returns a visible conflict message.

## Local contract

With the Zephyr local Supabase stack running:

```sh
bun run test:p7:quotes
```

The contract covers exact money, server authority, concurrent numbering, state legality, ready validation, sent immutability, revisions, historical settings, browser-visible optimistic conflicts, and query-plan evidence. The complete regression gate remains:

```sh
bun run quality
```
