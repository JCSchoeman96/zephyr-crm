# Product dimensions and quote lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, product-configured millimetre dimensions to the flat product catalogue and persist the final dimensions, category snapshots, and manually entered full line prices on quote items. Carry structured Width/Height lead measurements into the quote builder as editable defaults without introducing dimension-based pricing calculation.

**Architecture:** Keep ProductCategory as the existing flat catalogue grouping and use it as a non-priced quote heading. Add server-validated JSON dimension definitions to Products and server-owned dimension/category snapshots to QuoteItems. Product selection creates one line per actual item with quantity `1`; the existing quote money functions calculate `1 × unit_price`, where `unit_price` is the salesperson's full quoted price for dimensional lines. Lead parsing remains structured enquiry data; the quote editor applies matching values into a line's temporary state before the trusted draft action persists them. Existing Product and Quote RPC boundaries, lifecycle guards, stale-source review, presentation model, and document serializers remain the authoritative boundaries.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Supabase/Postgres SQL migrations and trusted RPCs, Vitest, Playwright, Bun, existing Zod/domain validation conventions, and the existing quote presentation/PDF pipeline. No new dependency, pricing engine, product hierarchy, or global feature flag.

---

## Invariants to preserve throughout

- Do not edit an existing migration; add one forward-only migration after `20260828150000_v150_quote_document_integrity.sql`.
- Keep Design IR/Bricks work, HEEx/Tailwind unrelated work, Product/Quote money semantics, and Phase 5 untouched.
- Keep Product and Token/quote source snapshots server-owned. The browser may submit only editable line fields and dimension values.
- `dimensions_enabled = false` always has an empty definition list. Services cannot enable dimensions. Enabled products have one to four ordered definitions using the supported keys `width`, `height`, `length`, and `depth`, with unit `mm`.
- Persist dimension values as canonical positive decimal strings (the form uses numeric inputs); retain `null` while a draft line is incomplete. Include `required` in the line snapshot so readiness validation does not depend on a later Product edit.
- A dimensional quote item has quantity `1`; its `unit_price` is the full manually quoted amount and its normal `line_subtotal`/tax/total calculations remain in force.
- `Openings` is enquiry context only. It never multiplies a line or creates duplicate lines. Every opening is represented by a separately selected or manually configured quote line.
- Custom quote lines remain supported but cannot carry Product-defined dimensions in this release.
- Category heading order is the first appearance order of categories in the ordered quote lines. `Other` is the heading for uncategorised custom lines; headings have no amount or tax.
- Customer-facing preview/PDF may show Product, size, quantity, unit, and amount, but never `internal_notes` or private implementation metadata.

## 1. Establish the dimension domain contract with failing unit tests

**Files:**

- Create `src/lib/domain/products/dimensions.spec.ts`.
- Create `src/lib/domain/products/dimensions.ts`.
- Extend `src/lib/domain/leads/request-details.spec.ts` only for the lead-measurement helper introduced in this task.
- Extend `src/lib/domain/leads/request-details.ts` with the helper rather than creating a second lead parser.

- [ ] Write tests first for `normalizeDimensionDefinitions` and `buildDimensionSnapshot` covering: ordered Width/Height definitions, the four supported keys, duplicate keys, unknown keys, invalid units, empty labels, more than four definitions, disabled products, and service rejection. Assert that form strings are normalized without changing definition order.
- [ ] Write tests first for positive decimal value normalization, `null` draft values, zero/negative/non-numeric values, duplicate snapshot keys, and applying only matching lead Width/Height values while retaining unmatched Product fields as `null`.
- [ ] Write tests first for `extractLeadMeasurements(parseLeadRequestMessage(message))`, asserting `Width (mm)`, `Height (mm)`, and `Openings` remain distinct structured values and that an unstructured lead returns `null` values with `hasStructuredFields` preserved.
- [ ] Run the new tests before implementation with `bunx vitest run src/lib/domain/products/dimensions.spec.ts src/lib/domain/leads/request-details.spec.ts`; confirm the new assertions fail for missing exports/behavior.
- [ ] Implement the exact shared types and pure functions used by both server and UI:

  ```ts
  export const DIMENSION_KEYS = ['width', 'height', 'length', 'depth'] as const;
  export type DimensionKey = (typeof DIMENSION_KEYS)[number];
  export type DimensionDefinition = {
    key: DimensionKey;
    label: string;
    unit: 'mm';
    required: boolean;
  };
  export type DimensionValue = DimensionDefinition & { value: string | null };

  export function normalizeDimensionDefinitions(input: unknown): DimensionDefinition[];
  export function buildDimensionSnapshot(
    definitions: DimensionDefinition[],
    values?: Record<string, unknown>,
  ): DimensionValue[];
  export function normalizeDimensionValue(input: unknown): string | null;
  export function extractLeadMeasurements(parsed: ParsedLeadRequestMessage): {
    width: string | null;
    height: string | null;
    openings: string | null;
  };
  ```

  Reject invalid definitions by returning the existing domain validation error shape used by this repository; do not silently discard invalid fields. Canonicalize valid numeric text using decimal-string rules, not JavaScript floating-point arithmetic.
