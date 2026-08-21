# Database Security Contract

Phase 3 establishes the local PostgreSQL/Auth boundary for Zephyr CRM. PostgreSQL is the durable source of truth; the browser receives only the publishable Supabase URL/key and never receives a service-role or provider secret.

## Identity and roles

Supabase Auth owns identity. An `auth.users` insert creates a matching `public.profiles` row with role `viewer` and status `invited`. Staff access is invitation-only: public signup and anonymous sign-in are disabled in `supabase/config.toml`. The application permits normal CRM access only for profiles with status `active`.

The profile roles are `owner`, `admin`, `sales`, and `viewer`; profile statuses are `invited`, `active`, and `suspended`. Profile privilege changes are protected by a database trigger. An authenticated browser session cannot self-escalate its role or status.

## Schema boundary

The Phase 3 migration creates `profiles`, `app_settings`, `lead_sources`, `lost_reasons`, `leads`, `clients`, `client_contacts`, `quotes`, `quote_items`, `tasks`, `activities`, `outbound_messages`, `message_events`, and `inbound_submissions`. Foreign keys, check constraints, uniqueness, timestamps, and lock versions are enforced in PostgreSQL. Leads and quotes use optimistic `lock_version` checks. Activities are append-only, and sent/terminal quote commercial fields are immutable.

The `private` schema contains only hardened helper functions used by RLS and triggers. They use a fixed search path and are granted only the narrow execution privileges needed by the authenticated role or Auth trigger owner. No broad admin bypass function is exposed through the Data API.

## RLS policy

RLS is enabled on every exposed business table. Anonymous table access is denied by explicit grants and RLS. Active viewers can read permitted CRM data but cannot mutate it. Active sales users can perform CRM lead/client/contact/quote/task/message operations but cannot mutate profiles, settings, secrets, or integration configuration. Admin and owner users receive the documented management permissions; owner-only privilege changes remain protected by the profile trigger. Suspended and invited profiles cannot continue normal CRM reads or writes.

The migration grants only the table and sequence privileges required by these policies. The local database advisor reports no security issues after reset.

## Reset and proof

```sh
bun run db:start
bun run db:reset
bun run db:test
bun run db:security
bun run auth:integration
bun run db:stop
```

`supabase/seed.sql` is deterministic and contains no credentials. `scripts/test-database-security.mjs` proves anonymous denial, role boundaries, suspension, durable constraints, RLS coverage, and stale optimistic-lock rejection. `scripts/test-auth-session.mjs` proves that an active invited user can sign in through the SvelteKit server action and receive a session cookie.
