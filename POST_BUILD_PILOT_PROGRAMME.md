# Post-Build Pilot Programme

**Status:** Outside the autonomous local build roadmap  
**Entry condition:** Phase 14 status is `LOCAL_BUILD_COMPLETE` / `PILOT_READY`  
**Execution mode:** Explicit future goal; may require remote/client-owned accounts and elapsed human observation

## Purpose

Validate the locally complete pre-release candidate (for example `v1.0.0-rc.1`) in a real client environment before declaring/finalising the stable production `v1.0.0` launch baseline. The local autonomous loop MUST NOT create the stable production tag.

This programme is deliberately separate because it can require remote infrastructure mutation, live DNS, real SendPulse/Bricks connectivity, real users, and observation over time. Those are not honest completion criteria for a single uninterrupted local coding loop.

## Pilot sequence

1. Provision a representative client using client-owned Cloudflare, Supabase, domain, and SendPulse accounts.
2. Apply migrations and baseline configuration. Select the production Supabase plan explicitly; default to a paid production plan for real clients unless an approved exception documents external recovery, inactivity/availability risk and operational ownership.
3. Configure production domain/DNS and Cloudflare Workers with Static Assets deployment using the pinned build/deployment toolchain.
4. Verify the deployed build matches `DEPENDENCY_BASELINE_v1.0.0.md`, `docs/TOOLCHAIN_PROOF.md`, exact package pins/`bun.lock`, and the committed `wrangler.jsonc` compatibility date.
5. Configure SendPulse sender identity plus SPF/DKIM/DMARC and verify it.
6. Configure the real Bricks webhook with Turnstile/honeypot, JSON, Bearer secret, payload bound, rate limit, known form ID and submission UUID controls; perform authenticated smoke submissions and failure-case checks.
7. Verify the complete production recovery set and ownership: database, private Storage quote artifacts, storage mapping, Auth/user reconstruction, schema/migrations, required configuration, secret-restoration procedure, retention and backup ageing.
8. Enforce and verify Owner/Admin MFA, then onboard real staff.
9. Observe real workflow across new enquiries, qualification, quote creation/revisions, sends, follow-ups, no-response cases, Lost reasons, Won conversion, dashboard, and reporting.
10. Reconcile sampled SendPulse submitted/delivered/bounced events plus any ambiguous `submission_unknown` cases with CRM logical-message and attempt records; verify controlled retry/reconciliation rather than blind resend.
11. Execute the privacy/operations tabletop: confirm Responsible Party/Operator ownership, subprocessors/cross-border review, retention, data-subject request path, incident escalation and legal-retention/anonymisation procedures.
12. Collect feedback and classify every item as: Bug, Domain Flaw, UX Friction, Configuration Need, Client-Specific Preference, or Future Feature.
13. Fix only true production/v1 blockers; do not implement every preference.
14. Re-run security, data-integrity, complete recovery, money/snapshot/provider-uncertainty/metrics/timezone regressions, Won/Lost E2E, migration, and release quality gates.
15. Freeze `v1.0.0` only after the pilot exit criteria pass.

## Pilot exit criteria

- No unresolved Critical/High security or data-integrity finding.
- No duplicate conversion, quote-history mutation, reminder duplication, or webhook idempotency defect.
- Staff can identify due/overdue/waiting work from normal UI without workaround database access.
- Real quote lifecycle and follow-up workflow operate without architectural workaround.
- Complete recovery responsibility is proven for the production instance, including representative private documents and Auth reconstruction.
- Supabase production plan/availability/backup choice is explicit; any Free-plan exception has a documented external recovery and availability-risk decision.
- Real sender-domain authentication and transactional email behavior are verified, including resolution of any ambiguous provider outcome without uncontrolled duplicate sends.
- Owner/Admin MFA is enabled and verified.
- POPIA-oriented privacy/incident/cross-border/retention ownership and procedures are accepted by the responsible parties.
- Pilot findings are classified; client-specific preferences are not silently promoted to universal domain rules.
- Final production regression passes.

## STOP conditions

Use the same genuine blocker/safety principles as `AGENTS.md`, plus do not perform irreversible remote production mutations when account/target ownership or rollback is unclear.
