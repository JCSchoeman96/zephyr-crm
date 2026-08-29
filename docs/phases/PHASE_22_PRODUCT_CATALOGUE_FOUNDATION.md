# Phase 22 — Product Catalogue Foundation

**Roadmap Version:** 1.5.0
**Status:** Complete
**Required predecessor:** P21
**Authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`

## Objective

Establish durable Product and ProductCategory truth, trusted administrator
actions, RLS and optimistic locking, Activity evidence, generated types, and a
small paginated catalogue management workflow.

## Scope

P22 adds only Product/Category persistence and management. Product selection
into Quotes belongs to P23. No QuoteItem snapshot fields, picker, PDF, public
catalogue, inventory, ERP, or new service is part of P22.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P22-T01` | Product schema | A forward-only migration adds ProductCategory and Product with lifecycle constraints, case-insensitive code uniqueness, numeric(compatible,4) price, ISO currency, category FK, lock version, timestamps, named query-backed indexes, RLS, protected-field triggers, and generated type coverage. |
| `P22-T02` | Trusted Product actions | Owner/Admin create, update, explicit price change, activate, inactivate, archive, restore, and category actions validate role, active Profile, state, input, current lock, reason where required, and append the documented Activity; stale, unauthorized, illegal, duplicate-code, and invalid-price operations fail. |
| `P22-T03` | Management screens | `/products`, `/products/new`, and `/products/[id]` provide server-paginated search/status/category/kind filters, Save Draft, Save & Activate, state-appropriate actions, clear errors, and no inventory fields. |

## Required validation

- Reset the disposable local database and run Product schema/RLS/trigger
  contract tests.
- Regenerate and check `src/lib/types/database.ts`.
- Exercise role matrix, duplicate codes, lock conflicts, lifecycle guards,
  archive lineage protection, and Activity evidence.
- Run focused Product browser journeys plus format, lint, check, build, and
  `git diff --check` gates.

## Explicit non-goals

No Quote integration, custom line changes, Product picker, stale-source review,
document generation, email changes, stock, suppliers, variants, price books,
FX, public endpoint, or remote deployment.

## Completion gate

The migration is forward-only and deterministic; all Product lifecycle and
security tests pass; generated types match the schema; management screens use
server pagination; no known P22 defect or unrelated diff remains.

## Next phase

P23 — Product-to-Quote snapshot tracer bullet.
