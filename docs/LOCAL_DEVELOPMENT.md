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

The Phase 1 lifecycle proof is `bun run test:p1:lifecycle`. It starts the
isolated local Supabase stack, resets it, checks local status, and always
attempts `bun run db:stop` during cleanup.

Playwright Chromium is installed once with `bun run test:e2e:install`; browser tests run with `bun run test:e2e`.

`bun run db:security` exercises the local anonymous, viewer, sales, admin, owner, and suspended-user RLS boundaries, durable constraints, and optimistic locking. `bun run auth:integration` creates a disposable local Auth user, verifies the invitation-only server login action returns a session cookie, and removes that user afterward. Both commands require the isolated local Supabase stack to be running.

`bun run test:p4:domain` proves the transactional Lead/Quote/Task/Client actions through the local Supabase API. `bun run test:p4:tracer` starts a disposable SvelteKit server and deterministic local provider, then proves the authenticated Bricks webhook, retry idempotency, Lead UI, SendPulse adapter contract, follow-up task, Won conversion, and Lost path. It uses only disposable local users and rows and cleans them up afterward.

`bun run test:p5:leads` proves the Lead management hardening contract against the disposable local stack: the complete pipeline transition matrix, independent attention and pause metadata, lost/reopen authorization and Activity evidence, Bricks schema/form/error handling, accepted retry idempotency, same-email distinct enquiries, bounded pagination/search/filter rendering, assignment authorization, optimistic-lock concurrency, and representative PostgreSQL query plans. It starts a disposable local SvelteKit server and removes its namespaced users and rows afterward.

`bun run test:p6:clients` proves the Client/contact contract against the disposable local stack: individual and company conversion, idempotent retries, rollback after a forced mid-transaction failure, the single-primary contact invariant, unauthorized conversion, source Lead/activity preservation, and same-email distinct customer handling. It removes its namespaced users and rows afterward.

## Environment boundary

Browser-safe environment is limited to PUBLIC_SUPABASE_URL,
PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SITE_URL, and the optional
PUBLIC_CLIENT_CONFIG_JSON. The JSON value must contain only the validated
public projection: version, brand, locale, and customer-facing Quote
presentation defaults. It must not contain roles, state, prices/totals,
credentials, trusted environment values/names, secret references, or private
operational configuration; server/database code remains authoritative for
roles, lifecycle, and money.

The trusted-only runtime contract is SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, SENDPULSE_CLIENT_ID, SENDPULSE_CLIENT_SECRET,
SENDPULSE_API_BASE_URL, SENDPULSE_SENDER_EMAIL, SENDPULSE_SENDER_NAME,
SENDPULSE_WEBHOOK_SECRET, SENDPULSE_SENDER_DOMAIN, SENDPULSE_DKIM_SELECTOR,
SENDPULSE_SPF_RECORD, SENDPULSE_DKIM_RECORD, SENDPULSE_DMARC_RECORD,
SENDPULSE_DOMAIN_AUTHENTICATED, AUTOMATION_CRON_SECRET, BRICKS_FORM_ID, and
BRICKS_WEBHOOK_SECRET. Real values are supplied through ignored local files or
the hosting/Edge Function secret store and are never committed or projected to
the browser.

The committed Worker configuration is the local deployment reference for the
Bricks form identifier. Keep `wrangler.jsonc`, `config/client.example.json`,
and the Playwright fixture on the same value; `bun run test:bricks:parity`
enforces that relationship. A live-site form identifier still requires an
approved deployment/configuration check and is not claimed by local tests.

## Local reset contract

Phase 3 owns the first canonical business migration. `bun run db:reset` recreates the isolated local database from zero, applies the identity/RLS schema, and loads deterministic lead sources, lost reasons, and non-secret app settings from `supabase/seed.sql`. No production or shared Supabase project is addressed by these commands.

## CI parity

`.github/workflows/ci.yml` runs the same formatting, lint, type, unit, browser, build, public-bundle, database lifecycle, and diff checks used locally. Database lifecycle and browser installation are explicit CI steps so failures are visible rather than hidden behind a composite command.