- [ ] Rerun the focused tests and confirm they pass. Commit only the two domain files and the lead parser test/source changes as `test: define product dimension contracts` followed by `feat: normalize product dimensions` if the repository's normal TDD checkpoint convention is used.

## 2. Extend Product persistence and ProductForm configuration

**Files:**

- Create a new forward migration at `supabase/migrations/20260901100000_product_dimensions_and_quote_lines.sql`.
- Extend `src/lib/server/products.ts` and `src/lib/server/products.spec.ts`.
- Extend `src/routes/products/new/+page.server.ts` and `src/routes/products/[id]/+page.server.ts`.
- Extend `src/lib/components/products/ProductForm.svelte`.
- Extend `src/lib/types/database.ts` through the repository's generated-types command; do not hand-edit generated output.

- [ ] Add Product boundary tests before implementation for creating/updating an active or draft `product` with ordered Width/Height definitions, disabling dimensions, rejecting a service with dimensions, rejecting malformed definitions, and retaining the existing product price/currency/tax behavior. Run the focused server tests and record the red result.
- [ ] Add the migration columns:

  ```sql
  alter table public.products
    add column dimensions_enabled boolean not null default false,
    add column dimension_definitions jsonb not null default '[]'::jsonb;
  ```

  Add a database check that disabled products have `[]`, enabled products have a JSON array, and `kind = 'service'` cannot enable dimensions. Keep the canonical definition shape/ordering/allowed-key/`mm`/required checks in trusted functions so error messages remain user-facing and the database is still authoritative.
- [ ] Replace the existing `create_product` and `update_product` function definitions in the new migration with the current signatures plus `p_dimensions_enabled boolean default false` and `p_dimension_definitions jsonb default '[]'::jsonb`. Preserve owner/admin checks, category checks, lock-version behavior, Product activities, and all existing fields. Normalize/validate the dimensions before writing; store `[]` for disabled products.
- [ ] Extend `ProductInput`, `normalizeProductInput`, `create_product` form data, and `update_product` form data with `dimensionsEnabled` and a serialized `dimensionDefinitions` field. Keep product form errors attached to the existing form error mechanism.
- [ ] Replace raw JSON editing with a ProductForm measurement editor: an enable toggle, an ordered list of the four permitted field presets, label inputs, required toggles, add/remove/reorder controls, and a hidden serialized field generated from the editor state. Hide or disable the editor for services and clear definitions when the kind changes to `service`.
- [ ] Add ProductForm tests for create/edit serialization and service behavior, then rerun the focused tests green.
- [ ] Run `bun run db:reset` and `bun run db:types`; inspect the generated Product types and confirm `bun run db:types:check` passes. Do not alter any Design IR or TokenSet type.

## 3. Add flat ProductCategory management

**Files:**

- Create `src/routes/products/categories/+page.server.ts`.
- Create `src/routes/products/categories/+page.svelte`.
- Create `src/lib/components/products/ProductCategoryForm.svelte` if the route needs a reusable create/edit form.
- Extend `src/routes/products/+page.svelte` with an Owner/Admin-only category-management link.
- Extend `tests/e2e/domain/p22-products.e2e.ts` or add `tests/e2e/domain/product-category-management.e2e.ts`.

- [ ] Write an E2E assertion first for an Owner/Admin creating a category, editing its label/code/sort order, seeing it in the Product form/picker, and an ordinary salesperson not seeing management controls. Run that scenario red before implementation.
- [ ] Implement the route with `requireActiveStaff`, the existing `canManageProducts` permission helper, and the existing trusted `create_product_category`, `update_product_category`, `activate_product_category`, and `inactivate_product_category` RPCs. Use lock versions on edits and preserve the current category status semantics.
- [ ] Render categories as flat records. Do not add `parent_id`, nested categories, sub-products, or a new hierarchy table. Use category `sort_order` for the catalogue/category manager only.
- [ ] Rerun the category E2E and the existing product journey; confirm both pass.

## 4. Extend Product search and picker data

