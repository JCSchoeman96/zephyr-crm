# Product Catalogue and Quote Documents v1.5.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the additive v1.5.0 Product Catalogue → immutable QuoteItem snapshot → professional Quote document flow without weakening the completed v1.4.0 CRM.

**Architecture:** PostgreSQL and trusted actions own Product lifecycle, snapshot creation, locks, money, and document metadata. SvelteKit orchestrates authorized requests and builds one server-owned QuotePresentationModel consumed by both the responsive preview and `pdf-lib` Template v2. SendPulse remains the delivery adapter and private Supabase Storage remains the document store.

**Tech Stack:** Bun 1.2.22, SvelteKit/Svelte 5, Supabase PostgreSQL/RLS, Zod, Vitest, Playwright, `pdf-lib` 1.17.1, Cloudflare adapter, SendPulse REST adapter.

---

## Plan constraints

- Work from the reconciled `codex/v150-product-catalogue` branch.
- Preserve existing v1.4.0 migrations and tests; every database change is a new forward-only migration.
- Use `bun` for package installation and scripts. Do not add a dependency unless the approved baseline is amended.
- Keep Product fields out of Quote commercial authority after snapshot creation. The browser never supplies authoritative totals or lifecycle results.
- Keep Product internal notes out of every customer-facing model, PDF, email, public config, and log.
- Do not add inventory, ERP, variants, price books, FX, public quote portals, signatures, online payments, Redis, Browser Rendering, or remote deployment.

## File map

| Area | Files | Responsibility |
|---|---|---|
| Persistence | `supabase/migrations/20260828100000_v150_product_catalogue.sql`, `supabase/migrations/20260828110000_v150_quote_item_snapshots.sql` | Product/Category tables, QuoteItem source fields, RLS, protected-field triggers, trusted SQL actions, indexes and constraints |
| Types | `src/lib/types/database.ts` | Generated Supabase schema types; never hand-edit generated output |
| Product domain | `src/lib/domain/products/states.ts`, `src/lib/domain/products/presentation.ts` | Pure lifecycle guards, labels, filter/pagination projections and tests |
| Product server boundary | `src/lib/server/products.ts`, `src/routes/products/+page.server.ts`, `src/routes/products/new/+page.server.ts`, `src/routes/products/[id]/+page.server.ts` | Parse forms, invoke trusted actions, authorize reads, return safe page data |
| Product UI | `src/lib/components/products/ProductForm.svelte`, `ProductTable.svelte`, `ProductPicker.svelte` | Catalogue form/table/picker with accessible loading/error states |
| Quote integration | `src/lib/server/quote-actions.ts`, `src/lib/server/quote-form.ts`, `src/lib/components/quotes/QuoteEditor.svelte`, `QuoteLineEditor.svelte` | Draft-only Product selection, custom lines, editing, stale review and server action forms |
| Presentation/documents | `src/lib/domain/quotes/documents/presentation-model.ts`, `template-v2.ts`, `pdf-v2.ts`, `src/lib/components/quotes/QuoteDocumentPreview.svelte`, `src/lib/server/quote-documents.ts` | One canonical customer model, responsive preview, A4 pagination, immutable PDF attachment |
| Delivery | existing quote email builder/SendPulse adapter | Branded escaped email with required frozen PDF attachment |
| Tests | `src/lib/domain/products/*.spec.ts`, server specs, SQL contract scripts, `tests/e2e/domain/p22-*.e2e.ts` through `p26-*.e2e.ts` | Focused red/green contracts and phase regression evidence |

### Task 1: P21 architecture freeze

**Files:**

- Create: `CRM_IMPLEMENTATION_ROADMAP_v1.5.0.md`
- Create: `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`
- Create: `docs/phases/PHASE_21_PRODUCT_QUOTE_ARCHITECTURE.md` through `PHASE_26_DELIVERY_RECONCILIATION.md`
- Modify: `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md`, `docs/SECURITY_MODEL.md`, `docs/ROADMAP.md`

- [x] **Step 1: Record the reconciled baseline**

Run:

```bash
git show -s --format='%H %P %s' HEAD
git status --short --branch
```

Expected: a clean v1.4 patchlist/origin-main reconciliation commit and no
unrelated worktree changes.

