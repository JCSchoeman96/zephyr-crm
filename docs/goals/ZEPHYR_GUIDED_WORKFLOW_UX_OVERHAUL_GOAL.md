# Zephyr CRM — Guided Workflow UX Overhaul `/goal` Authority

**Status:** Authorized implementation goal  
**Goal type:** Presentation architecture / information architecture / workflow-guidance overhaul  
**Repository:** `JCSchoeman96/zephyr-crm`  
**Document date:** 2026-09-07  
**Verified source baseline at authoring:** `main @ 9c6cae6df0d4e3b5be36dd54b2fa7c3f4bc1a9d0`  
**Verified protected checks at authoring:** `static`, `database-domain-security`, `browser-build`, `release-contract`

---

# 0. `/goal` EXECUTION DIRECTIVE

This document is the complete authorized scope for one `/goal` execution.

The coding agent may decompose the goal into internal phases, tasks, commits, and focused test cycles, but it must treat the **entire document as one bounded goal**. It does not need separate approval between the phases below unless a hard STOP condition is reached.

The agent must:

1. resolve the current `origin/main` before making changes;
2. record the actual starting SHA;
3. compare the current repository against this document before assuming the verified authoring baseline is still current;
4. work from an isolated branch/worktree, never directly on `main`;
5. preserve all existing domain, security, concurrency, quote-document, fulfilment, and audit authorities unless this document explicitly supersedes a **presentation** rule;
6. implement the smallest clean solution that achieves the UX goal;
7. use existing components, server/domain services, actions, RPCs, tests, and query authorities wherever possible;
8. keep commits logically scoped and reviewable;
9. open or update one PR for this goal;
10. never merge the PR;
11. stop at the exact authorized goal and report evidence.

Recommended branch name:

```text
ux/guided-workflow-overhaul
```

A different clean branch name is acceptable if the repository workflow requires it.

## Hard STOP conditions

STOP immediately and report instead of improvising if any of the following becomes necessary:

- a database migration;
- a new database lifecycle state;
- a new lifecycle transition;
- a change to an existing transition guard;
- a change to role or permission authority;
- weakening or bypassing optimistic locking;
- changing Quote immutability, revision history, snapshot semantics, document hashes, or accepted-Quote authority;
- changing the atomic Sales-to-Fulfilment handoff;
- changing Client/Customer conversion semantics;
- changing payment evidence into payment-processing or accounting truth;
- changing SendPulse provider semantics;
- adding Redis, Cachex, queues, microservices, polling, or other new infrastructure;
- adding a new frontend framework or replacing the current design system;
- adding a new dependency merely for convenience;
- discovering that a UI path marked for demotion has unique business semantics not represented elsewhere;
- discovering a conflict between this goal and a frozen domain/security authority that cannot be resolved as a narrow presentation amendment;
- an unrelated CI failure appears at exact head after implementation; do not blindly retry or alter unrelated code;
- current `origin/main` has materially changed the affected UX/domain seams since this document was authored and the goal is no longer safely applicable without redesign.

If a STOP condition occurs, make no speculative architecture change. Return the exact conflict, file/authority reference, current SHA, and recommended next decision.

---

# 1. ULTIMATE GOAL

Transform Zephyr from a CRM that exposes its internal workflow structure into a **guided work application** that always tells a staff member:

1. **Where am I?**
2. **What is happening?**
3. **What needs attention?**
4. **What should I do next?**
5. **What will happen when I do it?**

A staff member must not need to understand Zephyr's internal route structure, database terminology, pipeline mechanics, state-machine names, optimistic locking, provider internals, or queue architecture in order to perform ordinary work.

The underlying domain remains rigorous. The interface becomes simple.

## North-star statement

> **Zephyr should understand the workflow so the user does not have to.**

The target experience is understandable to a new employee with no CRM training. A user should be able to move an enquiry from arrival through quotation, customer response, conversion, and fulfilment without asking, “Where do I go next?”

---

# 2. PRODUCT BOUNDARY — DO NOT EXPAND IT

This goal does **not** turn Zephyr into a generic CRM or ERP.

The existing product boundary remains authoritative:

```text
Enquiry / Lead
    ↓
Qualification
    ↓
Quote
    ↓
Follow-up / customer decision
    ↓
Won / Lost
    ↓
Customer / Client
    ↓
Fulfilment
```

The overhaul must not introduce:

- accounting;
- invoices;
- inventory;
- payment gateways;
- public customer portals;
- electronic signatures;
- arbitrary workflow builders;
- project management;
- mass marketing;
- inbound mailbox functionality;
- WhatsApp/SMS/telephony;
- multi-company SaaS tenancy;
- AI-agent workflow automation;
- new provider integrations.

This is an **interaction and presentation architecture change**, not a product-domain expansion.

---

# 3. VERIFIED AUTHORITY CONFLICTS THAT MUST BE FORMALLY RECONCILED FIRST

Do not treat the UX overhaul as an informal series of Svelte edits. Current frozen/project authorities contain older presentation decisions that this goal intentionally supersedes.

## 3.1 `docs/ARCHITECTURE.md`

Current architecture states that Dashboard is the v1 reporting surface and that Reports and Settings are not separate v1 capabilities.

This goal explicitly authorizes a **narrow presentation-boundary amendment**:

- `/` becomes operational Home;
- `/reports` becomes the dedicated reporting presentation surface;
- `/settings` becomes the dedicated business-configuration presentation surface;
- `/operations` remains a technical operational surface and is presented as **System Health**.

This amendment must be recorded using the repository's existing authority/governance mechanism before or in the same first commit as implementation.

Do not rewrite historical evidence casually. Inspect the existing authority registry/hash/amendment conventions and follow them.

The amendment must state clearly:

> Reports and Settings are now separate presentation routes only. No new bounded domain, persistence authority, permission model, metric definition, or business capability is introduced.

## 3.2 `docs/superpowers/specs/2026-08-26-plain-language-enquiry-workflow-design.md`

Preserve its vocabulary intent:

- **Enquiry** is the staff-facing term for Lead;
- **Customer** is the staff-facing term for Client;
- technical enum names remain internal;
- practical action wording is preferred over implementation wording.

This new goal **supersedes the older interaction topology where necessary**, while retaining its vocabulary and plain-language principles.

## 3.3 v1.5.1 operational-polish authority and acceptance

Current v1.5.1 acceptance includes older UX decisions that this goal intentionally replaces, especially:

- preserving both `Open Quote Builder` and the separate quick custom Quote form;
- managing Quote defaults from Operations.

This goal supersedes those **presentation requirements**:

- one canonical Quote Builder becomes the ordinary quote-creation path;
- custom lines are created inside that builder;
- Quote defaults move to Settings;
- System Health contains technical diagnostics, not ordinary Quote configuration.

Do not simply delete tests because they fail. Update the relevant specification/acceptance evidence so the new requirement is explicit and traceable.

## 3.4 Sales queue compatibility