**Files:**

- Extend `src/lib/services/products.ts` and its tests.
- Extend `src/routes/api/products/search/+server.ts` and its tests, if present.
- Extend `src/lib/components/products/ProductPicker.svelte`.
- Extend the quote page server loaders that build `productSources`.

- [ ] Add a service/API test first asserting that a dimensional active Product response contains `dimensions_enabled` and its ordered `dimension_definitions`, while a service returns disabled/empty dimensions. Run it red.
- [ ] Add the fields to `ProductOption` and the server-backed search select. Keep the existing currency, active-status, category, pagination, and authorization filters unchanged.
- [ ] Update ProductPicker so a dimensional Product preview identifies the required measurements, removes or disables its quantity input, and submits only Product identity/lock data. The server, not the picker, determines the line's dimension snapshot and quantity `1`.
- [ ] Rerun ProductPicker/service tests and the existing P23 product-selection journey before moving to quote persistence.

## 5. Add QuoteItem dimension and category snapshot storage

**Files:**

- Extend `supabase/migrations/20260901100000_product_dimensions_and_quote_lines.sql`.
- Extend `src/lib/types/database.ts` via `bun run db:types`.
- Extend `scripts/test-p23-quote-item-schema.mjs` or add `scripts/test-product-dimensions-schema.mjs` for the new current schema contract.

- [ ] Write schema/action tests first for existing custom rows defaulting to `dimensions = []`, catalogue rows carrying category and dimension snapshots, nullable category snapshots for uncategorised products, and no foreign key that would invalidate a historical category snapshot after category changes. Run the script red.
- [ ] Add these QuoteItem columns without changing existing money columns:

  ```sql
  alter table public.quote_items
    add column dimensions jsonb not null default '[]'::jsonb,
    add column product_category_id_snapshot uuid,
    add column product_category_code_snapshot text,
    add column product_category_label_snapshot text;
  ```

  Add checks for a JSON array and the canonical dimension snapshot shape. Keep the category ID a historical value without a live FK. Preserve existing source-type/source-product consistency constraints.
- [ ] Regenerate types, inspect the diff, and extend the schema contract to assert the exact columns, defaults, checks, and grants. Run `bun run db:reset`, the schema script, `bun run db:types:check`, and `bun run db:test`.

## 6. Extend trusted Product-to-Quote RPCs

**Files:**

- Extend the new migration with replacements for the existing functions in `20260828110000_v150_quote_item_snapshots.sql` and `20260828120000_v150_quote_builder.sql`.
- Extend `scripts/test-p23-product-selection.mjs`, `scripts/test-p23-quote-item-schema.mjs`, and/or add `scripts/test-product-dimensions-actions.mjs`.

- [ ] Write database tests first for `add_product_quote_item`: a dimensional Product creates one catalogue line with quantity `1`, full Product definition/value snapshot with `null` values, Product/category snapshots, initial catalogue price, and unchanged quote totals. Assert a non-dimensional Product/Service follows the old path.
- [ ] Write database tests first for `save_quote_draft`: two rows for the same Product preserve different Width/Height values and full prices; different Products/categories remain separate rows; custom dimensions are rejected; dimensional quantity other than `1` is rejected or normalized to `1` at the trusted boundary; browser-supplied source/category fields cannot overwrite server snapshots; invalid/zero/negative/missing required values are rejected as specified.
- [ ] Write database tests first for readiness/lifecycle: a draft with a missing required dimension cannot be marked ready; after ready/sent/terminal states, dimensions and full prices cannot mutate; ordinary subtotal/tax/total calculations remain correct for `1 × full price` rows.
- [ ] Write database tests first for source changes: `refresh_product_quote_item` maps existing dimension values by stable key, preserves entered values, adds new keys as `null`, removes deleted keys, updates Product/category metadata, and retains the line as stale/reviewable according to the existing workflow. `review_product_quote_item` keeps the complete line snapshot. `revise_quote` copies dimensions and all category snapshots.
- [ ] Implement `add_product_quote_item` with the existing quote/product lock order and active/currency checks. Derive the dimension and category snapshots from the locked Product and category rows; never accept those snapshots from the browser.
- [ ] Implement draft validation in the trusted `save_quote_draft` replacement. Accept the existing item JSON plus `dimensions`; validate each catalogue line against its persisted Product lineage/definition contract, validate custom lines as dimensionless, force dimensional quantity to `1`, and continue to calculate all totals in SQL.
- [ ] Add the readiness guard in the existing trusted readiness path/trigger so every required snapshot value is present and positive before the lifecycle transition. Keep stale-source and terminal-state guards intact.
- [ ] Update refresh/revise copies explicitly so dimensions and category snapshots cannot be lost during stale review or quote revision.
- [ ] Rerun the database action scripts and all existing P22/P23/P24 persistence regressions. Do not weaken an existing assertion to make the new tests pass.

