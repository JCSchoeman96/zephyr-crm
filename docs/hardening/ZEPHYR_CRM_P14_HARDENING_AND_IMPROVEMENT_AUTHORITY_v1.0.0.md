# Zephyr CRM — P14 Hardening & Improvement Authority

**Document:** `ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md`  
**Document Version:** `1.0.0`  
**Status:** FROZEN — execution authority for the Zephyr CRM P14 hardening goal  
**Prepared:** 2026-08-24  
**Repository:** `JCSchoeman96/zephyr-crm`  
**Reviewed baseline commit:** `e522b412262a47e5b8bc082a857184822cfc7fc6`  
**Current project state at baseline:** `P14 = VALIDATING`, `local_build_status = FINAL_VALIDATION_PENDING`, `release_status = NOT_READY`  
**Intended execution mode:** Local-only autonomous `/goal`, followed by the existing post-build pilot programme  
**Scope:** Pre-pilot product, domain, UX, test, release-control, and maintainability hardening. No production deployment.

---

# 1. Purpose

This document defines the hardening work required before Zephyr CRM may honestly move from:

```text
P14 = VALIDATING
local_build_status = FINAL_VALIDATION_PENDING
release_status = NOT_READY
```

to:

```text
P14 = COMPLETE
        ↓
FINAL_PROJECT_VALIDATION
        ↓
LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

The objective is **not** to broaden Zephyr into a generic CRM.

The objective is to ensure that the already-strong domain/database architecture is matched by:

1. truthful release authority;
2. real authenticated browser proof;
3. complete v1 Client maintenance;
4. production-fit quote documents and customer-facing email;
5. truthful navigation;
6. safe Task relationship semantics;
7. an explicit database-centric architecture boundary;
8. deterministic, non-circular release gates;
9. a usable staff workflow with no hidden database workaround.

This document is an **additive P14 hardening amendment**, not a replacement product roadmap.

---

# 2. Governing Principle

The governing principle for this hardening pass is:

> **Preserve the strong domain law. Improve proof, usability, and product completeness without creating a second source of domain authority.**

The hardening goal MUST NOT move transactional invariants out of PostgreSQL merely to make the TypeScript tree look more “domain-driven”.

Zephyr’s strongest properties are already database-authoritative:

- state transitions;
- optimistic concurrency;
- idempotency;
- quote immutability;
- cross-resource transactions;
- audit evidence;
- SendPulse submission uncertainty;
- conversion;
- Task lifecycle;
- RLS/security.

Those properties MUST remain authoritative at the trusted PostgreSQL/Edge boundary.

---

# 3. Authority and Versioning Recommendation

## 3.1 Hardening authority version

This authority completed repository-evidence, adversarial architecture, security/mutation-boundary, and contradiction passes and is frozen as:

```text
v1.0.0
```

The v0.x working series has been superseded by this frozen `v1.0.0`. Any later change to scope, lifecycle law, acceptance criteria, or mandatory tests MUST create a new SemVer artifact (normally `v1.0.1` for a compatible correction or `v1.1.0` for additive scope) rather than silently editing this file.

The final `/goal` MUST reference this exact frozen file path and SHA-256.

## 3.2 Existing roadmap authority

Because this hardening changes normative P14 requirements and adds mandatory test coverage, the recommended authority patch is:

```text
CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md
        ↓
CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md
```

Existing test IDs MUST NOT be removed or renumbered.

The existing:

```text
P14-T01 ... P14-T21
```

MUST remain intact.

New hardening tests SHOULD be appended:

```text
P14-T22 ... P14-T35
```

## 3.3 Architecture patch

The DB-centric authority clarification, Client lifecycle, reporting-surface decision, and product-route truth justify a patch-level architecture amendment:

```text
Architecture 1.2.1
        ↓
Architecture 1.2.2
```

If the monolithic architecture blueprint remains an active bootstrap authority, produce the corresponding new SemVer file instead of silently changing the old version.

## 3.4 Dependency baseline patch

If the preferred PDF library is added, dependency law MUST be amended rather than bypassed.

Recommended:

```text
DEPENDENCY_BASELINE_v1.0.0.md
        ↓
DEPENDENCY_BASELINE_v1.0.1.md
```

The old baseline remains historical evidence.

---

# 4. Locked Architectural Decisions

## DEC-001 — PostgreSQL remains domain authority

**Decision:** Use a deliberate DB-centric domain architecture.

### PostgreSQL / trusted server authority owns

- lifecycle transitions;
- transition guards;
- relationship invariants;
- role checks for protected actions;
- optimistic locking;
- number allocation;
- exact money;
- idempotency;
- cross-resource transactions;
- append-only Activity;
- quote immutability;
- SendPulse logical-message state;
- conversion;
- Task parent integrity;
- Client lifecycle transitions.

### SvelteKit / TypeScript owns

- request parsing;
- form validation before RPC calls;
- UI orchestration;
- display projections;
- provider adapters;
- PDF rendering implementation;
- email body composition;
- presentation formatting;
- navigation;
- tests;
- non-authoritative helper functions.

### MUST NOT

- duplicate canonical transition matrices in TypeScript and PostgreSQL as competing authorities;
- move `convert_lead`, `send_quote`, Quote lifecycle, Task lifecycle, or Client lifecycle into browser code;
- create a second application service layer that can bypass database law;
- create TypeScript “domain” classes merely to mirror database rows.

---

## DEC-002 — Client creation remains conversion-only in v1

A `Client` MUST continue to be created by deliberate commercial conversion.

```text
Lead DECISION
      ↓
convert_lead
      ↓
Client
```

The hardening pass MUST NOT introduce:

- “New Client” generic creation;
- arbitrary standalone Client creation;
- email-based Client merge;
- implicit Lead-to-Client conversion.

The hardening pass MAY add Client **maintenance** after conversion.

---

## DEC-003 — Client status becomes an explicit lifecycle

Current status values already exist:

```text
active
inactive
archived
```

They MUST become explicit lifecycle law.

Recommended legal transitions:

```text
active ─────→ inactive
  │             │
  │             └────→ active
  │
  └────→ archived

inactive ─────→ archived

