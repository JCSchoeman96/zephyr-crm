# Zephyr CRM Security Model

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.2.1 (v1.3.1 reconciliation)

Security is enforced at the database and trusted-operation boundaries. UI hiding is not authorization.

## Identity and authentication

Supabase Auth is the identity authority. Staff accounts are invitation-only; public self-registration is not part of the product. Each Auth user has one Profile with role and status metadata. Initial Profile statuses are `invited`, `active`, and `suspended`; initial roles are `owner`, `admin`, `sales`, and `viewer`.

Owner/Admin privileged actions require the current session's AAL2/MFA claim when the action is classified as privileged. The application must verify current authenticated identity and claims server-side; a browser-supplied role, status, or `raw_user_meta_data` value is never trusted.

Suspended users are denied normal CRM access even if a previously issued session exists. Logout, session expiry, password reset/re-invite, and MFA re-enrollment expectations are documented in operational procedures and tested at the release gate.

## Authorization matrix

| Resource/action | Owner | Admin | Sales | Viewer |
|---|---:|---:|---:|---:|
| Read Leads | yes | yes | yes | yes |
| Create/update Leads | yes | yes | yes | no |
| Assign Leads | yes | yes | permitted staff | no |
| Convert, win, lose Leads | yes | yes | yes | no |
| Reopen terminal Lead | yes | restricted/admin policy | no | no |
| Read Clients/Contacts | yes | yes | yes | yes |
| Create/update Clients/Contacts | yes | yes | yes | no |
| Read Quotes | yes | yes | yes | yes |
| Create/update Draft Quotes | yes | yes | yes | no |
| Finalize/send/revise Quote | yes | yes | yes | no |
| Read Tasks | yes | yes | yes | yes |
| Create/update/complete Tasks | yes | yes | yes | no |
| Read reports | yes | yes | yes | yes |
| Read Activity | yes | yes | yes | yes |
| Append ordinary notes/activity | permitted action | permitted action | permitted action | no |
| Manage Profiles/invitations | yes | explicitly permitted admin subset | no | no |
| Manage AppSetting | yes | yes | no | no |
| Manage integration secrets | yes | restricted and audited | no | no |
| Read private Quote documents | yes | yes | yes | yes if row-authorized |

Every row-level rule also requires an authenticated, non-suspended Profile. Owner-only boundaries remain Owner-only when specified by an action.

## RLS law

RLS is enabled on every exposed business table, including Profiles, configuration, Leads, Clients, ClientContacts, Quotes, QuoteItems, Tasks, Activities, OutboundMessages, MessageEvents, InboundSubmissions, and reporting views/functions where applicable.

- Anonymous users cannot select, insert, update, or delete protected business rows.
- Viewer is read-only for business data and cannot invoke mutation actions.
- Sales cannot mutate Profiles, AppSetting, integration configuration, or secrets.
- Admin and Owner access follows the matrix exactly.
- Activity is append-only to ordinary users; updates/deletes are denied. Privileged corrections are represented by separate `security_audit_events` evidence.
- Reports expose only authorized rows/aggregates and use bounded date/limit parameters.
- Storage buckets containing Quote documents are private; access uses authorized signed URLs or trusted download actions.

Policies use database-derived identity and role from the authenticated JWT/profile relationship. User-controlled metadata, URL parameters, form fields, or browser state cannot grant authority.

## Trusted mutation boundaries

Use `SECURITY INVOKER` by default. Any `SECURITY DEFINER` function must be narrowly scoped, have a fixed safe `search_path`, fully qualified database objects, explicit input validation, explicit internal actor/role/status/domain checks, and restricted `EXECUTE` grants. No broad public or authenticated execute privilege is granted to privileged functions.

Trusted actions are the only place for cross-resource or secret-bearing operations:

```text
convert_lead
mark_lead_lost
reopen_lead
finalise_quote
send_quote
revise_quote
accept_quote
process_reminders
process_quote_expiry
invite_user
process_bricks_intake
process_sendpulse_event
```

Each action checks the current authenticated user, Profile status, role, AAL2 requirement where applicable, current row state, lock version, idempotency key, and all required relationships. The browser cannot choose an arbitrary resulting status or totals.

## Secret boundary

Browser-readable configuration is limited to:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_PUBLISHABLE_KEY
PUBLIC_SITE_URL
```

Trusted runtime secrets are never sent to browser code, built artifacts, public environment variables, database rows readable through Data API, or logs:

```text
SUPABASE_SERVICE_ROLE_KEY
SENDPULSE_CLIENT_ID
SENDPULSE_CLIENT_SECRET
BRICKS_WEBHOOK_SECRET
database passwords
session/signing secrets
```

The service-role key is used only by trusted server/Edge runtimes. Secrets are supplied through local/host secret stores, are absent from source control, and are rotated through documented operational procedures.

## Integration security

Bricks intake requires a client-specific shared secret in an Authorization header, a known form ID, bounded JSON/form payload size, schema validation, sane field lengths, valid email/phone formats, and a unique external submission ID. Invalid authentication, malformed payloads, unknown forms, oversized requests, and replayed submissions fail safely.

SendPulse calls run only through the project-owned adapter with trusted credentials. Provider webhook authentication/signature validation, event deduplication, mapping validation, and hard-bounce remediation are mandatory. Provider payloads never directly mutate arbitrary business fields.

## Input, output, and browser security

Zod or equivalent schema validation runs at untrusted boundaries. Untrusted names, messages, notes, and provider metadata are escaped according to rendering context. Rich HTML is not accepted unless sanitized by an explicitly approved path. The build emits a CSP and secure headers appropriate for the Cloudflare Worker + Static Assets runtime. No bulk CRM PII is intentionally persisted in localStorage or IndexedDB.

## Audit and POPIA operations

Material actions append Activity and privileged corrections append audit evidence with actor, time, action, target, and structured metadata. Operational procedures define data minimization, authorized access, retention, export, deliberate erasure, breach response, backup retention, and client offboarding consistent with applicable POPIA obligations. Audit evidence is not used as a destructive delete workaround.

## Recovery security

A valid recovery proof includes PostgreSQL data/schema, private Storage artifacts and mappings, Quote PDFs and hashes, configuration, Auth identity/profile/role/status reconstruction, suspension semantics, password reset/re-invite expectations, MFA re-enrollment requirements, and secret restoration procedures. A database dump alone is not recovery proof. Restore tests use disposable local environments and do not expose secrets.

## Security review gates

The final local gate must prove anonymous denial, role matrix behavior, suspended-user enforcement, secret absence from browser output, webhook rejection, XSS-safe rendering, private document denial, Activity append-only behavior, quote immutability, idempotency, optimistic concurrency, and recovery rehearsal. Production/pilot deployment remains outside this local loop.
