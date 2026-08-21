# Post-Build Pilot Programme

**Status:** Outside the autonomous local build roadmap  
**Entry condition:** Phase 14 status is `LOCAL_BUILD_COMPLETE` / `PILOT_READY`  
**Execution mode:** Explicit future goal; may require remote/client-owned accounts and elapsed human observation

## Purpose

Validate the locally complete release candidate in a real client environment before declaring a production `v1.0.0` launch baseline.

This programme is deliberately separate because it can require remote infrastructure mutation, live DNS, real SendPulse/Bricks connectivity, real users, and observation over time. Those are not honest completion criteria for a single uninterrupted local coding loop.

## Pilot sequence

1. Provision a representative client using client-owned Cloudflare, Supabase, domain, and SendPulse accounts.
2. Apply migrations and baseline configuration.
3. Configure production domain/DNS and Cloudflare Pages deployment.
4. Configure SendPulse sender identity plus SPF/DKIM/DMARC and verify it.
5. Configure the real Bricks webhook and perform authenticated smoke submissions.
6. Verify production backup/recovery ownership and procedures.
7. Onboard real staff.
8. Observe real workflow across new enquiries, qualification, quote creation/revisions, sends, follow-ups, no-response cases, Lost reasons, Won conversion, dashboard, and reporting.
9. Reconcile sampled SendPulse submitted/delivered/bounced events with CRM records.
10. Collect feedback and classify every item as: Bug, Domain Flaw, UX Friction, Configuration Need, Client-Specific Preference, or Future Feature.
11. Fix only true production/v1 blockers; do not implement every preference.
12. Re-run security, data-integrity, backup/restore, Won/Lost E2E, migration, and release quality gates.
13. Freeze `v1.0.0` only after the pilot exit criteria pass.

## Pilot exit criteria

- No unresolved Critical/High security or data-integrity finding.
- No duplicate conversion, quote-history mutation, reminder duplication, or webhook idempotency defect.
- Staff can identify due/overdue/waiting work from normal UI without workaround database access.
- Real quote lifecycle and follow-up workflow operate without architectural workaround.
- Backup and restore responsibility is proven for the production instance.
- Real sender-domain authentication and transactional email behavior are verified.
- Pilot findings are classified; client-specific preferences are not silently promoted to universal domain rules.
- Final production regression passes.

## STOP conditions

Use the same genuine blocker/safety principles as `AGENTS.md`, plus do not perform irreversible remote production mutations when account/target ownership or rollback is unclear.
