# Plain-language enquiry workflow

## Goal

Make Zephyr CRM understandable to staff who do not use sales or software
terminology every day. The interface should tell a person what an enquiry is,
what has happened, and what to do next without requiring knowledge of the
database, internal workflow names, or implementation details.

The user-facing word for a website lead will be **enquiry**. The user-facing
word for a converted client will be **customer**. Internal database values,
RPC names, form actions, routes, permissions, and state-machine rules remain
unchanged.

## Chosen approach

Use a presentation language layer rather than changing internal domain values
or doing isolated find-and-replace edits. Domain-specific helpers will convert
internal values into consistent labels, badges, filter options, descriptions,
and action guidance.

This gives every page one vocabulary while preserving the existing workflow
and database contracts. A future internal code change will have one place to
update its user-facing wording.

## Plain-language principles

- Say **enquiry**, **customer**, **quote**, and **follow-up action** in the
  interface.
- Use **status** or **progress** instead of pipeline or stage.
- Describe the next action in terms of the user's goal, not the database
  transition behind it.
- Explain actions before a user commits to them, especially closing an
  enquiry or confirming a customer.
- Keep internal identifiers and optimistic-lock fields hidden. They are
  implementation details, not useful information for staff.
- Use sentence case and short sentences.
- Translate stored enum values before displaying them. Never expose values
  such as `waiting_on_client`, `QUALIFICATION`, or `lock_version`.

## Shared vocabulary

| Internal or current wording | User-facing wording |
| --- | --- |
| Lead / Leads | Enquiry / Enquiries |
| Client / Clients | Customer / Customers |
| Pipeline | Progress |
| Pipeline stage | Enquiry status |
| Attention | Follow-up |
| Attention state | Follow-up status |
| Owner | Person responsible |
| Task | Follow-up action when shown to staff |
| Activity | History |
| Next workflow action | Next step |
| Qualify lead | Review enquiry |
| Move to proposal | Prepare a quote |
| Mark lead lost | Close enquiry |
| Mark won and create Client | Confirm customer |
| Pause Lead | Put enquiry on hold |
| Resume Lead | Continue enquiry |
| Reopen for qualification | Reopen enquiry |

The word `lead` may remain in URLs, code, database fields, hidden form names,
test names, and internal documentation. It should not appear in ordinary
staff-facing labels, descriptions, badges, empty states, or action buttons.

## Enquiry status labels

The application continues to store and submit the existing values. The UI
uses these labels and short explanations:

| Internal value | Display label | Meaning shown to staff |
| --- | --- | --- |
| `NEW` | New enquiry | A new request has arrived and needs to be reviewed. |
| `QUALIFICATION` | Reviewing details | The request is being checked before pricing. |
| `PROPOSAL` | Preparing quote | The request is ready for quote details and pricing. |
| `DECISION` | Quote sent | The customer has a quote and a decision is pending. |
| `WON` | Customer confirmed | The customer accepted the quote and the enquiry is complete. |
| `LOST` | Not proceeding | The customer is not going ahead with this enquiry. |

These labels apply to status badges, filters, table cells, dashboard links,
detail-page headings, and task context selectors.

## Follow-up labels

| Internal value | Display label |
| --- | --- |
| `none` | No follow-up needed |
| `waiting_on_us` | We need to respond |
| `waiting_on_client` | Waiting for customer |

The existing values remain the source of truth for filtering and actions. The
display layer owns the readable labels and badge tone descriptions.

## Enquiry detail workflow

### Summary and next step

Change the summary card to **Enquiry details**. Show a **Reference number**,
contact details, and the readable **Follow-up** value. Remove **Lock version**
from the visible page.

Change **Next workflow action** to **Next step**. Use the following action copy:

| Current internal situation | Button | Supporting description |
| --- | --- | --- |
| `NEW` | Review enquiry | Check the customer's details and request before preparing a quote. |
| `QUALIFICATION` | Prepare a quote | The details are ready to move to pricing. |
| `PROPOSAL` without a quote | Create a quote | Add the quote details and pricing for the customer. |
| `DECISION` | Confirm customer | Use this after the customer accepts the quote. This moves the enquiry to Customers. |
| `WON` | No action | This enquiry has been added to Customers. |
| `LOST` | No action | This enquiry is marked as not proceeding. |

