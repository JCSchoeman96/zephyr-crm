# Zephyr CRM Operations and Recovery

This document is the local operational contract for a pilot-ready Zephyr CRM build. It describes the evidence required before a hosted environment is accepted. It does not represent a production deployment or a completed pilot.

## Ownership and retention

The CRM owner is accountable for the business recovery decision. A named operations administrator owns the backup schedule, restore evidence and secret-manager access. The application administrator owns integration diagnostics and incident coordination. A client handoff must name these people, the approved data-retention period and the date on which access is removed.

The approved baseline is an automated, encrypted backup outside the application repository and outside the primary database service. The minimum retention is 30 days, with the schedule, destination and encryption-key owner recorded in the client handoff. `BACKUP_RETENTION_DAYS` controls local tooling retention; a hosted scheduler must enforce the same or a longer policy. Backup output must be written to a durable external location and must not be a free-tier database backup presented as a recovery plan.

## Auth and MFA pilot prerequisites

The local Auth baseline is invitation-only: project-level public signup and
anonymous sign-in are disabled, while the email provider remains available for
admin-provisioned/invited users. The local configuration requires passwords of
at least 12 characters with upper/lowercase letters, digits and symbols, uses
secure password changes, and enables Supabase TOTP enrollment and verification.

`bun run auth:integration` proves the application login server action returns a
session cookie for an active invited user. `bun run auth:readiness` provisions a
disposable Owner, proves a fresh AAL1 session is denied an AAL2-protected
setting action, enrolls and verifies a real TOTP factor through local Supabase
Auth, proves the resulting AAL2 session can execute that action, and proves
logout clears the session. Synthetic AAL2 JWT tests remain database-boundary
tests; they do not replace this local Auth flow.

Before a hosted pilot, the named Owner/Admin must complete TOTP enrollment,
verify a privileged action at AAL2, and record recovery devices and the
re-enrollment owner. A password reset or re-invite is required after recovery
because password hashes and MFA secrets are not portable in the backup bundle.
Hosted Auth must retain invitation-only access, secure HTTPS cookies, disabled
public signup, suspended-user denial, and explicit logout/session-expiry
behavior. The browser cannot choose role or status.

## Hosted edge controls and external evidence

The local Worker deliberately does not implement an in-memory rate limiter.
The hosted operator must configure and evidence edge/platform controls for
Bricks intake abuse, login/Auth abuse, SendPulse webhook abuse, and scheduled
automation invocation (for example Cloudflare WAF/rate limiting or the
equivalent approved hosting controls). SPF, DKIM, DMARC, real deliverability,
live DNS/TLS, human staff observation, and elapsed pilot evidence are external
gates and are never represented as local PASS.

All SendPulse side effects use the prepare/claim → external attempt →
definitive-success, definitive-failure, or `submission_unknown` model.
`submission_unknown` is a safe hold: reconciliation must establish provider
identity before any further state transition, and normal retries must not issue
a blind second send.

## Durable input boundaries

Ordinary authenticated Client, ClientContact, and Task CRUD remains available;
trusted workflow/provenance/evidence fields remain action-owned. The database
enforces the durable input contract after application/schema validation:

- names are bounded to 120 characters, display/company names to 240, email to
  320, phone display values to 80, and task/quote free text to 10,000;
- Bricks attribution/URL fields retain their existing 120/160/2,000-character
  limits, and external submission IDs remain UUID-style and at most 128;
- billing and identity fields use broad finite limits appropriate to their
  purpose; pause/lost/acceptance/note evidence is capped at 2,000 characters;
- provider IDs are capped at 255, provider/error strings at 1,000, and stored
  provider/activity metadata at 64 KiB.

The forward migration `20260823120000_rh06_input_persistence.sql` applies these
checks without changing ordinary field ownership or normal valid CRUD. The
database security and P12 hardening tests exercise the allowed CRUD path and
reject oversized durable values.

## What is backed up

`bun run backup:create` creates an AES-256-GCM encrypted bundle containing:

- PostgreSQL `public` and `private` schema DDL and data, including migrations;
- quote document mappings, private `quote-documents` object metadata and the PDF bytes;
- Auth identity reconstruction metadata and application profiles, without password hashes, access tokens or MFA secrets;
- `supabase/config.toml`, `wrangler.jsonc`, safe example configuration and `bun.lock`;
- a manifest containing SHA-256 hashes, backup version, retention and restore requirements.