- [x] **Step 2: Write the frozen architecture and phase authorities**

The architecture document defines Product, ProductCategory, lifecycle,
permissions, snapshot fields, stale review, currency, canonical presentation
model, PDF v2, private storage, email, Activity, source boundaries, and
non-goals. Phase documents define contiguous `P21-T01` through `P26-T02`
requirements.

- [x] **Step 3: Validate documentation**

Run:

```bash
bunx prettier --check CRM_IMPLEMENTATION_ROADMAP_v1.5.0.md docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md docs/ARCHITECTURE.md docs/DOMAIN_MODEL.md docs/STATE_MACHINES.md docs/SECURITY_MODEL.md docs/ROADMAP.md docs/phases/PHASE_21_PRODUCT_QUOTE_ARCHITECTURE.md docs/phases/PHASE_22_PRODUCT_CATALOGUE_FOUNDATION.md docs/phases/PHASE_23_PRODUCT_TO_QUOTE_TRACER.md docs/phases/PHASE_24_QUOTE_BUILDER_EXPERIENCE.md docs/phases/PHASE_25_PROFESSIONAL_QUOTE_DOCUMENT.md docs/phases/PHASE_26_DELIVERY_RECONCILIATION.md
git diff --check
```

Expected: all listed documents are formatted and no whitespace errors exist.

### Task 2: Product and category schema (P22-T01)

**Files:**

- Create: `supabase/migrations/20260828100000_v150_product_catalogue.sql`
- Create: `scripts/test-p22-product-schema.mjs`
- Test: `scripts/test-p22-product-schema.mjs`
- Modify: `src/lib/types/database.ts` by running the repository generator

- [ ] **Step 1: Write the failing schema contract**

The contract must assert the existence of `product_categories` and `products`,
their columns/checks/FKs, the four named Product indexes, RLS enablement,
protected-field triggers, and no destructive edit to prior migrations.

- [ ] **Step 2: Run the focused contract and observe the expected failure**

Run:

```bash
bun run db:start
bun run db:reset
bun scripts/test-p22-product-schema.mjs
```

Expected: FAIL because the Product tables and v1.5 schema contract are not
present yet.

- [ ] **Step 3: Add the forward-only migration**

Create `product_categories` and `products` with UUID IDs, bounded text,
lowercase status/kind checks, uppercase three-letter currency, numeric price
scale 4/non-negative checks, positive `lock_version`, UTC timestamps, creator
Profile FK, nullable category FK, lifecycle evidence timestamps, named
case-insensitive code/index constraints, RLS, and protected-field triggers.
Add only `products_product_code_lower_uidx`, `products_status_name_idx`,
`products_category_status_name_idx`, `products_kind_status_idx`.

- [ ] **Step 4: Run the contract green and regenerate types**

Run:

```bash
bun run db:reset
bun scripts/test-p22-product-schema.mjs
bun run db:types
bun run db:types:check
```

Expected: the schema contract and generated type check pass; prior migrations
remain byte-for-byte unchanged.

- [ ] **Step 5: Commit the schema boundary**

```bash
git add supabase/migrations/20260828100000_v150_product_catalogue.sql scripts/test-p22-product-schema.mjs src/lib/types/database.ts
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add v1.5 product catalogue schema"
```

### Task 3: Product trusted actions and domain contracts (P22-T02)

**Files:**

- Create: `src/lib/domain/products/states.ts`
- Create: `src/lib/domain/products/states.spec.ts`
- Create: `src/lib/server/products.ts`
- Create: `src/lib/server/products.spec.ts`
- Modify: `supabase/migrations/20260828100000_v150_product_catalogue.sql`
- Create: `scripts/test-p22-product-actions.mjs`

- [ ] **Step 1: Write failing lifecycle and role tests**

Cover valid `draft → active → inactive → active`, archive/restore, invalid
transitions, missing activation fields, duplicate case-insensitive codes,
negative/over-scale prices, stale locks, Sales/Viewer mutation denial, archive
reason requirements, and Activity old/new price evidence.

- [ ] **Step 2: Run the tests and verify feature-missing failures**

```bash
bun run test:unit -- --run src/lib/domain/products/states.spec.ts src/lib/server/products.spec.ts
bun scripts/test-p22-product-actions.mjs
```