The explanatory copy must describe the practical result. It must not mention
the server, state transitions, database, RPCs, tracer bullets, or lock
versions.

### Closing an enquiry

Replace the collapsed **Mark lead lost** panel with **Close enquiry**. The
panel description should read:

> Use this when the customer is not going ahead. Choose a reason so we know
> what happened.

Use **Why is it not proceeding?** as the reason label and **Extra notes
(optional)** as the notes label. The final action remains visually dangerous,
but its label is **Close enquiry**. Existing reasons and validation remain
unchanged unless a separate content review approves new reason values.

### Responsibility and follow-up

Rename **Ownership and attention** to **Responsibility and follow-up**. Use
**Person responsible** for the assignment field and **Follow-up status** for
the follow-up selector. The save buttons can simply say **Save**.

Use these labels for the hold controls:

- **Put enquiry on hold**
- **Why is it on hold?**
- **Continue on (optional)**
- **Continue enquiry**
- **Why are you reopening it?**
- **Reopen enquiry**

### Related information

- **Quotes** remains **Quotes** because the word is familiar and precise.
- Replace the quote description with: **Add prices and send a quote to the
  customer.**
- Replace database-focused copy such as **The database calculates the
  authoritative totals** with: **Totals are calculated for you.**
- Rename **Follow-up tasks** to **Follow-up actions** and describe it as:
  **Keep track of what needs to happen next.**
- Rename **Activity** to **History** and describe it as:
  **See what has happened with this enquiry.**
- Replace technical read-only copy with:
  **You can view this enquiry, but you do not have permission to change it.**

## Enquiry list and navigation

The sidebar and page title use **Enquiries**, **Customers**, and
**Follow-ups**. Quotes stays **Quotes**.

On the enquiry list:

- Page description: **Review new enquiries and keep each one moving.**
- Filter label: **Enquiry status**.
- Table column: **Status** or **Progress**, with **Status** preferred for
  clarity.
- Table column: **Follow-up** instead of Attention.
- Table column: **Person responsible** instead of Owner.
- Table column: **Last update** instead of Last activity.
- Empty state: **No enquiries yet** and **New website enquiries will appear
  here automatically.**
- Filtered empty state: **No enquiries match this search** and
  **Try a different search or filter.**

## Dashboard and follow-up pages

Dashboard metrics and links should use the same vocabulary:

- **New enquiries**
- **Overdue follow-ups**
- **Follow-ups due today**
- **We need to respond**
- **Waiting for customer**
- **Quotes expiring soon**
- **Sales overview** instead of Sales KPIs
- **Customer conversion rate** instead of Conversion rate
- **Open quote value** instead of Pipeline value
- **Why enquiries did not proceed** instead of Lost reasons

The follow-up page should use **Follow-ups** as its title. Replace technical
copy such as **automated rules remain server-configured** with:

> Write down the next action so nothing is forgotten.

Use **Add follow-up action**, **What needs to happen?**, **Notes (optional)**,
**Due date**, and **Person responsible** in the create form. Task types should
display readable labels such as **Review enquiry**, **Call customer**,
**Prepare quote**, **Send quote**, **Follow up**, and **Confirm customer**.

## Technical boundaries

This change is presentation-only:

- Do not rename database columns, RPC functions, form action names, URLs, or
  internal TypeScript properties.
- Do not change the lead lifecycle or permission checks.
- Add pure presentation helpers and unit tests for status, follow-up, and task
  labels.
- Update the affected Svelte pages to use the helpers instead of printing raw
  internal values.
- Add focused UI copy assertions for the primary enquiry actions and
  descriptions.
- Preserve existing form behavior, validation, redirect behavior, and error
  handling.

## Delivery order

1. Add and test the shared enquiry, status, follow-up, and action copy maps.
2. Update the enquiry list and enquiry detail pages.
3. Update the sidebar, dashboard, follow-ups, quotes, and customer references.
4. Search the visible frontend for the banned technical terms and raw enum
   values.
5. Run focused tests, the full unit suite, type checks, lint, build, and the
   relevant authenticated browser flows.

The first implementation pass should focus on consistency and comprehension.
A later content pass can refine individual lost-reason labels or marketing
copy without changing the workflow vocabulary.