Existing `/sales/[queue]` routes and their tests may remain as compatibility surfaces.

This goal does **not** require deleting them. It requires removing stage-specific queues from primary navigation and making `/sales` the canonical staff workspace.

Do not delete, redirect, or remove legacy queue actions unless parity and compatibility are proven.

---

# 4. NON-NEGOTIABLE DOMAIN INVARIANTS

The following remain authoritative throughout the goal:

- PostgreSQL remains durable business truth.
- Trusted domain actions validate material transitions.
- Current lifecycle states remain unchanged.
- Current transition guards remain unchanged.
- RLS and active-profile checks remain unchanged unless a separate security authority already requires otherwise.
- Optimistic `lock_version` checks remain mandatory.
- Material transitions continue to append Activity/audit evidence.
- Sent Quotes remain immutable.
- Quote revisions remain separate Quote records.
- QuoteItem commercial snapshots remain independent of later Product changes.
- Accepted Quote remains the commercial source for Fulfilment.
- Accepting a Quote remains the trusted atomic Sales-to-Fulfilment handoff.
- One accepted Quote creates/links the Customer and exactly one FulfilmentCase under the existing authority.
- PaymentMilestone remains recorded CRM evidence, not payment-processing/accounting truth.
- SendPulse remains provider authority only for provider observations.
- Realtime behaviour must not be replaced with polling.
- Existing URL compatibility should be preserved where practical.

---

# 5. UX LAWS

These become the working UX authority for this goal.

## UX-01 — One clear page goal

Every page must answer:

> **Why am I here?**

The page title, introduction, hierarchy, and actions must reinforce that one goal.

## UX-02 — One dominant next action, with one exception

For ordinary linear workflow records, expose one visually dominant next action.

Examples:

- Review enquiry
- Ready for quote
- Create quote
- Review quote
- Send quote
- Record customer response
- Schedule installation
- Mark dispatched
- Confirm delivery

**Exception:** Fulfilment may contain genuinely independent concurrent obligations, such as an installation step and payment attention. In that case, show a short ordered **Next actions** list with one action per active obligation. Do not show every theoretically possible transition.

## UX-03 — Queues select work; records perform work

A list/queue should answer:

- who or what needs attention;
- why;
- how urgent it is;
- how to continue.

Complex forms and material business decisions belong on the record/detail workflow, not inside every table row.

## UX-04 — Domain complexity stays behind the interface

Do not expose ordinary staff to wording such as:

- canonical record;
- lock version;
- immutable snapshot;
- PostgreSQL authority;
- trusted transition;
- pipeline stage;
- raw enum values;
- internal RPC/action names.

The domain remains rigorous. The user-facing explanation describes practical business meaning.

## UX-05 — Navigation represents business areas, not states

Primary navigation is organised around business jobs:

- Home
- Sales
- Customers
- Fulfilment
- Reports
- administration where permitted

Do not require users to choose between Qualification, Proposals, Decisions, or similar internal workflow-stage destinations.

## UX-06 — Progressive disclosure

Show important-now information first.

Demote or collapse:

- advanced configuration;
- historical evidence;
- administrative correction actions;
- dangerous actions;
- rarely changed defaults;
- technical diagnostics.

## UX-07 — Defaults work quietly

Do not repeatedly ask users to configure values already owned by trusted defaults.

## UX-08 — Destructive and exceptional actions are secondary

Archive, cancel, close, decline, reopen, restore, privileged correction, and similar actions must not compete visually with the ordinary workflow path.

## UX-09 — History follows current work

Current state and next action appear before historical activity.

## UX-10 — Vocabulary is enforced, not aspirational

Staff-facing vocabulary:

| Internal / technical | Staff-facing |
|---|---|
| Lead | Enquiry |
| Client | Customer |
| Pipeline stage | Status / Progress |
| Attention | Follow-up |
| Activity | History |
| Task | Follow-up action where appropriate |
| NEW | New enquiry |
| QUALIFICATION | Reviewing details |
| PROPOSAL | Quote needed |
| DECISION | Waiting for customer |
| WON | Customer confirmed |
| LOST | Not proceeding |

Internal database fields, TypeScript names, form fields, URLs, tests, and RPCs may retain technical naming where renaming would create needless risk.

## UX-11 — The system routes; the user works

Do not tell a user who is already on an Enquiry to “go to Quotes to Prepare” or “go to Awaiting Feedback”.

Present the correct action or link directly on the record.

## UX-12 — No complexity relocation trick

Moving a giant form into a modal does not automatically make the UX simple.

Use modal/drawer disclosure only when the underlying task is genuinely secondary and bounded.

---

# 6. TARGET NAVIGATION

## Primary navigation for active staff

```text
Home
Sales
Customers
Fulfilment
Reports
```

Reports must initially remain available to the **same authorization population that can currently access the dashboard analytics**. Do not narrow reporting permission merely because Reports feels managerial.

## Administration navigation

Show only where existing authorization permits:

```text
Products
Settings
System Health
```

## Secondary destinations

These remain valid capabilities without occupying primary navigation:

```text
Follow-ups
Quotes archive/search
legacy Sales stage queues
```

Provide contextual links such as:

- View all follow-ups
- View all quotes

where useful.

---

# 7. ROUTE DISPOSITION

| Route | Goal treatment |
|---|---|
| `/` | KEEP — redesign as operational Home |
| `/sales` | CREATE — canonical Sales workspace |
| `/sales/[queue]` | KEEP COMPATIBILITY — remove from primary navigation |
| `/leads` | KEEP SECONDARY — accessible from Sales / All enquiries |
| `/leads/[id]` | KEEP — canonical Enquiry workspace |
| `/quotes` | KEEP SECONDARY — archive/search/reference view |
| `/quotes/new` | KEEP — sole ordinary Quote Builder |
| `/quotes/[id]` | KEEP — canonical Quote workspace |
| `/tasks` | KEEP SECONDARY — consolidated Follow-ups |
| `/clients` | KEEP URL — staff-facing label becomes Customers |
| `/clients/[id]` | KEEP — canonical Customer workspace |
| `/fulfilment` | KEEP — redesign as task-oriented workspace |
| `/fulfilment/[id]` | KEEP — canonical Fulfilment workspace |
| `/products` | KEEP — administration |
| `/settings` | CREATE — business configuration |
| `/operations` | KEEP URL — present as System Health |
| `/reports` | ACTIVATE — replace current intentional 404 |
| `/login` | KEEP — only consistency/polish if required |

Do not rename `/leads` to `/enquiries` or `/clients` to `/customers` during this goal. User-facing vocabulary can change without risky route churn.

---

# 8. AFFECTED LIFECYCLE REGISTER

The agent must treat this section as UX mapping over existing state authority, not as permission to modify states.

## 8.1 Enquiry / Lead pipeline

Canonical states:

```text
NEW → QUALIFICATION → PROPOSAL → DECISION → WON
```

Any non-terminal commercial state may transition to `LOST`.

