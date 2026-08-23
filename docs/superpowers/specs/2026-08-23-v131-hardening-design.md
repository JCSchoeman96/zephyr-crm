# Zephyr CRM v1.3.1 Hardening Design

**Date:** 2026-08-23
**Scope:** RH01–RH06 release-candidate hardening only

## Goal

Bring the current v1.3.1-authority Zephyr CRM checkout to a reproducible,
security-hardened, CI-enforced pilot-ready release-candidate state without
redesigning the CRM or starting a pilot, production deployment, DNS change, or
live provider operation.

The working source of remediation requirements is the complete RH01–RH06
programme supplied in the current `/goal`. The referenced
`docs/hardening/ZEPHYR_CRM_REAUDIT_REVISED_HARDENING_v2.md` is not present in
the current checkout, `origin/main`, or any local ref. This absence is recorded
as a provenance gap; it does not change the higher-priority v1.3.1 authority.

## Architecture

Hardening is additive and boundary-focused. PostgreSQL remains durable truth,
RLS remains the row-visibility boundary, and trusted functions are used only
for cross-resource workflow, provider evidence, automation, provenance, and
privileged actions. Ordinary editable business fields continue through the
existing authenticated CRUD paths when the frozen security matrix permits
them. Database triggers/defaults and narrowed grants prevent those paths from
writing trusted fields or system evidence.

The release proof has two layers. Tracked authority, a tracked mandatory-test
registry, and a tracked release manifest define what must be proved. Current
execution generates evidence tied to the exact Git SHA and records command,
assertion, classification, and result. `.agent/` remains recovery state, never
the sole release authority.

External provider operations remain behind the project-owned SendPulse REST
adapter. Every send intent follows prepare/claim → external attempt →
definitive success, definitive failure, or unknown. Unknown and provider
success with local persistence failure block blind retry and require trusted
reconciliation. Quote and reminder sends use the same logical
`outbound_messages`/`outbound_message_attempts` model; the migration extends
the existing reminder fields additively rather than introducing a second send
state machine.

## Slice boundaries

### RH01 — authority, test, and release truth

Replace ceremonial P14 evidence with executable/static/composed/external
registry entries; make P14 non-terminal and let only the global final gate
write `COMPLETE`/`PILOT_READY`; add a reproducible release manifest and exact
SHA-bound generated evidence. Keep authority version `v1.3.1` separate from
application RC identity `v1.0.0-rc.N`.

### RH02 — protected mutation and evidence boundaries

Add forward database protections for trusted initial Lead state, conversion
lineage, Task system fields, OutboundMessage writes, and system Activity event
types. Preserve allowed manual CRUD and add a narrow trusted note action if the
existing UI requires staff notes. All elevated functions have explicit safe
search paths, actor/profile/role/status/domain checks, and restricted grants.

### RH03 — Bricks boundary

Enforce a UUID-style submission identity, explicit unknown-field policy, bounded
allowlisted inputs, and full method/content-type/auth/form/schema/idempotency
coverage. Preserve the 64 KiB limit and original phone display text while only
normalizing unambiguous E.164 values. Hosted edge rate limiting remains an
external deployment gate.

### RH04 — external delivery reliability

Extend the existing logical-key/attempt model to reminders, add explicit
`submission_unknown` handling, prevent provider re-send after ambiguous or
post-success local persistence failure, and make reconciliation idempotent.
Automation runs become `running`, `succeeded`, `partial_failure`, or `failed`;
duplicate completed run IDs return the stored result and never reset state.

### RH05 — CI and governance

Keep existing exact-pinned Bun/SvelteKit/Supabase/Workers tooling. Add
understandable CI jobs with timeouts for authority, static, security,
database/domain, browser/build, release-contract, type-drift, and diff gates.
Generated database types are compared to a temporary file. Repository main
protection is configured only after the local workflow is validated and only
with the minimum solo-maintainer-safe required checks.

### RH06 — pilot auth/readiness

Raise the supported password baseline, enable/configure local MFA capability
where the pinned Supabase version supports it, preserve AAL2 database checks,
and add real local auth-flow proof where the local stack can provide it.
Hosted-only controls are documented as deployment gates. Operational docs and
README describe the Worker + Static Assets model, uncertainty/reconciliation,
MFA prerequisites, RC semantics, and the intentionally unstarted pilot/
production lifecycle.

## Failure handling

Database changes are forward-only migrations. No historical migration is
edited. Local resets are allowed only against the disposable local Supabase
stack. Provider tests use a deterministic fake HTTP server; no live SendPulse,
Bricks, DNS, production database, or client infrastructure is contacted.

When a provider acknowledgement is unknown, the CRM records uncertainty and
blocks automatic retry. When the provider returns an ID but finalization fails,
the provider ID and logical key are retained or recoverable through a trusted
reconciliation path; a retry cannot call the provider again. Errors and
diagnostics are redacted and bounded.

## Validation

Each slice runs focused failing-then-passing tests first, followed by the
affected authority/security/domain regression tier, relevant format/type/lint
checks, and `git diff --check`. The final gate runs the complete current
P0–P14 mandatory suite, authority/hash/registry checks, build/browser/database
proof, CI configuration validation, and a clean working-tree/diff/marker audit.

Local proof is never labelled as external proof. DNS, hosted edge controls,
real provider deliverability, live deployment, human pilot observation, and
elapsed pilot outcomes remain explicitly external/not-started.
