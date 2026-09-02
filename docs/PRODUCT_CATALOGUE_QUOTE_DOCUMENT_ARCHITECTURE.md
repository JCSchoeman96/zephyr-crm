# Zephyr CRM v1.5.0 Product Catalogue and Quote Documents

**Status:** Frozen P21 architecture authority
**Roadmap Version:** 1.5.0
**Supersedes:** No prior resource; this is an additive extension to the v1.4.0 Sales-to-Fulfilment boundary.

## Purpose and boundary

v1.5.0 adds a governed Product Catalogue to the existing isolated-client CRM
and upgrades newly generated Quote documents. A Product is a reusable source
for creating a QuoteItem; it is never a live dependency of a Quote's
commercial truth. The QuoteItem owns the snapshot that is shown to a customer
and used for finalisation, document generation, and delivery.

The feature boundary is:

```text
Owner/Admin catalogue maintenance
        ↓
Active Product
        ↓
Draft Quote ──→ QuoteItem snapshot
        ↓
Frozen Quote presentation model
        ├── responsive Svelte preview
        └── professional A4 PDF
                ↓
private immutable Storage artifact + SHA-256
                ↓
SendPulse email with the frozen PDF attached
```

The existing Lead, Quote, exact-decimal money, immutable revision, private
Storage, SendPulse, and Fulfilment contracts remain in force. Product
Catalogue is not inventory ownership.

## Explicit non-goals

v1.5.0 does not add stock levels, warehouses, purchase orders, suppliers, cost
accounting, serial numbers, barcodes, variants, option matrices, bundles/BOMs,
price books, customer-specific or scheduled pricing, multi-currency conversion,
exchange-rate retrieval, inventory reservations, accounting, payment
processing, a public quote portal, customer login, electronic signatures,
online payment, or customer comments.

No Redis, queue service, browser-rendering service, second UI system, or
provider SDK is introduced. `pdf-lib@1.17.1` remains the document engine.

## Resource graph

```text
Profile
 │
 ├──< ProductCategory
 │       │
 │       └──< Product
 │
 └──< Product (created_by)

Lead ──< Quote ──< QuoteItem
 │        │
 │        └── one immutable document artifact per Quote revision
 │
 └──> Client ──< FulfilmentCase
```

`ProductCategory` and `Product` belong to the isolated client stack. They do
not receive a `client_id` because the deployment itself is the client
boundary, matching the existing schema. Product-to-QuoteItem linkage is
optional and historical; a custom QuoteItem has no Product dependency.

## ProductCategory

`ProductCategory` is a flat grouping used for catalogue search and picker
filters. It has:

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `code` | required trimmed identifier, unique case-insensitively within the isolated stack |
| `label` | required customer/staff-facing label |
| `status` | `active` or `inactive`; canonical lowercase |
| `sort_order` | non-negative integer used only for stable presentation ordering |
| `created_at`, `updated_at` | UTC timestamps |
| `lock_version` | positive optimistic-concurrency version |

An inactive category cannot receive a newly created Product. Existing Products
retain their category and remain historically readable. Categories are not
nested. Category changes are Owner/Admin maintenance actions and append
Activity when material.

## Product

`Product` can represent a physical product or a service without implying
inventory. It has:

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `product_code` | required trimmed display code; uniqueness is enforced by a named case-insensitive unique index |
| `name` | required trimmed staff/customer-facing name |
| `customer_description` | optional customer-facing default description |
| `internal_notes` | optional staff-only notes; never copied to a QuoteItem or document model |
| `kind` | `product` or `service` |
| `category_id` | nullable FK to ProductCategory; a category must be active when assigned to a new/updated Product |
| `unit_label` | required bounded text such as `each`, `hour`, `m²`, or `job`; not a giant enum |
| `currency` | required uppercase three-letter ISO currency code |
| `unit_price` | required non-negative PostgreSQL `numeric` using the existing unit-price scale of 4 |
| `taxable` | required boolean default used when the Product is selected |
| `dimensions_enabled` | optional Product-level toggle; services must keep this disabled |
| `dimension_definitions` | ordered JSON definitions for `width`, `height`, `length`, or `depth`; each currently uses `mm` and may be required |
| `status` | `draft`, `active`, `inactive`, or `archived`; canonical lowercase |
| `lock_version` | positive optimistic-concurrency version |
| `created_by` | creator Profile UUID |
| `created_at`, `updated_at` | UTC timestamps |
| `activated_at`, `inactivated_at`, `archived_at` | nullable lifecycle evidence timestamps |