### Transition matrix

| From | To | Existing guard/evidence | Existing side effect / meaning | User-facing action |
|---|---|---|---|---|
| `NEW` | `QUALIFICATION` | active authorized user, current lock | records qualification start evidence | **Review enquiry** |
| `NEW` | `LOST` | LostReason + normal transition authority | closes enquiry + Activity | **Close enquiry** (secondary) |
| `QUALIFICATION` | `PROPOSAL` | usable email/phone + meaningful message/qualification notes + current lock | records qualified evidence | **Ready for quote** |
| `QUALIFICATION` | `LOST` | LostReason | closes enquiry + Activity | **Close enquiry** (secondary) |
| `PROPOSAL` | `DECISION` | current valid Quote reaches sent state | attention normally becomes waiting on customer; follow-up work is ensured | **Send quote** occurs in Quote workflow |
| `PROPOSAL` | `LOST` | LostReason | closes enquiry + Activity | **Close enquiry** (secondary) |
| `DECISION` | `PROPOSAL` | trusted Quote revision path | new draft revision; attention waiting on us; prepare-quote work ensured | **Customer wants changes** |
| `DECISION` | `WON` | only ordinary trusted current sent Quote acceptance | Quote accepted; attention cleared; Customer link/create + exactly one FulfilmentCase + planning Task + Activity atomically | **Customer accepted** |
| `DECISION` | `LOST` | definitive Quote decline + LostReason | Quote declined; attention cleared; obsolete Sales tasks close | **Customer declined** |
| `WON` | none ordinary | terminal except authorized correction policy | Sales journey complete | **Open customer / fulfilment** |
| `LOST` | `QUALIFICATION` only through Owner/Admin `reopen_lead` | reason + current authority | Activity appended | **Reopen enquiry** (admin/secondary) |

### Orthogonal Enquiry facts

Do not turn these into new pipeline states:

- `attention_state`: `none`, `waiting_on_client`, `waiting_on_us`;
- pause evidence: `paused_at`, `pause_reason`, optional `resume_at`;
- overdue: derived from open Task due time;
- follow-up: represented by Task.

If paused, the UI may prioritize **Continue enquiry** without changing the pipeline-stage model.

### Terminal states

- `WON`: terminal under ordinary operations;
- `LOST`: terminal under ordinary operations but explicitly reopenable by Owner/Admin with reason.

---

## 8.2 Quote lifecycle

Canonical states:

```text
draft → ready → sent
```

Terminal sent outcomes:

```text
accepted
declined
expired
cancelled
superseded
```

### Transition matrix

| From | To | Existing guard | Existing side effect / rule | User-facing action |
|---|---|---|---|---|
| `draft` | `ready` | valid commercial snapshot + at least one valid item + current authority | Quote becomes ready for final send boundary | **Review quote** |
| `ready` | `draft` | existing edit/reopen rule | returns to editable preparation | **Back to edit** if current implementation supports it |
| `ready` | `sent` | trusted finalization/send boundary | sends/finalizes; Lead becomes DECISION; attention waiting on customer; follow-up ensured | **Send quote** |
| `sent` | `accepted` | current valid sent Quote + acceptance authority/evidence + concurrency guards | Lead WON; Customer + Fulfilment handoff occurs atomically | **Customer accepted** |
| `sent` | `declined` | LostReason + current valid sent Quote | Lead LOST; attention none; obsolete Sales work closes | **Customer declined** |
| `sent` | revision path | trusted `revise_quote` | creates a new **draft** revision; old sent Quote remains immutable | **Customer wants changes** |
| prior `sent` | `superseded` | newer revision is subsequently sent | old sent revision becomes superseded, remains readable | automatic consequence of sending revision |
| `sent` | `expired` | trusted expiry processor | terminal expiry evidence | no ordinary primary action |
| `sent` | `cancelled` | existing cancellation authority | terminal cancellation | **Cancel quote** (secondary/destructive) |

Important correction: creating a revision does **not** mean the prior sent Quote is immediately rewritten. Preserve the existing revision/supersession contract exactly.

### Terminal states

`accepted`, `declined`, `expired`, `cancelled`, `superseded`.

---

## 8.3 Follow-up Task lifecycle

```text
open → completed
open → cancelled
```

Reschedule keeps state `open` and changes due time.

| Action | Guard | Side effect | Terminal? |
|---|---|---|---|
| Complete | active authorized user + current lock | completes task + Activity | yes |
| Cancel | active authorized user + current lock | cancels task + Activity | yes |
| Reschedule | active authorized user + current lock | changes `due_at` + Activity | no |

`overdue` is derived and must never become a stored Task state.

---

## 8.4 Customer / Client lifecycle

Creation is a conversion/handoff result, not a standalone ordinary sales action.

Canonical lifecycle:

```text
active ↔ inactive
active/inactive → archived
archived → inactive  [Owner/Admin + restore reason]
```

### Guards and side effects

- Sales may not archive.
- Archive requires Owner/Admin, non-empty reason, current lock, and no open Task or non-terminal Quote through Customer/source-Enquiry lineage.
- Archived Customers are read-only under ordinary operations.
- Restore requires Owner/Admin + reason and returns to `inactive`, never directly to `active`.
- Activity/audit evidence remains authoritative.

### Terminal states

`archived` is **not absolutely terminal** because authorized restoration exists. It is terminal/read-only for ordinary staff operations.

---

## 8.5 Customer Contact lifecycle

```text
active ↔ inactive
```

Guards:

- inactive contact cannot be primary;
- primary switch clears previous primary atomically;
- inactivating the current primary requires a replacement when another active contact exists;
- ordinary hard delete remains prohibited.

No UX change may weaken these rules.

---

## 8.6 FulfilmentCase lifecycle

```text
open → completed
open → cancelled
```

### Completion guard

Completion requires:

- at least one successful non-cancelled FulfilmentStep;
- all required non-cancelled steps in successful terminal states;
- each required PaymentMilestone in `received` or `not_required`.

### Cancellation guard

- Owner/Admin authority;
- non-empty reason;
- history remains preserved.

### Terminal states

`completed`, `cancelled`.

The UI must not show **Complete fulfilment** as the dominant action while completion guards are unsatisfied. It should explain outstanding work instead.

---

## 8.7 FulfilmentStep lifecycles

### Installation

```text
awaiting_schedule → scheduled → completed
awaiting_schedule → cancelled
scheduled → cancelled
```

Successful terminal: `completed`.

### Courier / Delivery

```text
awaiting_dispatch → dispatched → delivered
awaiting_dispatch → cancelled
dispatched → cancelled
```

Successful terminal: `delivered`.

### Pickup / Collection

```text
preparing → ready_for_collection → collected
preparing → cancelled
ready_for_collection → cancelled
```

Successful terminal: `collected`.

### Common guards / side effects

- current active profile and authorized role;
- current state;
- current `lock_version`;
- at most one active step of a given type per case;
- cancellation requires reason;
- installation reschedule changes time and appends Activity without creating a new state.

