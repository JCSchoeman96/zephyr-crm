# Quote Builder Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-paginated Product picker, editable draft Quote lines, explicit stale Product review, and one server-built QuotePresentationModel without moving commercial authority into the browser.

**Architecture:** The Quote detail server load returns only active picker categories, current safe Product projections, and a presentation model built from authorized Quote/QuoteItem data. A bounded authenticated Product search endpoint handles picker queries. Product add, refresh, and review are trusted PostgreSQL actions; `save_quote_draft` preserves existing QuoteItem lineage by ID and continues to calculate totals in PostgreSQL. `QuoteDocumentPreview.svelte` renders the same serializable model that P25 will later pass to the PDF renderer.

**Tech Stack:** Bun 1.2.22, SvelteKit/Svelte 5, Supabase PostgreSQL/RLS, TypeScript, Vitest, Playwright, existing design-system components.

---

## Phase constraints

- Preserve all P0-P23 tests and the v1.4 Quote/document behavior.
- Add only the forward-only migration `supabase/migrations/20260828120000_v150_quote_builder.sql`.
- Product search returns at most 12 safe active Product rows per request and never selects or serializes `internal_notes`.
- Product selection, refresh, review, and readiness checks remain trusted actions with active-profile, role, state, currency, and optimistic-lock validation.
- Catalogue fields (`catalogue_unit_price`, Product code/unit/source version) are separate from editable draft commercial fields (`unit_price`, description, quantity, taxable).
- `save_quote_draft` preserves source fields for existing catalogue lines by validated QuoteItem ID and creates new browser-authored lines as custom lines only.
- Customer preview consumes server-owned model values and does not call `calculateQuoteTotals` or reconstruct totals from input fields.
- Do not implement PDF Template v2, email changes, public quotes, inventory, FX, price books, or remote deployment.

## File map

| Area | Files | Responsibility |
|---|---|---|
| Database contracts | `supabase/migrations/20260828120000_v150_quote_builder.sql`, `scripts/test-p24-quote-builder.mjs` | Preserve catalogue lines during draft saves; add trusted refresh/review actions; reject unresolved stale sources at readiness; record Activity |
| Product search | `src/routes/api/products/search/+server.ts` | Authenticate active staff, normalize bounded query/category/page/currency, return active safe Product projections and pagination |
| Quote server boundary | `src/routes/quotes/[id]/+page.server.ts`, `src/lib/server/quote-form.ts` | Load safe source projections/categories/presentation model; validate QuoteItem IDs; invoke trusted Product actions |
| Presentation | `src/lib/domain/quotes/documents/presentation-model.ts`, `.spec.ts` | Pure serializable model builder with frozen/server-owned values and no staff-only fields |
| Quote UI | `src/lib/components/products/ProductPicker.svelte`, `src/lib/components/quotes/QuoteLineEditor.svelte`, `QuoteDocumentPreview.svelte`, `QuoteEditor.svelte` | Search/select Products, edit draft lines, display explicit stale choices, render responsive model |
| Browser proof | `tests/e2e/domain/p24-quote-builder.e2e.ts` | Prove search pages/filter/no results/currency, custom/catalogue coexistence, edits, stale Refresh/Keep, preview desktop/mobile/no overflow |

### Task 1: Write the failing P24 database contract

**Files:**

- Create: `scripts/test-p24-quote-builder.mjs`
- Test: `scripts/test-p24-quote-builder.mjs`

- [ ] **Step 1: Add the red contract before changing production code**

The script must use the existing `p14-test-utils.mjs` fixture boundary and
assert:

```js
expectMigrationOnly('20260828120000_v150_quote_builder.sql', '6baf80c');
expectRpc('refresh_product_quote_item');
expectRpc('review_product_quote_item');
expectSavedCatalogueLineToRetainLineage();
expectRefreshToCopyCustomerSnapshotAndRetainNegotiatedPrice();
expectKeepToRetainCommercialValuesAndRecordReviewEvidence();
expectReadyToRejectUnresolvedStaleSource();
expectCustomLineToRemainCustom();
```

The fixture must mutate Products through trusted actions, pass current Quote
and Product locks, query rows with the service role only for assertions, verify
the two new Activity events, and verify stale locks plus inactive/terminal
Quotes are rejected.

- [ ] **Step 2: Run the contract and confirm the expected missing-feature failure**

```bash
bun run db:reset
bun scripts/test-p24-quote-builder.mjs
```

Expected: FAIL because the P24 migration and trusted refresh/review functions
do not exist.

### Task 2: Add trusted draft preservation, stale actions, and readiness guard

**Files:**

- Create: `supabase/migrations/20260828120000_v150_quote_builder.sql`
- Modify through the migration: `save_quote_draft` and the Quote ready guard
- Modify through the generator: `src/lib/types/database.ts`

- [ ] **Step 1: Add the forward-only SQL migration**

