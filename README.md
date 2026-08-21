# Zephyr CRM

Zephyr CRM is a SvelteKit 2 + Svelte 5 application built by Vite for Cloudflare Pages. The current foundation includes the tokenized design system, responsive application shell, invitation-only Supabase Auth, PostgreSQL schema, and role-aware RLS. CRM business workflows are added in later roadmap phases.

## Requirements

- Bun 1.2 or newer
- Docker Desktop or a compatible Docker Engine for Supabase local development
- Git

Bun is the only JavaScript package manager and `bun.lock` is the only JavaScript lockfile.

## Install and run

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

The browser-safe environment contract is documented in `.env.example`. Trusted runtime variables belong in `.dev.vars` for Wrangler or the local Supabase/Edge Function secret store; use `.dev.vars.example` as the names-only template. Never commit either file containing secrets.

## Local Supabase lifecycle

```sh
bun run db:start
bun run db:reset
bun run db:test
bun run db:security
bun run auth:integration
bun run db:stop
```

The Supabase CLI is executed through `bunx`, so a separate global installation is not required. Phase 3 adds the first canonical identity, schema, and RLS migration; `supabase/seed.sql` loads deterministic non-secret baseline data. Later phases extend the schema only through their authorized migrations.

## Quality commands

```sh
bun run format:check
bun run lint
bun run check
bun run test:unit -- --run
bun run test:e2e:install       # once per machine
bun run test:e2e
bun run build
bun run security:bundle
bun run tokens:check
bun run db:test                # with local Supabase running
bun run db:security             # role/RLS/constraint regression
bun run auth:integration        # server action and cookie integration
bun run db:types                # inspect generated public schema types
bun run diff:check
```

The complete local gate is `bun run quality` after Supabase is running and the Playwright Chromium browser is installed. `bun run build` generates/checks Cloudflare Worker types and writes the Cloudflare Pages output to `.svelte-kit/cloudflare`.

The design-system component lab is available at `/system`. The invitation-only login is available at `/login` when the three browser-safe Supabase variables are configured. Its implementation contract is documented in `docs/DESIGN_SYSTEM.md`; it intentionally contains no CRM business API calls or feature screens.

## Project boundaries

Source is organized for the frozen architecture:

```text
src/lib/components/{ui,leads,clients,quotes,tasks,dashboard}
src/lib/domain/{leads,clients,quotes,tasks,communications}
src/lib/services/supabase
src/lib/types
src/lib/utils
supabase/{migrations,functions}
```

No service-role key, SendPulse credential, Bricks secret, database password, or client data belongs in browser source control or public variables. The database security contract is documented in `docs/DATABASE_SECURITY.md`.

## Cloudflare Pages smoke preview

```sh
bun run build
bun run preview
```

The preview uses Wrangler Pages locally and does not publish or mutate remote infrastructure.