---

## 8.8 PaymentMilestone lifecycle

```text
not_due → awaiting → received
not_due → not_required
```

Privileged corrections may exist under existing authority.

Rules:

- at most one `deposit` and one `final_balance` milestone per FulfilmentCase;
- requesting payment moves `not_due → awaiting`;
- recording received moves `awaiting → received` with actor/time evidence;
- `not_required` is the ordinary waived path;
- changing received evidence or reversing facts is privileged correction with reason, current lock, Activity, and security-audit evidence;
- there is no payment `follow_up` status — follow-up is a Task.

Do not present PaymentMilestone as actual bank/payment-provider settlement.

---

## 8.9 ProductCategory lifecycle

```text
active ↔ inactive
```

Guards:

- Owner/Admin;
- current lock;
- valid input;
- Activity evidence.

Inactivation prevents new Product assignment but does not rewrite historical Products.

---

## 8.10 Product lifecycle

Canonical transitions:

```text
draft → active
active → inactive
inactive → active
draft → archived
inactive → archived
archived → inactive
```

There is no ordinary `active → archived` shortcut unless existing authority explicitly permits it.

Guards include Owner/Admin, current lock, product commercial validity where required, and non-blank archive/restore reasons.

Side effects include activation/inactivation/archive/restore evidence, lock increment, and Activity.

Existing QuoteItems are never rewritten by Product lifecycle changes.

---

## 8.11 Technical lifecycles visible only through System Health

Outbound Message, Outbound Message Attempt, InboundSubmission, User/Profile, and provider-observation lifecycles remain unchanged.

System Health is a **read/projection surface**, not a new workflow controller for these lifecycles.

Do not add ordinary UI controls that transition these technical resources as part of this goal.

---

# 9. PATCH PROGRAMME

The following patches are the authorized implementation programme. Internal task decomposition may differ, but all outcomes must be satisfied.

---

## ZUX-00 — Record the new presentation authority

### Goal

Make the Guided Workflow Shell a formally recorded authority before UI implementation drifts away from frozen docs.

### Required work

- Create a canonical design/authority document under the repository's existing spec convention, recommended:

```text
docs/superpowers/specs/2026-09-07-guided-workflow-shell-design.md
```

- Record the narrow architecture amendment described in Section 3.
- Reconcile authority registry/hash mechanisms using existing repository governance.
- Explicitly supersede only the conflicting presentation assertions from older UX/operational-polish authority.
- Preserve all domain, state-machine, security, fulfilment, Product, Quote document, and release authorities.

### Acceptance

Authority verification passes before or alongside first functional changes.

---

## ZUX-01 — Build a current-to-target UI inventory

Before editing broad UI surfaces, inventory each authenticated route and classify visible areas as:

```text
KEEP
MOVE
MERGE
DEMOTE
REMOVE FROM PRIMARY UX
RENAME / REPHRASE
```

The inventory may live inside the new design authority or a dedicated implementation note.

### Required routes

At minimum inspect:

- `/`
- `/sales/[queue]`
- `/leads`
- `/leads/[id]`
- `/quotes`
- `/quotes/new`
- `/quotes/[id]`
- `/tasks`
- `/clients`
- `/clients/[id]`
- `/fulfilment`
- `/fulfilment/[id]`
- `/products`
- `/operations`
- `/reports`

### STOP

If a visible capability has unclear business purpose or duplicate-looking UI has unique semantics, stop before deleting/demoting it.

---

## ZUX-10 — Simplify application navigation

### Likely files

- `src/lib/components/shell/Sidebar.svelte`
- `src/lib/components/shell/AppShell.svelte`
- `src/lib/components/shell/Topbar.svelte`
- `src/lib/components/shell/shell.css`

### Target

Primary staff navigation:

```text
Home
Sales
Customers
Fulfilment
Reports
```

Administration where currently authorized:

```text
Products
Settings
System Health
```

Remove stage-specific Sales queues, Quotes, and Tasks/Follow-ups from **primary** navigation.

Do not delete the underlying routes.

### Rules

- active/current route must remain obvious;
- mobile navigation must remain keyboard/touch usable;
- no second competing navigation system in Topbar;
- preserve role visibility rules unless existing authority says otherwise;
- hiding a nav item must not be used to substitute for server authorization.

---

## ZUX-11 — Add only minimal workflow UI primitives

Reuse the existing design system first.

Current shared UI already includes components such as Button, Card, DataTable, Drawer, Modal, FilterBar, Badge, EmptyState, ErrorState, LoadingState, inputs, and headings.

Add only genuinely missing reusable workflow primitives, for example:

- `NextStepCard`
- `WorkflowTabs` or a thin selected-view control
- `WorkItem`
- `SecondaryActions`

Names may differ if existing conventions suggest better names.

### Avoid

- new UI framework;
- design-system rewrite;
- new CSS methodology;
- new palette;
- excessive animation;
- giant universal “workflow component” abstractions.

Prefer small components with one job.

---

# 10. HOME + REPORTS

## ZUX-20 — Make `/` operational Home

Current Home combines operational attention and management analytics. Split those concerns.

### Home must answer

> **What needs my attention today?**

### Keep on Home

- New enquiries
- Overdue follow-ups
- Follow-ups due today
- We need to respond
- Waiting for customer
- Quotes expiring soon
- a bounded prioritized list of current actionable work
- a compact “waiting on others” summary where useful

### Remove/move to Reports

- reporting date-range controls;
- sales KPI grids;
- conversion-rate analysis;
- quote value analysis;
- lost reason analysis;
- source/UTM attribution;
- broad fulfilment analytics;
- management-style trend information.

### Performance rule

Do not make Home load all Sales queues, all Quotes, or all Fulfilment cases.

Use bounded server-side projections and only the fields needed for the first work list.

Do not create a database migration solely for this list.

---

## ZUX-21 — Activate `/reports`

The route currently exists as an intentional 404. Replace that presentation boundary.

### Move/reuse existing authority

Reuse existing analytics RPCs and metric definitions. Do not redefine formulas.

Reports should contain the existing management/reporting information such as:

- date range;
- enquiry counts;
- Quotes sent;
- Quote value;
- accepted value;
- customer conversion rate;
- open Quote value;
- Quote response time;
- lost-reason analysis;
- source analysis;
- UTM attribution;
- fulfilment aggregates already present on Dashboard.

### Authorization

Reports must initially use the same effective access authority as the analytics currently shown on Dashboard.

Do not introduce a new “manager” permission assumption.

### Performance

Use existing bounded RPCs/projections. Do not add large client-side aggregation or table scans.

---

# 11. SALES WORKSPACE

## ZUX-30 — Create canonical `/sales`

Create a unified Sales workspace over the existing Sales/Enquiry truth.

### Purpose

> **Keep every enquiry moving toward a customer decision.**

### Suggested user-facing views

```text
Needs attention
New
Reviewing
Quote needed
Waiting
All
```

