# Zephyr CRM client deployment template

Phase 13 defines one reusable product codebase with one isolated stack per client:

```text
one Zephyr CRM codebase + one validated client configuration + one isolated stack
```

There is no multi-tenancy in the application database and no ClientA/ClientB source
fork. Each client receives an independently owned Supabase project/database, Auth
identity store, private Storage bucket, Cloudflare Workers project with Static Assets, domain/DNS zone,
SendPulse account, credentials, billing relationship, and encrypted backup bundle.
PostgreSQL remains the source of truth within each isolated stack.

## Configuration boundary

`config/client.example.json` is a complete non-secret template. Copy it to an
operator-owned ignored file, validate it, and supply the resulting JSON through
`CLIENT_CONFIG_JSON` for trusted server/provisioning use. The browser receives only
the approved `PUBLIC_CLIENT_CONFIG_JSON` projection containing brand, locale, and
quote presentation defaults. Secret values are never placed in either JSON file.

The typed contract covers:

- brand company name, logo path, and colors;
- locale language, IANA timezone, currency, and date format;
- quote prefix, tax label/rate, validity, terms, and bank details;
- follow-up and stale-lead rules and default owner email;
- sender identity, reply-to, and template identifiers;
- Bricks form identity and SendPulse endpoint/domain/template identifiers;
- references to the approved trusted environment variables for webhook/API secrets.

Validate before any build or provisioning action:

```sh
bun run client:validate -- config/client.example.json
```

The validator rejects missing or malformed values, unsupported timezones, invalid
currency/prefix/ranges, inline credentials, and unapproved trusted environment
references with path-specific errors.

## Fresh local provisioning

Run the local Supabase stack first. The reset flag is explicit and refuses non-local
endpoints. It applies canonical migrations and seed data, creates or refreshes a
known local Auth Owner through the trusted admin API, assigns the Owner profile via
`provision_invited_profile`, and upserts all non-secret baseline settings. No manual
SQL edit is part of onboarding.

```sh
PROVISION_OWNER_EMAIL=owner@example.test \
PROVISION_OWNER_PASSWORD='use-a-local-test-password-of-at-least-12-chars' \
CLIENT_PROVISION_RESET=true \
bun run client:provision -- config/client.example.json
```

The password is a local operator input only. Hosted environments use the approved
invitation flow, password reset/re-invite expectations, and MFA re-enrolment from
`docs/OPERATIONS.md`; passwords are not stored in client configuration or source
control.

## Local release artifact

The deployment-compatible artifact is produced without publication:

```sh
bun run build
bun run security:bundle
```

The build uses Vite, SvelteKit, the Cloudflare adapter, Wrangler, and
`wrangler.jsonc` with `main: .svelte-kit/cloudflare/_worker.js` plus an
`assets.directory` binding for `.svelte-kit/cloudflare`. The local build proves artifact
compatibility only. It does not prove hosted Cloudflare bindings, DNS, TLS, sender
authentication, or real email delivery.

The shared application release candidate uses `v1.0.0-rc.N` semantics under
the frozen `v1.3.1` authority. Stable `v1.0.0` is post-pilot and must not be
claimed by this local build. The local Supabase Auth baseline is invitation-only
with public signup disabled, a 12-character strong password policy, secure
password changes, and TOTP enrollment/verification. The Owner/Admin AAL2
boundary remains enforced in the database; `bun run auth:readiness` proves the
local enrollment and privileged-action path.

## Deterministic onboarding and ownership

For a separately authorised future client deployment:

1. The client creates and retains ownership of Cloudflare, Supabase, the domain/DNS
   account, and SendPulse, including billing, recovery contacts, and MFA devices.
2. The implementer receives least-privilege deployment access, records the client
   configuration version, validates the non-secret configuration, and provisions a
   disposable/staging stack from canonical migrations.
3. The client supplies trusted credentials through the provider secret manager or
   ignored `.dev.vars` equivalent: Supabase service role, SendPulse API/webhook
   secrets, Bricks webhook secret, and the automation secret.
4. The operator configures a Bricks webhook to the client endpoint, the SendPulse
   sender identity/webhook, private Storage policy, redirect URLs, and scheduled
   reminder invocation, then runs the complete quality and recovery gates.
5. The operator hands over the project identifiers, configuration version, backup
   ownership, runbooks, recovery contacts, and unresolved pilot checks. The client
   accepts account ownership and support boundaries before pilot approval.

Hosted abuse controls must be configured at the edge/platform boundary for
Bricks intake, login/Auth, SendPulse webhooks, and scheduled automation. Do not
add a process-local Worker rate limiter and do not treat local fixtures as
proof of hosted WAF/rate-limit behavior.

## Updates and versioning

The repository version is the shared product version. A client instance records the
deployed application version and client configuration version separately. Updates
are forward-only:

1. create an encrypted backup and verify a disposable restore;
2. rehearse canonical migrations against a disposable copy;
3. validate the new release and merge configuration by explicit review;
4. apply migrations, deploy the same artifact to the client's owned project, and
   run smoke/security/recovery checks;
5. record the release and migration versions in the handoff.

Applied migrations are not rewritten. Rollback means restoring the last accepted
encrypted bundle into a replacement isolated stack and switching the separately
authorised endpoint; it is not a destructive in-place reset. Configuration and
business data are retained because the update does not introduce a per-client
schema or source fork.

## Offboarding dry run

Offboarding is independent per client. Export the client's database/migrations,
private Storage artifacts and quote mappings, encrypted backup manifest, Auth
profile/role/status reconstruction instructions, configuration version, and
provider identifiers. Transfer the bundle and account ownership directly to that
client, revoke implementer access, disable Bricks/SendPulse/cron credentials, and
retain or delete the bundle only under the client's written instruction and the
POPIA retention decision. Another client's stack, schema, storage, secrets, and
backup are not referenced or copied.

## External/manual boundary and pilot separation

The local autonomous lifecycle does not create or mutate remote resources. The
following remain explicit post-build/manual checks for a future authorised
deployment and pilot:

- create the client-owned hosted Supabase project and apply canonical migrations;
    - create the client-owned Cloudflare Workers project, Static Assets binding, secrets, and domain;
- publish DNS/TLS records and verify redirect/CSP origins;
- authenticate the client sender domain in SendPulse, including SPF, DKIM, and DMARC;
- configure the client Bricks webhook/form ID and verify the trusted secret;
- configure scheduled reminder invocation and hosted Auth/AAL2/MFA policy;
- configure password minimum/complexity, secure password changes, invitation-only
  access, TOTP enrollment/verification, recovery devices and re-enrollment ownership;
- send real controlled messages and observe provider uncertainty, bounces, and
  webhook idempotency;
- complete client staff invitation, recovery, handoff, and pilot acceptance.

These are not claimed by `bun run build`, local mocks, or local provider contracts.
The local terminal state is `LOCAL_BUILD_COMPLETE`, `PILOT_READY`,
`pilot_status=NOT_STARTED`, and `production_status=NOT_LAUNCHED` until the separate
post-build pilot programme authorises and records those actions.