Expected: FAIL because the state/action modules and SQL trusted actions do not
exist.

- [ ] **Step 3: Implement minimal pure lifecycle helpers**

Export only the canonical state union, transition guard, filter parser, and
human labels required by the tests. A transition helper returns a typed
allow/error result and never mutates a database row.

- [ ] **Step 4: Implement trusted SQL/server actions**

Expose create/update/price/lifecycle/category actions through the existing
trusted RPC pattern. Each action checks active Profile/role, current state,
expected `lock_version`, bounded input, category status, and reason; increments
the lock and appends Activity in the same transaction. `archive_product` is a
state change, never DELETE.

- [ ] **Step 5: Run focused tests green**

```bash
bun run db:reset
bun run test:unit -- --run src/lib/domain/products/states.spec.ts src/lib/server/products.spec.ts
bun scripts/test-p22-product-actions.mjs
bun run db:security
```

Expected: all focused Product action, RLS, protected-field, lock, and Activity
tests pass.

- [ ] **Step 6: Commit trusted Product actions**

```bash
git add src/lib/domain/products src/lib/server/products.ts src/lib/server/products.spec.ts supabase/migrations/20260828100000_v150_product_catalogue.sql scripts/test-p22-product-actions.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add trusted product catalogue actions"
```

### Task 4: Product management screens (P22-T03)

**Files:**

- Create: `src/lib/components/products/ProductForm.svelte`
- Create: `src/lib/components/products/ProductTable.svelte`
- Create: `src/routes/products/+page.server.ts`, `src/routes/products/+page.svelte`
- Create: `src/routes/products/new/+page.server.ts`, `src/routes/products/new/+page.svelte`
- Create: `src/routes/products/[id]/+page.server.ts`, `src/routes/products/[id]/+page.svelte`
- Test: `tests/e2e/domain/p22-products.e2e.ts`

- [ ] **Step 1: Write the failing browser journey**

The journey must create a draft, show it in a server-paginated list, reject
Sales mutation, Save & Activate an administrator product, filter by status,
kind, category and search term, perform allowed state actions, and verify no
inventory fields are rendered.

- [ ] **Step 2: Run the browser test red**

```bash
bunx playwright test tests/e2e/domain/p22-products.e2e.ts
```

Expected: FAIL because the `/products` routes do not exist.

- [ ] **Step 3: Implement server load/actions and owned components**

Use the existing `PageHeader`, `Card`, `Input`, `Select`, `Button`, `Badge`,
`ErrorState`, and `LoadingState` patterns. Server loads accept bounded search,
status, category, kind and page/cursor parameters; Product actions return
redirect/error form results and never expose secrets or unbounded catalogue
rows.

- [ ] **Step 4: Run focused browser and static checks**

```bash
bunx playwright test tests/e2e/domain/p22-products.e2e.ts
bun run check
bun run lint
bunx prettier --check src/lib/components/products src/routes/products tests/e2e/domain/p22-products.e2e.ts
```

Expected: the Product management journey, type checks, lint, and formatting
pass.

### Task 5: QuoteItem snapshot and tracer (P23)

**Files:**

- Create: `supabase/migrations/20260828110000_v150_quote_item_snapshots.sql`
- Create: `scripts/test-p23-quote-snapshot.mjs`
- Create: `src/lib/server/quote-product-actions.ts`
- Create: `src/lib/server/quote-product-actions.spec.ts`
- Modify: generated `src/lib/types/database.ts`
- Test: `tests/e2e/domain/p23-product-to-quote.e2e.ts`

- [ ] **Step 1: Write failing snapshot/immutability tests**

Assert custom backfill compatibility, catalogue fields and constraints,
active-only selection, draft-only Quote, matching currency, expected locks,
internal-note exclusion, exact price/tax snapshot, Product mutation after
selection, sent Quote immutability, and currency mismatch rejection.

- [ ] **Step 2: Run database and browser tests red**

```bash
bun run db:reset
bun scripts/test-p23-quote-snapshot.mjs
bunx playwright test tests/e2e/domain/p23-product-to-quote.e2e.ts
```

Expected: FAIL because QuoteItem has no Product source fields/action yet.

- [ ] **Step 3: Add forward-only QuoteItem fields and trusted action**