The bundle does not contain `.env`, `.dev.vars`, service-role keys, SendPulse credentials, webhook secrets, passwords or token values. The encryption key is supplied through `BACKUP_ENCRYPTION_KEY` and must be stored in the approved secret manager. Never place it in a repository file or command history.

Example local creation, using a disposable local output directory:

```sh
BACKUP_ENCRYPTION_KEY="<32-byte-hex-secret>" \
BACKUP_OUTPUT_DIR="/var/backups/zephyr-crm" \
bun run backup:create
```

For a hosted run, set `BACKUP_DATABASE_URL` to the approved PostgreSQL connection string and provide `PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` through the runtime secret manager. The database major version must match the application environment. The service-role key is read by the server-side backup process only.

## Restore drill

A file existing in a backup directory is not recovery evidence. A restore is accepted only after the encrypted bundle decrypts, every manifest hash verifies, PostgreSQL restores into a disposable target, application integrity counts are returned, and private Storage objects are restored and hash-checked.

The local rehearsal is:

```sh
createdb zephyr_crm_restore_<run-id>
BACKUP_ENCRYPTION_KEY="<same-32-byte-secret>" \
BACKUP_RESTORE_DISPOSABLE=true \
BACKUP_RESTORE_DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:54332/zephyr_crm_restore_<run-id>" \
bun run backup:restore -- /var/backups/zephyr-crm/zephyr-crm-<timestamp>.tar.gz.enc
```

The disposable target must be PostgreSQL 17 for the current baseline and must never be a production or shared database. The restore tool creates a minimal Auth reference schema solely to validate database reconstruction. In a real Supabase recovery, Auth identities are recreated through the approved admin invitation flow; password reset or re-invite is required and every user must re-enrol MFA. Password hashes and MFA secrets are intentionally not restored.

The manifest records `password_reset_or_reinvite_required=true` and `mfa_reenrollment_required=true` as explicit recovery evidence.

After database restore, the operator uploads the extracted private object bytes to the replacement private Storage bucket, verifies each SHA-256 hash against the manifest, and verifies each quote's `document_path` and `document_hash`. The application must then pass the full local quality gate and the Won/Lost recovery journeys before the restore is considered complete.

## Operational diagnostics

Owner and Admin users can open `/operations` or call `GET /api/diagnostics`. The endpoint is server-authorized and returns redacted evidence only:

- last accepted and failed Bricks intake activity;
- last accepted SendPulse send, last webhook event and failed outbound counts;
- last reminder processor run, status and failed reminder counts;
- recent error and critical event summaries without payload metadata.

Operational event messages must not include passwords, tokens, service keys or unnecessary full PII. Failed integration actions remain idempotent and auditable through the existing outbound, message-event, task and Activity records.

## Incident procedure

1. Contain the incident: disable the affected trusted integration, suspend compromised users and preserve the relevant redacted diagnostics and timestamps.
2. Rotate the affected secret in the secret manager and provider, then invalidate old credentials. Do not print the old value.
3. Record scope, affected records, first/last observed time and responsible operator. Preserve audit evidence and avoid editing append-only Activity history.
4. If data integrity is in doubt, perform the disposable restore drill before any customer-facing recovery. Reconcile quote document hashes, outbound uncertainty and reminder claims against provider evidence.
5. Apply the POPIA response and notification procedure appropriate to the verified incident scope. The CRM is not a substitute for legal advice or a statutory notification decision.
6. Re-enable integrations only after authorization, webhook authentication, idempotency and diagnostics checks pass. Record the recovery result in the client handoff.

## Client handoff and offboarding

The handoff packet must name the CRM owner, operations administrator, backup destination, retention, restore-test date, secret rotation owner, Supabase project, Cloudflare Workers project/Static Assets binding, SendPulse account and Bricks form owner. It must state that pilot and production launch are separate approvals.

On offboarding, export only the approved client data, revoke staff and provider access, rotate trusted secrets, retain or delete backups according to the signed retention policy, and record deletion evidence. Never leave a service-role key or private document copy in the repository, local workspace or an unowned backup location.
