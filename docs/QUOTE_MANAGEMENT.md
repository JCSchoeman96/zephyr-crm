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

## Catalogue-first quote creation

`/quotes/new` shows `Add from catalogue` before a Quote ID exists. `QuoteEditor`
keeps Product selections pending in memory until `Save draft`; selecting a
Product creates neither a temporary line nor an auto-created database draft.
`Save draft` sends the header and pending lines to the existing
`save_quote_draft` action, then the new Quote redirects to `/quotes/:id`.

For a saved draft, the picker continues to use the existing `addProduct` action
and trusted `add_product_quote_item` boundary. A failed new-Quote save can use
display metadata in `quote_failure_rehydration_catalogue_display` to rehydrate
pending catalogue rows, but Product code, unit, category, catalogue price,
source versions, and totals from that metadata are not server truth.

A draft may have zero, one, or many lines. `Add line item` remains the separate
custom-line path. The Lead's `Quick custom quote` shortcut remains a separate
custom-only form. Selecting the same Product repeatedly creates independent
lines, so each opening or size can keep its own dimensions and commercial
values.

`Mark ready` still requires at least one line, complete required Product
dimensions, and an explicit resolution of every stale Product source review.
Dimensional lines remain quantity `1` with a manually entered full quoted
price. Dimensions do not trigger pricing formulas.

For a pending catalogue line, the hidden `items` value carries only
`source_type = catalogue`, `product_id`, `product_lock_version`, editable
commercial fields (`description`, `quantity`, `unit_price`, and `taxable`), and
the submitted dimension definitions and values. The save boundary resolves
Product names and snapshots server-side and recalculates totals.

## Dimensional Product lines

Products may opt into an ordered set of `Width`, `Height`, `Length`, and/or
`Depth` fields. The current unit is `mm`; labels are limited to 80 characters,
and values are positive millimetre decimals up to 100000 mm with at most four
decimal places. These limits are enforced by the trusted Product and QuoteItem
boundaries and mirrored in the browser. Services cannot use Product dimensions.
A dimensional QuoteItem stores the Product definition and the salesperson's final values as a snapshot, uses quantity `1`, and treats
`unit_price` as the full manually entered quoted price. The optional future
pricing engine for per-mm, per-cm, per-metre, m², or m³ billing is deferred.

Every actual Product/opening is a separate line. Two differently sized lines
may reference the same Product, while `Openings` captured on the Lead remains
read-only enquiry context and never creates or multiplies quote lines. Flat
ProductCategories render as non-priced headings; they are not parent/sub-
product records.

Lead Width, Height, and Openings values remain structured enquiry data. The
quote editor shows them beside the builder and allows Width/Height to be
applied to one selected dimensional line as editable defaults. The salesperson
can then change each line's dimensions and full price independently. The
trusted `save_quote_draft` action owns source, Product, category, quantity, and
total derivation; the browser only submits editable line values. Readiness
rejects a draft with a missing required Product dimension.

Product and ProductCategory changes do not cascade into existing QuoteItems.
When a Product source is stale, the salesperson must explicitly refresh the
snapshot or keep the quoted values and record the review. Quote revisions copy
the complete dimension and category snapshots.

The customer-facing preview and PDF show the Product, stored size, quantity,
unit, full quoted amount, and category heading. They never expose Product
`internal_notes` or private source-review metadata.

## P14 document and email hardening

Quote documents are generated locally from the frozen `quote_snapshot`, not
mutable current settings. The renderer is deterministic, multi-page, readable
for long descriptions/introduction/terms/items, preserves supported customer
characters, records a private Storage path/hash, and never rewrites a sent
artifact. Customer-facing Quote email includes the recipient-safe quote number,
subject, client company, validity, sender identity, and the exact frozen PDF;
missing sender configuration fails before provider submission.

## Local contract

With the Zephyr local Supabase stack running:

```sh
bun run test:p7:quotes
```

The contract covers exact money, server authority, concurrent numbering, state legality, ready validation, sent immutability, revisions, historical settings, browser-visible optimistic conflicts, and query-plan evidence. The complete regression gate remains:

```sh
bun run quality
```
