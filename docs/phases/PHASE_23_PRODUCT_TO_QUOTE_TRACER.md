# Phase 23 — Product-to-Quote Snapshot Tracer

**Roadmap Version:** 1.5.0
**Status:** Complete
**Required predecessor:** P22
**Authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`

## Objective

Prove the commercial boundary from an active Product to a draft QuoteItem and
through Quote finalisation without allowing later Product changes to mutate
the snapshot.

## Scope

P23 adds the additive QuoteItem source/snapshot fields and one trusted,
draft-only Product selection action. It deliberately does not build the full
search picker or redesign QuoteEditor.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P23-T01` | QuoteItem persistence | A forward-only migration adds `source_type`, nullable Product lineage, code/unit/catalogue-price/source-version snapshots, explicit stale-review evidence, constraints, indexes, generated types, and compatibility defaults so all existing rows remain valid custom lines. |
| `P23-T02` | Product selection action | The trusted draft-only action requires an active Product, draft Quote, matching currency, expected Quote/Product locks, and authorized active Profile; it copies server-owned code/name/customer description/unit/catalogue price/tax/source version and never trusts browser totals or internal notes. |
| `P23-T03` | Tracer-bullet proof | A deterministic database/browser journey creates and activates a Product, adds it to a Quote, finalizes the Quote, mutates the Product, and proves the existing QuoteItem and frozen document facts remain unchanged, including a currency-mismatch rejection. |

## Required validation

- Run migration reset, database lint, RLS/security and generated-type checks.
- Test custom-line backwards compatibility, active-only selection, currency
  guard, stale lock rejection, internal-note exclusion, exact-decimal values,
  sent/terminal mutation rejection, and Product mutation after selection.
- Run the authenticated tracer browser journey and all affected v1.4 Quote,
  document, revision, and money regressions.

## Explicit non-goals

No full catalogue picker, category pagination UI, stale Refresh/Keep UI,
responsive preview redesign, PDF Template v2, email changes, or public quote
portal.

## Completion gate

The snapshot cannot be read from current Product values after insertion; the
tracer and immutability assertions pass against the local database; all old
Quote fixtures/regressions remain green; the browser remains a projection.

## Next phase

P24 — Quote Builder experience and responsive customer preview.
