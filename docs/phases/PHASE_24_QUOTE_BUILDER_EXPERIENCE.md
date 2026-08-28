# Phase 24 — Quote Builder Experience

**Roadmap Version:** 1.5.0
**Status:** Planned
**Required predecessor:** P23
**Authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`

## Objective

Make standard quoting fast and understandable by adding Product search and
selection while retaining custom lines, negotiated draft values, explicit
stale-source decisions, and one canonical customer preview model.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P24-T01` | Product picker | `ProductPicker.svelte` searches active Products only, supports category filtering and server-backed pagination, shows code/name/unit/price, rejects mismatched currency, and never loads the full catalogue into the browser. |
| `P24-T02` | Draft product-line editing | Draft Product-derived lines allow quantity, customer description, and quoted unit-price edits with existing money validation while preserving catalogue price/source snapshots; sent and terminal Quotes cannot be changed; internal notes never render. |
| `P24-T03` | Stale Product review | A source-version mismatch is visibly surfaced with explicit Refresh from Catalogue and Keep Quoted Values actions; Refresh is draft-only, Keep preserves commercial values and records review evidence, and Ready rejects an unresolved stale source. |
| `P24-T04` | Responsive preview | `QuoteDocumentPreview.svelte` renders the server-built QuotePresentationModel at desktop and narrow mobile widths without horizontal overflow or independent commercial calculations, with focused browser/contract tests. |

## Required validation

- Test search terms, category/status filters, page boundaries, no-result and
  currency-mismatch states.
- Test product/custom line coexistence, reordering, quantity/description/price
  validation, stale Refresh/Keep semantics, and locked Quote rejection.
- Assert preview fields match the canonical model and exclude internal notes,
  private paths, and browser-calculated totals.
- Run desktop/mobile overflow journeys, affected Quote regressions, check,
  lint, build, formatting, and diff gates.

## Explicit non-goals

No PDF renderer implementation, browser-to-PDF conversion, inventory, price
books, customer pricing, FX, public quote portal, acceptance link, or email
provider change.

## Completion gate

The picker is server-paginated, Product selection remains a trusted action,
custom lines remain legal, all stale choices are explicit, the preview consumes
only the canonical model, and no commercial authority moves into the browser.

## Next phase

P25 — Professional Quote PDF Template v2 and immutable attachment integration.