Product codes are compared after trusted boundary trimming and by
`lower(product_code)`. Code, name, unit, currency, and price are validated at
the trusted action boundary and constrained in PostgreSQL. Currency is not
converted. Product price and taxable changes never cascade to existing
QuoteItems.

Required query-backed index names are:

```text
products_product_code_lower_uidx
products_status_name_idx
products_category_status_name_idx
products_kind_status_idx
```

The foreign-key lineage index is:

```text
quote_items_product_id_idx
```

The existing position index is extended or preserved as:

```text
quote_items_quote_position_idx
```

## Product lifecycle

States are lowercase and are defined canonically in `docs/STATE_MACHINES.md`:

```text
draft ──activate──→ active ──inactivate──→ inactive
  │                    ▲                     │
  └────archive─────────┘                     └──activate──→ active
                    inactive ──archive──→ archived
```

The permitted recovery path is `archived → inactive` for Owner/Admin with a
reason and current lock. Archived is terminal for ordinary operations and is
never hard-deleted when lineage exists. `draft → archived` is allowed for
Owner/Admin with a reason. Only `active` Products may be newly selected into a
Quote.

Activation requires a valid code, name, kind, unit, ISO currency, non-negative
unit price, and taxable value. Inactivation and reactivation require the
expected Product `lock_version`. Archive and restore require Owner/Admin,
current lock, and a non-blank reason. Every material transition appends an
Activity event.

### Product dimensions

Dimensions are an optional Product configuration, not a catalogue hierarchy or
variant system. A Product may define one to four ordered measurements using the
supported keys `width`, `height`, `length`, and `depth`. Labels are configurable,
units are currently `mm`, and each definition records whether the salesperson
must provide a value before the Quote can become ready. Services cannot enable
dimensions.

The first release uses manual full-line pricing. A dimensional QuoteItem has
`quantity = 1`, and its `unit_price` is the full quoted amount entered by the
salesperson. Per-mm, per-cm, per-metre, square-metre, and cubic-metre pricing
calculation is deferred and is not implied by the dimension definitions.

## Permissions

The existing four roles remain the only roles:

| Action | Owner | Admin | Sales | Viewer |
|---|---:|---:|---:|---:|
| Read Products/Categories | yes | yes | yes | yes |
| Use active Products in draft Quotes | yes | yes | yes | no |
| Create/edit Product or Category | yes | yes | no | no |
| Change Product price | yes | yes | no | no |
| Activate/inactivate Product | yes | yes | no | no |
| Archive/restore Product or inactivate Category | yes | yes | no | no |

RLS still requires an authenticated, active Profile. UI visibility is not an
authorization boundary. Product mutation occurs only through trusted actions
with role, current state, lock, input, and Activity checks.

## QuoteItem snapshot contract

Existing custom QuoteItems remain valid. The additive fields are:

| Field | Contract |
|---|---|
| `source_type` | required `custom` or `catalogue`; existing rows backfill to `custom` |
| `product_id` | nullable historical source FK; null for custom lines |
| `product_code_snapshot` | nullable copied code for catalogue lines |
| `unit_label_snapshot` | nullable copied unit for catalogue lines |
| `catalogue_unit_price` | nullable copied Product price at selection/refresh, scale 4 |
| `source_product_version` | nullable Product `lock_version` used for the current snapshot |
| `source_product_reviewed_version` | nullable current Product version explicitly reviewed without refreshing values |
| `source_product_reviewed_at`, `source_product_reviewed_by` | optional explicit stale-review evidence |
| `dimensions` | ordered Product measurement snapshot with `key`, `label`, `unit`, `required`, and nullable final `value` |
| `product_category_id_snapshot` | nullable historical ProductCategory identity; intentionally has no live FK |
| `product_category_code_snapshot`, `product_category_label_snapshot` | nullable historical category display snapshot |

The existing `name`, `description`, `quantity`, `unit_price`, `taxable`, and
`line_subtotal` remain the commercial QuoteItem fields. For a catalogue line,
`name`, default `description`, `quantity`, `taxable`, and `catalogue_unit_price`
are copied server-side; `unit_price` starts at the catalogue price but may be
negotiated on a draft Quote by an authorized Sales/Admin/Owner action.

