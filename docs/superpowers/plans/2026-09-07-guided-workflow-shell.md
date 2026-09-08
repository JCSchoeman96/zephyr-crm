# Guided workflow shell implementation plan

Goal: execute every ZUX requirement in the committed governing goal and deliver
one PR with local and exact-HEAD CI proof. Execute sequentially in the isolated
`ux/guided-workflow-overhaul` worktree. No inter-phase approval is needed.

Architecture: reuse SvelteKit server loaders, trusted actions, existing Svelte
components and presentation helpers. Change page hierarchy and bounded work
selection. PostgreSQL, RLS, lifecycle guards and commercial snapshots retain
authority. Stack and dependencies remain pinned as committed.

## Sequence and closure gates

1. ZUX-00 and ZUX-01: record the presentation amendment and route inventory in
   `docs/superpowers/specs/2026-09-07-guided-workflow-shell-design.md`; add narrow
   amendment notices to the affected architecture and older presentation specs.
   Refresh only their authorized registry entries. Preserve all other hashes.
   Verify authority registry/hash checks and this goal's checkpoint continuity.
2. ZUX-10 and ZUX-11: change `src/lib/components/shell/Sidebar.svelte` to five
   business destinations plus the current read-authorized administration group.
   Preserve `AppShell.svelte`, `Topbar.svelte` mobile/focus/sign-out behavior.
   Add focused presentation mappings to `src/lib/domain/presentation/labels.ts`
   only where existing helpers do not suffice. Test role visibility, current
   detail-route highlighting and absence of stage navigation.
3. ZUX-20 and ZUX-21: move analytics from `src/routes/+page.server.ts` and
   `+page.svelte` to `src/routes/reports/`; retain authenticated reporting access,
   date normalization and RPC formulas. Home loads operational facts and bounded
   due work. Test that Home omits analytics calls and Reports preserves results.
4. ZUX-30 through ZUX-32: add `src/routes/sales/+page.server.ts` and
   `+page.svelte`, selected server-filtered view and bounded work rows. Reuse
   sales projection types where useful without fetching every Quote revision.
   Preserve `/sales/[queue]` actions and deep links. Test New, Reviewing, Quote
   needed, Waiting, All and deterministic Needs attention selection, with more
   records than the page limit and no inline decision forms.
5. ZUX-40 and ZUX-41: reorganize `src/routes/leads/[id]/+page.svelte` around
   current next work. Directly link current Quote or Builder, prioritize paused
   resume, and show Customer/Fulfilment after Won. Keep original mutation
   actions and hidden locks. Remove the visible quick form only. Test all six
   stages, paused state, Viewer and privileged reopening.
6. ZUX-50 through ZUX-53: update `QuoteEditor.svelte`, `QuoteLineEditor.svelte`
   and `src/routes/quotes/[id]/+page.svelte`. Keep item editing and totals first;
   put low-frequency header settings in disclosure. Review quote invokes
   existing readiness; Ready to send presents preview and Send quote. Sent
   response selection reveals the existing acceptance/revision/decline forms.
   Cancellation stays secondary. Test unsaved lines, dimension requirements,
   stale catalogue review, ready editing, sent immutability and revision history.
7. ZUX-60 through ZUX-62: update `src/routes/tasks/+page.svelte` and its loader
   for preselected bounded record context. Link Add follow-up from Enquiry,
   Quote, Customer and Fulfilment. Preserve `create_task` lineage validation.
   Keep Complete/Open first and Reschedule/Cancel disclosed. Test creation from
   each parent type, due work, completion, invalid parent hints and Viewer denial.
8. ZUX-70 through ZUX-73: update `src/routes/clients/+page.svelte`, detail and
   `ClientMaintenance.svelte`/`ClientContacts.svelte`. Show identity/contact,
   billing and related work before provenance/history/maintenance. Preserve all
   contact-primary and archive/restore guards. Test readable labels, edit
   disclosure, archive reasons and source-lineage restrictions.
9. ZUX-80 through ZUX-83: add selected population queries in
   `src/lib/server/fulfilment.ts`, preserving current compatibility helpers.
   Update list and detail to one work view and ordered independent next actions.
   Explain incomplete steps/payments and fail closed on truncated detail.
   Test selected-view bounds, installation/courier/pickup actions, concurrent
   obligations, payment correction gates and full case completion.
10. ZUX-90 through ZUX-92: reuse the validated defaults handler in Settings and
    retain compatibility at Operations as needed. Show redacted System Health
    summaries with diagnostic disclosure. Rephrase Product list/detail and
    secondary lifecycle controls. Test settings AAL1 denial/AAL2 success, role
    denial, invalid input and snapshot independence from later defaults.
11. Final acceptance: update only explicitly superseded presentation assertions
    in existing browser tests. Add `tests/e2e/domain/guided-workflow.e2e.ts` for
    the five governing journeys. Inspect task-based usability and keyboard/mobile
    behavior at the three required viewports. Record actual results and remaining
    limits in `docs/GUIDED_WORKFLOW_ACCEPTANCE.md`.

For each meaningful behavior, write the focused failing test, observe the
failure, implement the change, then run the focused test and applicable type,
lint and browser checks. Record exact commands/results in local phase handoffs.
At closure inspect `git diff --check` and the diff; stage only explicit owned
paths for logical checkpoint commits. Advance immediately to the next phase.

## Final delivery

Run `bun run quality`, `bun run test:e2e:domain`, focused guided-workflow tests
and `bun run diff:check`. Do not rerun expensive overlapping gates without a
reason. Read current main protection requirements, push the final branch and
open one PR. Verify every required check at the exact final SHA. Fix failures
caused by this diff; stop on unrelated exact-HEAD CI failures as required by
the goal. Report starting SHA, branch, final HEAD, PR, amendments, phase/test
evidence, CI, deviations and risks. Do not merge or deploy.
