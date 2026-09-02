# Catalogue-first Quote Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Add from catalogue" available on a new Quote before the Quote has an ID, allow zero or more lines in a draft, and save pending catalogue Products together with the quote header without a temporary manual line.

**Architecture:** Keep QuoteEditor as the owner of the in-memory line list. Add a local-selection mode to ProductPicker for /quotes/new, while preserving the current server action for existing draft Quotes. Send only Product identity, expected Product lock version, editable commercial fields, and editable dimension values to the existing trusted save_quote_draft RPC, which already derives source snapshots and accepts an empty item array.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Supabase/Postgres trusted RPCs, Vitest, Playwright, Bun, and the existing Product/QuoteItem/dimension contracts. No new dependency, migration, pricing engine, hierarchy, lifecycle state, or feature flag.

---

## Invariants and scope boundaries

- Do not modify supabase/migrations/20260901100000_product_dimensions_and_quote_lines.sql. Its existing save_quote_draft implementation already validates new Product IDs, Product lock versions, active status, currency, dimensions, and empty item arrays.
- Do not change Product, QuoteItem, category snapshot, dimension snapshot, money, stale-review, document, Design IR, TokenSet, HEEx, Tailwind, or Phase 5 contracts.
- Do not persist a Quote when the new Quote page opens or when a Product is selected. Save draft remains the first persistence event for a new Quote.
- A new draft may contain zero, one, or many lines. Lead and subject remain required. Mark ready continues to reject a Quote with no lines, missing required dimensions, or unresolved Product changes.
- Catalogue Product selection remains server-authoritative. Browser Product names, categories, catalogue prices, totals, and source metadata are display values only; the server re-fetches and snapshots the Product.
- A dimensional Product remains quantity 1 with a manually entered full quoted price. Dimensions never calculate price.
- Adding the same Product more than once is legal. Each selection is a separate line and can have different dimensions and price.
- Keep the existing Quick custom quote shortcut unchanged.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| src/lib/server/quote-form.ts | Preserve and validate pending catalogue Product identity in the save payload while excluding server-owned fields. |
| src/lib/server/quote-form.spec.ts | Unit coverage for pending catalogue rows, custom rows, empty rows, and malformed identity. |
| src/lib/components/products/ProductPicker.svelte | Search active Products in both new-Quote local mode and saved-draft server-action mode. |
| src/lib/components/quotes/QuoteEditor.svelte | Own pending lines, render the picker before first save, serialize Product identity, and support an empty line list. |
| src/routes/quotes/new/+page.server.ts | Load active Product categories for the initial picker. |
| src/routes/quotes/new/+page.svelte | Pass categories and rehydrate pending catalogue rows after failed saves. |
| tests/e2e/domain/p24-quote-builder.e2e.ts | Prove catalogue-first new Quote creation and empty draft behavior. |
| tests/e2e/domain/product-dimensions-quote.e2e.ts | Exercise dimensional Product lines from the real new-Quote flow without a bootstrap line. |
| docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md | Document the catalogue-first flow and pending-line trust boundary. |
| docs/QUOTE_MANAGEMENT.md | Document zero-line drafts, catalogue selection, and ready-state requirements. |

No new database migration or schema file is required. Reuse the existing trusted RPC contract.

### Task 1: Preserve pending catalogue identity in the quote form contract

**Files:**

- Modify: src/lib/server/quote-form.ts
- Modify: src/lib/server/quote-form.spec.ts

- [ ] Step 1: Add the failing parser test. Add a catalogue item containing source_type "catalogue", a valid product_id, product_lock_version "7", editable fields, dimensions, and browser-owned snapshots. Assert the parsed result preserves source type, Product ID, lock version, name, description, quantity, quoted price, taxable flag, and dimensions, but excludes product_code_snapshot, catalogue_unit_price, and line_subtotal.
- [ ] Step 2: Add identity and empty-array cases. Assert that a catalogue row without a valid Product UUID, without a positive integer Product lock version, or with a custom source and Product ID throws. Assert that parsing an empty item array returns an empty array, and retain the existing custom-line and custom-dimension rejection tests.
- [ ] Step 3: Run the focused test red. Run:

~~~bash
bun run test:unit -- --run src/lib/server/quote-form.spec.ts
~~~

The new catalogue assertions must fail because the current parser drops Product identity fields.
- [ ] Step 4: Implement the discriminated parser branch. Extend QuoteFormItem with optional catalogue source fields. For catalogue rows, validate the UUID and positive integer lock version, preserve those fields, parse editable fields and dimensions, and exclude all browser-owned snapshots and totals. For custom rows, preserve the current output and reject Product identity or non-empty dimensions.
- [ ] Step 5: Run the focused test green. Run the same Vitest command and confirm all quote-form tests pass.
- [ ] Step 6: Commit the parser contract. Stage only the two quote-form files, run git diff --cached --check, inspect git diff --cached, and commit:

