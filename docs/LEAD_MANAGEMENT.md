# Lead Management Contract

Phase 5 completes the operational Lead domain without changing the frozen distinction between pipeline position, attention responsibility, and Task-derived next action.

## Durable behavior

- Leads retain source, attribution, contact, ownership, pipeline, attention, lost, conversion, lock, and last-activity data in PostgreSQL.
- Pipeline transitions are validated by `transition_lead` and `convert_lead`; `LOST` requires an active reason and `other` requires notes.
- Attention is independent from pipeline state and is limited to `none`, `waiting_on_client`, and `waiting_on_us`. Pause facts (`paused_at`, `pause_reason`, and optional `resume_at`) are orthogonal; overdue and follow-up conditions remain Task-derived.
- Owner/Admin-only `reopen_lead` returns a lost Lead to `QUALIFICATION`, clears lost metadata, and appends `lead_reopened` Activity.
- Material trusted actions advance `last_activity_at` and append immutable Activity evidence.

## Intake and list boundaries

Bricks intake is authenticated by the shared trusted secret, checks the configured form ID and bounded fields, normalizes the supported contact shape, and records rejected submissions when a stable external submission ID is available. `(source, external_submission_id)` is the idempotency boundary; email is never used as a deduplication key.

The `/leads` server load applies a maximum page size of 50, stable `id` tie-breaking, allow-listed sorting, bounded search fields, and authorized stage/attention/assignment filters. PostgreSQL remains authoritative; the browser receives only the requested page.

## Local release gate

```sh
bun run test:p5:leads
```

The contract creates disposable local Auth profiles and namespaced Lead data, checks the state and authorization rules through the local API, renders bounded authenticated pages, and reviews representative PostgreSQL query plans. It does not call SendPulse, WordPress, Bricks, Cloudflare, or production infrastructure.
