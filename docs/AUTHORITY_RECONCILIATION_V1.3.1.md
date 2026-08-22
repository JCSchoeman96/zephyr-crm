# v1.1 → v1.3.1 authority reconciliation

Baseline implementation checkpoint: `2d76e12`  
Baseline authority: v1.1.0  
Reconciled authority: v1.3.1  
Reconciled on: 2026-08-22

## Exact delta

The old authority set contained 156 mandatory test IDs. The preserved v1.3.1
set contains 229 unique mandatory test IDs. The exact delta is:

```text
added:     73
removed:    0
renumbered: 0
```

The 73 additions are listed individually below. All old IDs remain in the
current phase authorities and remain frozen regression gates.

Classification means:

- `ALREADY_SATISFIED`: implementation already complied; reconciliation added or
  retained evidence only.
- `DOCUMENTATION_DRIFT`: implementation truth was valid, but the normative
  document/runbook/config description was stale or absent.
- `TEST_EVIDENCE_GAP`: behavior was present or substantially covered, but the
  v1.3.1 acceptance proof was not explicit/reproducible.
- `IMPLEMENTATION_GAP`: the old implementation or boundary did not satisfy the
  newer contract and was repaired.
- `INTENTIONAL_ARCHITECTURE_CONFLICT`: an equal-priority conflict requiring a
  decision. None was found.

## Delta matrix