archived ──Owner/Admin restore──→ inactive
```

Recommended rules:

| Current | Next | Actor | Guard |
|---|---|---|---|
| `active` | `inactive` | Owner/Admin/Sales | reason optional |
| `inactive` | `active` | Owner/Admin/Sales | none |
| `active` | `archived` | Owner/Admin | reason required |
| `inactive` | `archived` | Owner/Admin | reason required |
| `archived` | `inactive` | Owner/Admin | restore reason required |

`archived` is terminal under ordinary Sales operations.

Direct:

```text
archived → active
```

SHOULD NOT be allowed. Restore to `inactive`, then deliberately activate.

Archive MUST fail if active work exists through either the Client itself **or its source-Lead lineage**. At minimum, the guard MUST consider:

- open Tasks where `client_id = client.id`;
- open Tasks where `lead_id = client.source_lead_id`;
- non-terminal Quotes (`draft`, `ready`, `sent`) where `client_id = client.id`;
- non-terminal Quotes where `lead_id = client.source_lead_id`.

The current conversion contract does not justify assuming historical Lead Quotes are automatically re-parented to the new Client. The archive guard MUST therefore follow lineage rather than relying only on `quotes.client_id`.

Archive MUST NOT silently cancel commercial work or rewrite historical Quote associations merely to make the guard simpler.

---

## DEC-004 — Client concurrency becomes explicit

Before writable Client UI is introduced, both:

```text
clients
client_contacts
```

MUST receive optimistic concurrency protection.

Recommended:

```text
lock_version bigint not null default 1
```

Every mutable operation MUST reject stale writes.

---

## DEC-005 — ClientContact is retained, not hard-deleted

Recommended v1 contact lifecycle:

```text
active ↔ inactive
```

Add explicit Contact status rather than ordinary hard deletion.

Rules:

- new contacts start `active`;
- an inactive contact cannot be primary;
- a primary contact MUST be active;
- at most one active primary contact per Client;
- v1 UI MUST NOT hard-delete ClientContact history;
- inactivation and primary changes append Activity evidence.

This protects historical customer identity while remaining simple.

---

## DEC-006 — Dashboard is the v1 reporting surface

The current `/reports` route adds no capability.

For v1:

> **Dashboard analytics is Zephyr’s reporting surface.**

Therefore:

- remove the Reports navigation item;
- remove the Dashboard “Reports” action;
- remove `/reports` or deliberately return 404;
- update documentation that currently implies a separate reporting module.

A dedicated reporting/export product can be added later by explicit product decision.

---

## DEC-007 — Settings is not a v1 user-facing route

The Sidebar currently advertises `/settings` although no Settings route exists.

For v1:

- remove the dead Settings navigation item;
- keep deployment/client configuration governed through the existing typed config / AppSetting mechanisms;
- do not create a rushed Settings product merely to satisfy the menu.

---

## DEC-008 — Component Lab is local/test-only

`/system` is useful for automated design-system testing but is not a CRM capability.

It MUST:

- require an explicit private local/test enable flag; and
- return 404 when disabled.

Recommended private environment control:

```text
ZEPHYR_COMPONENT_LAB_ENABLED=1
```

Production/client configuration MUST default to disabled.

---

## DEC-009 — Quote PDF remains locally generated

Do not add an external PDF SaaS.

The preferred implementation is a deterministic JavaScript PDF renderer compatible with Cloudflare Workers.

Preferred dependency candidate:

```text
pdf-lib@1.17.1
```

If full font embedding is required:

```text
@pdf-lib/fontkit@1.1.1
```

A new dependency MUST pass:

- dependency-law review;
- licence review;
- Worker build;
- Worker local preview;
- public bundle scan;
- deterministic-document test;
- bundle-size sanity check.

If the preferred library fails the proof, the agent MAY implement an equivalent deterministic local solution, but MUST NOT weaken the document acceptance criteria.

---

## DEC-010 — No broad refactor before pilot

The hardening goal MAY extract code when a touched route genuinely benefits from it.

It MUST NOT:

- rewrite the application architecture;
- move all SQL into TypeScript;
- refactor every large Svelte page for aesthetics;
- introduce repository patterns without an immediate hardening need.

---

## DEC-011 — Do not squash migrations before pilot

The current historical migration chain remains authority for this release candidate.

This goal MUST NOT squash or rewrite migration history.

A future stable-v1 installation baseline MAY be designed after the pilot baseline is frozen.

---

## DEC-012 — Release state has one machine authority

Machine-readable release state is authoritative.

Human-readable readiness documents MUST be projections of, or mechanically checked against, machine state.

They MUST NOT carry independent lifecycle truth.

---

# 5. Priority Classification

## P0 — Pilot-blocking correctness / proof

- ZH-001 Release truth parity
- ZH-002 Release gate architecture
- ZH-003 Stateful authenticated browser harness
- ZH-004 Canonical Won browser E2E
- ZH-005 Canonical Lost/reopen browser E2E
- ZH-006 Client lifecycle + concurrency law
- ZH-009 Task relationship integrity
- ZH-010 Quote document production fitness
- ZH-012 Navigation/capability truth
- ZH-013 Component Lab production gating
- ZH-015 Evidence/authority semantic hardening
- ZH-017 Final P14 reconciliation
- ZH-018 Trusted-mutation boundary parity

## P1 — Pilot-blocking usability completeness

- ZH-007 Client maintenance UI
- ZH-008 ClientContact management
- ZH-011 Quote email presentation
- ZH-014 Targeted architecture/module cleanup
- ZH-016 Role/responsive/accessibility browser coverage

---

# 6. Hardening Items

---

# ZH-001 — Eliminate contradictory release truth

**Priority:** P0  
**Category:** Release control / authority integrity  
**Severity:** High

## Current issue

At the reviewed baseline:

`docs/release/P14_READINESS_STATE.json` says:

```text
goal_status = IN_PROGRESS
P14 = VALIDATING
local_build_status = FINAL_VALIDATION_PENDING
release_status = NOT_READY
```

while:

`docs/PILOT_READINESS.md` says:

```text
goal_status = COMPLETE
LOCAL_BUILD_COMPLETE
PILOT_READY
```

Both cannot be authoritative simultaneously.

## Relevant files

- `docs/release/P14_READINESS_STATE.json`
- `docs/PILOT_READINESS.md`
- `.agent/goal-loop/STATE.json` during execution
- `.agent/goal-loop/STATE.md`
- `scripts/check-release-state.mjs`
- `scripts/test-p14-release.mjs`
- `scripts/test-release-contract.mjs`
- `scripts/generate-test-evidence.mjs`
- `scripts/verify-test-evidence.mjs`
- `docs/release/TEST_EVIDENCE.json`
- `docs/release/RELEASE_MANIFEST.json`
- `docs/AUTHORITY_HASHES.json`

## Required outcome

There MUST be exactly one current release state authority.

Recommended model:

```text
.agent/goal-loop/STATE.json
            │
            ├── current autonomous execution state
            │
            ▼
docs/release/P14_READINESS_STATE.json
            │
            ├── committed release-state projection/evidence
            │
            ▼
docs/PILOT_READINESS.md
            └── human-readable generated/validated projection
```

## Required implementation

1. Define the machine state schema as authoritative.
2. Add a projection/validation script, recommended:
   - `scripts/generate-pilot-readiness.mjs`, or
   - `scripts/check-pilot-readiness-parity.mjs`.
3. The human document MUST be generated from state, or its status block MUST be mechanically parsed and compared.
4. During P14 `VALIDATING`, `PILOT_READINESS.md` MUST say `NOT_READY`.
5. Only after GLOBAL FINAL validation may it say `PILOT_READY`.
6. Add a stale-document failure test.
7. Remove hand-maintained duplicate lifecycle fields where possible.

## Example required behaviour

Given:

```json
{
  "goal_status": "IN_PROGRESS",
  "phase_status": "VALIDATING",
  "release_status": "NOT_READY"
}
```

a human readiness file containing:

```text
PILOT_READY
```

MUST fail CI/local release validation.

## MUST

- fail closed on mismatch;
- keep `STATE.json` / committed state / human readiness semantically aligned;
- preserve non-terminal P14 semantics.

## MUST NOT

- “fix” the contradiction by simply changing JSON to `PILOT_READY`;
- make P14 completion depend circularly on global final completion;
- silently update hashes without recording authority amendment.

## Tests

Add:

```text
P14-T22 — Release truth parity
```

Test cases:

1. valid P14 non-terminal state + matching doc → PASS;
2. valid P14 state + doc says PILOT_READY → FAIL;
3. final COMPLETE state + matching PILOT_READY doc → PASS;
4. final state + doc says NOT_READY → FAIL;
5. `STATE.md` contradicts `STATE.json` → FAIL/reconciliation required.

## Success criteria

There is no committed file that truthfully parses to a release state different from the authoritative machine state.

---

# ZH-002 — Refactor P14 gate so proof is semantic, non-recursive, and CI-enforced

**Priority:** P0  
**Category:** Release engineering  
**Severity:** High

## Current issue

`scripts/test-p14-release.mjs` currently:

- calls `bun run quality`;
- re-runs selected existing scripts, some more than once;
- uses those commands as P14 evidence;
- does not run the canonical authenticated browser Won/Lost journeys;
- checks only weak textual properties in `PILOT_READINESS.md`;
- is not itself a normal protected CI job.

`package.json` `quality` does not include `test:p14:release`, which avoids recursion but means a green normal quality run does not prove the complete P14 gate.

## Relevant files

- `scripts/test-p14-release.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `scripts/check-ci-contract.mjs`
- `scripts/test-release-contract.mjs`
- `docs/release/TEST_EVIDENCE.json`
- `Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md`

## Required target

Separate:

```text
ordinary project quality
```

from:

```text
P14-specific final candidate proof
```

Recommended scripts:

```text
quality
test:p14:release
release:gate
```

with semantics:

```text
quality
  = ordinary cumulative project quality

test:p14:release
  = P14-specific tests only
  = MUST NOT invoke quality recursively

release:gate
  = quality
  + test:p14:release
  + final diff/evidence checks
```

## CI recommendation

Add a stateful protected job:

```text
browser-domain-e2e
```

and/or a dedicated:

```text
p14-release
```

The final `release-contract` job MUST depend on all substantive required jobs.

At minimum:

```text
static
database-domain-security
browser-build
browser-domain-e2e
        ↓
release-contract
```

## MUST

- make P14 browser tests first-class CI evidence;
- make P14 release script non-recursive;
- remove duplicate command invocations used merely to look like separate proof;
- make test-to-evidence mapping explicit.

## MUST NOT

- count the same successful script execution as proof of unrelated criteria without an explicit assertion;
- weaken P14 authority wording to match existing weaker tests;
- keep a release test that can pass while required browser journeys do not exist.

## Tests

Add:

```text
P14-T23 — P14 gate semantic integrity
```

Test must prove:

- no `test:p14:release → quality → test:p14:release` cycle;
- required protected CI jobs are present;
- final release job depends on browser-domain E2E;
- P14 test IDs map to real test commands/files;
- no duplicate “placeholder proof” command satisfies multiple unrelated outcomes without explicit evidence.

---

# ZH-003 — Add a real authenticated stateful Playwright harness

**Priority:** P0  
**Category:** Browser E2E infrastructure  
**Severity:** High

## Current issue

Current Playwright coverage is primarily:

- login-form presence;
- scaffold/smoke;
- design-system/component lab.

It does not currently prove real authenticated business journeys.

`browser-build` also does not start local Supabase.

## Relevant files

- `playwright.config.ts`
- `tests/e2e/auth.e2e.ts`
- `tests/e2e/scaffold.e2e.ts`
- `tests/e2e/design-system.e2e.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `scripts/provision-client.mjs`
- `supabase/seed.sql`
- auth helpers under `src/lib/server/`

## Required implementation

Create a stateful local browser test mode.

Recommended structure:

```text
tests/e2e/
  helpers/
    auth.ts
    fixtures.ts
    ids.ts
  smoke/
    auth.e2e.ts
    design-system.e2e.ts
  domain/
    won-flow.e2e.ts
    lost-flow.e2e.ts
    client-maintenance.e2e.ts
    task-context.e2e.ts
    navigation.e2e.ts