## 7. Carry dimensions through quote form parsing and editor state

**Files:**

- Extend `src/lib/server/quote-form.ts` and `src/lib/server/quote-form.spec.ts`.
- Extend `src/lib/components/quotes/QuoteEditor.svelte`.
- Extend `src/lib/components/quotes/QuoteLineEditor.svelte`.
- Extend `src/routes/quotes/[id]/+page.server.ts` and `src/routes/quotes/[id]/+page.svelte`.
- Extend `src/routes/quotes/new/+page.server.ts` only if the new quote defaults require a matching type.

- [ ] Write parser tests first for valid dimension arrays, `null` draft values, unknown keys, duplicate keys, malformed values, dimensions on custom items, and the existing item fields. Assert that parser output is safe to send to `save_quote_draft` but does not author Product/category snapshots or totals. Run red.
- [ ] Extend `QuoteFormItem` with `dimensions?: DimensionValue[]` and include only the editable `dimensions` values in the hidden `p_items` JSON. Continue to parse quantity and price using existing money/quantity rules.
- [ ] Extend `EditorItem` with `dimensionsEnabled`, `dimensions`, and server-supplied category snapshot fields. Keep `source_type`, Product IDs, lock versions, and catalogue metadata read-only in the UI.
- [ ] Render each dimensional line with its configured fields as numeric millimetre inputs. Display `1` as fixed quantity and label the price control `Full quoted price`. Keep ordinary Product/Service/custom line controls unchanged.
- [ ] Add the approved `Measurements from enquiry` panel beside the quote builder. Show structured Width, Height, and Openings values read-only, explain when no structured measurements exist, and provide an `Apply to line` action for a selected dimensional line. Applying values changes editable line state only; it does not submit a separate lead mutation.
- [ ] Keep Openings visible as context but never use it to add or multiply rows. Provide an explicit `Add product line` path so the salesperson can add another Product, including a different Product for another opening.
- [ ] Preserve draft incompleteness in the editor. Show a line-level missing-measurement error returned by the action and prevent the browser from hiding the server rejection.
- [ ] Rerun quote-form unit tests and the existing quote builder unit tests, then run the affected route tests/type checks.

## 8. Add quote category grouping and customer-facing size presentation

**Files:**

- Extend `src/lib/domain/quotes/documents/presentation-model.ts` and `src/lib/domain/quotes/documents/presentation-model.spec.ts`.
- Extend `src/lib/components/quotes/QuoteDocumentPreview.svelte`.
- Extend `src/lib/domain/quotes/documents/pdf-v2.ts` and `src/lib/domain/quotes/documents/pdf-v2.spec.ts`.
- Extend `src/lib/domain/quotes/documents/document.spec.ts` if the document contract fixture needs the new presentation fields.

- [ ] Write presentation-model tests first for two categories and three lines: headings occur in first-category-appearance order, lines retain their quote order within a category, each dimensional line includes a formatted `Width: 1500 mm × Height: 1500 mm`-style size detail, headings have no amount/tax, and uncategorised custom lines use `Other`. Assert `internal_notes` is absent. Run red.
- [ ] Extend the presentation types with a customer-facing dimension type and category heading/group data while retaining the existing item fields (`code`, `description`, `quantity`, `unit`, `unitPrice`, `amount`, `taxable`). Build the model only from server-loaded snapshots and existing Product source snapshots.
- [ ] Implement one shared category-grouping helper used by preview and PDF. Its algorithm records the first category occurrence, preserves item order, and emits a heading plus item rows; it does not create a price-bearing heading.
- [ ] Render headings and indented Product lines in the responsive preview. Render dimensions below the Product description using the stored unit/value and leave custom lines unchanged.
- [ ] Add dimension text to PDF `itemSegments`/line details without changing the document table's quantity, unit-price, amount, tax, subtotal, or total calculations. Keep internal notes out of all serialized document output.
- [ ] Rerun document/presentation/PDF unit tests and the existing P8/P14 document regressions.

## 9. Complete Product and Quote browser journeys

**Files:**

- Create `tests/e2e/domain/product-dimensions-quote.e2e.ts`.
- Extend `tests/e2e/domain/helpers.ts` only for reusable setup needed by the new journey.
- Extend `scripts/test-p24-quote-builder.mjs` only if the trusted-boundary assertions belong there; otherwise create `scripts/test-product-dimensions-actions.mjs`.

