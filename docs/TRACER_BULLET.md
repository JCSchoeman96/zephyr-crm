# P4 Tracer Bullet Contract

The local end-to-end proof uses the permanent architecture:

```text
Bricks-compatible authenticated request
        ↓
trusted intake boundary → InboundSubmission → Lead → lead_created Activity
        ↓
authenticated Leads UI → Qualification → Proposal
        ↓
transactional Quote + QuoteItem → SendPulse adapter/provider contract
        ↓
submitted Quote → Decision / waiting_on_client → follow-up Task
        ↓
trusted conversion action → Won Lead → Client + primary Contact
```

The alternative path is tested from a fresh Lead: a Lost transition without a reason is rejected, while a transition with the seeded Price reason succeeds and appends `lead_lost` Activity.

## Trusted boundaries

- `supabase/functions/ingest-bricks-lead/index.ts` is the deployable Edge Function boundary. It validates a bounded JSON or form request, checks the shared Authorization secret, and calls the service-role-only `ingest_bricks_lead` database action.
- `/api/webhooks/bricks` is the equivalent local SvelteKit trusted boundary used by the disposable local tracer. It keeps the same secret, validation, service-role, and idempotency contract so local proof does not call a browser mutation path.
- `src/lib/domain/communications/sendpulse-adapter.ts` owns provider-specific OAuth and SMTP request/response mapping. The tracer runs it against a local deterministic provider contract; no remote SendPulse credentials or real send are required for local closure.
- `prepare_quote_send` and `complete_quote_send` separate the persisted
  outbound claim/submitting transition from provider acknowledgement.
  Completion is idempotent and atomically updates the Quote, Lead attention
  state, follow-up Task, and Activities.

## Proof commands

```sh
bun run db:reset
bun run test:p4:domain
bun run test:p4:tracer
```

The scripts create disposable local Auth users, provision them through the trusted invitation boundary, perform the workflow through HTTP/API boundaries, and remove their rows and identities in `finally` cleanup. They never call a remote provider or production infrastructure.
