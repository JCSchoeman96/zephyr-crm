# Zephyr CRM

Zephyr CRM is a SvelteKit 2 + Svelte 5 application built by Vite for Cloudflare Workers with Static Assets. The current foundation includes the tokenized design system, responsive application shell, invitation-only Supabase Auth, PostgreSQL schema, role-aware RLS, and a complete local Lead → Quote → SendPulse → Task → Client tracer bullet.

The current application release candidate is `v1.0.0-rc.1` under the frozen
`v1.3.1` authority. Stable `v1.0.0` is intentionally post-pilot. The local
release target is `LOCAL_BUILD_COMPLETE` / `PILOT_READY`; `pilot_status` remains
`NOT_STARTED` and `production_status` remains `NOT_LAUNCHED`.

## Requirements

- Bun 1.2 or newer
- Docker Desktop or a compatible Docker Engine for Supabase local development
- Git

Bun is the only JavaScript package manager and `bun.lock` is the only JavaScript lockfile.

Bun is also the pinned runtime for Zephyr-owned scripts, tests, release evidence,
fixtures, and maintenance commands. Vite owns application bundling, Wrangler
runs the local Worker, Cloudflare workerd runs the deployed Worker, and Supabase
provides PostgreSQL, Auth, and Storage.

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
bun run auth:readiness
bun run test:p4:domain
bun run test:p4:tracer
bun run test:p5:leads
bun run test:p6:clients
bun run test:p7:quotes
bun run db:stop
```

The Supabase CLI is executed through `bunx`, so a separate global installation is not required. Phase 3 adds the first canonical identity, schema, and RLS migration; `supabase/seed.sql` loads deterministic non-secret baseline data. Later phases extend the schema only through their authorized migrations.

Local Auth is invitation-only: project-level signup is disabled, while the
email provider remains available for invited/admin-provisioned users. The
local pilot baseline requires passwords of at least 12 characters with upper,
lower, digit, and symbol requirements, secure password changes, and TOTP
enrollment/verification. `bun run auth:integration` proves the application
server action and session cookie; `bun run auth:readiness` proves the real
local Supabase Auth flow from AAL1 denial through TOTP verification to AAL2
privileged-action success and logout.

## Quality commands

```sh
bun run format:check
bun run lint
bun run check
bun run test:unit -- --run
bun run test:e2e:install       # once per machine
bun run test:e2e
bun run build
bun run auth:csrf             # production Worker cross-origin mutation denial
bun run security:bundle
bun run tokens:check
bun run ci:contract
bun run release:evidence:verify
bun run release:manifest:verify
bun run test:release:contract
bun run db:test                # with local Supabase running
bun run db:security             # role/RLS/constraint regression
bun run db:types:check          # generated public-schema drift
bun run auth:integration        # server action and cookie integration
bun run auth:readiness          # local TOTP/AAL2 readiness contract
bun run db:types                # inspect generated public schema types
bun run test:p4:domain          # trusted domain action contract
bun run test:p4:tracer          # full local CRM tracer bullet
bun run test:p5:leads           # Lead state, intake, list, assignment and query-plan contract
bun run test:p6:clients         # Client/contact conversion, rollback, dedupe and history contract
bun run test:p7:quotes          # Quote money, numbering, lifecycle, immutability, revisions and editor conflict contract
bun run test:p8:documents        # documents, SendPulse acknowledgement and uncertainty contract
bun run test:v131:communications
bun run test:p9:automation
bun run test:p10:analytics
bun run test:p11:hardening
bun run test:p12:hardening
bun run test:p13:template
bun run test:p14:release         # non-terminal P14 readiness gate
bun run release:evidence:run -- --plan
bun run diff:check
```

The complete local gate is `bun run quality` after Supabase is running and the Playwright Chromium browser is installed. The CI workflow enumerates the same substantive gates across static, database/domain/security, browser/build, and release-contract jobs. `bun run build` generates/checks Cloudflare Worker types and writes the Worker plus Static Assets artifact to `.svelte-kit/cloudflare`. P14 proves non-terminal release readiness; the frozen flow is `P14 VALIDATING → P14 COMPLETE → FINAL_PROJECT_VALIDATION → COMPLETE` only after global validation passes.

The design-system component lab is available at `/system`. The invitation-only login is available at `/login` when the three browser-safe Supabase variables are configured. Authenticated staff can review the bounded Lead workflow at `/leads`, create and manage durable Quotes at `/quotes`, and review converted customers at `/clients`. Lead search, filters, assignment, attention, pause/resume, controlled reopen actions, Client conversion, contact primary semantics, source-Lead history, exact Quote money, trusted Quote state actions, immutable sent snapshots, and revisions are enforced through server actions and PostgreSQL functions. The full local Lead hardening contract is `bun run test:p5:leads`, the Client/contact contract is `bun run test:p6:clients`, and the Quote contract is `bun run test:p7:quotes`. See `docs/QUOTE_MANAGEMENT.md` for the Quote lifecycle boundary.

SendPulse outcomes are modelled as definitive success, definitive failure, or
`submission_unknown`; an uncertain provider outcome is reconciled and is never
blindly retried. Hosted WAF/rate limiting for Bricks intake, Auth abuse,
SendPulse webhooks, and automation invocation remains a deployment/pilot gate;
the Worker does not use an in-memory rate limiter.

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

## Cloudflare Workers smoke preview

```sh
bun run build
bun run preview
```

The preview uses Wrangler's local Worker runtime with Static Assets and does not publish or mutate remote infrastructure.