For a custom line, `source_type = custom`, `product_id` and all catalogue
snapshot fields are null, and the existing custom-line validation applies.

Adding a Product requires a draft Quote, an active Product, matching ISO
currency, a current Quote lock, and a current Product lock. The server copies
all snapshot values and never trusts browser totals. A Product update, price
change, lifecycle change, or category change never updates a QuoteItem by
cascade and never changes a sent or terminal Quote.

`catalogue_unit_price` is internal snapshot evidence. The customer-facing
quoted value is `unit_price`; v1.5 has no discount engine. The database remains
authoritative for line subtotal, Quote subtotal, tax, and total under
`docs/MONEY_CONTRACT.md`.

Each actual Product/opening is a separate QuoteItem, including two lines for
the same Product when their sizes differ. `Openings` from a Lead is context and
does not multiply or duplicate lines. ProductCategory is a flat, non-priced
heading in the quote presentation; it has no parent/sub-product relationship.

Structured Width, Height, and Openings values remain enquiry data. The quote
builder displays them read-only and lets the salesperson apply matching
Width/Height values to one selected dimensional line as editable defaults.
`save_quote_draft` is the trusted boundary for line dimensions, price, and
quantity, and readiness validation requires every required snapshot value to be
present and positive. Product and category changes do not rewrite the stored
QuoteItem snapshots; stale Product changes require an explicit refresh or
keep-quoted-values review.

### Stale source review

If the current Product `lock_version` differs from the QuoteItem's
`source_product_version` (or is newer than its explicit reviewed version), the
draft line is stale. The UI must show the difference and require one explicit
choice:

```text
Refresh from Catalogue
Keep Quoted Values
```

Refresh copies the current Product customer-facing snapshot and catalogue
price, preserves the current draft quantity/negotiated-price policy, and
records the new source version. Keep preserves every commercial QuoteItem
value, records the reviewed Product version, and appends review evidence. No
silent path exists. Mark Ready rejects unresolved stale source reviews.

## Quote currency and custom lines

Catalogue selection requires `Product.currency = Quote.currency` after
canonical uppercase comparison. There is no FX conversion or rate lookup. A
currency mismatch is a trusted-action validation error; staff may use a custom
line when the commercial requirement is legitimately outside the catalogue
currency.

Custom lines remain first-class through every Quote editor and revision path.
Product is the standard reusable source, not a mandatory foreign key.

## Canonical QuotePresentationModel

The server builds one serializable presentation model from the current Quote,
its QuoteItems, frozen seller/recipient/commercial snapshots, branding, terms,
and bank details. Both the responsive Svelte preview and PDF Template v2
consume this model. Neither presentation surface reconstructs business facts or
calculates authoritative totals.

Conceptual shape:

```text
QuotePresentationModel
├── quoteIdentity: number, revision, status, issueDate, validUntil, currency
├── seller: companyName, addressLines, phone, email, registrationDetails
├── recipient: name, company, addressLines, email, phone
├── subject
├── introduction
├── items: code, name, description, quantity, unit, unitPrice, amount, taxable
├── subtotal, tax: label/rate/amount, total
├── terms
├── bankDetails
├── brand: companyName, logoAsset, primary, primaryStrong, accent
└── documentMetadata: templateVersion, generatorVersion, quoteRevision
```

`internal_notes`, source review metadata, private Storage paths, service-role
values, and other staff-only fields are excluded. The model contains frozen
server-owned monetary values and is only generated for the authorized Quote
context.

## Responsive preview contract

`QuoteDocumentPreview.svelte` is a customer-facing document preview, not a
commercial authority. Desktop presentation uses a branded header, seller and
recipient blocks, subject/introduction, item table, totals, terms, and bank
details. At narrow widths the blocks stack, item details become readable
cards/rows, and no horizontal document overflow is permitted. The preview
uses the same model passed to the PDF renderer and is tested at desktop and
mobile viewports.

## Professional PDF Template v2

Template v2 remains in the existing `pdf-lib` boundary and is A4 portrait:

1. professional margins and a branded header with logo and quote identity;
2. seller/company details and customer/recipient details;
3. optional subject and introduction;
4. item table with category headings, code, description, quantity, unit, unit price, and amount;
5. subtotal, tax label/rate/amount, and prominent total;
6. terms and payment/bank details;
7. contact footer and `Page X of Y`.

