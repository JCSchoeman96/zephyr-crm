# Zephyr CRM Security Model

**Status:** Frozen implementation authority (Phase 0)
**Version:** 1.2.2 (v1.3.2 hardening amendment)

Security is enforced at the database and trusted-operation boundaries. UI hiding is not authorization.

## Identity and authentication

Supabase Auth is the identity authority. Staff accounts are invitation-only; public self-registration is not part of the product. Each Auth user has one Profile with role and status metadata. Initial Profile statuses are `invited`, `active`, and `suspended`; initial roles are `owner`, `admin`, `sales`, and `viewer`.

Owner/Admin privileged actions require the current session's AAL2/MFA claim.
The server must verify current authenticated identity and claims at the
trusted action boundary; a browser-supplied role, status, or
`raw_user_meta_data` value is never trusted.

The privileged Owner/Admin action classes requiring current-session AAL2 are:

- **User/role administration:** invitation/provisioning, role or status
  changes, suspension/reactivation, and privileged Profile access changes.
- **Integrations/security settings:** AppSetting changes, integration
  credentials or secrets, webhook authentication, and security configuration.
- **Exceptional reopen/correction:** `reopen_lead` and any exceptional
  lifecycle or data correction that is classified as privileged.
- **Recovery/admin actions:** backup/restore, recovery configuration,
  migration/repair administration, and other privileged recovery operations.
- **Other explicitly privileged actions:** any action explicitly classified as
  privileged by this `SECURITY_MODEL` or a higher-priority frozen authority.

Owner/Admin role membership alone is insufficient for these classes. The
current session must satisfy AAL2 when the operation executes, and the action
must still pass its role, status, RLS, domain, concurrency, and audit checks.

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

## Protected-field/action mutation matrix

RLS controls which rows a role can see and which ordinary fields it may edit;
it is not authority to write lifecycle, identity, provider, snapshot, lock, or
configuration fields. The following matrix is the frozen boundary for the
protected resources:

| Resource | Ordinary RLS CRUD | Protected fields/transitions | Trusted action boundary |
|---|---|---|---|
| Lead | Permitted contact, attribution, notes, and other explicitly editable Lead fields under row policy. | `pipeline_stage`, `attention_state`, `assigned_to`, lost-reason/notes, conversion link, pause/resume facts, normalized phone, and `lock_version`; terminal and lifecycle transitions. | `set_lead_attention`, `assign_lead`, `transition_lead`, `mark_lead_lost`, `reopen_lead`, `convert_lead`, `pause_lead`, and `resume_lead`. |
| Quote | Draft content and QuoteItems only through the authorized draft boundary and row policy. | Lead/Client associations, status, quote number/revision lineage, tax and server-calculated totals, seller/recipient/commercial `quote_snapshot`, document path/hash/provenance, acceptance fields, and `lock_version`; sent/terminal immutability. | Trusted Quote draft, ready/finalise, document, send, revise, accept, and cancel actions, including `save_quote_draft`, `mark_quote_ready`, `prepare_quote_send`, `complete_quote_send`, `revise_quote`, and `accept_quote`. |
| Task | Permitted title, description, due date, assignment, and work-detail edits under row policy. | Status and terminal timestamps, reminder status/claim/outbound link, parent associations, creator, and `lock_version`; completion, cancellation, rescheduling, and automation transitions. | `complete_task`, `reschedule_task`, `cancel_task`, and the trusted reminder processor/notification boundary. |
| OutboundMessage | No generic browser mutation; authorised reads and trusted creation only. | Logical idempotency key, provider identity/status/timestamps, attempt count, recipient snapshot, Lead/Client/Quote/Task associations, uncertainty/error evidence, and delivery observations. | Trusted quote-send and reminder-send boundaries, `prepare_quote_send`, `complete_quote_send`, `fail_quote_send`, `mark_quote_send_unknown`, `reconcile_quote_submission`, and `process_sendpulse_event`. |
| Profile | Personal fields explicitly allowed by Profile RLS, such as permitted name maintenance. | Auth identity link, email identity, role, status, suspension/access state, and other security attributes. | Invitation/provisioning administration and `set_profile_access`; role/status changes are never generic browser CRUD. |
| AppSetting | No generic CRUD for ordinary users; only the authorised settings path. | Every setting value and description, especially integration, security, sender, automation, and numbering configuration; secrets remain outside browser authority. | `set_app_setting` and the trusted client-configuration/admin settings boundary. |

The matrix is also enforced by database protected-field triggers and trusted
function checks. Activity remains append-only evidence: ordinary UPDATE/DELETE
is prohibited, while privileged corrections create separate security-audit
evidence.

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

## Trusted-mutation parity

