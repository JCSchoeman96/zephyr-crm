# Zephyr CRM v1.5.0 Implementation Roadmap

**Version:** 1.5.0
**Status:** P21 architecture frozen; P22 is the next implementation phase
**Execution authority:** `AGENTS.md`
**Product authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`
**Required baseline:** v1.4.0 patchlist reconciled with local `origin/main` in
`2874522ee99e09dbb47b63fecc78d14d6076d681`

## Goal

Allow Owner/Admin staff to maintain reusable Products that Sales can select
into draft Quotes as immutable commercial snapshots, then generate a
professional branded A4 Quote PDF and responsive preview from one canonical
server-owned presentation model while preserving all v1.4.0 Sales-to-
Fulfilment, money, security, storage, and delivery contracts.

## Ordered phases

| Phase | Authority                                              | Objective                                                                                  | Required predecessor |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------- |
| P21   | `docs/phases/PHASE_21_PRODUCT_QUOTE_ARCHITECTURE.md`   | Freeze Product, QuoteItem snapshot, permissions, document, security, and phase contracts   | v1.4.0/P20           |
| P22   | `docs/phases/PHASE_22_PRODUCT_CATALOGUE_FOUNDATION.md` | Add Product/Category persistence, trusted actions, and management screens                  | P21                  |
| P23   | `docs/phases/PHASE_23_PRODUCT_TO_QUOTE_TRACER.md`      | Prove active Product selection creates an immutable QuoteItem snapshot                     | P22                  |
| P24   | `docs/phases/PHASE_24_QUOTE_BUILDER_EXPERIENCE.md`     | Add searchable Product picker, custom lines, editing, stale review, and responsive preview | P23                  |
| P25   | `docs/phases/PHASE_25_PROFESSIONAL_QUOTE_DOCUMENT.md`  | Implement and integrate deterministic professional Quote PDF Template v2                   | P24                  |
| P26   | `docs/phases/PHASE_26_DELIVERY_RECONCILIATION.md`      | Upgrade branded email and close full v1.5 reconciliation and validation                    | P25                  |

Dependencies are strict and sequential. A later phase cannot hide a failed
Product lifecycle, snapshot, money, document, or v1.4 regression gate.

## Phase boundaries

P21 changes documentation and local execution state only. It MUST NOT add a
migration, generated type, route, component, dependency, provider integration,
or renderer.

P22 owns the Product and ProductCategory database foundation and administrator
workflow. It does not add Quote integration.

P23 owns the narrow trusted Product-to-Quote snapshot boundary and its
tracer-bullet proof. It does not redesign the picker or document renderer.

P24 owns Quote Builder interaction and the preview. The browser remains a
projection; PostgreSQL remains commercial authority.

P25 owns Template v2 layout, pagination, Unicode/font handling, and immutable
attachment integration. Existing stored documents and historical Quote
revisions are never regenerated.

P26 owns branded email presentation, closure evidence, authority reconciliation,
and the complete local v1.5 regression gate. It does not add a public portal,
electronic signature, payment gateway, or production/pilot activity.

## Cross-phase invariants

1. Product codes are unique case-insensitively after trusted trimming.
2. Only `active` Products may be selected into a new QuoteItem.
3. Product edits, price changes, category changes, and lifecycle transitions
   never mutate an existing QuoteItem.
4. Catalogue and Quote currencies must match; no FX conversion exists.
5. Custom Quote lines remain supported and Product is not mandatory.
6. QuoteItem and Quote totals remain database-authoritative under
   `docs/MONEY_CONTRACT.md`.
7. Sent and terminal Quotes remain immutable; revisions are new drafts.
8. Product internal notes never enter customer snapshots, preview, PDF, email,
   public configuration, or logs.
9. Product mutations and stale-source decisions use trusted actions,
   optimistic locks, role checks, and Activity evidence.
10. Quote documents are generated from frozen server-owned data, stored in the
    existing private bucket, and identified by a SHA-256 matching stored bytes.
11. SendPulse remains the only email provider and cannot replace the frozen
    PDF as commercial authority.
12. No v1.5 phase adds inventory, ERP, FX, public quote portal, e-signature,
    online payment, Redis, Browser Rendering, or a competing package/system.

## Validation ladder

Each phase runs its focused tests first, then the applicable existing gates:

```text
format/check changed files
focused unit/domain/server tests
focused database/RLS/security tests
phase browser journey where required
completed-phase regression tier
database types + lint + svelte-check + build
authority/hash and generated-artifact checks
git diff --check + final diff inspection
```

P26 additionally runs every mandatory P0-P26 test, full database/security and
browser gates, the v1.4.0 release/reconciliation evidence, document/email
integrity checks, and the local final project validation.

## Completion state

The local v1.5.0 loop may set terminal state only after P26 and the separate
global validation pass:

```text
goal_status = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

Remote merge, deployment, sender-domain proof, a real-client pilot, production
launch, and customer portal/e-sign/payment features remain outside this local
roadmap.