- [ ] Add the browser test before implementation changes for this end-to-end flow: seed `Blinds` and `Shutters`, create `Blockout Blinds` with Width/Height and `Security Shutters` with Width/Height, create a lead with structured Width/Height/Openings, open a quote, add two differently sized Blockout Blinds lines and one Security Shutters line, apply enquiry defaults to one line, edit all values/prices, save, and assert each row is independent.
- [ ] Assert the quote builder shows `Blinds` and `Shutters` as non-priced headings with indented lines, quantity `1`, full quoted prices, and no internal notes. Assert `Openings` did not create duplicate rows.
- [ ] Assert Mark Ready is rejected while a required dimension is empty, then succeeds after the value is supplied. Assert the resulting preview contains each size and amount.
- [ ] Assert a Service cannot be configured with dimensions and a custom line cannot submit dimensions. Assert sent/terminal quote edit attempts remain rejected by the server.
- [ ] Assert a Product/category source change followed by stale review preserves the entered line dimensions and the category/Product snapshots used by the quote.
- [ ] Run the focused browser journey with `bun run test:e2e -- tests/e2e/domain/product-dimensions-quote.e2e.ts`, then rerun the existing product, product-snapshot, and quote-builder journeys.

## 10. Document the implemented boundary

**Files:**

- Update `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`.
- Update `docs/QUOTE_MANAGEMENT.md`.
- Update `docs/superpowers/specs/2026-09-01-product-dimensions-and-quote-lines-design.md` only if implementation evidence requires a wording correction; do not change the approved behavior.

- [ ] Add the Product dimension definition and QuoteItem dimension/category snapshot shapes, the flat-category/no-sub-product decision, the one-line-per-opening rule, and the `quantity = 1`/full-price rule to the catalogue and quote documentation.
- [ ] Document that Width/Height/Length/Depth currently use `mm`, values are manually entered or applied from structured lead defaults, and per-mm/per-cm/per-m/m²/m³ pricing is deferred.
- [ ] Document the trust boundary: the lead remains enquiry data, the salesperson applies editable defaults, `save_quote_draft` and readiness validation are authoritative, and Product/category snapshots survive source changes.
- [ ] Document customer-facing preview/PDF behavior and the exclusion of internal notes. Do not rewrite unrelated historical implementation plans or promote the feature to Phase 5.

## 11. Validation and local handoff

- [ ] Run focused unit tests for dimensions, lead extraction, products, quote form, presentation model, PDF, and all affected existing quote/document tests with `bunx vitest run ...`.
- [ ] Run database reset and generated types: `bun run db:reset`, `bun run db:types`, `bun run db:types:check`, `bun run db:test`, `bun run db:security`, and the new/extended Product and Quote action scripts.
- [ ] Run focused browser coverage: the new dimensions journey plus `tests/e2e/domain/p22-products.e2e.ts`, `tests/e2e/domain/p23-product-snapshot.e2e.ts`, and `tests/e2e/domain/p24-quote-builder.e2e.ts`.
- [ ] Run repository quality gates: `bun run format:check`, `bun run lint`, `bun run check`, `bun run build`, and `bun run diff:check`.
- [ ] Run the required regression set for the affected contracts: `bun run test:unit -- --run`, `bun run test:p7:quotes`, `bun run test:p8:documents`, `bun run test:p14:document-fitness`, `bun run test:p14:product-flow`, `bun run test:p16:persistence`, `bun run test:p17:sales-fulfilment`, `bun run test:p19:fulfilment`, and `bun run test:p20:metrics`. Include the existing product/quote schema and selection scripts.
- [ ] Inspect `git diff --stat`, `git diff --check`, generated type changes, migration ordering, and the final document output. Confirm no old migration, Design IR/TokenSet contract, unrelated user change, or `.agent` authority file was modified.
- [ ] Record the focused/full validation results in the local goal-loop handoff if the repository loop state is active, and create a local checkpoint commit with explicit feature paths only. Do not push or open a remote PR from this project-local worktree.

## Completion gate

The feature is complete only when all tests and gates above pass and the final behavior proves: optional Product dimensions; Service exclusion; one independent line per actual opening/Product; editable lead Width/Height defaults; quantity `1` and full manually entered line price; stable Product/category/dimension snapshots; readiness rejection for missing required dimensions; unchanged existing quote totals/lifecycle; category headings with indented customer-facing lines; preview/PDF size output without internal notes; and no pricing calculation engine or Product hierarchy.
