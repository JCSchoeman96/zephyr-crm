# Zephyr CRM v1.3.1 local release candidate — pilot readiness

Status: `LOCAL_BUILD_COMPLETE` / `PILOT_READY`

This document is the handoff boundary between the autonomous local build and a
separately authorised post-build pilot. The local project has not deployed a
remote stack, changed live DNS, authenticated a real sender domain, sent a real
client message, onboarded real staff, completed human observation, or launched
production.

Current lifecycle values:

```text
goal_status = COMPLETE
local_build_status = LOCAL_BUILD_COMPLETE
release_status = PILOT_READY
pilot_status = NOT_STARTED
production_status = NOT_LAUNCHED
```

## Local evidence accepted for pilot handoff

The local release candidate is accepted only with the complete quality gate and
the following evidence. Contract fixtures prove application behavior and are not
substitutes for live provider/DNS or human-observation evidence.

| Evidence | Local proof | Status |
| --- | --- | --- |
| Fresh isolated instance | `bun run client:provision -- config/client.example.json` with explicit local reset | PASS |
| Won/Lost journeys | P4 tracer plus P12 Won/Lost E2E on local synthetic data | PASS |
| Quote history | Quote money, numbering, revisions, snapshots, immutability and conflicts | PASS |
| Idempotency/concurrency | Bricks, SendPulse events, reminders, conversion and locking suites | PASS |
| Bricks boundary | Authenticated canonical request fixture against local ingestion endpoint | PASS |
| SendPulse boundary | Adapter/provider fixtures, acknowledgement/failure mapping and webhook deduplication | PASS |
| Recovery | Encrypted backup and disposable restore with private document hash verification | PASS |
| Migration | Fresh reset and forward-upgrade rehearsal | PASS |
| Diagnostics | Redacted owner/admin diagnostics and operational evidence | PASS |
| Owner/Admin Auth/MFA | Invitation-only application login, local TOTP enrollment/verification, AAL1 denial, AAL2 privileged-action success, logout, and recovery/re-enrollment documentation | PASS locally; hosted staff enrollment remains external |
| Build and security | Cloudflare artifact, public-bundle scan, RLS/security, browser, static and diff gates | PASS |

## Future remote deployment checklist

Every item below is external/manual and requires a future explicit goal plus a
named operator. Marking an item complete requires evidence attached to the client
handoff; the local build does not mark these items complete.

The release candidate identity is `v1.0.0-rc.1`; the frozen roadmap/authority
version remains `v1.3.1`. The non-circular release sequence is:

```text
P14 VALIDATING
  → P14-T01..P14-T21 PASS
  → P14 COMPLETE
  → FINAL_PROJECT_VALIDATION
  → COMPLETE / LOCAL_BUILD_COMPLETE / PILOT_READY
```

P14 does not require terminal global state. A failed global gate reopens the
responsible proof and returns to final validation only after the affected
phase is complete again.

### Client-owned accounts and access

- [ ] Client owns Cloudflare account/project, billing, recovery email, MFA devices,
      and domain/DNS registrar.
- [ ] Client owns Supabase project, billing/plan, project recovery contacts, Auth
      administration, private Storage, and database backup decision.
- [ ] Client owns SendPulse account, billing, sender identities, API/webhook
      credentials, and recovery contacts.
- [ ] Client approves the least-privilege implementer access, support window,
      offboarding date, and secret-rotation owner.

### Remote stack and configuration

- [ ] Create the client-owned Supabase project and apply the canonical migration
      chain; record the project reference and migration version.
- [ ] Apply the validated client configuration and trusted secrets through the
      approved secret manager. Never commit `.env`, `.dev.vars`, or credential
      values.
- [ ] Create the client-owned Cloudflare Workers project, bind Static Assets from
      `wrangler.jsonc`, and configure
      approved environment/secrets, and record the deployed release/configuration
      versions.
- [ ] Choose and test the client-owned encrypted backup destination, retention,
      key owner, restore operator, and disposable restore cadence.

### DNS, email, and Bricks

- [ ] Attach the client domain to Cloudflare and publish/verify DNS and TLS records.
- [ ] Configure the client SendPulse sender identity and verify SPF, DKIM, DMARC,
      alignment, webhook secret, redirect origins, and the documented evidence
      date/operator.
- [ ] Configure the client Bricks form ID, webhook URL, authentication secret,
      field mapping, duplicate submission behavior, and an authenticated smoke
      submission.
- [ ] Send a controlled real transactional message to an approved test
      recipient; reconcile pending/claimed/submitting/submitted, failed, and
      submission-unknown outcomes plus delivered/bounced provider observations
      against CRM records.

### Staff, observation, and feedback

- [ ] Invite staff through the approved invitation-only Auth flow; verify Owner/Admin
      AAL2 and MFA enrolment/re-enrolment expectations. The local proof is
      `bun run auth:integration` plus `bun run auth:readiness`; hosted staff
      enrollment and recovery-device confirmation remain pilot evidence.
- [ ] Observe new enquiry, qualification, attention/Task work, quote creation and
      revision, send/follow-up, no-response, Lost, Won conversion, dashboard, and
      reporting workflows with real staff.
- [ ] Record support/recovery contacts, client handoff acceptance, and the first
      restore-test date.
- [ ] Classify every finding as Bug, Domain Flaw, UX Friction, Configuration Need,
      Client-Specific Preference, or Future Feature. Fix only true release blockers
      in the pilot scope.

### Pilot exit and production launch gate

Do not launch production until the separate pilot record proves:

- no unresolved Critical/High security or data-integrity findings;
- no duplicate conversion, quote-history mutation, reminder duplication, or webhook
  idempotency defect;
- staff can identify due/overdue/waiting work without database workarounds;
- real sender-domain authentication and transactional email behavior are verified;
- backup ownership and a disposable restore are proven for the hosted instance;
- feedback is classified and client preferences have not been promoted to domain law;
- final security, integrity, migration, recovery, Won/Lost, and quality gates pass.

Only after those conditions are signed off may a separately authorised goal decide
whether to launch production. This local release candidate does not claim
`PILOT_COMPLETE` or `PRODUCTION_LAUNCHED`.
