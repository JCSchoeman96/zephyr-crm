# Zephyr CRM Frozen Roadmap

**Status:** Frozen implementation authority (Phase 0)
**Roadmap source:** `CRM_IMPLEMENTATION_ROADMAP_v1.1.0.md`
**Execution controller:** `AGENTS.md`
**Deployment model:** One isolated stack per client

## Ordered phases

| Phase | Authority | Objective | Required predecessor |
|---|---|---|---|
| P0 | `Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md` | Freeze product, domain, state, security, deployment and sequence | none |
| P1 | `Phases/PHASE_01_PROJECT_SCAFFOLD_QUALITY_GATES.md` | Create deterministic SvelteKit/Bun/Supabase/Cloudflare skeleton and quality gates | P0 |
| P2 | `Phases/PHASE_02_DESIGN_SYSTEM_APPLICATION_SHELL.md` | Create tokenized accessible primitives and application shell | P1 |
| P3 | `Phases/PHASE_03_DATABASE_IDENTITY_PERMISSIONS_RLS.md` | Create schema, Auth wiring, seed, RLS and permission foundations | P2 |
| P4 | `Phases/PHASE_04_COMPLETE_CRM_TRACER_BULLET.md` | Prove Bricks intake → Lead → Quote → SendPulse contract → Task → Won/Lost → Client | P3 |
| P5 | `Phases/PHASE_05_LEAD_MANAGEMENT_HARDENING.md` | Complete lead resource, intake hardening, pipeline, lists and concurrency | P4 |
| P6 | `Phases/PHASE_06_CLIENT_CONTACT_DOMAIN.md` | Complete Clients/Contacts and atomic idempotent conversion | P5 |
| P7 | `Phases/PHASE_07_QUOTE_DOMAIN_QUOTE_EDITOR.md` | Complete exact money, numbering, immutable Quote lifecycle and editor | P6 |
| P8 | `Phases/PHASE_08_DOCUMENTS_COMMUNICATIONS.md` | Create private documents, SendPulse adapter/events and delivery evidence | P7 |
| P9 | `Phases/PHASE_09_TASKS_FOLLOW_UPS_AUTOMATION.md` | Complete Tasks, follow-ups, scheduler, claims and terminal cleanup | P8 |
| P10 | `Phases/PHASE_10_DASHBOARD_ANALYTICS.md` | Create deterministic bounded operational and sales analytics | P9 |
| P11 | `Phases/PHASE_11_UX_REALTIME_PERFORMANCE_HARDENING.md` | Measure and harden UX, realtime, accessibility, conflicts and performance | P10 |
| P12 | `Phases/PHASE_12_SECURITY_BACKUP_OPERATIONAL_HARDENING.md` | Complete security audit, backup/restore, diagnostics and release rehearsal | P11 |
| P13 | `Phases/PHASE_13_REUSABLE_CLIENT_DEPLOYMENT_TEMPLATE.md` | Prove typed client configuration and repeatable local provisioning/artifact readiness | P12 |
| P14 | `Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md` | Run final local release candidate, reconciliation and pilot-readiness package | P13 |

Dependencies are strict and sequential. A later phase cannot be used to hide a failure in an earlier phase. Completed-phase acceptance tests are frozen regression gates.

## Phase boundaries

P0 is documentation only. P1 creates the technical skeleton but no CRM business capability. P2 creates design infrastructure and shell but no CRM-specific business workflow. P3 creates persistence/security foundations but not the complete workflow. P4 proves the thinnest real vertical slice. P5–P10 expand the proven domains. P11–P12 harden the local product. P13 makes the isolated deployment reusable. P14 freezes the local release candidate.

## Cross-phase completion gate

Each phase must pass its phase-specific mandatory test matrix, previous regression gates, format/lint/type/unit/integration/browser/build/database checks applicable to the repository, migration consistency checks, secret-boundary checks, `git diff --check`, and a reviewable diff. No required test may be deleted, weakened, renamed, or silently skipped.

## Final local terminal state

After P14 and the separate global final validation pass, local state must record:

```text
goal_status = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

The local loop does not deploy, alter DNS, verify live sender domains, run a real-client pilot, or launch production. Those actions are described in `POST_BUILD_PILOT_PROGRAMME.md` and remain explicitly external/deferred.

## Deferred v1 scope

Marketing campaigns, mass mail, inbound mailbox, WhatsApp, SMS, telephone integration, accounting, payments, invoices, subscriptions, project management, AI agents, workflow builders, arbitrary custom fields, public customer portals, electronic signatures, advanced document generation, and multi-company SaaS tenancy are outside P0–P14. Real remote deployment, live DNS/email authentication, pilot observation, feedback execution, and production launch are also outside this local roadmap.

## Authority reconciliation

The frozen implementation authority is split by responsibility:

- `docs/ARCHITECTURE.md`: boundaries and topology.
- `docs/DOMAIN_MODEL.md`: resources, relationships, invariants and trusted actions.
- `docs/STATE_MACHINES.md`: states and legal transitions.
- `docs/SECURITY_MODEL.md`: Auth, RLS, secrets, integration and recovery law.
- this file: phase order, boundaries and final state.

No phase may introduce a competing definition for Lead, Client, Quote, Task, Activity, role, state, or deployment.
