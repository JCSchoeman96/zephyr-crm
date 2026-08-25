# Phase 8 — Documents & Communications

**Project:** Small Business CRM  
**Roadmap Version:** 1.3.2
**Phase:** 8  
**Milestone:** M2 — Production CRM Core  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Workers with Static Assets + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Create reliable quote documents and a first-class outbound communication domain that records provider submission, delivery/failure events, and engagement without conflating provider acknowledgements with delivery truth.

# Preconditions

Quote immutability, numbering, totals, and revisions are proven.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Implement SendPulse through a project-owned trusted REST/HTTP adapter; no arbitrary/community SendPulse SDK is permitted without architecture amendment.

- Generate a frozen quote document from the final commercial snapshot.
- Store documents in private Supabase Storage.
- Persist document path, generated timestamp, and cryptographic hash.
- Create OutboundMessage before calling SendPulse.
- Use SendPulse transactional API through trusted server-side code only.
- Track the frozen `pending → claimed → submitting → submitted|submission_unknown` workflow, where definitive pre-acceptance failure becomes `failed`, while accepted `submitted` messages may later become `delivered` or `bounced`.
- Persist provider message identifiers.
- Implement SendPulse event webhook and MessageEvent resource.
- On the first **definitive hard bounce** for the current actionable Quote communication: preserve Quote history, set the OutboundMessage to `bounced`, move Lead attention to `waiting_on_us`, and create/ensure exactly one open corrective Task such as `Quote email bounced — verify contact details`. Deduplicate by a deterministic remediation key tied to the logical outbound message. A late bounce for an obsolete/superseded communication is recorded but must not steal attention from a newer actionable state.
- Deduplicate provider webhook retries.
- Treat SendPulse webhooks as untrusted: use an unguessable secret/token endpoint where supported by configuration, strict POST/content-type, bounded body size, schema validation, provider task/message correlation, expected logical-message/recipient correlation, and safe generic responses/logging.
- Provider webhooks may update communication evidence only; they must never directly accept a Quote, mark a Lead Won, convert a Client, or perform another dangerous commercial transition.
- Record open/click as engagement events rather than delivery states.
- Provide and validate the production sender-domain authentication contract/checklist for SPF, DKIM, and DMARC; actual live DNS verification is a post-build pilot/deployment gate unless explicitly authorized in the current `/goal`.
- Support safe retry of failed sends without accidental duplicate side effects.

- Give each logical outbound message a deterministic idempotency key and keep append-only send-attempt evidence.
- Implement `pending → claimed → submitting → submitted|submission_unknown`, where definitive pre-acceptance failure becomes `failed`, while accepted `submitted` messages may later become `delivered` or `bounced`, exactly as frozen.
- Treat a timeout/connection loss after possible request transmission as `submission_unknown`, not automatic `failed`; do not blindly retry.
- Reconcile provider task/message identifiers and webhook events to the logical message; expose an authorised controlled-retry/reconciliation path for unresolved uncertainty.
- Persist document template/generator version and artifact SHA-256/path with the generated Quote document.

# MUST NOT Happen