These are **presentation views**, not new domain states.

Suggested mapping:

- New → `NEW`
- Reviewing → `QUALIFICATION`
- Quote needed → `PROPOSAL`
- Waiting → `DECISION`
- All → active + optionally closed based on filter
- Needs attention → deterministic projection from existing attention/task/Quote facts

### Important performance rule

Do not eagerly load four complete queue datasets simply to render tabs.

Prefer:

- selected-view data only;
- bounded results;
- lightweight counts if required;
- server-side filtering;
- reuse of `src/lib/server/sales-queue.ts` and `src/lib/domain/sales/queues.ts` patterns where they remain suitable.

Current `loadSalesQueue` already bounds leads to 50 and selects narrow fields. Preserve or improve that discipline rather than replacing it with an unbounded query.

---

## ZUX-31 — Turn Sales rows into work selectors, not workflow forms

Each work item should communicate:

- customer/enquiry identity;
- current plain-language status;
- why it needs attention;
- relevant age/due information;
- assignee/follow-up context if useful;
- one **Continue** action.

Remove complex row-level workflows from the canonical Sales experience, including inline:

- qualification note forms;
- acceptance source/evidence forms;
- decline reason forms;
- requote forms.

Those actions move to the canonical Enquiry/Quote record workflow.

---

## ZUX-32 — Preserve `/sales/[queue]` compatibility

Remove legacy queues from primary navigation.

Keep them functional unless deletion/redirect is proven safe.

Do not break existing deep links or frozen tests merely for cleanliness.

The new `/sales` page is the preferred staff entry point; compatibility pages are no longer the conceptual navigation model.

---

# 12. ENQUIRY WORKSPACE

## ZUX-40 — Make `/leads/[id]` the canonical Sales work surface

### Required page hierarchy

1. identity + plain-language status;
2. **Next step**;
3. customer request / relevant qualification information;
4. current Quote or Quote creation;
5. follow-up actions;
6. responsibility/assignee;
7. secondary details;
8. history;
9. destructive/admin actions.

### Key rule

Never tell the user to navigate away to another Sales queue to continue the same Enquiry.

### State-specific primary presentation

| State / condition | Primary UX |
|---|---|
| paused | **Continue enquiry** |
| `NEW` | **Review enquiry** |
| `QUALIFICATION` | qualification form + **Ready for quote** |
| `PROPOSAL` without current draft | **Create quote** |
| `PROPOSAL` with draft/current Quote | **Open quote** |
| `DECISION` | **Record customer response** with follow-up secondary |
| `WON` | **Open customer / fulfilment** as relevant |
| `LOST` | no ordinary next action; Reopen only under existing authority |

### Secondary actions

- Close enquiry
- Pause
- Reassign
- Change follow-up status
- Reopen

must not visually compete with the normal stage action.

---

## ZUX-41 — Remove duplicate ordinary Quote creation

The Enquiry UI must have one ordinary path:

```text
Create quote
    ↓
/quotes/new?lead_id=...
```

Remove the separate Quick Custom Quote form from the ordinary Enquiry presentation.

Inside Quote Builder provide both:

- Add product
- Add custom item

### Compatibility rule

Do not delete the old `createQuote` server action solely because the UI no longer uses it unless its removal is demonstrably safe and all authority/tests are reconciled. Leaving an unused compatibility action temporarily is preferable to risky cleanup within this goal.

---

# 13. QUOTE WORKFLOW

## ZUX-50 — Simplify Quote Builder information hierarchy

### Primary flow

```text
Who is this quote for?
    ↓
What are we quoting?
    ↓
Check quantities / measurements / price
    ↓
Review totals
    ↓
Review quote
```

### Primary visible information

- Enquiry/Customer context
- Quote items
- Add product
- Add custom item
- quantities/measurements relevant to item
- totals
- primary save/review action

### Progressive/secondary information

Where existing contracts allow it, demote rather than remove:

- introduction;
- validity override;
- terms override;
- currency where genuinely editable;
- other low-frequency header/configuration fields.

Do not remove fields from the persisted Quote contract merely because they become secondary in the UI.

---

## ZUX-51 — Replace “Mark ready” as the user goal

Preserve internal transition:

```text
draft → ready
```

User-facing action:

```text
Review quote
```

The ready screen/state should communicate:

```text
Ready to send
Check what the customer will receive.
```

Then the dominant action is:

```text
Send quote
```

If current authority allows `ready → draft`, expose a clear **Back to edit** path using the existing trusted behaviour. Do not invent the transition if implementation does not currently support it safely.

---

## ZUX-52 — Redesign sent Quote response handling

The sent Quote page should first communicate:

```text
Waiting for customer
Sent to: <recipient>
Sent: <time>
```

Then ask:

```text
What happened?
```

Actions:

- **Customer accepted**
- **Customer wants changes**
- **Customer declined**

Only reveal the evidence/reason fields needed for the selected outcome.

Do not show acceptance, decline, revision, cancel, and all their forms permanently at equal visual weight.

### Preserve validation

Do not change required acceptance evidence/source or decline LostReason rules unless existing authority already differs. UX disclosure must not weaken business validation.

---

## ZUX-53 — Keep exceptional Quote actions secondary

Examples:

- Cancel quote
- administrative correction
- non-routine revision/correction

must live under secondary/destructive treatment.

---

# 14. FOLLOW-UPS

## ZUX-60 — Reframe `/tasks` as the consolidated Follow-ups view

Purpose:

> **Show all open work that must not be forgotten.**

The canonical `/tasks` page may retain:

- search/filter;
- open/completed/cancelled views;
- overdue view;
- bounded task list;
- task context;
- Complete;
- Open context;
- secondary Reschedule/Cancel.

It should no longer feel like a universal workflow-builder page.

---

## ZUX-61 — Prefer contextual follow-up creation

Primary creation path should be from the record already in context:

```text
Enquiry → Add follow-up
Quote → Add follow-up
Customer → Add follow-up
Fulfilment → Add follow-up
```

Because the record supplies context automatically.

A global Add Follow-up path may remain if useful, but it should be secondary rather than forcing every user through context-type selection during normal work.

---

## ZUX-62 — Simplify Task row actions

Default row actions:

```text
Complete
Open
More…
```

Use `More…`/Drawer/Modal for bounded secondary actions such as Reschedule or Cancel.

Do not render a full reschedule form in every row by default.

---

# 15. CUSTOMERS

## ZUX-70 — Enforce Customer terminology everywhere staff-facing

Keep internal `/clients` URLs and code names.

Change visible UI to:

```text
Customer
Customers
Customer details
Back to Customers
Customer #...
```

Raw internal status values should receive readable presentation labels.

---

## ZUX-71 — Simplify Customer list

Primary list information:

- Customer
- useful contact information
- status
- one relevant contextual summary if genuinely useful

Do not make source-Enquiry provenance dominate the list. Keep provenance on detail where it remains important and traceable.

