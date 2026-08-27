# Task automation contract

Phase 9 keeps `public.tasks` as the durable next-action record. The only Task
states are `open`, `completed`, and `cancelled`; completed and cancelled rows
are terminal. `overdue` and `due` are derived by `public.task_work_queue` from
`status = 'open'`, `due_at`, and `now()`. No Lead status stores overdue state.

The `automation_rules` application setting is the explicit configuration for:

- new Lead aging (`new_lead_aging_hours`, default 24);
- Quote follow-up timing (`follow_up_days`, default 3);
- stale active opportunity detection (`stale_opportunity_days`, default 14);
- Quote validity warnings (`quote_expiry_warning_days`, default 7) and expiry;
- reminder claim timeout and batch size.

`supabase/functions/process-reminders` is the trusted Supabase Cron boundary.
It claims due Tasks through `process_reminders`, sends the resulting
`task_reminder` OutboundMessage through the project-owned SendPulse REST
adapter, and records success/failure with `record_task_reminder`. Claims use
row locks, a run UUID, a timeout, and one unique OutboundMessage per Task. A
retry reuses that message and never creates another reminder intent.

The local SvelteKit endpoint at `/api/automation/process-reminders` is the
same trusted boundary for deterministic local integration tests. Both
boundaries require `AUTOMATION_CRON_SECRET`; the secret is never public.

Task creation, completion, rescheduling, cancellation, and reminder outcomes
append material Activity evidence. Won and Lost Lead transitions cancel open
Tasks with a lock-version increment; the Task activity trigger records each
closure. Quote send creates one configured, automation-keyed follow-up Task.

P14 hardening requires `create_task` to derive Quote-linked Lead/Client context
from the trusted Quote relationship and reject mismatching caller-supplied
parents. Non-Quote Tasks have exactly one direct Lead or Client parent. Direct
authenticated Task INSERT/PATCH/DELETE cannot bypass parent integrity,
assignment, lifecycle, terminal immutability, or optimistic locking. The work
queue projection exposes human business labels and links for Lead, Client, and
Quote context.

## v1.4.0 additive Fulfilment Tasks

Tasks remain concrete next actions. A FulfilmentCase adds the nullable
`fulfilment_case_id` parent and these task types:

```text
plan_fulfilment
schedule_installation
complete_installation
dispatch_order
confirm_delivery
prepare_pickup
confirm_collection
payment_follow_up
```

The trusted `create_task` action derives the Task's Client and Lead lineage
from the FulfilmentCase. It rejects any caller-provided parent IDs that do not
match that case. Existing non-Fulfilment Tasks continue to require exactly one
valid direct Lead or Client parent unless their existing Quote relationship
derives the lineage.

Payment follow-up is a Task concern. Creating or completing a
`payment_follow_up` Task does not change `PaymentMilestone.status`; the
milestone remains `awaiting` until a trusted user records `received` or marks
it `not_required`. Duplicate equivalent open follow-up Tasks should be
reused or rejected by a deterministic trusted boundary.

FulfilmentCase creation, step planning, payment requests, payment recording,
Task creation/completion, and terminal case transitions append Activity
evidence transactionally. Won/Lost Sales cleanup remains separate from
Fulfilment Task cleanup, so an accepted sale keeps its operational Tasks.