~~~bash
git commit -m "feat: preserve pending catalogue quote lines"
~~~

### Task 2: Add local-selection mode to the Product picker and Quote editor

**Files:**

- Modify: src/lib/components/products/ProductPicker.svelte
- Modify: src/lib/components/quotes/QuoteEditor.svelte
- Modify: tests/e2e/domain/p24-quote-builder.e2e.ts

- [ ] Step 1: Add the failing browser assertion. Add a catalogue-first scenario that seeds an active Product and eligible Lead, opens /quotes/new with the seeded Lead ID, and asserts Add from catalogue and Search catalogue are visible before any Quote exists. Assert there are no line items and no temporary custom line. Run:

~~~bash
bun run test:e2e -- tests/e2e/domain/p24-quote-builder.e2e.ts -g "catalogue-first"
~~~

It must fail because the picker is currently hidden on new Quotes.
- [ ] Step 2: Add the ProductPicker local callback. Make quoteId optional and add the callback onAddProduct(product, quantity). When no Quote ID exists, make Add Product to quote a button that calls the callback and resets selection. Preserve the current submit/form-action behavior for saved draft Quotes. Keep dimensional Products at quantity 1 and allow repeated Product selections.
- [ ] Step 3: Add pending catalogue rows to QuoteEditor. Extend editor state with product_lock_version. Add addCatalogueProduct(product, quantity) that appends a catalogue row with Product display metadata, the current catalogue price as the editable starting price, the Product taxable default, the expected lock version, and dimension definitions with null values. Pass the callback only when quoteId is absent.
- [ ] Step 4: Serialize only the pending Product contract. Include source_type "catalogue", product_id, and product_lock_version for new catalogue rows in the hidden items JSON, alongside editable fields and dimensions. Do not serialize server-owned category, catalogue-price, source-version, or total fields as trusted data.
- [ ] Step 5: Allow zero lines and render the picker from the start. Make an empty initialItems array produce no line rows instead of a required blank custom row. Keep Add line item as the explicit custom-row action and allow removing the last row. Render ProductPicker for every writable draft editor, regardless of quoteId.
- [ ] Step 6: Run focused verification. Rerun the catalogue-first browser scenario and:

~~~bash
bun run test:unit -- --run src/lib/server/quote-form.spec.ts src/lib/services/products.spec.ts
~~~

Confirm the picker appears before save and existing search/parser tests remain green.
- [ ] Step 7: Commit the picker/editor change. Stage only the picker, editor, and updated P24 test, inspect the cached diff, and commit:

~~~bash
git commit -m "feat: show catalogue picker on new quotes"
~~~

### Task 3: Load categories and retain failed new-Quote selections

**Files:**

- Modify: src/routes/quotes/new/+page.server.ts
- Modify: src/routes/quotes/new/+page.svelte
- Modify: tests/e2e/domain/p24-quote-builder.e2e.ts

- [ ] Step 1: Add the failing category and failure-retention assertions. Extend the catalogue-first scenario to assert the new Quote picker has an active category, select a Product, submit a deliberately invalid header or Product payload, and assert the pending Product row remains visible after the action failure.
- [ ] Step 2: Load active categories in the new route. Add the same product_categories projection and ordering used by the saved Quote route: active rows, sort_order ascending, label ascending, limited to 100. Return productCategories as id/label values and treat a category-load error as a failed route load.
- [ ] Step 3: Pass categories and rehydrate pending rows. Pass productCategories to QuoteEditor. In the new-route initialItems mapper, retain source type, Product ID, Product lock version, display code/unit/category/price/version, and dimensions from failed raw items JSON. Use these values only for display; the next save still re-fetches Product data in PostgreSQL.
- [ ] Step 4: Run route/type verification:

~~~bash
bun run test:e2e -- tests/e2e/domain/p24-quote-builder.e2e.ts -g "catalogue-first"
bun run check
~~~

Both commands must pass.
- [ ] Step 5: Commit the route change. Stage the two new-Quote route files and the P24 test, inspect the cached diff, and commit:

~~~bash
git commit -m "feat: load catalogue categories for new quotes"
~~~

### Task 4: Prove catalogue-first, zero-line, and dimensional journeys

**Files:**

- Modify: tests/e2e/domain/p24-quote-builder.e2e.ts
- Modify: tests/e2e/domain/product-dimensions-quote.e2e.ts