Filters remain available without visually dominating the page.

---

## ZUX-72 — Redesign Customer detail hierarchy

Target order:

1. identity / contact / status;
2. key Customer information;
3. contacts;
4. billing/company information;
5. related current work/quotes/fulfilment only where already available through bounded existing queries;
6. source Enquiry/provenance;
7. history;
8. maintenance/edit/status actions.

The current technical wording such as durable PostgreSQL record descriptions must not appear in ordinary Customer presentation.

---

## ZUX-73 — Demote Customer maintenance/lifecycle controls

Normal viewing comes first.

Editing may be exposed through a clear **Edit customer** action.

Lifecycle actions such as:

- Inactivate
- Reactivate
- Archive
- Restore

must preserve existing guards and be visually secondary/admin-oriented.

Do not show raw “Lifecycle status” mechanics as the main purpose of the Customer page.

---

# 16. FULFILMENT

## ZUX-80 — Turn `/fulfilment` into one selected work queue

Current UI renders multiple summary cards and all queues together. Replace this with a focused workspace.

Suggested user-facing views:

```text
Needs planning
Installations
Deliveries
Collections
Payment attention
Completed
```

Internal mappings remain:

- Deliveries → courier
- Collections → pickup

### Target

Show:

- compact counts/tabs;
- only the selected queue's rows;
- one Continue/Open action per work item;
- urgency/schedule context.

Do not load every full queue dataset merely to render all views.

---

## ZUX-81 — Give Fulfilment detail a practical next-actions hierarchy

Target order:

1. Customer / accepted sale identity;
2. current case status;
3. **Next action(s)**;
4. active operational work;
5. payment attention;
6. schedule/tracking evidence;
7. accepted Quote reference;
8. history;
9. cancellation/admin correction.

Remove ordinary staff-facing explanations about canonical records, independent locks, PostgreSQL, or immutable data structures.

---

## ZUX-82 — State determines available operational action

Examples:

| Current state | Primary action |
|---|---|
| installation `awaiting_schedule` | **Schedule installation** |
| installation `scheduled` | **Complete installation** when appropriate; reschedule secondary |
| courier `awaiting_dispatch` | **Dispatch delivery** |
| courier `dispatched` | **Confirm delivery** |
| pickup `preparing` | **Mark ready for collection** |
| pickup `ready_for_collection` | **Confirm collection** |
| payment `awaiting` | **Record payment evidence** or contextual follow-up under existing authority |

Cancellation remains secondary and requires existing reason/role guards.

---

## ZUX-83 — Completion readiness must be understandable

If Fulfilment cannot be completed, do not merely hide the button without explanation.

Show concise outstanding requirements derived from existing truth, for example:

```text
Before this fulfilment can be completed:
• complete the installation
• resolve the final payment milestone
```

Do not calculate new business rules in the browser. Derive presentation from server-authoritative data and existing guard rules.

---

# 17. ADMINISTRATION

## ZUX-90 — Create `/settings`

Move ordinary business configuration out of Operations/System Health.

Initial Settings scope is only the configuration already present, including:

- Quote prefix;
- tax label;
- tax rate;
- Quote validity days;
- default terms;
- bank/payment instruction text.

### Preserve

- existing Owner/Admin access;
- existing MFA/AAL2 requirements;
- existing trusted `set_app_setting` or equivalent boundary;
- validation;
- secret-safety rules.

Do not expand Settings into a generic administration framework.

Prefer extracting/reusing existing server logic rather than duplicating trusted configuration writes.

---

## ZUX-91 — Present `/operations` as System Health

Keep the URL if that minimizes compatibility risk.

Visible navigation label:

```text
System Health
```

Top-level health should be human-readable, for example:

```text
Website enquiries       Healthy / Needs attention
Email delivery          Healthy / Needs attention
Follow-up automation    Healthy / Needs attention
```

Technical details may remain available below/behind disclosure:

- last success;
- last failure;
- failed outbound sends;
- provider webhook observations;
- submission uncertainty;
- stale submitting records;
- reminder processor evidence;
- critical function errors.

Never expose secrets or raw provider payloads.

System Health is primarily a read/diagnostic projection. Do not add new technical transition controls during this goal.

---

## ZUX-92 — Keep Products scoped, but apply the same UX laws

Products remain an administration capability.

Apply:

- clear list purpose;
- clear Add/Edit action;
- readable lifecycle labels;
- advanced data secondary;
- destructive/archive actions secondary;
- no raw architecture language.

Do not redesign Product business rules, category semantics, price authority, dimensions, or Quote snapshot behaviour.

---

# 18. CROSS-CUTTING PAGE ANATOMY

Operational record pages should generally follow:

```text
Identity
↓
Plain-language status
↓
Next step / Next actions
↓
Important information now
↓
Related work
↓
Secondary details
↓
History
↓
Administrative / destructive actions
```

Do not force this mechanically where a page has a genuinely different job, but deviations must still preserve clear hierarchy.

---

# 19. COPY AND LANGUAGE RULES

## Required style

- sentence case;
- short labels;
- action verbs;
- practical outcomes;
- plain English;
- explain why when a guard blocks progression;
- preserve exact domain meaning without exposing implementation jargon.

## Banned staff-facing terms unless inside an explicitly technical System Health detail

```text
lock_version
PostgreSQL authority
canonical record
trusted RPC
immutable snapshot
pipeline stage
QUALIFICATION
PROPOSAL
DECISION
waiting_on_client
waiting_on_us
```

`immutable` may appear only where a sophisticated administrator genuinely needs it; it must not be required to understand ordinary work.

## Error recovery

Errors must answer what the user should do next.

Example:

Bad:

```text
Conflict
```

Better:

```text
This enquiry changed while you were working on it. Reload it before saving your change.
```

Preserve internal diagnostic/error codes where required for support, but do not make staff interpret them.

---

# 20. EMPTY, LOADING, AND SUCCESS STATES

## Empty states

An empty state should explain:

- what the empty list means;
- whether that is good/normal;
- how records will appear or what action to take next.

Examples:

```text
No quotes need preparing right now.
```

```text
No customers yet. Customers appear here after a quote is accepted.
```

## Loading

Preserve page orientation while refreshing. Avoid replacing the entire page with an ambiguous loader for minor realtime changes.

## Success

After an important action, the resulting state and next step must be obvious. Do not require the user to infer success from disappearance from a queue.

---

# 21. MOBILE AND ACCESSIBILITY

Core workflows must function at mobile widths without relying on giant horizontal tables.

Where table semantics become unusable for operational work, use stacked work items/cards rather than forcing horizontal scrolling.

Requirements:

- keyboard navigation;
- visible focus;
- semantic headings;
- labelled controls;
- appropriate form error association;
- no hover-only actions;
- adequate touch targets;
- state not communicated by colour alone;
- destructive actions clearly distinguishable;
- existing accessibility coverage must not regress;
- follow WCAG 2.2 AA principles where applicable without introducing unrelated redesign scope.