The layout engine must wrap long codes, names, descriptions, addresses, terms,
and bank details; repeat table headers after page breaks; keep totals together
when possible; and never draw outside the content margins. It must support
short Quotes and at least 100-item/multi-page fixtures. Ordinary customer
Unicode such as `José`, `Chloë`, `François`, and `Müller` must be rendered
without silent replacement. If standard fonts cannot encode the contract,
embed one approved Unicode-capable font asset and keep the font choice
deterministic.

The renderer uses deterministic metadata/object settings, returns valid PDF
bytes, and exposes page count/fitness evidence to tests. It does not call a
browser, external rendering service, or network resource.

Dimensional lines include their customer-facing stored size details, for
example `Width: 1500 mm × Height: 1500 mm`. Category headings have no price or
tax amount. Internal notes and source-review metadata are excluded from both
the responsive preview and the PDF.

## Document versioning and storage

Template v2 uses explicit values such as:

```text
document_template_version = professional-v2
document_generator_version = quote-pdf-v2.<exact implementation version>
```

The current v1 document behavior remains isolated for historical compatibility.
Template v2 is selected only for newly generated eligible Quote revisions after
its fixture and integrity gates pass. Existing stored PDFs are never
regenerated in place.

For each finalized Quote revision, trusted generation creates one canonical
PDF byte stream, stores it in the existing private quote-document bucket, and
persists its path, MIME type, byte hash, template version, generator version,
and generation timestamp. The SHA-256 must equal the stored bytes. Concurrent
generation retains the existing immutable attach race semantics: one canonical
artifact wins and a historical attachment cannot be replaced.

## Email boundary

The existing SendPulse REST adapter remains the only provider boundary. A Quote
email may be visually upgraded to branded responsive HTML, but it is
informational. Sending is rejected unless the current Quote revision owns its
frozen private PDF attachment. Email HTML and text escape untrusted customer
values, never expose internal notes or Storage URLs, and never replace the PDF
as commercial authority.

## Activity evidence

The additive material Activity events are:

```text
product_category_created
product_category_updated
product_category_activated
product_category_inactivated
product_created
product_updated
product_price_changed
product_activated
product_inactivated
product_archived
product_restored
quote_item_product_added
quote_item_product_refreshed
quote_item_product_reviewed
```

Draft keystrokes do not append Activity. Product price changes include old
price, new price, currency, actor, timestamp, and an optional bounded reason.

## Architecture and source boundaries

The implementation follows the existing layering:

```text
Product/Quote domain contract
        ↓
PostgreSQL schema and trusted actions
        ↓
SvelteKit server orchestration and presentation-model builder
        ↓
Svelte Product/Quote components and preview
        ↓
pdf-lib renderer / SendPulse adapter
```

Expected owned source boundaries are:

```text
src/lib/domain/products/states.ts
src/lib/domain/products/presentation.ts
src/lib/domain/quotes/documents/presentation-model.ts
src/lib/domain/quotes/documents/template-v2.ts
src/lib/domain/quotes/documents/pdf-v2.ts
src/lib/server/products.ts
src/lib/server/quote-actions.ts
src/lib/server/quote-documents.ts
src/lib/server/quote-form.ts
src/lib/components/products/ProductForm.svelte
src/lib/components/products/ProductTable.svelte
src/lib/components/products/ProductPicker.svelte
src/lib/components/quotes/QuoteLineEditor.svelte
src/lib/components/quotes/QuoteDocumentPreview.svelte
src/routes/products/
```

These are boundaries, not permission to create all files in P21. P22-P26 own
their implementation.

## P21 freeze and later sequence

P21 is documentation only. It freezes this document plus the additive sections
in `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md`,
`docs/SECURITY_MODEL.md`, `docs/ROADMAP.md`, and the v1.5 roadmap/phase
authorities. No migration, generated type, route, component, dependency,
provider, or renderer code is part of P21.

The dependency order is strict:

```text
P21 architecture
  → P22 Product persistence and management
  → P23 Product-to-Quote snapshot tracer
  → P24 Quote Builder and responsive preview
  → P25 professional PDF and immutable attachment integration
  → P26 branded delivery, reconciliation, and final validation
```

The v1.4 patchlist/main baseline was reconciled in local commit
`2874522ee99e09dbb47b63fecc78d14d6076d681` before this phase began.