The migration must re-emit `save_quote_draft` with its existing v1.4
signature and decimal validation. An item JSON `id` identifies an existing
row only after the function validates that it belongs to the Quote. Existing
catalogue rows are updated only in editable fields and position, preserving
all source/snapshot/review columns; omitted rows are deleted; ID-less rows are
inserted as `custom`.

Add:

```text
refresh_product_quote_item(p_quote_id, p_quote_lock_version,
  p_quote_item_id, p_product_lock_version)
review_product_quote_item(p_quote_id, p_quote_lock_version,
  p_quote_item_id, p_product_lock_version)
```

Both actions lock Quote then Product, require an active CRM role, draft Quote,
current locks, and catalogue lineage. Refresh requires matching currency,
copies Product code/name/customer description/unit/catalogue price/taxable/source
version, preserves quantity and negotiated `unit_price`, clears review
evidence, recalculates database totals, and appends
`quote_item_product_refreshed`. Keep preserves every commercial/snapshot
value, records reviewed version/time/actor, increments the Quote lock, and
appends `quote_item_product_reviewed`.

Add a trusted `before update on public.quotes` guard that rejects readiness
when a catalogue line's current Product lock differs from its source version
and is newer than its reviewed version. Use a stable `23514` error and leave
the Quote untouched. Revoke raw execution and grant only intended authenticated
RPC signatures.

- [ ] **Step 2: Run database contracts and generated types green**

```bash
bun run db:reset
bun scripts/test-p24-quote-builder.mjs
bun run db:types
bun run db:types:check
bun run db:test
bun run db:security
```

- [ ] **Step 3: Commit the database boundary**

```bash
git add supabase/migrations/20260828120000_v150_quote_builder.sql scripts/test-p24-quote-builder.mjs src/lib/types/database.ts
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add quote builder source review actions"
```

### Task 3: Add the canonical presentation model first

**Files:**

- Create: `src/lib/domain/quotes/documents/presentation-model.ts`
- Create: `src/lib/domain/quotes/documents/presentation-model.spec.ts`

- [ ] **Step 1: Write the failing pure model test**

Pass a Quote with intentionally different database totals and client-calculated
looking values, plus a snapshot containing `internal_notes` and
`private_path`. Assert the model includes only documented quote identity,
seller, recipient, subject, introduction, item code/name/description/quantity/
unit/unitPrice/amount, subtotal, tax, total, terms, bank details, brand, and
document metadata. Assert totals equal supplied server values and private
fields are absent.

- [ ] **Step 2: Run the pure test red**

```bash
bun run test:unit -- --run src/lib/domain/quotes/documents/presentation-model.spec.ts
```

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement and test the pure model**

Export `QuotePresentationModel`, `QuotePresentationInput`, and
`buildQuotePresentationModel(input)`. Prefer frozen
`quote_snapshot.seller` and `recipient` when present, use current draft Quote
fields otherwise, copy unit/code from QuoteItem snapshots, and pass through
server totals without importing the money calculator.

### Task 4: Add bounded Product search and picker

**Files:**

- Create: `src/routes/api/products/search/+server.ts`
- Create: `src/lib/components/products/ProductPicker.svelte`
- Modify: `src/routes/quotes/[id]/+page.server.ts`, `src/lib/components/quotes/QuoteEditor.svelte`
- Test: `tests/e2e/domain/p24-quote-builder.e2e.ts`

- [ ] **Step 1: Write the failing browser journey**

Create at least 13 active Products, one inactive Product, two categories, and
one different-currency Product. On a draft Quote assert active matching-currency
rows only, page boundaries, category/search/no-result states, no internal notes,
and selection through the Quote action.

- [ ] **Step 2: Run the browser test red**

```bash
bunx playwright test tests/e2e/domain/p24-quote-builder.e2e.ts
```

Expected: FAIL because the endpoint, picker, and Quote integration do not exist.

- [ ] **Step 3: Implement the endpoint**

Normalize `q` to 80 characters, `category_id` to a UUID or empty value,
`currency` to uppercase ISO-3 or empty value, `page` to a positive integer,
and `page_size` to at most 12. Query `status = active` with optional
currency/category/search filters, exact count, stable ordering, and bounded
range. Select only safe Product fields and return private no-store JSON to
active staff.

- [ ] **Step 4: Implement the picker**

Use a bounded debounced `fetch('/api/products/search?...')` request. Show
search, category, page controls, loading/error/no-result states, code/name/unit/
price, and a selected Product quantity. Submit a
`formaction="?/addProduct"` button with Product ID and current Product lock.

### Task 5: Add draft line editing, stale review UI, and server orchestration

**Files:**

- Create: `src/lib/components/quotes/QuoteLineEditor.svelte`
- Modify: `src/lib/server/quote-form.ts`, `src/routes/quotes/[id]/+page.server.ts`, `src/routes/quotes/[id]/+page.svelte`, `src/lib/components/quotes/QuoteEditor.svelte`
- Test: `tests/e2e/domain/p24-quote-builder.e2e.ts`