Add the source type, nullable Product lineage, code/unit/catalogue-price/source
version, reviewed version/time/actor fields, compatibility defaults and named
lineage index. Implement the transactional draft action that locks Quote and
Product in deterministic order, verifies active state and currency, copies
customer-facing values, and calculates no browser totals.

- [ ] **Step 4: Run tracer tests green and inspect snapshot rows**

```bash
bun run db:reset
bun scripts/test-p23-quote-snapshot.mjs
bunx playwright test tests/e2e/domain/p23-product-to-quote.e2e.ts
bun run test:p7:quotes
bun run test:p8:documents
```

Expected: Product mutation leaves the QuoteItem and finalized document facts
unchanged, while old custom Quote fixtures remain valid.

### Task 6: Quote Builder and canonical preview (P24)

**Files:**

- Create: `src/lib/components/products/ProductPicker.svelte`
- Create: `src/lib/components/quotes/QuoteLineEditor.svelte`
- Create: `src/lib/components/quotes/QuoteDocumentPreview.svelte`
- Create: `src/lib/domain/quotes/documents/presentation-model.ts`
- Modify: existing `QuoteEditor.svelte`, quote route/server actions, and Quote form parsing
- Test: unit/server contracts and `tests/e2e/domain/p24-quote-builder.e2e.ts`

- [ ] **Step 1: Write failing picker/edit/stale/preview tests**

Cover server-backed search/category pages, active-only results, currency
guard, product/custom line coexistence, quantity/description/quoted-price
editing, stale Refresh/Keep, unresolved-ready rejection, mobile overflow, and
internal-note/private-path exclusion.

- [ ] **Step 2: Run focused tests red**

```bash
bun run test:unit -- --run src/lib/domain/quotes/documents/presentation-model.spec.ts
bunx playwright test tests/e2e/domain/p24-quote-builder.e2e.ts
```

Expected: FAIL because the picker, stale actions, canonical model, and new
preview are absent.

- [ ] **Step 3: Implement picker and draft line editing**

Use a debounced/bounded server request with explicit page/category/currency
parameters. Add Product and Custom Line controls. Keep catalogue price/source
fields separate from editable draft `unit_price`, and route all writes through
draft-only trusted actions.

- [ ] **Step 4: Implement explicit stale review**

Compare source/reviewed Product version with the current Product projection.
Refresh copies customer-facing values and current source version; Keep retains
all commercial values and records reviewed version/actor/time. Ready rejects
unresolved stale lines.

- [ ] **Step 5: Implement the canonical presentation model and preview**

Build the model on the server from frozen Quote data. Render seller,
recipient, subject, items, totals, terms, bank details and branding responsively
with stacked mobile sections. Do not derive totals from input values.

- [ ] **Step 6: Run focused P24 checks green**

```bash
bun run test:unit -- --run src/lib/domain/quotes/documents/presentation-model.spec.ts
bunx playwright test tests/e2e/domain/p24-quote-builder.e2e.ts
bun run check
bun run lint
bun run build
```

### Task 7: Professional PDF and delivery closure (P25-P26)

**Files:**

- Create/modify: `src/lib/domain/quotes/documents/template-v2.ts`, `pdf-v2.ts`, `src/lib/server/quote-documents.ts`
- Modify: existing quote email builder/SendPulse adapter integration
- Create: PDF fixture/unit tests, email safety tests, and `tests/e2e/domain/p25-*.e2e.ts`/`p26-*.e2e.ts`
- Modify: release/authority manifests and local goal-loop state

- [ ] **Step 1: Write failing document-fitness tests**

Fixtures must cover 1, 10 and 100 items; long code/name/description/address/
terms/bank details; tax/no-tax; multi-page headers; totals; logo; Unicode
customer names; deterministic bytes/hash; internal-note absence; and private
attachment metadata.

- [ ] **Step 2: Run document tests red**

```bash
bun run test:unit -- --run src/lib/domain/quotes/documents/template-v2.spec.ts src/lib/domain/quotes/documents/pdf-v2.spec.ts
```

Expected: FAIL because Template v2 and its layout/fitness contracts are not
implemented.

- [ ] **Step 3: Implement Template v2 from QuotePresentationModel**