- [ ] Step 1: Add the empty-draft journey. Open /quotes/new with the seeded Lead ID, fill the required subject, click Save draft with zero lines, follow the redirect, assert the Quote remains draft, assert no line item exists, and assert Add from catalogue remains visible. Click Mark ready and assert the existing at-least-one-line validation.
- [ ] Step 2: Add the catalogue-only save journey. Open the new Quote route, select two Products before the first save, add no temporary custom line, save, and verify both persisted rows are Catalogue line rows with server-derived names and source data. Select the same Product twice in a separate assertion and verify two independent rows remain.
- [ ] Step 3: Replace dimensional bootstrap setup. In product-dimensions-quote.e2e.ts, navigate to the new Quote route instead of creating a temporary setup line through a direct RPC. Add Blockout Blinds and Security Shutters before the first save, select Blockout Blinds a second time for another opening, apply enquiry Width/Height to one row, edit the other row independently, enter full quoted prices, and save once. Preserve all existing assertions for category headings, Openings context, readiness rejection, stale review, and customer-facing output.
- [ ] Step 4: Run focused browser coverage:

~~~bash
bun run test:e2e -- tests/e2e/domain/p24-quote-builder.e2e.ts tests/e2e/domain/product-dimensions-quote.e2e.ts
bun run test:e2e -- tests/e2e/domain/p22-products.e2e.ts tests/e2e/domain/p23-product-snapshot.e2e.ts tests/e2e/domain/quote-dimensions-editor.e2e.ts tests/e2e/domain/product-picker-dimensions.e2e.ts
~~~

Expected result: new catalogue selections are stored by the existing trusted RPC, no temporary line is needed, zero-line drafts remain drafts, and existing Product/Quote dimensions behavior remains green.
- [ ] Step 5: Commit the journey coverage. Stage only the two browser test files, inspect the cached diff, and commit:

~~~bash
git commit -m "test: cover catalogue-first quote creation"
~~~

### Task 5: Document the boundary and run local gates

**Files:**

- Modify: docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md
- Modify: docs/QUOTE_MANAGEMENT.md

- [ ] Step 1: Document the initial picker. State that /quotes/new shows Add from catalogue before a Quote ID exists, Product selections remain pending until Save draft, and the saved-draft picker continues using the existing trusted action. Keep Quick custom quote documented as a separate custom-only shortcut.
- [ ] Step 2: Document draft rules. State that a draft may have zero, one, or many lines, repeated Product selections create independent lines, and Mark ready still requires at least one line plus complete dimensions and source review.
- [ ] Step 3: Run focused and static gates:

~~~bash
bun run test:unit -- --run src/lib/server/quote-form.spec.ts src/lib/services/products.spec.ts
bun run format:check
bun run lint
bun run check
bun run build
git diff --check
~~~

All commands must exit with status 0.
- [ ] Step 4: Run database/security and regression gates:

~~~bash
bun run db:types:check
bun run db:test
bun run db:security
bun run test:p7:quotes
bun run test:p14:product-flow
bun run test
bun run test:e2e:domain
~~~

Do not create or rewrite a migration. The existing trusted RPC and generated types must remain unchanged.
- [ ] Step 5: Perform the final scope review. Confirm there is no temporary bootstrap logic, no pricing calculation, no hierarchy, no new dependency, no schema change, and no protected main-worktree file in the branch. Confirm the new route supports empty, custom-only, catalogue-only, and mixed drafts.
- [ ] Step 6: Commit documentation and final local checkpoint. Stage only the two documentation files and any reviewed feature paths not already committed. Run git diff --cached --check, inspect git diff --cached, and commit:

~~~bash
git commit -m "docs: describe catalogue-first quote creation"
~~~

## Completion gate

The implementation is complete only when:

- Add from catalogue is visible on /quotes/new before the first save.
- A salesperson can select one or many Products, including the same Product more than once, without a temporary manual line.
- A new Quote can be saved with zero, one, or many lines.
- Pending catalogue Product identity is passed to save_quote_draft; PostgreSQL still owns Product/category snapshots, dimensions, totals, and lifecycle validation.
- Dimensional lines retain quantity 1, editable dimensions, and manually entered full quoted prices.
- Existing saved-draft Product additions, stale review, lead measurement defaults, category grouping, preview/PDF output, and custom lines remain green.
- No schema, migration, pricing engine, Product hierarchy, lifecycle state, dependency, or unrelated Quote UX change was introduced.
- Focused tests, related E2E journeys, full local tests, type checks, lint, formatting, build, database/security checks, and git diff --check pass with fresh evidence.