```

The exact folder layout MAY follow existing project conventions, but semantic separation MUST be clear.

## Harness requirements

The stateful job MUST:

1. install frozen dependencies;
2. start local Supabase;
3. reset migrations/seed;
4. provision deterministic Owner/Admin/Sales/Viewer users;
5. start a deterministic local fake SendPulse-compatible HTTP provider on a dedicated test port and point the existing configurable `apiBaseUrl` at it;
6. start the built Worker/preview against that local Supabase and test provider;
7. authenticate using the real login route or a test setup that creates a real Supabase session;
8. run browser domain journeys;
9. stop the app/provider/Supabase in `always()` cleanup.

The provider fixture MUST live outside the production domain path: use the existing provider base-URL configuration or dependency injection already permitted by the adapter. Do **not** add a production code branch such as `if (TEST_MODE) pretend SendPulse succeeded`.

## Test isolation

Each journey MUST:

- use unique deterministic test identities/UUIDs;
- not depend on previous test order;
- avoid direct post-setup DB manipulation to force business transitions;
- use public/real product boundaries for the journey under test.

Direct DB setup MAY be used only for fixture bootstrap that is outside the business journey itself. The Bricks portion of the canonical Won flow MUST use the real HTTP intake boundary, not direct Lead insertion.

## MUST NOT

- mock the Svelte form actions being tested;
- bypass authentication by manually injecting fake profile objects;
- call lifecycle RPCs directly from the test in place of clicking the UI;
- depend on live SendPulse credentials.

## Tests

Add:

```text
P14-T24 — Authenticated stateful browser harness
```

Pass criterion:

> A real authenticated CRM browser session operates against fresh local Supabase state and can persist/reload business state.

---

# ZH-004 — Canonical Won journey browser E2E

**Priority:** P0  
**Category:** Product workflow proof  
**Severity:** Critical release proof

## Required canonical journey

```text
authenticated HTTP POST to the real Bricks intake boundary
using the canonical Bricks-compatible fixture + secret
        ↓
Lead appears in CRM
        ↓
Sales user opens Lead
        ↓
NEW → QUALIFICATION
        ↓
QUALIFICATION → PROPOSAL
        ↓
create Quote
        ↓
edit multiple line items
        ↓
draft → ready
        ↓
send using deterministic provider fixture
        ↓
Quote sent
Lead → DECISION
attention → waiting_on_client
follow-up Task exists
PDF artifact exists
OutboundMessage exists
        ↓
follow-up is visible
        ↓
Mark Won
        ↓
Client created
primary ClientContact created
Lead remains historical and WON
obsolete open Lead Tasks resolved according to law
Activity evidence exists
```

## Relevant files

- `src/routes/leads/[id]/+page.server.ts`
- `src/routes/leads/[id]/+page.svelte`
- `src/routes/quotes/[id]/+page.server.ts`
- `src/routes/quotes/[id]/+page.svelte`
- `src/lib/components/quotes/QuoteEditor.svelte`
- `src/lib/server/quote-actions.ts`
- Bricks intake boundaries
- Client conversion RPC
- Task automation
- new Playwright domain test

## Provider strategy

No real SendPulse credential is required.

Use deterministic provider fixture/interception at the trusted adapter boundary while still exercising:

```text
browser → server action → quote send orchestration → adapter → persistence
```

The test MUST NOT skip `prepare_quote_send` / `complete_quote_send`.

## Assertions

At minimum assert through UI/reloaded state:

- Lead number/name visible;
- correct stage after each action;
- Quote number assigned;
- Quote totals correct;
- sent Quote becomes read-only;
- frozen PDF download endpoint responds successfully;
- delivery status displays submitted/fixture result;
- follow-up Task is visible;
- Client link exists after Won;
- Client page opens;
- source Lead link remains;
- primary contact exists;
- Activity contains expected events.

## Tests

Add:

```text
P14-T25 — Canonical Won browser E2E
```

Existing P14-T02 criterion MUST remain semantically intact; its evidence mapping MUST be strengthened so this real journey is the controlling proof, not a database tracer alone.

## MUST NOT

- mark P14 complete with only RPC-level Won proof;
- manipulate the Lead stage directly in SQL during the journey;
- manually insert Client;
- manually insert follow-up Task;
- mutate sent Quote content.

---

# ZH-005 — Canonical Lost + administrative reopen browser E2E

**Priority:** P0  
**Category:** Product workflow proof  
**Severity:** High

## Required journey

```text
Lead
 ↓
attempt LOST without reason
 ↓
rejected
 ↓
select active LostReason
 ↓
LOST
 ↓
obsolete open Tasks resolved
Activity written
 ↓
ordinary Sales cannot reopen terminal Lead
 ↓
Owner/Admin opens Lead
 ↓
reopen without reason rejected
 ↓
reopen with reason
 ↓
QUALIFICATION
Activity written
```

## Assertions

- Lost reason required;
- `other` requires notes;
- stale `lock_version` rejected;
- terminal ordinary controls disappear;
- reopen control only for Owner/Admin;
- reopen reason persisted as Activity metadata/evidence;
- old Lost evidence is not deleted;
- reopened Lead is `QUALIFICATION`, not `NEW`.

## Tests

Add:

```text
P14-T26 — Canonical Lost/reopen browser E2E
```

Existing P14-T03 criterion MUST remain semantically intact; its evidence mapping MUST point to this real product proof.

---

# ZH-006 — Client lifecycle, mutation authority, and optimistic concurrency

**Priority:** P0  
**Category:** Domain law / database integrity  
**Severity:** High

## Current issue

`Client.status` already has:

```text
active
inactive
archived
```

but `docs/STATE_MACHINES.md` does not currently define a Client lifecycle.

`Client` and `ClientContact` also lack explicit `lock_version` in current domain law despite the project-wide concurrency invariant.

## Relevant files

- `docs/DOMAIN_MODEL.md`
- `docs/STATE_MACHINES.md`
- `docs/CLIENT_MANAGEMENT.md`
- `docs/ARCHITECTURE.md`
- existing Client migrations
- new hardening migration
- generated DB types
- P6 Client tests
- database security tests

## Required migration

Recommended additive migration:

```text
supabase/migrations/<timestamp>_p14_client_lifecycle_and_maintenance.sql
```

Add:

```text
clients.lock_version
client_contacts.lock_version
client_contacts.status
```

Recommended:

```sql
lock_version bigint not null default 1 check (lock_version > 0)
status text not null default 'active' check (status in ('active', 'inactive'))
```

for ClientContact.

## Client status trusted action

Add an authoritative action, recommended:

```text
set_client_status
```

It MUST:

- lock Client row;
- validate current status;
- validate requested transition;
- validate role;
- require reason for archive/restore;
- reject stale lock version;
- guard active work before archive;
- increment lock version;
- append Activity atomically.

## Client editable-field mutation

**Known effective baseline defect:** ordinary CRM roles can still insert a Client with no conversion provenance under the current RH02 guard. That is compatible with generic CRUD but conflicts with the now-frozen v1 rule that Client creation is conversion-only. This direct creation capability MUST be removed as part of this hardening.

Recommended mutation model:

```text
Client SELECT
  → RLS-secured read

Client CREATE
  → convert_lead only

Client identity/billing UPDATE
  → update_client_details trusted action

Client status UPDATE
  → set_client_status trusted action

Client DELETE
  → prohibited in v1
```

After the new trusted actions exist, ordinary authenticated direct `INSERT`, lifecycle `UPDATE`, protected-field `UPDATE`, and `DELETE` paths MUST be revoked or otherwise made impossible at the database privilege/trigger boundary. If a `SECURITY DEFINER` function is required because ordinary table mutation privileges are removed, the use is justified only for this narrow privilege elevation and MUST follow the existing secure-DEFINER law: fixed safe search path, fully qualified sensitive references, internal role/status checks, least grants, and tests.

The official application MUST use the trusted actions, not raw table PATCHes for Client maintenance.

Caller MUST NOT be able to edit:

- `id`
- `client_number`
- `source_lead_id`
- `converted_at`
- lifecycle timestamps
- lock version except expected version input.

## Immutable / protected fields

The server/database MUST derive or protect:

- `phone_normalized`;
- timestamps;
- lifecycle evidence;
- Client source relationship.

## Tests

Add:

```text
P14-T27 — Client lifecycle and maintenance integrity
```

Cases:

- active → inactive allowed for Sales;
- inactive → active allowed;
- Sales archive denied;
- Owner/Admin archive requires reason;
- archive blocked with open work linked directly to Client;
- archive blocked with non-terminal work reachable through `source_lead_id`;
- archived ordinary edit denied;
- archived → inactive restore Owner/Admin + reason;
- archived → active direct denied;
- stale lock update denied;
- protected fields cannot be changed;
- `individual → company` requires a non-empty company name atomically;
- `company → individual` clears/rejects company-only identity consistently rather than leaving an invalid hybrid;
- phone changes re-derive `phone_normalized` at the trusted boundary;
- Activity written exactly once.

---

# ZH-007 — Complete Client maintenance UI without adding generic Client creation

**Priority:** P1  
**Category:** Product usability  
**Severity:** Medium/High

## Current issue

Client detail is currently read-only.

## Relevant files

- `src/routes/clients/[id]/+page.server.ts`
- `src/routes/clients/[id]/+page.svelte`
- `src/lib/components/clients/`
- Client mutation migration/RPCs
- new E2E tests

## Required capabilities

For authorized non-Viewer staff:

### Identity

- type;
- display name;
- company name subject to type law;
- email;
- phone;
- tax number;
- registration number.

### Billing

- address line 1;
- address line 2;
- city;
- region;
- postal code;
- country.

### Lifecycle

Display status action appropriate to role and current state.

Examples:

```text
active:
  [Mark inactive]
  [Archive] Owner/Admin only

