# P0–P14 requirements coverage

This reconciliation records the evidence used by the local release-candidate gate.
The phase authority files remain binding law; this document does not replace them.
For every phase, the corresponding MUST and MUST NOT sections were reviewed, the
mandatory test IDs below were retained, and the phase handoff records the closure
result. No waiver or test weakening was used.

| Phase | MUST / MUST NOT authority | Mandatory test IDs | Evidence |
| --- | --- | --- | --- |
| P0 | `Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md` | P0-T01, P0-T02, P0-T03, P0-T04, P0-T05 | Frozen architecture/domain/state/security/roadmap documents and P0 handoff |
| P1 | `Phases/PHASE_01_PROJECT_SCAFFOLD_QUALITY_GATES.md` | P1-T01, P1-T02, P1-T03, P1-T04, P1-T05, P1-T06, P1-T07, P1-T08 | Bun/Vite/SvelteKit/Cloudflare scaffold, dependency baseline and P1 handoff |
| P2 | `Phases/PHASE_02_DESIGN_SYSTEM_APPLICATION_SHELL.md` | P2-T01, P2-T02, P2-T03, P2-T04, P2-T05, P2-T06, P2-T07 | Tokenized primitives, shell, browser/a11y tests and P2 handoff |
| P3 | `Phases/PHASE_03_DATABASE_IDENTITY_PERMISSIONS_RLS.md` | P3-T01, P3-T02, P3-T03, P3-T04, P3-T05, P3-T06, P3-T07, P3-T08, P3-T09, P3-T10 | Canonical migrations, Auth/RLS/security contracts and P3 handoff |
| P4 | `Phases/PHASE_04_COMPLETE_CRM_TRACER_BULLET.md` | P4-T01, P4-T02, P4-T03, P4-T04, P4-T05, P4-T06, P4-T07, P4-T08, P4-T09, P4-T10, P4-T11 | Authenticated local tracer and P4 domain contract |
| P5 | `Phases/PHASE_05_LEAD_MANAGEMENT_HARDENING.md` | P5-T01, P5-T02, P5-T03, P5-T04, P5-T05, P5-T06, P5-T07, P5-T08, P5-T09, P5-T10, P5-T11, P5-T12, P5-T13 | Lead state/attention/assignment/idempotency/concurrency suite and P5 handoff |
| P6 | `Phases/PHASE_06_CLIENT_CONTACT_DOMAIN.md` | P6-T01, P6-T02, P6-T03, P6-T04, P6-T05, P6-T06, P6-T07, P6-T08, P6-T09 | Atomic conversion/contact/rollback/authorization suite and P6 handoff |
| P7 | `Phases/PHASE_07_QUOTE_DOMAIN_QUOTE_EDITOR.md` | P7-T01, P7-T02, P7-T03, P7-T04, P7-T05, P7-T06, P7-T07, P7-T08, P7-T09, P7-T10, P7-T11 | Money/numbering/state/revision/immutability/concurrency suite and P7 handoff |
| P8 | `Phases/PHASE_08_DOCUMENTS_COMMUNICATIONS.md` | P8-T01, P8-T02, P8-T03, P8-T04, P8-T05, P8-T06, P8-T07, P8-T08, P8-T09, P8-T10, P8-T11 | Private PDF/SendPulse/webhook/retry/auth readiness suite and P8 handoff |
| P9 | `Phases/PHASE_09_TASKS_FOLLOW_UPS_AUTOMATION.md` | P9-T01, P9-T02, P9-T03, P9-T04, P9-T05, P9-T06, P9-T07, P9-T08, P9-T09, P9-T10 | Task lifecycle/claims/reminders/expiry/concurrency suite and P9 handoff |
| P10 | `Phases/PHASE_10_DASHBOARD_ANALYTICS.md` | P10-T01, P10-T02, P10-T03, P10-T04, P10-T05, P10-T06, P10-T07, P10-T08, P10-T09 | Bounded metric reconciliation/RLS/query-plan suite and P10 handoff |
| P11 | `Phases/PHASE_11_UX_REALTIME_PERFORMANCE_HARDENING.md` | P11-T01, P11-T02, P11-T03, P11-T04, P11-T05, P11-T06, P11-T07, P11-T08, P11-T09, P11-T10 | Realtime/RLS/conflict/a11y/performance/concurrency suite and P11 handoff |
| P12 | `Phases/PHASE_12_SECURITY_BACKUP_OPERATIONAL_HARDENING.md` | P12-T01, P12-T02, P12-T03, P12-T04, P12-T05, P12-T06, P12-T07, P12-T08, P12-T09, P12-T10, P12-T11, P12-T12, P12-T13, P12-T14, P12-T15 | Security, backup/restore, recovery, diagnostics and release rehearsal suite |
| P13 | `Phases/PHASE_13_REUSABLE_CLIENT_DEPLOYMENT_TEMPLATE.md` | P13-T01, P13-T02, P13-T03, P13-T04, P13-T05, P13-T06, P13-T07, P13-T08, P13-T09, P13-T10, P13-T11 | Client configuration/provisioning/artifact/integration/ownership suite |
| P14 | `Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md` | P14-T01, P14-T02, P14-T03, P14-T04, P14-T05, P14-T06, P14-T07, P14-T08, P14-T09, P14-T10, P14-T11, P14-T12, P14-T13, P14-T14, P14-T15, P14-T16 | This release-candidate gate, final quality run, coverage reconciliation and final state check |

## Cross-cutting MUST NOT reconciliation

- No client source fork, multi-tenancy, undocumented database edit, or schema
  divergence was introduced.
- No trusted secret enters source-controlled client configuration, public
  environment variables, browser bundles, logs, or handoff evidence.
- No RLS/trusted mutation, AAL2, immutability, money, recovery, idempotency,
  concurrency, UTC/IANA, or audit requirement was weakened.
- No remote Cloudflare/Supabase/SendPulse/Bricks/DNS or production resource was
  mutated by the local loop.
- No pilot or production launch is claimed; those are explicit external steps in
  `PILOT_READINESS.md` and `POST_BUILD_PILOT_PROGRAMME.md`.
