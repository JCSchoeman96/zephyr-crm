# Phase 26 — Delivery and Reconciliation

**Roadmap Version:** 1.5.0
**Status:** Complete
**Required predecessor:** P25
**Authority:** `docs/PRODUCT_CATALOGUE_QUOTE_DOCUMENT_ARCHITECTURE.md`

## Objective

Deliver a responsive branded Quote email with its frozen PDF attachment, then
reconcile Product Catalogue, Quote snapshots, documents, security, authority,
generated types, and every historical v1.4 regression for local v1.5 closure.

## Mandatory requirements

| ID | Name | Exact pass criterion |
|---|---|---|
| `P26-T01` | Branded Quote email | The SendPulse REST adapter receives escaped responsive branded HTML/text, correct recipient and current Quote revision, and the required frozen private PDF attachment; no internal notes or Storage URLs are exposed and provider acknowledgement semantics remain unchanged. |
| `P26-T02` | Full v1.5 reconciliation | Product lifecycle/security/snapshot/money/revision/PDF/email/browser/build/database/generated-type/authority/diff checks and every mandatory P0-P25 regression pass; local state records v1.5 `LOCAL_BUILD_COMPLETE`/`PILOT_READY` only after the separate final project gate. |

## Required validation

- Test email escaping, no-attachment rejection, MIME/hash/path privacy,
  recipient/revision matching, SendPulse acknowledgement and retry behavior.
- Run Product lifecycle, RLS/trusted-mutation parity, snapshot immutability,
  Quote money/revision, document fitness/storage, email, v1.4 Sales and
  Fulfilment, browser, build, lint, type, format, database, recovery, and
  authority gates.
- Do not rename historical `test:p14:product-flow`; it remains v1.4/P14
  regression authority and is unrelated to the Product resource.

## Explicit non-goals

No customer portal, public quote URL, electronic signature, online payment,
inventory, ERP, FX, Redis, Browser Rendering, live sender-domain proof,
remote deployment, pilot execution, or production launch.

## Completion gate

No required old Quote, Fulfilment, release-authority, security, document, or
delivery regression is skipped or weakened. P26 closes only after the complete
local v1.5 programme and separate global final validation pass.

## Terminal state

```text
goal_status = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```
