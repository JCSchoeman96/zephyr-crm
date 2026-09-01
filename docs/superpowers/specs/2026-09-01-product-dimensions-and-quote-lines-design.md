# Product dimensions and quote lines

## Goal

Allow selected catalogue products to require configurable measurements and
allow each quote line to record the actual size of the client-specific item.
The first release supports manually quoted full line prices. It does not
calculate prices from dimensions.

## Scope

This feature adds:

- a product-level dimensions toggle;
- ordered product dimension definitions, initially using millimetres;
- quote-line dimension snapshots;
- lead measurement defaults in the quote builder;
- separate quote lines for separately sized openings;
- product-category headings with product lines beneath them;
- manual full-price entry for dimensional quote lines;
- customer-facing size presentation without exposing internal notes.

This feature does not add a global feature flag. The product-level dimensions
toggle is the flag. It also does not add a per-mm, per-cm, per-m, square-metre,
or cubic-metre pricing calculator. A later pricing feature may use the stored
dimension structure and add an explicit pricing mode without changing existing
quote snapshots.

## Product model

Products remain catalogue records with a single optional ProductCategory. The
catalogue stays flat. A category such as `Blinds` contains products such as
`Blockout Blinds`; there is no parent-product or sub-product relationship in
this release.

A product can enable measurements and define an ordered list of fields. The
first release supports the common fields `Width`, `Height`, `Length`, and
`Depth`. Each field has a stable key, customer-facing label, millimetre unit,
required flag, and position. The storage shape is an ordered JSON value so
the product is not locked to fixed width and height columns:

```json
[
  { "key": "width", "label": "Width", "unit": "mm", "required": true },
  { "key": "height", "label": "Height", "unit": "mm", "required": true }
]
```

The product form presents this as a measurement editor. It does not expose
raw JSON. Services cannot enable measurements. Products without measurements
continue using the existing catalogue flow.

## Quote-line model

Each dimensional opening is a separate QuoteItem. Two instances of the same
product with different sizes are two rows. Different products for different
openings are also separate rows. Dimensional rows use quantity `1` and the
salesperson enters the full quoted price for that row. The existing money
contract therefore remains valid because the stored line subtotal is
`1 × full quoted price`.

The line stores a snapshot of the selected product's dimensions, including
the stable key, label, unit, and final value:

```json
[
  { "key": "width", "label": "Width", "unit": "mm", "value": "1500" },
  { "key": "height", "label": "Height", "unit": "mm", "value": "1500" }
]
```

The line also keeps the existing Product snapshot and adds the category ID,
category code, and category label snapshots needed to render a stable group
heading. A later category or Product edit cannot change a sent Quote.

The current catalogue unit price remains the initial/default value supplied
when a Product is selected. The quote editor labels the editable value as the
full quoted price for dimensional lines. No calculation from dimensions is
performed.

Custom lines remain legal. They do not receive Product-defined dimensions in
this release. A one-off dimension-specific item should be created as a
catalogue Product with measurements enabled and a manual quote price.

## Lead measurement flow

The existing structured lead request contains `Width (mm)`, `Height (mm)`,
and `Openings`. The quote builder parses those values and displays them in a
read-only `Measurements from enquiry` panel beside the editor.

The salesperson selects a Product line and applies the lead measurements to
that line. Matching width and height fields become editable millimetre values.
The values are defaults, not locks. The saved QuoteItem owns the final values
used by the quote, so later changes to the Lead message cannot rewrite a Quote
line.

`Openings` is reference information about the enquiry. It does not multiply a
line and does not automatically create identical rows. The salesperson adds
one line per actual opening and can choose a different Product or edit the
size for every row.

If the lead has no structured measurements, the panel explains that no
measurements were captured and the salesperson enters them manually. The
Product picker never guesses a Product from the lead's product text.

## Categories and presentation

