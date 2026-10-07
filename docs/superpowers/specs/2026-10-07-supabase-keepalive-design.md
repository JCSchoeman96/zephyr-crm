# Supabase keepalive Worker design

## Goal

Run a small Cloudflare Worker once per day to call Supabase and execute a harmless database function. This gives the project recurring database activity without reading or changing CRM records.

## Approach

Add a separate Worker under `workers/supabase-keepalive/`, with its own `wrangler.jsonc` and scheduled handler. Its daily Cron Trigger runs at 04:15 UTC. Keeping it separate from the SvelteKit Worker lets the schedule and deployment configuration stay independent.

Add a forward-only Supabase migration that creates `public.keepalive()`. The SQL function returns `true`, uses invoker rights, and has a fixed `pg_catalog` search path. Revoke default execution from `PUBLIC` and application roles, then grant execution only to `anon`. It reads no application data and makes no writes.

The Worker calls `/rest/v1/rpc/keepalive` with the project's URL and publishable key. The publishable key maps this request to `anon`; it is already public application configuration. The Worker does not need a service-role key or a public HTTP handler. It reports successful and failed runs through structured Cloudflare logs, without logging keys or response payloads.

## Failure behavior

The scheduled handler treats a non-success response or a response other than JSON `true` as a failed ping and emits an error log. Network requests have a bounded timeout. The Worker does not retry by making a second database call in the same scheduled invocation.

## Validation and rollout

Validate the migration locally, generate and check Wrangler types for the separate config, run the scheduled handler against the local Supabase stack, and use Wrangler's dry-run packaging check. Do not deploy the Worker or apply the migration to hosted Supabase as part of this change. Document the deploy and hosted migration steps for a separately authorized rollout.

## Limit

Supabase says it may pause Free Plan projects that show low activity over seven days, and documents Pro as the way to guarantee no inactivity pause. Its documentation does not guarantee that a daily ping prevents pausing. This Worker is a best-effort measure, not an availability guarantee.

## Current documentation

- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Data API exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