| ID | v1.3.1 requirement delta | Classification | Reconciliation result/evidence |
| --- | --- | --- | --- |
| P0-T06 | Attention only none/waiting states; follow-up is Task-derived; pause is orthogonal | IMPLEMENTATION_GAP | DB/domain/UI attention contract, pause fields and P5 regression |
| P0-T07 | Exact money precision, rounding and server authority | IMPLEMENTATION_GAP | Numeric migration, money domain contract and P7 regression |
| P0-T08 | Trusted mutation matrix and append-only Activity | IMPLEMENTATION_GAP | Protected-field triggers, append-only policy and security gate |
| P0-T09 | Quote snapshots, acceptance evidence, provenance and association | IMPLEMENTATION_GAP | Quote migration/actions/document provenance and P7/P8 gates |
| P0-T10 | Outbound idempotency, attempts, uncertainty, reconciliation and retry | IMPLEMENTATION_GAP | Outbound contract migration, adapter boundary and P8 regression |
| P0-T11 | POPIA-oriented operations and complete recovery scope | TEST_EVIDENCE_GAP | Privacy/recovery contracts and P12/P14 restore evidence |
| P0-T12 | Metrics, UTC/IANA time, identity, phone and toolchain law | DOCUMENTATION_DRIFT | Metrics, domain, phone and toolchain contracts imported/updated |
| P0-T13 | Complete dependency baseline authority | DOCUMENTATION_DRIFT | v1.3.1 baseline imported and exact proof recorded |
| P0-T14 | Dependency governance, source ownership and defaults | DOCUMENTATION_DRIFT | Toolchain proof and registry gate record the governed choices |
| P0-T15 | SECURITY INVOKER/DEFINER, search path and EXECUTE law | IMPLEMENTATION_GAP | Hardened PostgreSQL functions, grants and static/DB security checks |
| P0-T16 | Server role/status authority, no metadata authorization, signup prohibition and AAL2 | IMPLEMENTATION_GAP | Auth config, profile guards, AAL2 checks and security regression |
| P0-T17 | Complete authority hash coverage and drift stop semantics | TEST_EVIDENCE_GAP | v1.3.1 registry/hash map and final state evidence |
| P1-T09 | Reproducible exact runtime/toolchain proof | TEST_EVIDENCE_GAP | `docs/TOOLCHAIN_PROOF.md` and frozen install evidence |
| P1-T10 | Workers + Static Assets artifact | IMPLEMENTATION_GAP | `wrangler.jsonc`, adapter output and Worker build |
| P1-T11 | Bun package-manager authority | ALREADY_SATISFIED | Exact Bun package manager and canonical scripts retained |
| P1-T12 | Exact direct dependency pins | ALREADY_SATISFIED | Existing exact pins retained and registry verified |
| P1-T13 | Single `bun.lock` authority | ALREADY_SATISFIED | Lockfile retained; competing lockfiles absent |
| P1-T14 | Full-stack compatibility proof | TEST_EVIDENCE_GAP | Toolchain proof plus complete local quality gate |
| P1-T15 | `wrangler.jsonc` sole config authority | IMPLEMENTATION_GAP | Pages-oriented preview/config replaced with Worker config |
| P1-T16 | Frozen explicit compatibility date | ALREADY_SATISFIED | Explicit non-self-rewriting date retained |
| P1-T17 | Vite owns SvelteKit build | ALREADY_SATISFIED | Vite build remains canonical; Bun invokes scripts |
| P1-T18 | Project-local Supabase CLI authority | ALREADY_SATISFIED | Exact CLI dev dependency and Bun scripts retained |
| P1-T19 | Approved quality stack | ALREADY_SATISFIED | Vitest/Playwright/check/lint/Prettier remain primary |
| P1-T20 | Frozen reinstall proof | TEST_EVIDENCE_GAP | Frozen lockfile/toolchain proof recorded and rerun |
| P2-T08 | shadcn-svelte source ownership/configuration | IMPLEMENTATION_GAP | Project-owned `components.json` and source convention |
| P2-T09 | Tailwind 4 integration | ALREADY_SATISFIED | `@tailwindcss/vite` and Tailwind 4 retained |
| P2-T10 | Lucide ordinary icon system | ALREADY_SATISFIED | Existing Lucide usage retained |
| P2-T11 | Dependency restraint | ALREADY_SATISFIED | No alternate UI/state/form/provider stack added |
| P3-T11 | Protected field mutation | IMPLEMENTATION_GAP | Database guards and trusted action boundaries |
| P3-T12 | Activity append-only | IMPLEMENTATION_GAP | Trigger/policy enforcement and regression |
| P3-T13 | Timestamp contract | ALREADY_SATISFIED | Existing UTC/timestamptz behavior retained |
| P3-T14 | Restricted trusted function EXECUTE | IMPLEMENTATION_GAP | Explicit revokes/grants and security inspection |
| P3-T15 | SECURITY DEFINER hardening | IMPLEMENTATION_GAP | Safe search paths, qualification, checks and grants |
| P3-T16 | Role/status authority | IMPLEMENTATION_GAP | Profile/config guards reject direct privilege mutation |
| P3-T17 | Public signup disabled | IMPLEMENTATION_GAP | Supabase config and signup denial regression |
| P3-T18 | Privileged AAL2 enforcement | IMPLEMENTATION_GAP | Current-session AAL2 required and AAL1 denied |
| P5-T14 | Attention/pause orthogonality | IMPLEMENTATION_GAP | Lead schema/actions/UI and P5 regression |
| P5-T15 | E.164 phone normalization | IMPLEMENTATION_GAP | Domain normalizer, private trigger and unit coverage |
| P5-T16 | Bricks boundary hardening | IMPLEMENTATION_GAP | Allowlist/size/content validation and P5 integration |
| P6-T10 | Contact authority for person vs account channels | ALREADY_SATISFIED | Existing Client/Contact boundary retained; P6 regression |
| P6-T11 | Concurrent primary-contact uniqueness | ALREADY_SATISFIED | Existing unique invariant retained; P6 regression |
| P6-T12 | Quote association on conversion | IMPLEMENTATION_GAP | Lead association preserved and quote fixture corrected |
| P7-T12 | Decimal edge cases | IMPLEMENTATION_GAP | Four/six-place inputs, half-up rounding and document proof |
| P7-T13 | Negative money rejection | IMPLEMENTATION_GAP | DB checks and domain validation |
| P7-T14 | Historical snapshot integrity | IMPLEMENTATION_GAP | Immutable seller/recipient/commercial snapshots |
| P7-T15 | Quote association integrity | IMPLEMENTATION_GAP | Immutable lead linkage and trusted client linking |
| P7-T16 | Acceptance evidence | IMPLEMENTATION_GAP | Trusted acceptance fields and direct mutation denial |
| P8-T12 | Ambiguous provider outcome | IMPLEMENTATION_GAP | `submission_unknown`, adapter error and blocked retry |
| P8-T13 | Logical send idempotency | IMPLEMENTATION_GAP | Logical key, attempt rows and unique boundary |
| P8-T14 | Provider reconciliation | IMPLEMENTATION_GAP | Service-only reconciliation path and regression |
| P8-T15 | Document provenance | IMPLEMENTATION_GAP | Hash/template/generator identity tied to quote artifact |
| P8-T16 | Webhook defense in depth | ALREADY_SATISFIED | Existing signature/schema/service boundary retained and gated |
| P8-T17 | SendPulse dependency boundary | ALREADY_SATISFIED | Project-owned REST adapter; no SDK introduced |
| P8-T18 | Hard-bounce remediation | IMPLEMENTATION_GAP | Current-actionable bounce sets waiting_on_us and one task |
| P9-T11 | Follow-up projection from open Tasks | IMPLEMENTATION_GAP | Security-invoker projection and automation regression |
| P10-T10 | Revision-safe value metrics | IMPLEMENTATION_GAP | Latest eligible quote selection and metric contract |
| P10-T11 | UTC/IANA timezone boundary | TEST_EVIDENCE_GAP | Metrics contract and analytics regression |
| P10-T12 | Analytics view authorization | IMPLEMENTATION_GAP | Security-invoker views, grants and DB inspection |
| P11-T11 | Realtime dependency restraint | ALREADY_SATISFIED | Feature-scoped Realtime retained; database remains truth |
| P12-T16 | Activity immutability after all migrations | IMPLEMENTATION_GAP | Final trigger/policy and post-migration security regression |
| P12-T17 | Privileged audit evidence | IMPLEMENTATION_GAP | `security_audit_events` and audited trusted actions |
| P12-T18 | MFA/AAL2 readiness gate | IMPLEMENTATION_GAP | AAL1 denial/AAL2 allow tests and pilot checklist |
| P12-T19 | Privacy operations | DOCUMENTATION_DRIFT | POPIA-oriented privacy/incident/cross-border/retention runbook |
| P12-T20 | Backup ageing/privacy | TEST_EVIDENCE_GAP | Retention/ageing procedure recorded; disposable recovery gate |
| P12-T21 | Dependency security baseline | TEST_EVIDENCE_GAP | Exact inventory, lockfile, proof and registry gate |
| P12-T22 | Auth reconstruction fidelity | TEST_EVIDENCE_GAP | Identity/profile/role/status manifest and reset/MFA contract |
| P13-T12 | Pinned provisioning toolchain | DOCUMENTATION_DRIFT | Client runbook and exact toolchain proof updated |
| P13-T13 | Client governance configuration | DOCUMENTATION_DRIFT | Timezone/currency/privacy/recovery/MFA ownership documented |
| P14-T17 | Cross-cutting law regression | IMPLEMENTATION_GAP | Money/mutation/snapshot/association/attention regressions |
| P14-T18 | Metric/time regression | TEST_EVIDENCE_GAP | Metrics contract plus analytics/timezone gate |
| P14-T19 | Privacy/MFA pilot gate | DOCUMENTATION_DRIFT | Final pilot package blocks launch until prerequisites exist |
| P14-T20 | Authority drift check | TEST_EVIDENCE_GAP | Complete v1.3.1 hash map and registry gate |
| P14-T21 | Toolchain/dependency drift | TEST_EVIDENCE_GAP | Frozen proof, pins, lockfile, Wrangler and final gate |

## Architecture resolution

The old implementation and runbooks used Cloudflare Pages, while v1.3.1 freezes
Cloudflare Workers with Static Assets. This was not an equal-priority authority
conflict and was not resolved by documentation-only renaming. The implementation
now emits `.svelte-kit/cloudflare/_worker.js`, `wrangler.jsonc` binds
`.svelte-kit/cloudflare` as `ASSETS`, local preview uses `wrangler dev`, and the
architecture, deployment, pilot and toolchain documents describe Workers. No
Pages deployment is claimed or required locally.

## Unchanged and deferred scope

The Lead-before-Client rule, quote immutability, PostgreSQL truth, isolated
single-client deployment and post-v1 backlog remain intact. WhatsApp, SMS,
accounting, payments, invoices, AI, workflow builders, multi-tenancy, remote
deployment, live DNS/email authentication, human pilot observation and
production launch remain deferred by the v1.3.1 authority.
