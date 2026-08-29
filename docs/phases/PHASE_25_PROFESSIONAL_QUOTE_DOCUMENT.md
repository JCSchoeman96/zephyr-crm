# Phase 25 — Professional Quote Document

**Roadmap Version:** 1.5.0
**Status:** Complete
**Required predecessor:** P24
**Authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`

## Objective

Produce a polished, deterministic, printable customer Quote using the
existing `pdf-lib` boundary and the same QuotePresentationModel as the
responsive preview.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P25-T01` | Versioned Template v2 | A versioned renderer under `src/lib/domain/quotes/documents/` produces A4 portrait PDFs with branded header, seller/recipient blocks, subject/introduction, item table, totals, terms, bank details, contact footer, and page numbering from QuotePresentationModel. |
| `P25-T02` | Pagination and fitness | Short, 10-item, 100-item, long-text, multi-page, tax/no-tax, long-address/terms, logo, and Unicode fixtures render valid deterministic PDF bytes with wrapped content, repeated table headers, readable non-orphaned totals, no clipping, and no content outside margins. |
| `P25-T03` | Immutable attachment integration | Newly eligible Quote revisions route to Template v2 only after fixture gates; one private stored artifact has matching SHA-256/MIME/provenance, concurrent attachment semantics remain safe, and historical v1 documents are never regenerated or replaced. |

## Required validation

- Unit-test the canonical model boundary, layout measurements, page breaks,
  page counts, hashes, Unicode glyph handling, and internal-note exclusion.
- Inspect representative PDF bytes/pages locally and test private Storage/RLS
  behavior through the existing disposable stack.
- Run current Quote finalisation, revision, document-integrity, and send
  precondition regressions before changing the default for new eligible
  revisions.

## Explicit non-goals

No Chromium/Browser Rendering service, SVG renderer, public document URL,
historical PDF rewrite, accounting, electronic signature, payment gateway, or
provider change.

## Completion gate

Every document-fitness fixture passes; the renderer uses the canonical model;
the stored hash matches bytes; private access and immutability regressions
pass; Template v2 is activated only for newly generated eligible revisions.

## Next phase

P26 — Branded email, hardening, reconciliation, and final local validation.