Product categories are the quote group headings. The quote builder presents
lines under their snapshotted category, with product lines visually indented.
An uncategorised custom line appears under `Other`. Empty categories do not
appear in the quote.

The heading is presentation-only and has no price or tax value. Category order
follows the first appearance of each category in the ordered quote lines.
Moving a line can therefore change the heading order. ProductCategory sort
order controls catalogue and picker ordering, not an already-created Quote.
Lines remain individually movable.

For a dimensional line, the customer-facing content includes the Product,
size, and full line amount. The existing professional document contract still
controls required document fields such as code, quantity, unit, and amount;
the new size is rendered as part of the customer-facing line details. Product
internal notes, private paths, and browser-only calculation data never enter
the presentation model or PDF.

## Lifecycle and security

Product measurement configuration uses the existing trusted Product actions.
Only the existing Owner/Admin Product permissions may create or update it.
Product source identity, category snapshots, and catalogue metadata are
server-owned.

The existing authenticated Quote actions remain the write boundary. The
server validates the dimension structure, positive numeric millimetre values,
required fields, product lineage, quote currency, price scale, and Quote
lock. It does not trust browser-calculated totals or Product identity fields.

Draft Quotes may be edited while a newly added line is being completed. A
dimensional line with a missing required measurement cannot be marked ready.
Ready, sent, accepted, declined, expired, and cancelled Quotes follow the
existing lifecycle restrictions.

If the Product changes after selection, the existing stale-source review is
used. Refreshing catalogue metadata must preserve the client-specific
dimensions already entered. Keeping quoted values preserves the complete
line snapshot. Sent and terminal Quote facts remain unchanged.

## Components and data flow

The implementation follows the existing boundaries:

- `ProductForm.svelte` edits the measurement toggle and ordered definitions.
- Product server actions validate and persist the configuration.
- `ProductPicker.svelte` continues server-backed active Product selection and
  exposes category filtering.
- `QuoteLineEditor.svelte` renders dimension fields and full quoted price for
  dimensional catalogue lines.
- `QuoteEditor.svelte` renders category groups and the lead-measurement panel.
- The trusted Quote draft action validates and stores dimension snapshots.
- `presentation-model.ts`, the responsive preview, and the PDF renderer
  consume the server-built presentation model.

The browser may manage temporary form state and display lead defaults. It may
not calculate or author commercial totals, Product snapshots, category
snapshots, or customer documents.

## Validation and acceptance tests

Focused tests must prove:

1. A Product can enable ordered Width/Height fields, while a Service cannot.
2. Invalid, duplicate, unknown, or non-positive dimension definitions/values
   are rejected by trusted actions.
3. Product selection creates a catalogue line with its dimension definition
   snapshot and quantity `1`.
4. Lead width and height values can be applied as editable defaults.
5. Two lines for the same Product can retain different sizes and full prices.
6. Different ProductCategories render as non-priced headings with indented
   lines.
7. Existing quote subtotal, tax, and total calculations remain correct for
   manual full prices.
8. Mark ready rejects a required missing measurement.
9. Sent and terminal Quotes reject dimension and price mutation.
10. Product/category snapshot values survive source changes and stale review.
11. Preview and PDF include customer-facing sizes and exclude internal notes.
12. Existing Product, Quote, money, document, and stale-source regressions
    remain green.

The implementation must pass the repository's focused tests, database/RLS and
generated-type checks where applicable, formatting, lint, type checking,
build, relevant browser journeys, and `git diff --check`.

## Explicit non-goals

- per-mm, per-cm, per-m, m², or m³ pricing calculation;
- arbitrary pricing formulas or price-rule editing;
- parent Products, variants, or nested ProductCategories;
- automatic Product matching from lead text;
- automatic multiplication or creation of rows from `Openings`;
- inventory, stock, suppliers, price books, customer-specific price lists,
  or foreign-exchange conversion;
- public quote portals, new document templates, or unrelated lifecycle work.
