# Zephyr CRM Deployment and Release Gate

This is the release procedure for a local build that is ready for a separately authorized pilot. The current repository work is local-only: no Cloudflare, Supabase hosted, SendPulse, WordPress or production mutation is performed by the autonomous implementation loop.

## Required local gate

Run the commands from the repository root with the local Supabase project running:

```sh
bun run authority:verify
bun run db:reset
bun run check
bun run lint
bun run test
bun run build
bun run auth:csrf
bun run db:test
bun run db:security
bun run auth:integration
bun run auth:readiness
bun run test:v131:security
bun run test:v131:communications
bun run test:v131:recovery
bun run test:p8:documents
bun run test:p9:automation
bun run test:p10:analytics
bun run test:p11:hardening
bun run test:p12:hardening
bun run test:p13:template
bun run test:p14:release
bun run release:evidence:run -- --plan
bun run quality
```

`bun run quality` is the authoritative combined local gate, and the required CI
workflow enumerates its substantive commands in separate diagnosable jobs. It
includes the frozen authority check, formatting, lint, strict Svelte/TypeScript
checks, unit and browser tests, Cloudflare Worker + Static Assets build,
public-bundle secret scan, schema/RLS/security contracts, Auth/MFA readiness,
all phase acceptance contracts and `git diff --check`. A backup file or a
successful SQL dump by itself cannot satisfy the recovery gate.

## Environment and secret boundary

The browser receives only `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `PUBLIC_SITE_URL`. Service-role credentials, SendPulse credentials, Bricks webhook secrets, automation secrets, database URLs and backup encryption keys remain server-side or in the approved provider secret manager. The public bundle scan must pass after every build.

The hosted environment must use the frozen Bun/SvelteKit/Vite/Svelte 5/Supabase/Cloudflare toolchain, canonical migrations and the exact `bun.lock`. Cloudflare uses Workers with Static Assets and the SvelteKit Cloudflare adapter. Supabase must have an approved paid managed backup plan or the automated encrypted external backup described in `docs/OPERATIONS.md`; free-tier database existence is not recovery proof.

For repeatable isolated client instances, use the typed non-secret configuration and
local provisioning contract in `docs/CLIENT_DEPLOYMENT.md`. The application remains
one codebase with one Supabase/Cloudflare/SendPulse stack per client; credentials are
trusted environment values and never client configuration source.

## Migration and backup release sequence

1. Verify the authority hashes and inspect the migration list.
2. Apply migrations to a disposable/staging environment using the canonical Supabase migration workflow. Never edit an applied migration after a frozen release baseline.
3. Run the migration reset and forward-upgrade rehearsal, then run the database security matrix.
4. Create an encrypted external backup and complete a disposable restore, including private Storage bytes, quote mappings, Auth profile reconstruction and application integrity checks.
5. Run the full quality gate and review the diff for secrets, debug code, temporary markers, weakened assertions, unbounded reads and unauthorized role paths.

Rollback is forward-safe recovery, not an in-place destructive migration: stop the affected release, restore the last accepted encrypted bundle into a disposable replacement stack, verify integrity and then switch the separately authorized client endpoint. Applied migrations remain immutable; a rollback never rewrites migration history.

## Integration readiness checks

Before a separately authorized pilot, an operator must verify the production Bricks form ID and secret, SendPulse sender-domain authentication and webhook secret, cron secret, redirect URLs, private Storage policy, CSP origins, Cloudflare bindings and DNS. SendPulse webhook events must be authenticated and idempotent; uncertain provider outcomes must remain visible instead of being silently retried as new messages. Owner/Admin AAL2 requirements and invitation-only Auth provisioning must be verified in the hosted environment. Local provider outcomes use the `submission_unknown` reconciliation state and never trigger a blind second send.

The release gate requires both complete business journeys:

- Login → Bricks intake → Lead → Quote → Send → Reminder → conversion → Client;
- Login → Bricks intake → Lead → Lost → required reason.

Pilot approval is not production launch. The non-circular local sequence is
`P14 COMPLETE → FINAL_PROJECT_VALIDATION → COMPLETE`, with terminal statuses
`LOCAL_BUILD_COMPLETE` and `PILOT_READY`, while `pilot_status=NOT_STARTED` and
`production_status=NOT_LAUNCHED` remain explicit.
