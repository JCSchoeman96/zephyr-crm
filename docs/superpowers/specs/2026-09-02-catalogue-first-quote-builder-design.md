# Catalogue-first Quote Builder

## Goal

Make the catalogue Product picker available when a salesperson starts a new
Quote. A salesperson can select Products, add optional custom lines, and save
the complete quote as a draft without first creating a temporary manual line
or an empty database draft.

## Scope

This change covers the initial Quote Builder experience only:

- show `Add from catalogue` on `/quotes/new` before the Quote has an ID;
- allow the new Quote line list to contain zero, one, or many lines;
- add selected catalogue Products to local quote-editor state;
- persist catalogue and custom lines together with the quote header on `Save draft`;
- preserve repeated references to the same Product so each size/opening remains
  a separate line;
- keep the existing picker behavior for an already-saved draft Quote;
- keep the existing Quick custom quote shortcut unchanged.

The change does not add pricing formulas, a Product hierarchy, new lifecycle
states, new permissions, or a new database resource.

## User flow

The canonical flow is:

1. The salesperson opens `Open Quote Builder` from a ready-to-quote Lead, or
   opens `/quotes/new` directly.
2. The page immediately shows the quote header, `Add from catalogue`, and the
   line-item editor. The picker can search by the current currency and filter
   by active Product category without a Quote ID.
3. `Use Product` selects a search result. `Add Product to quote` adds one
   catalogue line to the in-memory line list. Adding the same Product again is
   allowed and creates another line.
4. A dimensional Product creates a line with quantity `1`, its configured
   dimension fields, and its catalogue price as the initial full quoted price.
   The salesperson can edit dimensions and the full quoted price. Structured
   lead Width/Height values remain editable defaults.
5. `Add line item` remains available for optional custom lines. The line list
   may remain empty while the quote header is being prepared.
6. `Save draft` creates or updates the Quote and all current lines in one
   trusted database action. The new Quote then redirects to `/quotes/:id`.
7. On the saved draft, the existing catalogue picker remains available and
   continues to add Products through the existing draft-only Product action.

The Lead and quote subject remain required. A draft with no lines is legal;
the existing `Mark ready` guard still requires at least one line and continues
to enforce required dimensions and stale Product review.

## Architecture and data flow

The existing Product, QuoteItem, category snapshot, dimension snapshot, and
money contracts remain unchanged.

`ProductPicker.svelte` will support two modes:

- saved-draft mode, where it submits the existing `addProduct` form action;
- new-quote mode, where it calls a parent callback with the selected Product
  and does not write to the database.

`QuoteEditor.svelte` owns the pending line array in both modes. In new-quote
mode it converts a selected `ProductOption` into a read-only catalogue line
with editable commercial fields and dimension values. The line carries the
Product ID and expected Product lock version needed for the first save. The
picker and editor may display Product metadata for the salesperson, but the
browser is not trusted to author snapshots or totals.

The hidden `items` JSON for a new catalogue line contains only:

- Product ID;
- expected Product lock version;
- editable description, quantity, quoted price, and taxable flag;
- editable dimension values and their submitted definition shape.

The application parser preserves the Product identity fields needed by the
trusted action and rejects malformed IDs, lock versions, dimensions, or custom
lines carrying Product data. It continues to exclude server-owned snapshots
and calculated totals.

The existing `save_quote_draft` RPC already accepts an unsaved Product ID and
expected Product lock version, derives the Product/category snapshots under a
row lock, validates active status and currency, normalizes dimensions, and
accepts an empty item array. The implementation will use that existing
boundary rather than add a second save action or change the schema.

The new Quote route will load the same active Product categories used by the
saved Quote route. A failed save will retain the submitted pending line data so
the salesperson can correct a stale Product, currency, or dimension error
without losing the rest of the form.

## Lifecycle and security

- A new Quote is not persisted merely because the page was opened or a Product
  was selected.
- `Save draft` is the first persistence event for a new Quote.
- A draft can have zero or more QuoteItems.
- `Mark ready` remains the first state transition that requires at least one
  line and complete required dimensions.
- The server re-fetches and locks every submitted Product in deterministic
  order, verifies the expected Product lock version, rejects inactive or
  currency-mismatched Products, and derives all source/category snapshots.
- The server calculates line subtotals, tax, and totals from submitted quoted
  fields. Dimensions do not participate in pricing calculation.
- Existing quote locks, stale-source review, sent/terminal immutability,
  authorization, and activity logging remain in force.

## Error handling

The new form uses the existing action failure contract. Header validation,
malformed line data, stale Product versions, inactive Products, currency
mismatches, and invalid dimensions return a visible error and preserve the
submitted form values. The UI never treats a local Product selection as saved
until the server redirects after a successful `save_quote_draft` call.

If a selected Product becomes stale before the first save, the server rejects
the save with the existing conflict classification. The salesperson can
reload/search the Product and replace the pending line. No partial Quote or
partial QuoteItem write is left behind by a failed new-Quote save.

## Testing

Focused unit coverage will prove that the quote form parser preserves pending
catalogue identity and lock-version fields while excluding browser-owned
snapshots and calculated totals. It will also prove that an empty item array
and ordinary custom lines remain valid.

Focused browser coverage will prove that:

- `Add from catalogue` is visible on `/quotes/new` before the first save;
- a Product can be selected without a temporary manual line;
- multiple Product lines, including repeated/differently sized lines, remain
  independent in local state and after saving;
- a new quote with no lines can be saved as a draft;
- a saved draft still exposes the picker and existing draft actions;
- dimensional values, lead defaults, and manual full prices survive the first
  save;
- `Mark ready` still rejects an empty quote and incomplete dimensional lines;
- existing custom-line, Product snapshot, stale-review, category-heading, and
  document behavior remains green.

No browser test will use a temporary bootstrap line to prove the new flow.

## Documentation

Update the catalogue and quote documentation to describe the catalogue-first
new Quote flow, local pending Product lines, zero-line drafts, and the existing
ready-state requirement. Keep the Quick custom quote path documented as a
separate custom-only shortcut. Do not rewrite unrelated phase authority or
pricing-engine documentation.

## Explicit non-goals

- per-mm, per-cm, per-metre, square-metre, or cubic-metre pricing;
- automatic Product selection from lead text;
- automatic use of `Openings` to multiply or duplicate lines;
- Product variants, sub-products, nested categories, or bundles;
- automatic database draft creation on page load;
- new quote lifecycle states or a new workflow service;
- changes to Design IR, TokenSet, HEEx, Tailwind, or Phase 5.
