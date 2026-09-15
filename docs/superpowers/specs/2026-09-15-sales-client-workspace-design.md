# Sales client workspace design

Status: approved for implementation on 2026-09-15.

## Goal

Make one Sales enquiry easier to work by replacing the long detail page with a
bounded workspace. The page must keep the next action prominent, show enough
context to explain the current state, and keep Quotes, Follow-up actions, and
History easy to reach without repeated scrolling.

Home is unchanged.

## Approved layout

The detail route remains `/leads/:id` and uses a validated `tab` query:

- `overview`
- `quotes`
- `follow-ups`
- `history`

Overview is the default. Desktop uses a persistent context rail beside the
selected tab. The rail contains the next step, current status, attention state,
assignment, latest activity, and compact contact/quote facts. On mobile the
rail stacks above horizontally scrollable tabs.

The header contains the enquiry name, reference/contact summary, current status,
and a secondary `Close enquiry` action. Closing remains the existing lost-lead
action with its required reason, notes, lock version, and permissions.

All new text and surfaces use explicit application theme tokens. This slice
does not add a global dark-mode system.

## Tab responsibilities

### Overview

Show the prominent state-derived next step, current stage/attention, key
contact and quote facts, the latest open follow-up, and a short recent-activity
preview. Keep captured request details available behind a secondary disclosure.

### Quotes

Show the current quote first. If no quote exists, link to the existing quote
builder. If one exists, show its status, total, and allowed next action with a
link to the existing quote editor/response workflow. Older revisions stay in a
collapsed history section. Sent quote data remains immutable.

### Follow-up actions

Show open tasks first. Support adding an action, completing it, and secondary
rescheduling/cancellation through the existing trusted RPCs. Full editing of
task title, type, notes, due date, and assignee is explicitly deferred from
this slice because the current trusted task boundary has no update action and
the approved scope avoids a database migration.

### History

Show a read-only chronological Activity timeline, newest first, with timestamp,
event label, actor/source, and concise summary. Structured metadata remains
secondary.

## Lifecycle and data authority

The current `enquiryNextStep` mapping, lead transition actions, Quote actions,
optimistic locks, role checks, Customer conversion, and atomic accepted-Quote
Sales-to-Fulfilment handoff remain authoritative. A successful action returns
to the relevant tab when the action belongs to the workspace. No generic Notes
entity or new lifecycle state is introduced.

## Acceptance

- Each tab is bookmarkable and direct links select the correct content.
- Overview answers what happened, where the enquiry stands, and what to do
  next without rendering the full page of sections.
- Quotes expose the current quote and existing builder/editor paths.
- Follow-ups can be added, completed, rescheduled, and cancelled without
  bypassing trusted task RPCs.
- History is readable and complete for the loaded Activity bound.
- Close enquiry remains inline, reasoned, locked, and permissioned.
- Won records expose Customer and Fulfilment links.
- Viewer users can read the workspace but cannot mutate it.
- Desktop, tablet, and mobile layouts have readable contrast, keyboard focus,
  labelled errors, and no horizontal overflow.