inactive:
  [Reactivate]
  [Archive] Owner/Admin only

archived:
  read-only
  [Restore to inactive] Owner/Admin only
```

## UX requirements

- preserve entered values on validation failure;
- stale concurrency error must clearly tell user to reload;
- use current UI primitives;
- mobile layout must remain usable;
- Viewer sees no mutation controls;
- no generic “Delete Client”;
- no generic “New Client”.

## Recommended components

```text
src/lib/components/clients/ClientEditor.svelte
src/lib/components/clients/ClientStatusActions.svelte
```

Use components only where they reduce route complexity.

## MUST NOT

- allow changing source Lead;
- allow changing Client number;
- allow Sales to archive;
- hard-delete Client;
- allow archived Client ordinary edits.

## Browser proof

Included in P14-T27.

---

# ZH-008 — ClientContact maintenance, status, and primary-contact law

**Priority:** P1  
**Category:** Domain + usability  
**Severity:** Medium/High

## Required lifecycle

```text
active ↔ inactive
```

No ordinary hard delete in v1.

## Required actions

Recommended:

```text
create_client_contact
update_client_contact
set_primary_client_contact
set_client_contact_status
```

They MAY be consolidated if transaction law remains explicit.

The current generic authenticated ClientContact insert/update capability MUST NOT remain as a bypass around primary/status/concurrency law. After trusted actions are available, direct mutations to protected contact fields (`status`, `is_primary`, `lock_version`, relationship identity) must be impossible. Ordinary hard delete remains prohibited.

## Primary-contact rules

- at most one primary;
- primary MUST be active;
- setting one contact primary MUST clear previous primary atomically;
- inactive contact cannot become primary;
- inactivating current primary MUST either:
  - choose an active replacement; or
  - deliberately leave no primary only when no other active contact exists, according to locked implementation law.

Recommended simpler rule:

> If another active contact exists, a primary contact cannot be inactivated until a replacement is chosen.

## UI

Client page MUST allow authorized staff to:

- add contact;
- edit contact;
- mark primary;
- activate/inactivate contact.

Show:

- name;
- email;
- phone;
- job title;
- status;
- primary indicator.

Viewer is read-only.

Archived Client makes Contact management read-only.

## Concurrency

All updates require ClientContact `lock_version`.

Primary switch MUST protect against concurrent primary changes.

## Activity

Recommended event types:

```text
client_contact_created
client_contact_updated
client_contact_status_changed
client_primary_contact_changed
```

Do not log sensitive fields unnecessarily in metadata.

## Tests

Add:

```text
P14-T28 — ClientContact lifecycle and primary integrity
```

Cases:

- create;
- edit;
- stale update;
- switch primary atomically;
- inactive cannot primary;
- concurrent primary switch resolves safely;
- Viewer denied;
- archived Client mutations denied;
- no hard delete path exposed.

---

# ZH-009 — Harden Task parent integrity and complete Task context UX

**Priority:** P0/P1  
**Category:** Data integrity + usability  
**Severity:** High

## Current issue — integrity

`create_task` accepts:

```text
p_lead_id
p_client_id
p_quote_id
```

and permits multiple parent IDs when `quote_id` is present.

The trusted function MUST prove those relationships are internally consistent.

A caller MUST NOT be able to construct:

```text
Quote A
+
unrelated Lead B
+
unrelated Client C
```

in one Task.

## Required database rule

**Known effective baseline defect:** ordinary authenticated Task INSERT remains available and the insert trigger protects automation/system fields but does not reproduce all `create_task` relationship/assignee validation. A generic Task UPDATE policy also exists, although later protected-field/lock triggers close important update paths. The hardening implementation MUST test the fully migrated effective boundary and close every remaining bypass, especially direct creation, rather than assuming either the old policy or the later trigger is sufficient by itself.

Preferred mutation model:

```text
Task SELECT
  → RLS-secured read

Task CREATE
  → create_task

Task COMPLETE
  → complete_task

Task RESCHEDULE
  → reschedule_task

Task CANCEL
  → cancel_task

Arbitrary direct Task lifecycle mutation
  → denied
```

If direct field editing is retained for a narrow non-lifecycle property, database triggers/column privileges MUST make it impossible to bypass assignment ownership, parent integrity, terminal immutability, and lock-version law. Simpler recommendation: route all v1 Task mutation through the existing trusted actions.

If `p_quote_id` is provided:

1. lock/read Quote;
2. derive authoritative:
   - `lead_id = quote.lead_id`
   - `client_id = quote.client_id`
3. ignore null caller relationship hints or reject mismatches;
4. never trust browser-supplied relationship combinations.

Preferred:

> Quote is authoritative; derive relationship context server-side.

For a Quote-linked Task, derive:

```text
lead_id = quote.lead_id
client_id = quote.client_id ?? lead.converted_client_id ?? null
```

where the Lead lookup is authoritative and `converted_client_id` is used only when it is the conversion result for that same Quote Lead. Caller-supplied mismatching IDs MUST be rejected, not silently attached.

If no Quote:

```text
exactly one direct parent = Lead OR Client
```

unless existing law explicitly permits another case.

## Current issue — UX

Task creation UI currently only provides a Lead selector even though domain law supports Client/Quote Task contexts.

Task table also renders UUID fragments rather than useful business context.

## Required UI

Add Context Type:

```text
Lead
Client
Quote
```

Then show relevant target selector.

Human-readable queue context examples:

```text
Lead #1042 — Jane Smith
Client #220 — Acme Engineering
Quote Q-2026-000312 — Website maintenance
```

Each context SHOULD link to the relevant detail page.

For Quote-linked tasks, UI may show:

```text
Quote Q-... · Lead #... · Client ...
```

when available.

## Recommended projection

Extend `task_work_queue` or server projection to include safe human context labels.

Do not force Svelte to render UUID prefixes as the primary identity.

## Tests

Add:

```text
P14-T29 — Task relationship and context integrity
```

Database cases:

- Lead-only valid;
- Client-only valid;
- Quote-only derives Quote relationships;
- Quote + matching hints valid if hints retained;
- Quote + mismatched Lead rejected;
- Quote + mismatched Client rejected;
- malicious direct Data API insert/update cannot bypass relationship or lifecycle rules;
- Sales user cannot mutate another user's protected Task through raw table access when the trusted action would deny it.

Browser cases:

- manual Lead Task;
- manual Client Task;
- manual Quote Task;
- useful context label/link;
- Viewer read-only.

---

# ZH-010 — Replace prototype quote PDF renderer with production-fit deterministic document engine

**Priority:** P0  
**Category:** Customer-facing document / data integrity  
**Severity:** High

## Current issue

Current generator:

- manually assembles raw PDF objects;
- uses Helvetica;
- starts at a fixed coordinate;
- moves down 14 points per line;
- creates exactly one page;
- has no page-break logic;
- strips/transliterates unsupported characters;
- renders literal `ZEPHYR CRM` branding;
- does not use current client brand identity as the main document identity.

A sufficiently long Quote can draw content below the page.

## Relevant files

- `src/lib/domain/quotes/document.ts`
- `src/lib/domain/quotes/document.spec.ts`
- `src/lib/server/quote-documents.ts`
- `src/lib/server/quote-actions.ts`
- Quote snapshot/finalisation SQL
- client config
- dependency baseline if library added
- P8 document tests
- P7 Quote tests
- P14 tests


## Existing branding authority to reuse

Local/client provisioning already projects configured brand data into `app_settings.company_identity`, including company name, logo path, and brand colour tokens. Quote snapshot construction already captures `company_identity`. The document hardening MUST reuse and, if necessary, extend that frozen snapshot contract. It MUST NOT create a second live branding authority exclusively for PDFs.

## Required design

The generated document MUST be:

- deterministic for the same frozen input;
- multi-page;
- readable;
- client-branded;
- immutable after send;
- safe for long descriptions;
- safe for long introductions/terms;
- safe for multiple pages of line items;
- generated locally in Worker-compatible code;
- stored privately;
- hash-recorded.

## Minimum v1 visual structure

Page 1:

```text
[Client Company Name / branded heading]

QUOTE Q-...
Subject
Date / Valid Until

FROM
seller identity

TO
recipient identity

Introduction

Items table:
Description | Qty | Unit | Tax | Line Total

Subtotal
VAT/Tax
TOTAL

Terms
Payment details if configured

