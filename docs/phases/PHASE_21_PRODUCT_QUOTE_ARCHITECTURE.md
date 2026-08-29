# Phase 21 — Product and Quote Document Architecture

**Roadmap Version:** 1.5.0
**Status:** Complete
**Required predecessor:** v1.4.0/P20
**Authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`

## Objective

Freeze the additive Product Catalogue, QuoteItem snapshot boundary, permissions,
stale-source behavior, canonical presentation model, professional PDF
contract, private-storage rules, and P22-P26 sequence before implementation.

## Scope

P21 is documentation and local loop-state work only. It MUST NOT add SQL
migrations, generated database types, application source, routes, components,
dependencies, provider integrations, or renderer code. The v1.4 patchlist and
local `origin/main` baseline must be reconciled before P21 closes.

## Deliverables

- `CRM_IMPLEMENTATION_ROADMAP_v1.5.0.md` with strict P21-P26 ordering.
- `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md` as the new Product,
  snapshot, document, security, and source-boundary authority.
- Additive v1.5.0 sections in `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`,
  `docs/STATE_MACHINES.md`, `docs/SECURITY_MODEL.md`, and `docs/ROADMAP.md`.
- P21-P26 phase authorities under `docs/phases/`.
- Authority hashes and `.agent/goal-loop` state recording the intentional
  v1.5.0 amendment.

## Mandatory requirements

| ID | Name | Exact pass criterion | Evidence |
|---|---|---|---|
| `P21-T01` | Product domain authority | Product and ProductCategory fields, kinds, code uniqueness, unit, currency, price scale, taxable default, customer description, internal notes, category, lifecycle, ownership, named indexes, and explicit non-goals are defined. | Product architecture authority and DOMAIN_MODEL |
| `P21-T02` | Product state authority | `draft`, `active`, `inactive`, and `archived` states, legal transitions, guards, recovery path, lock/version requirements, and Activity side effects have one canonical definition. | STATE_MACHINES and Product architecture authority |
| `P21-T03` | QuoteItem snapshot authority | Catalogue and custom line behavior, nullable lineage, code/unit/price/version snapshots, stale review, currency guard, database money authority, and sent-Quote immutability are explicit. | Product architecture authority, DOMAIN_MODEL, MONEY_CONTRACT |
| `P21-T04` | Document and security authority | One QuotePresentationModel feeds preview/PDF; Template v2 A4 layout, overflow/font/logo policy, versioning, private storage/hash, email boundary, permissions, and internal-note exclusion are explicit. | Product architecture authority, ARCHITECTURE, SECURITY_MODEL |

## Completion gate

- The v1.4 patchlist branch is reconciled with the local `origin/main` ref in a
  local merge commit before implementation.
- All four mandatory requirements are satisfied by named documents.
- Product-to-Quote snapshot semantics do not introduce a live Product
  dependency or weaken existing Quote lifecycle/money rules.
- P22-P26 each have dependency-ordered requirements and explicit non-goals.
- No migration, source, route, generated type, dependency, provider, or
  renderer file changes as part of P21.
- Authority hashes and local state identify P21 as complete and P22 as next.

## Next phase

P22 — Product Catalogue persistence and management screens.