Keep `pdf-lib@1.17.1`, use A4 portrait, fixed margins, deterministic metadata,
explicit font/logo policy, wrapped text measurement, repeated headers, safe
page breaks, totals grouping, footer page counts, and byte-stable output.

- [ ] **Step 4: Run document tests green before routing default**

```bash
bun run test:unit -- --run src/lib/domain/quotes/documents/template-v2.spec.ts src/lib/domain/quotes/documents/pdf-v2.spec.ts
bun run test:p14:document-fitness
bun run test:p14:email-safety
```

Expected: all fixture pages fit their content bounds, ordinary Unicode is
preserved, hashes match bytes, and the old document fixtures remain green.

- [ ] **Step 5: Integrate immutable attachment routing**

Route only newly eligible Quote revisions to `professional-v2`, persist exact
template/generator version and MIME/hash/path metadata, retain one canonical
artifact under private Storage, preserve concurrent attach behavior, and never
rewrite a historical document.

- [ ] **Step 6: Upgrade and test branded email**

Use escaped customer-facing model fields, the current Quote revision, and the
required PDF byte attachment. Reject missing/mismatched/private attachment
metadata and preserve SendPulse uncertainty/idempotency semantics.

- [ ] **Step 7: Run the complete v1.5 closure gate**

```bash
bun run db:reset
bun run test:unit -- --run
bun run test:e2e:baseline
bun run test:e2e:domain
bun run db:test
bun run db:types:check
bun run db:security
bun run check
bun run lint
bun run build
bun run authority:registry
bun run authority:verify
bun run authority:v140:verify
bun run diff:check
```

Expected: every P0-P26 mandatory test and every local quality/security/build/
database/authority gate passes; no remote action is required.

- [ ] **Step 8: Commit only reviewed v1.5 paths**

```bash
git status --short
git diff --name-only
git diff --check
git add CRM_IMPLEMENTATION_ROADMAP_v1.5.0.md docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md docs/phases/PHASE_21_PRODUCT_QUOTE_ARCHITECTURE.md docs/phases/PHASE_22_PRODUCT_CATALOGUE_FOUNDATION.md docs/phases/PHASE_23_PRODUCT_TO_QUOTE_TRACER.md docs/phases/PHASE_24_QUOTE_BUILDER_EXPERIENCE.md docs/phases/PHASE_25_PROFESSIONAL_QUOTE_DOCUMENT.md docs/phases/PHASE_26_DELIVERY_RECONCILIATION.md docs/superpowers/plans/2026-08-28-v150-product-catalogue.md docs/ARCHITECTURE.md docs/DOMAIN_MODEL.md docs/STATE_MACHINES.md docs/SECURITY_MODEL.md docs/ROADMAP.md supabase/migrations/20260828100000_v150_product_catalogue.sql supabase/migrations/20260828110000_v150_quote_item_snapshots.sql src/lib/domain/products src/lib/domain/quotes/documents src/lib/server/products.ts src/lib/server/quote-product-actions.ts src/lib/server/quote-actions.ts src/lib/server/quote-form.ts src/lib/server/quote-documents.ts src/lib/components/products src/lib/components/quotes src/routes/products tests/e2e/domain/p22-products.e2e.ts tests/e2e/domain/p23-product-to-quote.e2e.ts tests/e2e/domain/p24-quote-builder.e2e.ts tests/e2e/domain/p25-document.e2e.ts tests/e2e/domain/p26-delivery.e2e.ts scripts/test-p22-product-schema.mjs scripts/test-p22-product-actions.mjs scripts/test-p23-quote-snapshot.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "feat: deliver v1.5 product catalogue and quote documents"
```

The final staging list must exclude protected user work, generated secrets,
unrelated refactors, and any temporary fixture/debug artifact.

## Plan self-review

- P21 architecture, Product/Category lifecycle, permissions, snapshot law,
  currency, stale review, preview, PDF, email, private storage, and all
  explicit non-goals are covered by Tasks 1-7.
- P22-P26 requirements map to phase IDs and focused tests without changing
  v1.4 authority.
- No task introduces a second package manager, document engine, service, or
  customer trust boundary.
- All database changes are forward-only and generated types are regenerated.
- Browser totals and current Product joins are never treated as authority.