Footer
Quote number · Page X of Y
```

Continuation pages:

- repeat client company name or compact header;
- repeat item table heading where items continue;
- repeat page number/footer;
- total section appears once at the correct end.

## Branding

MUST:

- use client company name;
- use configured brand primary colour where technically safe;
- never expose `ZEPHYR CRM` in customer-facing PDF unless that is actually the configured client company;
- render identity/branding from the **frozen Quote snapshot**, not from mutable live configuration at send/download time.

If the current `quote_snapshot` does not yet contain all document-brand facts needed for deterministic historical rendering, extend the ready/finalisation snapshot contract first. A later change to AppSetting/client config MUST NOT alter an already-ready/sent Quote document.

Logo support:

- MAY be added if a deterministic Worker-compatible asset path is proven;
- logo is not required to pass v1 if it creates unsafe SVG/raster complexity;
- company name branding IS required.

## Characters

The implementation MUST NOT silently replace customer names with `?`.

Preferred solution:

- `pdf-lib@1.17.1`;
- add `@pdf-lib/fontkit@1.1.1` and an OFL Unicode font if needed.

At minimum test representative names and punctuation.

If a character cannot be represented, document generation MUST fail clearly before send rather than silently corrupt identity.

## Determinism

No current timestamp/random PDF metadata may affect output hash for identical frozen input.

Metadata SHOULD be:

- omitted; or
- derived from frozen Quote facts.

Existing deterministic-hash contract MUST remain.

## Long-document tests

Create fixtures with:

- 1 item;
- 25 items;
- 100 items;
- very long item descriptions;
- multi-paragraph introduction;
- multi-page terms.

Assertions:

- valid PDF;
- page count > 1 for long fixture;
- first and last item present;
- total present exactly once;
- no content lost;
- no `ZEPHYR CRM`;
- deterministic bytes/hash for identical input;
- customer-facing characters preserved;
- private document path/hash persisted;
- sent Quote snapshot remains immutable.

## Tests

Add:

```text
P14-T30 — Quote document production fitness
```

Update existing P8/P7 document regressions rather than replacing them.

## MUST NOT

- use HTML-to-PDF service;
- use headless Chromium in production Worker just for PDF generation;
- weaken exact money formatting;
- regenerate/overwrite a sent artifact because branding changed later;
- silently drop overflow content.

---

# ZH-011 — Harden quote email presentation and configuration truth

**Priority:** P1  
**Category:** Customer-facing communication  
**Severity:** Medium

## Current issue

Current quote-send body is effectively:

```html
<p>{subject}</p>
<p>A frozen PDF quote is attached.</p>
```

The PDF attachment path is real and correct, but the customer email is prototype-level.

The SendPulse adapter also has generic fallback sender identity.

## Relevant files

- `src/lib/server/quote-actions.ts`
- `src/lib/domain/communications/sendpulse-adapter.ts`
- `src/lib/config/client-config.ts`
- `config/client.example.json`
- communication tests

## Required email

Minimum body:

```text
Hello {recipient name if available},

Please find attached {Quote Number}: {Subject}
from {Client Company Name}.

Valid until: {date if present}

If you have any questions, reply to this email.

Kind regards,
{Sender/Company}
```

Use escaped HTML.

The email MUST NOT advertise unsupported functionality such as:

- online acceptance portal;
- payment link;
- e-signature;
- customer login.

## Sender config

A real quote send MUST fail fast if required sender identity is missing.

Do not rely on:

```text
no-reply@example.invalid
Zephyr CRM
```

for production-like execution.

Local provider fixtures MAY inject explicit test sender identity.

## Attachment

The exact frozen PDF must remain attached.

## Provider templates

Do not introduce SendPulse-template dependence merely for cosmetic email.

If currently configured template IDs are not used by the implementation, either:

- document them as reserved future config; or
- remove them in a deliberate configuration cleanup.

Do not falsely claim provider-template functionality.

## Tests

Add:

```text
P14-T31 — Quote email presentation and sender safety
```

Cases:

- client company name appears;
- quote number appears;
- HTML escaping works;
- missing live sender config fails before provider call;
- attachment bytes match frozen document;
- no Zephyr fallback branding in client send;
- uncertain provider semantics remain unchanged.

---

# ZH-012 — Navigation and capability truth

**Priority:** P0  
**Category:** UX correctness  
**Severity:** High

## Current issues

### Reports

`/reports` currently redirects to Dashboard.

The UI advertises a capability that does not exist independently.

### Settings

Sidebar exposes:

```text
/settings
```

but no current Settings route exists.

## Relevant files

- `src/lib/components/shell/Sidebar.svelte`
- `src/routes/+page.svelte`
- `src/routes/reports/+page.server.ts`
- route tree
- design-system/browser tests
- docs describing reporting/settings

## Required changes

### Reports

Remove:

- Sidebar Reports group/item;
- Dashboard Reports action/link;
- `/reports` route unless a deliberate compatibility redirect is justified.

Pre-production recommendation: remove route.

Update product docs:

> Dashboard is the v1 reporting and analytics surface.

### Settings

Remove Settings navigation item for v1.

Do not build a rushed Settings UI in this goal.

## Navigation integrity regression

Add a browser test that enumerates visible navigation for:

- Sales;
- Viewer;
- Admin/Owner.

Every visible internal link MUST:

- resolve;
- not 404;
- not loop;
- be permitted for that role;
- represent a real current capability.

## Tests

Add:

```text
P14-T32 — Navigation and capability truth
```

## MUST NOT

- retain dead menu items because a future phase once mentioned them;
- create dummy pages solely to make links return 200;
- label Dashboard as one thing while claiming a separate Reports product exists.

---

# ZH-013 — Gate the internal Component Lab from production

**Priority:** P0  
**Category:** Product surface hardening  
**Severity:** Medium

## Current issue

`/system` is a Component Lab used for design-system tests.

It is not a CRM feature and should not be an ordinary production route.

## Relevant files

- `src/routes/system/+page.svelte`
- new `src/routes/system/+page.server.ts`
- `playwright.config.ts`
- `tests/e2e/design-system.e2e.ts`
- private env documentation

## Required implementation

Add private local/test gate.

Example:

```text
ZEPHYR_COMPONENT_LAB_ENABLED=1
```

Behaviour:

```text
enabled:
  /system works

disabled:
  /system → 404
```

The flag MUST be private/server-side.

## Tests

- design-system E2E explicitly enables lab;
- production-like preview without flag returns 404;
- public bundle contains no secret value;
- no navigation item exposes `/system`.

Included in:

```text
P14-T32
```

or a focused existing P2 design-system regression.

---

# ZH-014 — Formalise DB-centric application layering and remove misleading scaffolding

**Priority:** P1  
**Category:** Maintainability  
**Severity:** Medium

## Current issue

The repository visually suggests a conventional TypeScript domain layer for every domain, but some directories are placeholders while actual law correctly lives in PostgreSQL and route/server orchestration.

Large route files also carry some orchestration that can be extracted when touched.

## Required architecture documentation

Add a clear layering section:

```text
Canonical Product Law
        ↓
PostgreSQL / trusted domain actions
        ↓
SvelteKit server orchestration
        ↓