The fully migrated schema is the effective authority. Every operation listed as
trusted-only is tested against raw authenticated Data API INSERT/PATCH/DELETE
attempts. Direct Client creation, protected Client status/source changes,
ClientContact primary/status changes, forged Task parents/lifecycle/ownership,
Lead pipeline/terminal mutation, Quote lifecycle/commercial mutation, Activity
updates/deletes, and OutboundMessage mutation must fail for ordinary roles while
the authorised trusted action succeeds. Useful RLS-secured reads remain
available; UI hiding is never the security boundary.

## Secret boundary

Browser-readable environment/configuration is limited to:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_PUBLISHABLE_KEY
PUBLIC_SITE_URL
PUBLIC_CLIENT_CONFIG_JSON
```

PUBLIC_CLIENT_CONFIG_JSON is optional and must contain only the validated
non-secret projection returned by parsePublicClientConfiguration: version,
brand, locale, and customer-facing Quote presentation defaults (prefix,
taxLabel, taxRate, defaultValidityDays, terms, and bankDetails). It is
presentation/configuration input only. It is not authority for roles, Profile
status, lifecycle state, prices/totals, server-calculated money, trusted
actions, or secrets; those remain server/database-owned. The public JSON must
not contain credentials, service-role values, API/webhook secrets, trusted
environment values or names, private operational configuration, or secret
environment-key references. The parser rejects fields outside this explicit
public shape, and the browser fixture passes the parsed projection rather than
the complete trusted configuration.

The complete trusted runtime environment contract is never sent to browser
code, built artifacts, public environment variables, database rows readable
through Data API, or logs:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SENDPULSE_CLIENT_ID
SENDPULSE_CLIENT_SECRET
SENDPULSE_API_BASE_URL
SENDPULSE_SENDER_EMAIL
SENDPULSE_SENDER_NAME
SENDPULSE_WEBHOOK_SECRET
SENDPULSE_SENDER_DOMAIN
SENDPULSE_DKIM_SELECTOR
SENDPULSE_SPF_RECORD
SENDPULSE_DKIM_RECORD
SENDPULSE_DMARC_RECORD
SENDPULSE_DOMAIN_AUTHENTICATED
AUTOMATION_CRON_SECRET
BRICKS_FORM_ID
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

## v1.4.0 additive Fulfilment authorization

The v1.4.0 amendment preserves the four existing roles and adds no separate
permission system. RLS still determines which rows a user can see, while
trusted actions determine whether a material transition is legal.

RLS is also enabled on `FulfilmentCase`, `FulfilmentStep`, and
`PaymentMilestone`. Their rows are visible only through the same authenticated,
non-suspended isolated-client boundary as the existing CRM resources.

| Action | Sales | Admin | Owner | Viewer |
|---|---:|---:|---:|---:|
| Work Sales queues | yes | yes | yes | read |
| Create/send/revise Quote | yes | yes | yes | read |
| Accept or decline current Quote | yes | yes | yes | read |
| Create/update Fulfilment steps | yes | yes | yes | read |
| Record payment received/not required | yes | yes | yes | read |
| Correct received payment evidence | no | yes | yes | read |
| Cancel FulfilmentCase | no | yes | yes | read |
| Complete FulfilmentCase | yes | yes | yes | read |

All mutation rows require an active authenticated Profile and the current
trusted boundary. Admin/Owner payment correction and case cancellation require
current-session AAL2/MFA, a non-blank reason, expected `lock_version`, and
Activity plus security-audit evidence. A viewer may read authorised records
but cannot invoke a mutation action.

The additive protected-field boundary includes FulfilmentCase status and
lineage, FulfilmentStep type/status/schedule/completion evidence,
PaymentMilestone type/status/actor/timestamps, and Fulfilment Task parent
relationships. Browser-supplied Client/Lead IDs for a Fulfilment Task are
validated against the server-derived case lineage and cannot grant access or
change ownership.

The trusted v1.4.0 action names are:

```text
start_lead_qualification
ready_lead_for_quote
accept_quote
revise_quote
decline_quote
create_fulfilment_step
dispatch_fulfilment_step
ready_fulfilment_step
schedule_fulfilment_step
reschedule_fulfilment_step
complete_fulfilment_step
cancel_fulfilment_step
request_payment_milestone
record_payment_received
mark_payment_not_required
correct_payment_milestone
complete_fulfilment
cancel_fulfilment
create_task
```

Raw authenticated INSERT/PATCH/DELETE on FulfilmentCase,
FulfilmentStep, PaymentMilestone, Fulfilment Task lineage, protected Lead
qualification/decision fields, or Fulfilment Activity must not bypass these
checks. Unique constraints, deterministic lock order, optimistic versions,
append-only Activity, and idempotent acceptance protect retries and concurrent
requests.
