# Local Development Contract

## Required commands

Use Bun for all JavaScript package and project commands. A clean checkout is prepared with:

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run gen
bun run check
bun run test:unit -- --run
bun run tokens:check
bun run build
```

Run `bun run authority:verify` before changing implementation. It verifies the SHA-256 hashes of `AGENTS.md`, the roadmap/phase authorities, and the five frozen Phase 0 documents.

Supabase local lifecycle is:

```sh
bun run db:start
bun run db:reset
bun run db:test
bun run db:security
bun run auth:integration
bun run test:p4:domain
bun run test:p4:tracer
bun run test:p5:leads
bun run test:p6:clients
bun run db:stop
```

Playwright Chromium is installed once with `bun run test:e2e:install`; browser tests run with `bun run test:e2e`.

`bun run db:security` exercises the local anonymous, viewer, sales, admin, owner, and suspended-user RLS boundaries, durable constraints, and optimistic locking. `bun run auth:integration` creates a disposable local Auth user, verifies the invitation-only server login action returns a session cookie, and removes that user afterward. Both commands require the isolated local Supabase stack to be running.

`bun run test:p4:domain` proves the transactional Lead/Quote/Task/Client actions through the local Supabase API. `bun run test:p4:tracer` starts a disposable SvelteKit server and deterministic local provider, then proves the authenticated Bricks webhook, retry idempotency, Lead UI, SendPulse adapter contract, follow-up task, Won conversion, and Lost path. It uses only disposable local users and rows and cleans them up afterward.

`bun run test:p5:leads` proves the Lead management hardening contract against the disposable local stack: the complete pipeline transition matrix, independent attention and pause metadata, lost/reopen authorization and Activity evidence, Bricks schema/form/error handling, accepted retry idempotency, same-email distinct enquiries, bounded pagination/search/filter rendering, assignment authorization, optimistic-lock concurrency, and representative PostgreSQL query plans. It starts a disposable local SvelteKit server and removes its namespaced users and rows afterward.

`bun run test:p6:clients` proves the Client/contact contract against the disposable local stack: individual and company conversion, idempotent retries, rollback after a forced mid-transaction failure, the single-primary contact invariant, unauthorized conversion, source Lead/activity preservation, and same-email distinct customer handling. It removes its namespaced users and rows afterward.

## Environment boundary

Only `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `PUBLIC_SITE_URL` are browser-safe. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENDPULSE_CLIENT_ID`, `SENDPULSE_CLIENT_SECRET`, `SENDPULSE_API_BASE_URL`, `SENDPULSE_SENDER_EMAIL`, `SENDPULSE_SENDER_NAME`, `BRICKS_FORM_ID`, and `BRICKS_WEBHOOK_SECRET` are trusted-only runtime variables. Real values are supplied through ignored local files or the hosting/Edge Function secret store and are never committed.

## Local reset contract

Phase 3 owns the first canonical business migration. `bun run db:reset` recreates the isolated local database from zero, applies the identity/RLS schema, and loads deterministic lead sources, lost reasons, and non-secret app settings from `supabase/seed.sql`. No production or shared Supabase project is addressed by these commands.

## CI parity

`.github/workflows/ci.yml` runs the same formatting, lint, type, unit, browser, build, public-bundle, database lifecycle, and diff checks used locally. Database lifecycle and browser installation are explicit CI steps so failures are visible rather than hidden behind a composite command.