Recommended manual/browser widths for final UX inspection:

```text
1440 × 900
1024 × 768
390 × 844
```

Do not add a screenshot-testing dependency solely for this goal.

---

# 22. PERFORMANCE AND SCALING REVIEW

This goal must make ordinary navigation **cheaper or no worse**, not more expensive.

## Existing architecture rule

Zephyr explicitly does not currently use Redis, queues, or microservices for this product boundary. Do not introduce them during a UX overhaul.

## Home

After splitting Reports away, Home should no longer call every analytics projection merely to render a work-start screen.

## Sales

Do not load every Sales queue in full for every page request.

## Fulfilment

Do not load/render every complete queue when the user is viewing one selected queue.

## Lists

- bounded result sizes;
- server-side filtering;
- existing indexes/query authorities;
- narrow field selection;
- no N+1 query loops from Svelte components;
- no unbounded client-side joins;
- no loading huge history sets when only current work is visible.

## Realtime

Preserve current realtime mechanisms. No polling.

## Database

No migration is authorized for this UX goal. If a desired view genuinely requires new persistence/index/schema work, STOP and report it as a separate performance/domain task.

---

# 23. LIKELY FILE/BOUNDARY MAP

This is a guide, not permission to modify every file.

## Shell

```text
src/lib/components/shell/Sidebar.svelte
src/lib/components/shell/AppShell.svelte
src/lib/components/shell/Topbar.svelte
src/lib/components/shell/shell.css
```

## Shared UI / workflow components

```text
src/lib/components/ui/*
src/lib/components/sales/*
src/lib/components/fulfilment/*
src/lib/components/quotes/*
src/lib/components/clients/*
```

Add small focused workflow components only where reuse is real.

## Home / Reports

```text
src/routes/+page.server.ts
src/routes/+page.svelte
src/routes/reports/+page.server.ts
src/routes/reports/+page.svelte        [new]
```

## Sales

```text
src/routes/sales/+page.server.ts       [new]
src/routes/sales/+page.svelte          [new]
src/routes/sales/[queue]/*              [compatibility]
src/lib/domain/sales/queues.ts
src/lib/server/sales-queue.ts
```

## Enquiries

```text
src/routes/leads/+page.*
src/routes/leads/[id]/+page.svelte
src/routes/leads/[id]/+page.server.ts   [only when presentation data needs it]
src/lib/domain/presentation/labels.*
```

## Quotes

```text
src/routes/quotes/+page.*
src/routes/quotes/new/+page.svelte
src/routes/quotes/[id]/+page.svelte
src/lib/components/quotes/QuoteEditor.svelte
src/lib/components/quotes/QuoteLineEditor.svelte
src/lib/components/products/ProductPicker.svelte
```

Avoid touching trusted server/domain Quote actions unless the presentation genuinely requires safe orchestration refactoring.

## Follow-ups

```text
src/routes/tasks/+page.svelte
src/routes/tasks/+page.server.ts
```

## Customers

```text
src/routes/clients/+page.svelte
src/routes/clients/[id]/+page.svelte
src/lib/components/clients/ClientMaintenance.svelte
src/lib/components/clients/ClientContacts.svelte
```

## Fulfilment

```text
src/routes/fulfilment/+page.svelte
src/routes/fulfilment/+page.server.ts
src/routes/fulfilment/[id]/+page.svelte
src/routes/fulfilment/[id]/+page.server.ts  [only when required]
src/lib/domain/fulfilment/queues.ts
src/lib/components/fulfilment/*
```

## Administration

```text
src/routes/settings/+page.server.ts     [new]
src/routes/settings/+page.svelte        [new]
src/routes/operations/+page.server.ts
src/routes/operations/+page.svelte
src/routes/products/*
```

## Authority/docs/tests

```text
docs/ARCHITECTURE.md                    [narrow additive presentation amendment]
docs/superpowers/specs/2026-09-07-guided-workflow-shell-design.md [new]
relevant authority registry/hash files according to existing governance
relevant v1.5.1 operational acceptance/spec evidence
tests/e2e/*
tests/e2e/domain/*
unit tests for presentation/action mapping
```

---

# 24. TEST STRATEGY

Do not treat visual success as sufficient, and do not treat green unit tests as sufficient.

The overhaul needs domain-regression proof **and** workflow-comprehension proof.

## 24.1 Presentation mapping tests

Add/extend pure tests for:

- Enquiry state → label;
- Enquiry state → primary action intent;
- Quote state → label/action intent;
- Customer status → label;
- Fulfilment state → next-action intent;
- Product status labels;
- technical/raw enums never printed in ordinary staff-facing rendering where covered by deterministic helpers.

Do not duplicate business transition logic in TypeScript. Test presentation mapping only.

---

## 24.2 Navigation tests

Verify, using existing roles:

- correct primary destinations;
- admin-only destinations remain role-gated as currently authorized;
- stage-specific Sales queues are absent from primary navigation;
- Customers is displayed instead of Clients;
- Reports access does not silently narrow current analytics authorization;
- `/operations` presents System Health;
- `/settings` preserves current configuration authority/MFA behaviour.

---

## 24.3 Primary-action tests

At minimum prove the canonical presentation for:

```text
NEW enquiry                 → Review enquiry
QUALIFICATION               → Ready for quote
PROPOSAL without Quote      → Create quote
PROPOSAL with draft Quote   → Open quote
DECISION                    → Record customer response / follow-up context
WON                         → Customer/Fulfilment handoff visible
LOST                        → closed; reopen only when authorized

draft Quote                 → Review quote
ready Quote                 → Send quote
sent Quote                  → Customer accepted / wants changes / declined

installation awaiting       → Schedule installation
courier awaiting dispatch   → Dispatch delivery
pickup preparing            → Mark ready for collection
```

Do not make UI tests assert transitions the backend does not authorize.

---

## 24.4 End-to-end journeys

### Journey A — Won sale

```text
Home
→ Sales
→ new enquiry
→ review
→ qualification
→ ready for Quote
→ create Quote
→ add Product/custom line
→ review Quote
→ send Quote
→ record acceptance
→ Customer visible
→ Fulfilment visible
```

### Journey B — Lost sale

```text
Enquiry
→ quote/sent decision
→ customer declined / not proceeding
→ LostReason captured
→ closed state visible
```

### Journey C — Quote revision

```text
sent Quote
→ customer wants changes
→ new draft revision
→ prior sent Quote remains immutable/readable
→ edit revision
→ review/send revision
→ prior sent revision becomes superseded under existing authority
```

### Journey D — Follow-up

```text
record
→ Add follow-up
→ Home / Follow-ups shows due work
→ open record
→ complete follow-up
```

### Journey E — Fulfilment

At least one supported fulfilment path end to end, for example:

```text
accepted Quote
→ needs planning
→ installation step
→ schedule
→ complete installation
→ satisfy required payment evidence
→ complete FulfilmentCase
```

