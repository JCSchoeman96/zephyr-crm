# Supabase Keepalive Operations

The separate `zephyr-supabase-keepalive` Worker calls the read-only
`public.keepalive()` RPC each day at 04:15 UTC. Cloudflare logs record successful
and failed invocations without request credentials or response payloads. Run
`bun run keepalive:dry-run` to package the Worker locally.

For a hosted rollout, apply the keepalive migration to the intended Supabase
project before deploying the Worker. Confirm the dry run lists only the
intended migration; investigate any other pending migrations separately.

```sh
bunx supabase db push --linked --dry-run
bunx supabase db push --linked
bun run wrangler deploy --config workers/supabase-keepalive/wrangler.jsonc
```

The daily activity is best-effort for Free Plan projects. Supabase does not
guarantee that a keepalive call prevents an inactivity pause. Supabase documents
the Pro Plan as the option to avoid inactivity pauses; this is not a general
uptime guarantee. See the [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
