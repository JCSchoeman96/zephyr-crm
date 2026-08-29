# P25 — Professional Quote Document

## Objective

Implement a versioned, deterministic A4 portrait Quote PDF from the existing
server-built `QuotePresentationModel`, then attach it once to the existing
private Storage boundary with matching SHA-256, MIME, and renderer provenance.
Keep the v1 renderer and every stored historical PDF untouched.

## Authority and constraints

- Follow `docs/phases/PHASE_25_PROFESSIONAL_QUOTE_DOCUMENT.md` and
  `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`.
- Keep `pdf-lib@1.17.1`; do not introduce a browser renderer, provider, or
  second document framework.
- Treat `QuotePresentationModel` as the only customer-facing PDF input. Do not
  read live Products, internal notes, private Storage paths, or browser totals.
- Preserve `src/lib/domain/quotes/document.ts` as the v1 compatibility renderer;
  Template v2 is a separate implementation and only new attachments select it.
- Use forward-only migrations and trusted RPCs. Existing document paths, bytes,
  hashes, and provenance remain immutable.

## Implementation sequence

1. **P25-T01 red contract** — add a unit/contract fixture for short, Unicode,
   branded, no-tax, and long customer-facing models. Assert A4 dimensions,
   required sections, page numbering, deterministic bytes/hash, and absence of
   internal/private fields. Run it red before adding the renderer.
2. **P25-T01/P25-T02 layout boundary** — add `template-v2.ts` constants and
   layout primitives plus `pdf-v2.ts` with deterministic standard-font glyph
   validation, branded header/logo mark, seller/recipient blocks, wrapped
   introduction, repeated item headers, totals, terms, bank details, contact
   footer, and `Page X of Y`.
3. **P25-T02 fitness contracts** — cover 1/10/100-item, long code/name/
   description/address/terms, tax/no-tax, accented Unicode, logo input,
   pagination, page margins, repeated headers, totals grouping, and stable
   hashes/page counts. Keep unsupported glyphs fail-closed as the frozen v1
   document contract requires.
4. **P25-T03 attachment integration** — add a forward-only migration for
   `document_mime_type`, frozen document defaults, protected-field coverage, and
   the trusted immutable attach function’s v2 MIME/template/generator
   provenance. Regenerate database types.
5. **P25-T03 server wiring** — build the canonical model server-side for new
   document generation, call Template v2, retain the existing private upload
   and immutable attach race behavior, and return existing artifacts without
   regeneration. Include frozen bank details in the ready snapshot boundary.
6. **Regression and close** — run P25 contracts, current P8 document/send
   regressions, P7 quote regressions, unit/check/lint/build/database/security/
   formatting/diff gates, inspect representative PDF bytes locally, update
   phase state/registry/handoff, and create an explicit local checkpoint.

## Completion gate

All P25 mandatory fixtures pass; the renderer consumes only the canonical model;
PDF bytes are deterministic and fit A4 margins; stored bytes/hash/MIME/
provenance agree; v1 documents remain isolated; private access and immutable
attachment regressions pass; and no unrelated diff remains.