Use existing fixtures and domain rules. Do not weaken guards to make the test easy.

---

## 24.5 No-training usability acceptance

The final browser/manual acceptance must provide **tasks, not navigation instructions**.

Example:

> A new enquiry from John Smith arrived. Review it and prepare a quote.

The tester should not be told:

> Open Sales → Qualification → Quotes to Prepare.

Acceptance questions for every core screen:

1. Can the tester identify the page's purpose within approximately five seconds?
2. Can they identify the current status?
3. Can they identify the next action?
4. Can they predict the practical outcome of that action?
5. Can they complete the journey without knowing Zephyr's internal route/state vocabulary?

If not, the UX is not complete even if tests are green.

---

# 25. EXISTING TEST AUTHORITY THAT MAY NEED EXPLICIT SUPERSESSION

Do not blindly preserve obsolete UX assertions.

Known examples include:

- v1.5.1 operational acceptance that expects both Quote Builder and Quick Custom Quote;
- v1.5.1 acceptance that expects Quote defaults inside Operations;
- navigation/browser tests asserting old sidebar structure;
- copy assertions tied to stage-specific queue navigation.

For each failing test:

1. determine whether it protects domain/security behaviour or an intentionally superseded UX contract;
2. preserve domain/security behaviour;
3. formally update only superseded presentation assertions;
4. never weaken tests simply to obtain green output.

---

# 26. FINAL VALIDATION

Use the least number of commands that provide complete proof.

During implementation, run focused tests for the affected slice.

Before final handoff, the expected broad local proof is:

```bash
bun run quality
bun run test:e2e:domain
bun run diff:check
```

If the repository's current `quality`/domain test contracts have changed at execution time, use the current equivalent authority and record the exact commands.

Also run focused tests for any new ZUX-specific presentation helpers and browser journeys.

Do not duplicate expensive commands unnecessarily when a broader gate already includes them.

## CI

After pushing exact head, verify the protected checks currently required by `main`.

At authoring time these are:

```text
static
database-domain-security
browser-build
release-contract
```

The agent must re-read current branch protection/check requirements at execution time rather than assuming they are unchanged.

### CI failure rule

- If failure is caused by the goal diff: diagnose and fix within scope.
- If failure is a new independent/out-of-scope failure: STOP and report exact evidence.
- Do not repeatedly rerun an unrelated failure hoping for green.

---

# 27. SUCCESS METRICS / DEFINITION OF DONE

The goal is complete only when all of the following are true.

## Home

Answers:

> **What should I do now?**

without a management dashboard overwhelming operational work.

## Sales

Answers:

> **Which enquiries need work, and what do they need?**

without requiring navigation through internal stages.

## Enquiry

Answers:

> **What is happening with this customer request, and what do I do next?**

without sending the user to another queue to continue.

## Quote

Answers:

> **What do I need to finish, review, send, or record?**

with one ordinary Quote Builder and clear state-specific actions.

## Follow-ups

Answers:

> **What must not be forgotten?**

and allows context-first task creation.

## Customers

Answers:

> **What do we know about this customer?**

without internal Client/PostgreSQL language dominating the page.

## Fulfilment

Answers:

> **What must happen to complete this accepted sale?**

without showing every queue and every possible transition simultaneously.

## Reports

Answers:

> **How is the business performing?**

using existing metric authorities.

## Settings

Answers:

> **How are our Quote/business defaults configured?**

without technical diagnostics mixed into the same page.

## System Health

Answers:

> **Is Zephyr's intake/email/automation infrastructure healthy?**

with technical details available only when needed.

---

# 28. EXPLICITLY BANNED END STATES

The overhaul has failed if it produces any of the following:

- a prettier version of the same giant pages;
- more primary navigation destinations than before;
- a separate page for every internal lifecycle state;
- several ordinary ways to create the same Quote;
- giant inline workflow forms inside queues;
- all possible actions shown with equal weight;
- technical architecture prose used as user guidance;
- raw enum values visible to ordinary staff;
- a modal-heavy interface that merely hides complexity instead of reducing it;
- new database/domain semantics introduced to make frontend code easier;
- new infrastructure introduced to support presentation-only changes;
- permission changes hidden inside navigation changes;
- historical/authority tests deleted rather than formally superseded;
- a new component framework/design-system rewrite;
- unbounded Sales/Home/Fulfilment queries;
- client-side polling;
- “complete” status based only on tests without human/browser UX inspection.

---

# 29. IMPLEMENTATION STYLE

Use:

- existing design tokens;
- existing Svelte/SvelteKit patterns;
- existing Supabase/server service boundaries;
- small focused components;
- deterministic presentation helpers;
- server-side projections;
- progressive disclosure;
- semantic HTML;
- concise user-facing copy;
- TDD/focused regression tests for each meaningful behavioural change.

Avoid:

- over-engineering;
- generic workflow engines;
- abstraction before repeated need exists;
- unnecessary refactors outside touched seams;
- broad file moves;
- speculative “future-proofing”;
- new libraries for basic UI composition;
- duplicate domain logic in TypeScript.

---

# 30. FINAL AGENT HANDOFF FORMAT

When the `/goal` execution is complete, STOP and return a concise evidence report containing:

```text
GOAL VERDICT: PASS | STOPPED

STARTING origin/main SHA:
BRANCH:
FINAL HEAD:
PR:
WORKTREE STATUS:

AUTHORITY AMENDMENT:
- files changed
- superseded presentation assertions
- domain/security authorities preserved

UX OUTCOMES:
- Home
- Sales
- Enquiry
- Quote
- Follow-ups
- Customers
- Fulfilment
- Reports
- Settings
- System Health

LIFECYCLE INTEGRITY:
- states changed? must be NO
- transitions changed? must be NO
- guards weakened? must be NO
- optimistic locking preserved? YES
- Quote immutability preserved? YES
- Sales→Fulfilment handoff preserved? YES

VALIDATION:
- focused tests
- bun run quality
- bun run test:e2e:domain
- git diff --check

CI AT EXACT FINAL HEAD:
- static
- database-domain-security
- browser-build
- release-contract
(or current protected equivalents)

KNOWN LIMITATIONS / FOLLOW-UP:
- only genuine out-of-scope items

MERGE:
- NOT PERFORMED
```

Do not self-authorize another product phase, architecture expansion, refactor programme, or deployment after this report.

---

# 31. FINAL GOAL STATEMENT

> **Rework Zephyr's presentation architecture into a guided workflow shell that hides internal workflow complexity, simplifies navigation, separates operational work from reporting and technical administration, gives every record an obvious practical next step, and allows a new staff member to complete the full Enquiry → Quote → Decision → Customer → Fulfilment journey without CRM-specific training — while preserving every existing authoritative lifecycle, guard, permission, concurrency rule, commercial snapshot, audit invariant, and Sales-to-Fulfilment domain boundary.**

That is the goal. Do not expand it. Do not weaken the system to achieve it. Simplify what the human sees while preserving what the platform knows.