Svelte components / browser
```

Define:

### `src/lib/domain/*`

Only use for pure deterministic logic that is not authoritative persistence law, e.g.:

- money display/helpers where appropriate;
- document rendering;
- phone pure normalization helper if mirrored and database remains authority;
- provider-independent pure calculations.

### `src/lib/server/*`

Use for:

- authenticated server orchestration;
- provider calls;
- form parsing;
- trusted client configuration;
- RPC coordination;
- document storage.

### `src/routes/*`

Use for:

- route load/action wiring;
- minimal request/response glue.

### PostgreSQL

Own canonical transactional business rules.

## Required code cleanup

As touched by this hardening:

- extract Client actions from route into a server helper if the route becomes too large;
- extract Task context/form parsing if useful;
- use new Client components instead of placing all forms inline;
- remove unused `.gitkeep` scaffolding that falsely implies a layer is required.

## MUST NOT

- refactor Lead/Quote screens merely to reduce line count;
- create `ClientService`, `TaskService`, etc. that re-implement SQL law;
- duplicate transition guards in browser code as authority.

## Success criteria

A new maintainer can answer:

> “Where is this rule authoritative?”

without ambiguity.

---

# ZH-015 — Harden evidence registry, mandatory-test accounting, and authority amendment semantics

**Priority:** P0  
**Category:** Governance / test integrity  
**Severity:** High

## Current issue

Some release scripts contain brittle assumptions such as a hard-coded mandatory evidence count.

New tests will legitimately increase the registry.

The system must detect:

- missing IDs;
- duplicate IDs;
- removed historical IDs;
- unaccounted new IDs;

without relying on a magic total alone.

## Relevant files

- `scripts/verify-v131-registry.mjs`
- `scripts/generate-v131-coverage.mjs`

Because those names encode the old roadmap version, the hardening pass SHOULD rename/generalise them to version-neutral names such as `verify-authority-registry.mjs` and `generate-requirements-coverage.mjs`, with package scripts updated atomically. A temporary compatibility wrapper is acceptable if other evidence tooling still references the old paths; duplicated independent implementations are not.
- `scripts/generate-test-evidence.mjs`
- `scripts/verify-test-evidence.mjs`
- `scripts/test-p14-release.mjs`
- `docs/release/TEST_EVIDENCE.json`
- `docs/REQUIREMENTS_COVERAGE.md`
- authority hashes/manifests
- Roadmap/P14 authority

## Required version transition

Recommended:

```text
Roadmap v1.3.1
    → v1.3.2
```

Preserve every old ID. Append new IDs.

The roadmap-version metadata in the 15 phase authorities MUST be reconciled consistently to `1.3.2`. For P0–P13 this is a **metadata-only authority carry-forward**: their completed semantics and mandatory tests remain frozen and MUST NOT be substantively reopened. P14 receives the substantive hardening amendment. All changed authority hashes must be refreshed only after the intentional amendment passes consistency checks.

## Registry law

Expected mandatory IDs SHOULD be derived from canonical phase authorities.

Verification MUST prove:

```text
authority IDs
==
evidence registry IDs
==
coverage IDs
```

plus no duplicates.

A numeric count MAY be reported but SHOULD NOT be the primary definition.

## Existing completed tests

No completed-phase test may be:

- deleted;
- renumbered;
- weakened;
- skipped to make hardening pass.

## New P14 IDs

Proposed append-only matrix:

| ID | Purpose |
|---|---|
| `P14-T22` | Release truth parity |
| `P14-T23` | P14 gate semantic integrity |
| `P14-T24` | Authenticated stateful browser harness |
| `P14-T25` | Canonical Won browser E2E |
| `P14-T26` | Canonical Lost/reopen browser E2E |
| `P14-T27` | Client lifecycle and maintenance integrity |
| `P14-T28` | ClientContact lifecycle and primary integrity |
| `P14-T29` | Task relationship and context integrity |
| `P14-T30` | Quote document production fitness |
| `P14-T31` | Quote email presentation and sender safety |
| `P14-T32` | Navigation / internal route capability truth |
| `P14-T33` | Role, responsive, accessibility product-flow regression |
| `P14-T34` | Hardening authority/evidence reconciliation |
| `P14-T35` | Trusted-mutation boundary parity |

## Test evidence

Each new ID MUST point to actual:

- test file;
- command;
- assertion;
- evidence type.

No generic:

```text
quality passed
```

may stand in for a specific browser behaviour unless the quality command demonstrably includes that behaviour and the evidence registry points to it.

---

# ZH-016 — Product-flow role, responsive, and accessibility regression

**Priority:** P1  
**Category:** UX / browser validation  
**Severity:** Medium

## Required roles

Browser coverage MUST include at least:

- Viewer;
- Sales;
- Owner/Admin privileged path.

## Viewer

Prove:

- can view authorized CRM data;
- cannot mutate Lead lifecycle;
- cannot edit Client;
- cannot manage ClientContacts;
- cannot create/complete/cancel Tasks;
- cannot archive Client;
- cannot use admin Operations.

## Sales

Prove:

- ordinary sales workflow;
- Client edit allowed where defined;
- archive denied;
- Lost reopen denied.

## Owner/Admin

Prove:

- Lost reopen;
- Client archive/restore;
- Operations access.

## Responsive coverage

At least canonical product pages:

- Dashboard;
- Lead detail;
- Quote editor/detail;
- Tasks;
- Client detail/maintenance.

Viewports:

```text
390x844
768x1024
1280x900
```

No horizontal document overflow except deliberate scrollable tables.

## Accessibility

Minimum browser assertions:

- form inputs have labels;
- visible buttons have accessible names;
- modal/drawer focus works where used;
- validation error has alert/status semantics;
- status is not communicated by colour alone;
- keyboard can reach lifecycle controls;
- mobile navigation remains keyboard operable.

## Tests

Add:

```text
P14-T33 — Role, responsive, accessibility product-flow regression
```

Do not attempt a broad WCAG certification in this slice.

---

# ZH-017 — Final P14 reconciliation and honest pilot handoff

**Priority:** P0  
**Category:** Final release control  
**Severity:** Critical

## Preconditions

All ZH items marked P0/P1 are complete.

All new tests pass.

No unresolved high-impact defect from the hardening implementation remains.

## Required final sequence

```text
1. Fresh clean checkout/worktree proof
2. Frozen dependency install
3. Local Supabase start/reset
4. Database/domain/security tests
5. Auth tests
6. Browser smoke tests
7. Stateful browser business E2E
8. Quote document tests
9. Backup/restore rehearsal
10. Migration rehearsal
11. Build
12. Public-bundle scan
13. Authority registry
14. Coverage generation + no drift
15. Evidence registry
16. Release manifest
17. git diff --check
18. P14 release gate
19. P14-T01..T35 accounted for
20. P14 = COMPLETE
21. Write handoff
22. GLOBAL FINAL VALIDATION
23. Only then:
    LOCAL_BUILD_COMPLETE
    PILOT_READY
```

## Human readiness document

After GLOBAL FINAL PASS it may say:

```text
LOCAL_BUILD_COMPLETE
PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

Before that it MUST NOT.

## Tests

Add:

```text
P14-T34 — Hardening authority/evidence reconciliation
```

This test proves every hardening requirement is:

- implemented;
- explicitly deferred by this authority; or
- impossible only under a genuine defined STOP condition.

Nothing may be silently omitted.

---

# ZH-018 — Trusted-mutation boundary parity across the Data API

**Priority:** P0  
**Category:** Security / domain-authority enforcement  
**Severity:** High

## Problem statement

Zephyr's architecture correctly distinguishes ordinary RLS-secured reads/simple edits from **trusted business actions**. A trusted action is not actually authoritative, however, if the same authenticated actor can bypass it with a raw PostgREST/Data API `INSERT`, `PATCH`, or `DELETE` against the underlying table.

Known baseline examples identified during this hardening review:

- authenticated CRM roles have direct Client INSERT/UPDATE policy capability although Client creation is supposed to be conversion-only;
- ordinary authenticated Task INSERT remains possible for non-automation fields even though canonical creation is expressed through `create_task`; the current insert guards do not by themselves prove Quote/Lead/Client relationship consistency or all assignee rules.

Quote hardening already demonstrates the preferred pattern: direct Quote/QuoteItem mutations are revoked and guarded functions own the commercial mutation boundary.

## Relevant files

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/SECURITY_MODEL.md`
- `docs/STATE_MACHINES.md`
- initial RLS migration
- Lead hardening migrations
- Client/Contact migrations
- Quote hardening migration
- Task hardening migration
- v1.3.1 security reconciliation migrations
- `scripts/test-database-security.mjs`
- `scripts/test-v131-security.mjs`
- P4/P5/P6/P7/P9/P12 contract tests

## Required audit matrix

Build an explicit matrix for every mutable business resource:

| Resource | Ordinary direct mutation allowed? | Trusted actions that must be non-bypassable |
|---|---|---|
| Profile role/status | No | invitation/admin profile actions |
| Lead pipeline/loss/reopen | No bypass | transition/loss/reopen actions |
| Lead ordinary editable contact fields | Only if explicitly legislated | must not alter protected lifecycle/ownership facts |
| Client create | **No** | `convert_lead` only |
| Client identity/billing | Through approved maintenance boundary | `update_client_details` |
| Client status | **No direct bypass** | `set_client_status` |
| ClientContact | Through approved contact actions | create/update/primary/status actions |
| Quote/QuoteItem | No ordinary direct mutation | save/finalise/send/revise/accept/etc. |
| Task | No ordinary lifecycle bypass | create/complete/reschedule/cancel |
| Activity | No update/delete | append-only trusted evidence |
| OutboundMessage/Attempt | No browser mutation | trusted provider/send/reconciliation actions |
| MessageEvent | No arbitrary browser insertion | trusted webhook/provider event boundary |
| InboundSubmission | No browser mutation | authenticated intake boundary |

The exact matrix MUST be reconciled with the current architecture rather than blindly applying “RPC everything”. Simple non-lifecycle fields may remain RLS-editable only when doing so cannot bypass a guard, side effect, ownership rule, lock, or Activity requirement.

## Required implementation properties

For each protected operation:

1. direct browser/Data API mutation that would bypass the trusted action MUST fail;
2. the official trusted action MUST still succeed for an authorised actor;
3. an unauthorised role MUST fail at both direct and trusted boundaries;
4. stale writes MUST fail where concurrency law applies;
5. required Activity/side effects MUST occur only through the authoritative action;
6. table privileges, column privileges, RLS, triggers, and function grants MUST agree rather than contradict one another.

Where privilege revocation requires a function to use `SECURITY DEFINER`, every such function MUST have a documented privilege-elevation reason and pass the existing secure-DEFINER audit.

## Lead/Quote regression requirement

This item is not permission to redesign already-hardened domains. It MUST first **test** Lead and Quote boundaries. Only patch them if a real bypass is reproducible against the current final schema.

Do not infer a defect solely from an old migration policy if a later migration/trigger/revoke already closes it.

## Tests

Add:

```text
P14-T35 — Trusted-mutation boundary parity
```

The test MUST run against the **fully migrated current schema**, not inspect only historical migration text.

It MUST include malicious/raw Data API attempts for at least:

- direct Client creation;
- protected Client status/source changes;
- ClientContact primary/status bypass;
- Task create/update lifecycle/ownership bypass;
- Lead protected pipeline/terminal mutation attempt;
- Quote protected lifecycle/commercial mutation attempt;
- Activity update/delete;
- Outbound communication mutation.

Expected result:

> Any operation defined as trusted-only is impossible to perform through an alternate ordinary authenticated Data API path.

## MUST NOT

- solve this by removing useful RLS reads;
- convert every trivial field edit into a privileged function without need;
- rely on hidden UI controls as security;
- assume a function is authoritative merely because the app calls it;
- weaken secure-DEFINER rules to compensate for revoked table privileges.

---

# 7. Required File-Level Change Map

The exact implementation diff will be discovered by the execution agent, but the following files are expected to be relevant.

## Authority / governance

```text
AGENTS.md
CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md
Small Business CRM — ... v1.2.2.md
Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md
docs/ARCHITECTURE.md
docs/DOMAIN_MODEL.md
docs/STATE_MACHINES.md
docs/CLIENT_MANAGEMENT.md
docs/TASK_AUTOMATION.md
docs/QUOTE_MANAGEMENT.md
docs/PILOT_READINESS.md
docs/ROADMAP.md
docs/REQUIREMENTS_COVERAGE.md
docs/AUTHORITY_HASHES.json
docs/release/P14_READINESS_STATE.json
docs/release/TEST_EVIDENCE.json
docs/release/RELEASE_MANIFEST.json
```

If dependency changes:

```text
DEPENDENCY_BASELINE_v1.0.1.md
docs/TOOLCHAIN_PROOF.md
package.json
bun.lock
```

## Security / trusted-mutation boundary

```text
supabase/migrations/20260821194640_database_identity_permissions_rls.sql   (historical evidence; do not edit)
supabase/migrations/<new hardening migration>.sql
scripts/test-database-security.mjs
scripts/test-v131-security.mjs
src/lib/types/database.ts
```

Historical migrations remain immutable; corrections are additive migrations.

## Release scripts

```text
scripts/test-p14-release.mjs
scripts/check-release-state.mjs
scripts/test-release-contract.mjs
scripts/check-ci-contract.mjs
scripts/generate-test-evidence.mjs
scripts/verify-test-evidence.mjs
scripts/verify-v131-registry.mjs
scripts/generate-v131-coverage.mjs
```

Recommended new:

```text
scripts/check-pilot-readiness-parity.mjs
```

or equivalent generator.

## CI / browser

```text
.github/workflows/ci.yml
playwright.config.ts
tests/e2e/*
```

## Client

```text
src/routes/clients/[id]/+page.server.ts
src/routes/clients/[id]/+page.svelte
src/lib/components/clients/*
src/lib/server/clients/*   (if extraction is justified)
src/lib/types/database.ts
```

New migration:

```text
supabase/migrations/<timestamp>_p14_client_lifecycle_and_maintenance.sql
```

## Tasks

```text
src/routes/tasks/+page.server.ts
src/routes/tasks/+page.svelte
src/lib/components/tasks/*
src/lib/types/database.ts
```

New or shared hardening migration may modify:

```text
public.create_task
public.task_work_queue
```

## Quote document / email

```text
src/lib/domain/quotes/document.ts
src/lib/domain/quotes/document.spec.ts
src/lib/server/quote-documents.ts
src/lib/server/quote-actions.ts
src/lib/domain/communications/sendpulse-adapter.ts
config/client.example.json
src/lib/config/client-config.ts
```

Potential migration if branding snapshot schema/JSON contract changes.

## Navigation / internal lab

```text
src/lib/components/shell/Sidebar.svelte
src/routes/+page.svelte
src/routes/reports/+page.server.ts
src/routes/system/+page.svelte
src/routes/system/+page.server.ts   (new)
```

---

# 8. Suggested Implementation Order

The autonomous `/goal` SHOULD execute in this order.

## H0 — Authority amendment

Before behaviour changes:

1. capture Git safety boundary;
2. freeze this hardening authority;
3. create roadmap v1.3.2 amendment;
4. reconcile all phase `Roadmap Version` metadata to 1.3.2 without changing P0–P13 semantics;
5. append P14-T22..T35;
6. amend architecture/domain/state law;
7. patch dependency baseline only if an approved new production dependency is actually introduced;
8. update execution state to record intentional authority change;
9. do not update authority hashes until consistency checks pass.

## H1 — Release proof foundation

Implement:

- ZH-001 release truth parity;
- ZH-002 release gate refactor;
- ZH-003 stateful Playwright harness;
- ZH-013 Component Lab gate;
- ZH-015 evidence registry hardening.

This makes subsequent work provable.

## H2 — Data law

Implement migrations/tests for:

- ZH-006 Client lifecycle/concurrency;
- ZH-008 ClientContact law;
- ZH-009 Task relation integrity;
- ZH-018 trusted-mutation boundary parity.

Regenerate DB types immediately.

Run focused DB/security tests.

## H3 — Staff UI

Implement:

- ZH-007 Client maintenance;
- ZH-008 Contact UI;
- ZH-009 Task context UI;
- ZH-012 navigation truth.

Add browser tests alongside each vertical slice.

## H4 — Customer-facing output

Implement:

- ZH-010 quote document;
- ZH-011 quote email.

Run deterministic, long-document and provider-fixture tests.

## H5 — Canonical business journeys

Implement/finalise:

- ZH-004 Won E2E;
- ZH-005 Lost/reopen E2E;
- ZH-016 role/responsive/accessibility regression.

## H6 — Final reconciliation

Execute ZH-017.

No new feature work starts during H6.

---

# 9. Global MUST Requirements

The hardening goal MUST:

1. preserve PostgreSQL as durable business truth;
2. preserve RLS;
3. preserve invitation-only auth;
4. preserve Owner/Admin MFA law;
5. preserve Quote immutability;
6. preserve exact money;
7. preserve provider `submission_unknown`;
8. preserve controlled retry;
9. preserve append-only Activity;
10. preserve Bricks idempotency;
11. preserve one isolated stack per client;
12. preserve conversion-only Client creation;
13. add explicit Client lifecycle law;
14. add Client/Contact concurrency before writable UI;
15. prove canonical browser journeys;
16. fix quote pagination and client-facing branding;
17. eliminate dead navigation;
18. gate internal Component Lab;
19. harden Task relationship integrity;
20. establish one release-state truth;
21. append, never replace, mandatory test authority;
22. make trusted business actions non-bypassable through ordinary Data API mutations;
23. end with complete local evidence.

---

# 10. Global MUST NOT Requirements

The hardening goal MUST NOT:

1. deploy to production;
2. mutate live DNS;
3. use real client data;
4. require real SendPulse credentials for local closure;
5. create generic Client creation;
6. add accounting/invoices/payments;
7. add WhatsApp/SMS/telephony;
8. add AI features;
9. add workflow builder;
10. add customer portal;
11. add electronic signature;
12. add a separate analytics platform;
13. move state law to browser TypeScript;
14. weaken SQL guards to simplify UI;
15. bypass lock versions;
16. change sent Quote content;
17. hard-delete Activity;
18. hard-delete Client in v1;
19. hard-delete ClientContact through ordinary UI;
20. silently squash migrations;
21. broadly refactor unrelated working code;
22. mark `PILOT_READY` before GLOBAL FINAL validation;
23. claim real deliverability has been proven by fixtures;
24. claim human usability has been proven by automated tests alone.

---

# 11. Deferred — Explicitly NOT Part of This Goal

The following remain future work and MUST NOT be pulled into this hardening pass:

- WhatsApp;
- SMS;
- telephony;
- inbox;
- marketing campaigns;
- mass email;
- invoicing;
- payments;
- accounting;
- project management;
- AI lead scoring;
- AI agents;
- customer portal;
- e-signature;
- arbitrary custom fields;
- generalized workflow builder;
- mobile native application;
- broad visual redesign;
- dedicated BI/reporting module;
- migration-chain squash/stable installation baseline;
- broad CSP redesign unless a concrete current vulnerability is found;
- generic framework/library upgrades unrelated to hardening.

---

# 12. Completion Definition

This hardening authority is complete only when:

## Product

- staff can work the core Lead → Quote → Follow-up → Won/Lost → Client flow;
- Clients can be safely maintained after conversion;
- contacts can be safely maintained;
- Tasks show useful business context;
- customer Quote PDF is production-fit for v1;
- Quote email is client-facing, not prototype-facing;
- navigation advertises only real capabilities.

## Domain

- Client lifecycle is explicit;
- Client/Contact writes use optimistic concurrency;
- Task cross-resource relationships cannot be forged;
- historical and transactional invariants remain intact;
- trusted-only actions cannot be bypassed with raw authenticated Data API writes.

## Tests

- canonical Won browser E2E passes;
- canonical Lost/reopen browser E2E passes;
- role tests pass;
- Client/Contact tests pass;
- Task integrity tests pass;
- long PDF tests pass;
- navigation tests pass;
- state parity tests pass;
- all historical tests still pass.

## Release control

- no contradictory release state exists;
- P14-T01..T35 are accounted for;
- P14 release gate is non-recursive;
- CI config requires substantive browser-domain proof;
- authority/evidence/coverage/manifests are consistent;
- full local release gate passes;
- P14 closes;
- GLOBAL FINAL validation passes;
- only then is `PILOT_READY` persisted.

---

# 13. Recommended Final `/goal` Contract — Outline Only

This document is frozen at v1.0.0. The outline below may now be turned into the exact `/goal` in a separate artifact/message, with this file's SHA-256 pinned.

The eventual goal SHOULD roughly state:

```text
/goal

Execute the complete Zephyr CRM P14 hardening amendment defined by:

ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md

Treat that exact file as explicit current-goal implementation authority for this
hardening pass, subordinate only to this /goal and AGENTS.md execution law.

The hardening authority explicitly authorizes the required patch-level updates to
the existing roadmap/architecture/domain/P14 authorities where specified. Preserve
all existing completed-phase test IDs and semantics unless the hardening authority
explicitly strengthens them. Append the new P14 test IDs; do not renumber old IDs.

Continue autonomously through implementation, validation, authority reconciliation,
P14 closure, and GLOBAL FINAL validation. Do not stop for routine approvals.

Do not deploy, publish, mutate live infrastructure, or use real client data.

Successful terminal state:

goal_status = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

The final `/goal` SHOULD also pin:

- the hardening authority SHA-256;
- the starting Git commit;
- the exact local-only scope;
- the STOP conditions inherited from AGENTS.md.

---

# 14. Locked Review Decisions

The user accepted the recommendations and viewpoints for this hardening pass. The following are therefore normative unless a later explicit amendment supersedes this v1.0.0 authority:

1. **Client lifecycle is locked:** `active ↔ inactive`; archive is Owner/Admin only; restore is `archived → inactive` with reason.
2. **ClientContact lifecycle is locked:** `active ↔ inactive`; no ordinary hard delete in v1.
3. **Reporting scope is locked:** Dashboard is the v1 reporting/analytics surface; the fake separate Reports capability is removed.
4. **Settings scope is locked:** remove the dead Settings menu; do not build a Settings product in this hardening goal.
5. **PDF approach is locked conditionally:** prefer `pdf-lib` if it passes dependency/licence/Worker/determinism proof; an equivalent local deterministic renderer is allowed only if the preferred library fails that proof.
6. **PDF branding is locked:** company name and frozen brand identity are mandatory; image logo is optional for v1 only if deterministic Worker-safe asset handling becomes disproportionately complex.
7. **Authority SemVer is locked:** roadmap `1.3.2`, architecture `1.2.2`, and dependency baseline `1.0.1` only if a new production dependency is introduced.
8. **P14 extension is locked:** append `P14-T22` through `P14-T35`; do not create a new Phase 15.
9. **Trusted-mutation parity is locked:** close proven direct Data API bypasses and audit every trusted-only resource against the fully migrated current schema.

These decisions are not prompts for routine clarification during `/goal` execution.

---

# 15. Hardening Doctrine

The final implementation should follow this rule:

> **Do not redesign what is already strong. Make the truth singular, make the browser prove the workflow, make the remaining v1 surfaces complete, and then expose the system to a real pilot.**

The hardening target is not “more code”.

The hardening target is:

```text
domain-complete
+
browser-proven
+
customer-presentable
+
staff-usable
+
release-truthful
+
pilot-ready
```

Only then should Zephyr leave the local autonomous build loop.


---

# 16. Freeze-Audit Amendments Incorporated into v1.0.0

This revision specifically tightened the first-pass authority in five places:

1. **Client archive lineage:** active work is checked through both `client_id` and `source_lead_id`; no assumption is made that old Lead Quotes were re-parented.
2. **Provider-fixture safety:** browser E2E uses the existing configurable SendPulse base URL against a local fake provider rather than introducing a production test-success branch.
3. **Task relationship derivation:** Quote-linked Tasks derive Lead/Client context from the authoritative Quote/Lead relationship, including a converted Client only when it belongs to that same source Lead.
4. **Quote branding immutability:** document identity/brand facts must be frozen in the Quote snapshot before document generation, not read from mutable live configuration later.
5. **Authority-version carry-forward:** roadmap `1.3.2` metadata is reconciled across all phase authorities while P0–P13 semantics/tests remain frozen; only P14 is substantively amended.
6. **Trusted-mutation parity:** known Client/Task direct-Data-API bypass capability is elevated into a cross-resource current-schema audit, with Quote hardening used as the reference pattern rather than assuming historical policies still describe final protection.


---

# 17. Baseline Evidence Map for the Execution Agent

This section records why each major hardening item exists. The execution agent MUST re-check the current working tree before patching because the repository may have advanced beyond the reviewed baseline commit.

| Finding | Reviewed baseline evidence | Hardening item |
|---|---|---|
| Machine release state says P14 validating / not ready while human readiness says pilot ready | `docs/release/P14_READINESS_STATE.json`, `docs/PILOT_READINESS.md` | ZH-001 |
| P14 script does not prove canonical browser business flows and performs weak phrase/count checks | `scripts/test-p14-release.mjs` | ZH-002, ZH-015 |
| Playwright suite contains only login/scaffold/component-lab coverage | `tests/e2e/`, `playwright.config.ts` | ZH-003–005 |
| Client has `active/inactive/archived` status but no Client state machine | `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md` | ZH-006 |
| Client page is read-only | `src/routes/clients/[id]/+page.server.ts`, `+page.svelte` | ZH-007–008 |
| Fully migrated RH02 boundary still permits ordinary Client creation without conversion provenance; generic Client updates remain broader than the new explicit lifecycle requires | RH02 trusted-boundary migration + current-schema test | ZH-006, ZH-018 |
| Task RPC accepts multiple relationship IDs; UI only selects Lead; fully migrated boundary still permits ordinary Task insertion while trusted creation has additional validation | P9/RH02 migrations, Task route | ZH-009, ZH-018 |
| PDF renderer is one-page raw PDF with literal Zephyr branding and lossy ASCII conversion | `src/lib/domain/quotes/document.ts` | ZH-010 |
| Quote email body is prototype-level and adapter has generic fallback sender identity | `src/lib/server/quote-actions.ts`, SendPulse adapter | ZH-011 |
| Reports redirects to Dashboard; Settings link has no route | `/reports`, Sidebar route tree | ZH-012 |
| `/system` is an internal Component Lab without a route-specific production gate | `src/routes/system/+page.svelte` | ZH-013 |
| Some TS domain/component directories remain empty scaffolds while business law lives in SQL/server routes | `src/lib/domain/*`, `src/lib/components/*` | ZH-014 |
| Evidence registry uses brittle version/count assumptions | release evidence scripts | ZH-015 |
| Product browser coverage is not yet role/responsive journey-level | current E2E suite | ZH-016 |

---

# 18. Test Addition / Modification Matrix

| Test ID | New or strengthened? | Primary evidence | Existing tests that remain regression authority |
|---|---|---|---|
| P14-T22 | New | release-state parity script | P14-T16, release contract |
| P14-T23 | New | P14 gate/CI semantic test | existing CI contract |
| P14-T24 | New | stateful Playwright harness | auth E2E, P13 template |
| P14-T25 | Strengthens P14-T02 proof | `won-flow.e2e.ts` | P4 tracer, P5/P6/P7/P8/P9 contracts |
| P14-T26 | Strengthens P14-T03 proof | `lost-flow.e2e.ts` | P5 lead contract |
| P14-T27 | New | DB + Client browser tests | P6 Client contract, DB security |
| P14-T28 | New | DB + ClientContact browser tests | P6 Client contract |
| P14-T29 | New | DB + Task browser tests | P9 automation contract |
| P14-T30 | New | deterministic/multi-page PDF tests | P7/P8 quote/document contracts |
| P14-T31 | New | email/provider-fixture tests | v1.3.1 communications contract |
| P14-T32 | New | navigation/internal-route E2E | design-system shell tests |
| P14-T33 | New | role/responsive/accessibility E2E | auth/design-system tests |
| P14-T34 | New | authority/evidence reconciliation | all completed phase tests |
| P14-T35 | New | current-schema malicious Data API tests | P3/P5/P6/P7/P9/P12 security/domain tests |

A “strengthened” test MUST preserve the original criterion and add stronger proof. It MUST NOT redefine an old test ID to mean something weaker or unrelated.


---

# 19. Freeze Declaration

`ZEPHYR_CRM_P14_HARDENING_AND_IMPROVEMENT_AUTHORITY_v1.0.0.md` is the frozen hardening authority produced from the reviewed baseline commit.

Execution rules:

- the execution agent MUST re-read the working tree and detect changes since the reviewed baseline before modifying files;
- a newer repository state does not invalidate a requirement merely because the exact file has moved; map the requirement to the current equivalent;
- if a finding is already fixed in newer code, prove it with the specified regression rather than reimplementing it;
- if newer code contradicts this authority, follow `AGENTS.md` authority-conflict/amendment law;
- do not silently edit this frozen artifact during implementation.

The next artifact should be the exact `/goal` bootstrap that pins this file and its SHA-256.