- Do not store SendPulse credentials in browser code or public tables.
- Do not make quote files publicly enumerable/readable.
- Do not mark a message Delivered when the provider merely accepted the API request.
- Do not treat an open event as proof that a human read the quote.
- Do not rewrite a historical document after send.
- Do not build a custom marketing email campaign system or template designer.
- Do not allow webhook retries to append duplicate business transitions.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P8.1 Document Generator** | Create deterministic private quote document and hash. |
| **P8.2 Outbound Message Model** | Persist send intent and state before provider call. |
| **P8.3 SendPulse Adapter** | Trusted API client and provider acknowledgement mapping. |
| **P8.4 Provider Event Webhook** | Validate/map/deduplicate delivery and engagement events. |
| **P8.5 Activity Projection** | Append meaningful communication events to CRM timeline. |
| **P8.6 Retry & Failure UX** | Expose failed/submitted/delivered distinctions and safe retry. |
| **P8.7 Production Email Authentication Readiness** | Define/validate sender identity plus SPF/DKIM/DMARC requirements and pilot verification procedure. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P8-T01` | Document determinism | Integration | Same final Quote snapshot generates equivalent commercial content and a stored immutable artifact. |
| `P8-T02` | Private storage | Security | Anonymous/public access to quote documents is denied; authorized retrieval works through the approved path. |
| `P8-T03` | Document immutability | Integration | Sent Quote document path/hash is not silently replaced by ordinary edits. |
| `P8-T04` | Send success | Integration | Deterministic provider acceptance through the real SendPulse adapter stores provider message ID and transitions to Submitted, not Delivered; an approved real test send is supplemental. |
| `P8-T05` | Send failure | Integration | Deterministic provider failure through the real SendPulse adapter records Failed/error state and does not falsely mark Quote/Message delivered. |
| `P8-T06` | Safe retry | Integration | Retrying a failed message follows documented idempotency strategy and does not duplicate unrelated CRM state. |
| `P8-T07` | Delivery webhook | Integration | Valid provider delivery event transitions the matching OutboundMessage to Delivered and appends one event/activity. |
| `P8-T08` | Webhook duplicate | Integration | Replaying identical provider event creates no duplicate MessageEvent/business transition. |
| `P8-T09` | Open/click semantics | Domain | Open/click are stored as events and do not alter delivery state incorrectly. |
| `P8-T10` | Domain-auth readiness | Documentation/config test | Sender identity and SPF/DKIM/DMARC requirements, DNS values/ownership procedure, and explicit live-verification pilot gate are documented and configuration validation fails clearly when required production settings are absent; live DNS proof is not claimed locally. |
| `P8-T11` | Project quality gate | Automated | Full project and prior E2E gates remain green. |
| `P8-T12` | Ambiguous provider outcome | Integration | Simulated lost acknowledgement after request transmission persists `submission_unknown` and does not automatically send a second logical message. |
| `P8-T13` | Logical send idempotency | Concurrency/integration | Concurrent/retried initial-send requests for the same Quote revision create one logical message; attempts are recorded without duplicate business send intent. |
| `P8-T14` | Provider reconciliation | Integration | Later provider event/identifier can reconcile an eligible uncertain message without duplicate state transition. |
| `P8-T15` | Document provenance | Domain/storage | Stored artifact has hash, template version, generator version and private storage identity that remain tied to the immutable Quote revision. |
| `P8-T16` | Webhook defense-in-depth | Integration/security | Invalid method/content type/token/schema/oversize/correlation cases are rejected/ignored safely; a forged delivery event cannot accept Quote, win Lead, convert Client, or bypass trusted commercial transitions. |
| `P8-T17` | SendPulse dependency boundary | Static/integration | Transactional sending uses the project-owned trusted REST adapter; no unapproved community SendPulse SDK is installed and provider semantics remain isolated behind the adapter. |
| `P8-T18` | Hard-bounce remediation | Integration/domain | First definitive hard bounce for the current actionable Quote communication sets the message bounced, returns Lead attention to `waiting_on_us`, creates exactly one corrective Task, preserves Quote history, and duplicate provider events do not duplicate remediation; stale obsolete-message bounces do not overwrite newer attention. |

# Definition of Done

- The CRM can distinguish generated, pending/claimed/submitting, submitted, submission-unknown, delivered, bounced, and failed communication.
- Historical quote documents are private and immutable.
- SendPulse retries/events are idempotent.

# Handoff to Next Phase

Phase 9 may build scheduled follow-up automation on top of trustworthy Quote send and communication state.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] The AGENTS.md-required regression tier for this phase passes; completed-phase tests remain frozen and none were weakened, skipped, or removed merely to make this phase pass.
- [ ] Project-wide format/lint/type/test/build/database/diff gates pass.
- [ ] Migrations are deterministic and clean where applicable.
- [ ] Security/RLS assumptions are test-backed where applicable.
- [ ] No secrets are exposed.
- [ ] No unrelated feature scope was introduced.
- [ ] Git diff is reviewable and limited to this phase's outcomes.
- [ ] Phase documentation is updated to match the implemented truth.

# Global Rules Inherited by This Phase

The following rules apply to every phase:

1. **One codebase, isolated client deployments.**
2. **PostgreSQL is the durable source of truth.**
3. **RLS is mandatory for exposed business data.**
4. **Secrets must never enter browser code or public environment variables.**
5. **Sent quotes are immutable.**
6. **External integrations must be retry-safe and idempotent.**
7. **Do not introduce Redis, microservices, Kafka, background infrastructure, or a separate analytics system unless a measured requirement proves they are necessary.**
8. **Use the smallest number of tools and dependencies necessary.**
9. **Do not implement functionality allocated to a later phase.**
10. **Regression coverage is cumulative, but cadence is tiered: focused/affected + phase/core regression at each phase close; all completed-phase mandatory tests at milestone gates; the complete suite at Phase 14/final release. Completed tests are never weakened or deleted merely to obtain green status.**
11. **`DEPENDENCY_BASELINE_v1.0.0.md` is binding: do not change the approved package manager, framework/build/UI/platform/test responsibilities or introduce unapproved dependencies merely for convenience.**
12. **Once Phase 1 freezes exact pins, package/toolchain upgrades must follow the dependency governance and regression policy rather than floating semver drift.**

# Standard Agent Tool Policy

Use only the tools required by the current task.

**Default tools**
- filesystem read/write
- shell
- git

**Add only when required**
- Supabase CLI for schema, migrations, Edge Functions, Auth/RLS, or database tests
- browser for UI or end-to-end verification
- SendPulse/API access only for the communication integration phase and explicit end-to-end verification
- WordPress/Bricks access only for webhook integration verification

Do not browse, install dependencies, or call external services merely because they are available.

# Global Execution STOP Conditions

Execution may stop only under a genuine `AGENTS.md` **EXECUTION STOP** condition. Ordinary test/build/lint/migration failures, phase completion, or reaching this phase's scope boundary are not execution stops; diagnose/repair or close the phase as defined by `AGENTS.md`.

# Phase Close Condition

Once all required outcomes in this document are implemented, every mandatory phase test passes, the AGENTS.md-required phase regression tier passes, the project-wide quality gate passes, migrations are clean, and no unrelated scope was introduced:

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to the next dependency-valid phase.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`. Do not “improve” adjacent systems before advancing.

---
