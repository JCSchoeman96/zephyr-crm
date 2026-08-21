# Phase 12 — Security, Backup & Operational Hardening

**Project:** Small Business CRM  
**Roadmap Version:** 1.1.0  
**Phase:** 12  
**Milestone:** M3 — Production Hardening  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Pages + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Prove the CRM is safe to hold real customer and commercial data by validating authorization, secret boundaries, webhook security, private storage, recovery, diagnostics, migration integrity, idempotency, and complete release regressions.

# Preconditions

All intended v1 features are complete. This phase is the production launch gate.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Perform full RLS/role matrix audit.
- Verify service-role, SendPulse, database, and webhook secrets are server-side only.
- Review CSP, XSS handling, input validation, storage privacy, and webhook authentication.
- Verify quote documents remain private.
- Implement an explicit backup strategy: managed paid backup or automated external encrypted backup.
- Define retention policy and backup ownership.
- Perform a real restore into a disposable environment and verify application integrity.
- Create operational diagnostics for Bricks intake, SendPulse send/events, failed outbound messages, reminder processor status, and critical function errors.
- Run migration reset and forward-upgrade tests.
- Run full end-to-end Won and Lost journeys.
- Document incident/recovery and client handoff procedures.

# MUST NOT Happen

- Do not call a Free-tier database production-ready without a proven recovery strategy.
- Do not treat existence of a backup file as proof of recoverability.
- Do not log passwords, access tokens, service keys, or unnecessarily complete PII payloads.
- Do not launch with unresolved RLS findings.
- Do not waive idempotency failures as 'unlikely'.
- Do not add unrelated features during hardening.
- Do not deploy if migrations cannot be reproduced from clean state.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P12.1 Security Audit** | RLS, roles, Auth, secrets, input, CSP/XSS, storage. |
| **P12.2 Integration Security** | Bricks secret/form validation and SendPulse webhook/provider boundaries. |
| **P12.3 Backup Automation** | Create managed or external backup process and retention. |
| **P12.4 Restore Drill** | Restore into disposable environment and validate. |
| **P12.5 Diagnostics** | Expose operational health/failure visibility. |
| **P12.6 Migration/Release Rehearsal** | Clean reset, upgrade, rollback strategy where applicable. |
| **P12.7 Full Release Regression** | Won/Lost workflows and all critical invariants. |
| **P12.8 Production Checklist** | Document launch gate and ownership. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P12-T01` | Anonymous access audit | Security | Anonymous access to protected business rows/documents is denied. |
| `P12-T02` | Role matrix audit | Security | Owner/Admin/Sales/Viewer permissions match the frozen matrix across all exposed resources/actions. |
| `P12-T03` | Secret scan | Static/runtime | No trusted secret appears in browser bundle, repository history in scope, or public config. |
| `P12-T04` | Webhook auth failure | Integration | Invalid/missing Bricks or provider webhook authentication is rejected safely. |
| `P12-T05` | XSS/input smoke | Security/browser | Representative untrusted text is escaped/sanitized according to rendering context. |
| `P12-T06` | Private storage | Security | Anonymous quote-document access is denied. |
| `P12-T07` | Backup creation | Operations | Current database and required metadata/storage references are captured according to procedure. |
| `P12-T08` | Restore drill | Operations | Backup restores into disposable environment and critical CRM records/relationships can be read and used. |
| `P12-T09` | Migration reset | Supabase CLI | Fresh database migrates/seed successfully from zero. |
| `P12-T10` | Upgrade rehearsal | DB | Representative prior schema can migrate forward without unintended data loss. |
| `P12-T11` | Duplicate external events | Integration | Bricks/SendPulse retries remain idempotent after hardening. |
| `P12-T12` | Won E2E | Browser/integration | Login → Bricks → Lead → Quote → Send → Reminder → Won → Client passes. |
| `P12-T13` | Lost E2E | Browser/integration | Lead → Lost → required reason → task cleanup/activity passes. |
| `P12-T14` | Production build | Automated | Full check/test/build/db/diff gate passes from clean checkout. |
| `P12-T15` | Launch blocker review | Manual | No unresolved Critical/High security, recovery, data-integrity, or migration blocker remains. |

# Definition of Done

- The system has a proven recovery path.
- Security and authorization are test-backed.
- Operational failures can be diagnosed without raw-cloud archaeology.
- The release candidate is safe to move into productisation.

# Handoff to Next Phase

Phase 13 may make deployment repeatable across isolated client-owned stacks without changing core domain code.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] All prior-phase regression tests still pass and none were weakened, skipped, or removed merely to make this phase pass.
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
10. **Every phase closes with focused tests plus the complete existing project quality gate.**

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

Once all required outcomes in this document are implemented, every mandatory phase test passes, all completed-phase regression gates still pass, the project-wide quality gate passes, migrations are clean, and no unrelated scope was introduced:

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to the next dependency-valid phase.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`. Do not “improve” adjacent systems before advancing.

---
