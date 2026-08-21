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
bun run db:stop
```

Playwright Chromium is installed once with `bun run test:e2e:install`; browser tests run with `bun run test:e2e`.

## Environment boundary

Only `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `PUBLIC_SITE_URL` are browser-safe. `SUPABASE_SERVICE_ROLE_KEY`, `SENDPULSE_CLIENT_ID`, `SENDPULSE_CLIENT_SECRET`, and `BRICKS_WEBHOOK_SECRET` are trusted-only variables. Real values are supplied through ignored local files or the hosting/Edge Function secret store and are never committed.

## Local reset contract

Phase 1 includes no CRM migrations. `supabase/seed.sql` executes a no-op query so `db:reset` is deterministic without inventing future business tables. Domain migrations are added only by their authorized roadmap phase.

## CI parity

`.github/workflows/ci.yml` runs the same formatting, lint, type, unit, browser, build, public-bundle, database lifecycle, and diff checks used locally. Database lifecycle and browser installation are explicit CI steps so failures are visible rather than hidden behind a composite command.