- [ ] **Step 1: Extend the browser journey**

After selection, edit quantity, customer description, and quoted unit price;
save/reload; assert catalogue price/source version remain unchanged. Keep a
custom line beside the Product line and reorder it. Mutate the Product, assert
a visible version mismatch and exactly `Refresh from Catalogue` and
`Keep Quoted Values`. Refresh must copy current customer-facing Product
fields while retaining negotiated price/quantity. Keep must preserve them,
record evidence, and allow Ready; unresolved stale Ready must fail first.

- [ ] **Step 2: Extend form parsing without trusting source fields**

Allow an optional UUID `id` in each serialized item, retain it only to
identify the existing row, and continue validating name, quantity, price,
taxable flag, and item count. Do not accept source type, Product ID, catalogue
price, or review fields from the browser as authority.

- [ ] **Step 3: Implement Quote page loads/actions**

Load active Product categories, safe current Product projections for catalogue
line IDs, and the presentation model. Add `addProduct`,
`refreshProduct`, and `reviewProduct` actions that parse lock/item/product
versions and call the corresponding RPCs, preserving existing errors and
redirect-after-success behavior.

- [ ] **Step 4: Implement line editor and stale controls**

Render source badges and read-only catalogue code/unit/price/version evidence.
Keep quantity, description, quoted unit price, and taxable controls editable
only for draft/ready Quotes. Use clicked submit buttons with `formaction` and
named IDs/locks for Refresh/Keep, never nested forms. Sent/terminal pages remain
read-only.

### Task 6: Replace the local preview with the canonical responsive model

**Files:**

- Create: `src/lib/components/quotes/QuoteDocumentPreview.svelte`
- Modify: `src/routes/quotes/[id]/+page.server.ts`, `src/lib/components/quotes/QuoteEditor.svelte`, `src/routes/quotes/[id]/+page.svelte`
- Test: `src/lib/domain/quotes/documents/presentation-model.spec.ts`, `tests/e2e/domain/p24-quote-builder.e2e.ts`

- [ ] **Step 1: Render the server model**

Pass the serializable model into `QuoteDocumentPreview.svelte`. Render
branded header, seller/recipient, subject/introduction, item table, totals,
terms, and bank details from model properties. Do not import money helpers or
compute subtotal/tax/total in the component. Exclude internal notes,
source-review metadata, private paths, and non-model Product fields.

- [ ] **Step 2: Add responsive assertions**

At desktop render the document card/table; at 390px stack identity blocks and
render readable item rows/cards without horizontal overflow. Assert
`document.documentElement.scrollWidth <= document.documentElement.clientWidth`
and model totals remain visible.

- [ ] **Step 3: Remove the old independent preview calculation**

Delete only the QuoteEditor preview implementation that calls
`calculateQuoteTotals`; retain the editor's server-authority hint.

### Task 7: Close P24 and checkpoint

- [ ] **Step 1: Run the cumulative P24 gate**

```bash
bun run db:reset
bun scripts/test-p22-product-schema.mjs
bun scripts/test-p22-product-actions.mjs
bun scripts/test-p23-quote-item-schema.mjs
bun scripts/test-p23-product-selection.mjs
bun scripts/test-p24-quote-builder.mjs
bun run test:e2e -- tests/e2e/domain/p22-products.e2e.ts tests/e2e/domain/p23-product-snapshot.e2e.ts tests/e2e/domain/p24-quote-builder.e2e.ts
bun run test:p7:quotes
bun run test:p8:documents
bun run test
bun run db:test
bun run db:types:check
bun run db:security
bun run check
bun run lint
bun run build
bun run format:check
git diff --check
```

- [ ] **Step 2: Update phase state and handoff**

Record P24-T01 through P24-T04 complete, the migration and files changed,
validation evidence, explicit P25 deferrals, and the next action.

- [ ] **Step 3: Inspect and commit only P24-owned paths**

```bash
git status --short
git diff --stat
git diff --check
git add docs/superpowers/plans/2026-08-28-p24-quote-builder.md src/routes/api/products/search src/lib/components/products/ProductPicker.svelte src/lib/components/quotes/QuoteLineEditor.svelte src/lib/components/quotes/QuoteDocumentPreview.svelte src/lib/domain/quotes/documents/presentation-model.ts src/lib/domain/quotes/documents/presentation-model.spec.ts src/lib/server/quote-form.ts 'src/routes/quotes/[id]' scripts/test-p24-quote-builder.mjs supabase/migrations/20260828120000_v150_quote_builder.sql src/lib/types/database.ts tests/e2e/domain/p24-quote-builder.e2e.ts
git diff --cached --check
git diff --cached --stat
git commit -m "feat: build v1.5 quote builder experience"
```
