# Lead request details layout

## Goal

Make the quote information captured from the Bricks form easy to scan on a
lead detail page. The current UI prints the stored `message` as one long pipe-
delimited sentence. Staff should be able to find location, product,
measurements, follow-up preferences, promotion data, and notes without
decoding that sentence.

This change is presentation-only. It does not change the Bricks webhook,
Cloudflare Worker payload, Supabase RPC, or `leads.message` storage contract.

## Chosen layout

The lead overview will render request details in a grouped accordion card. The
groups appear in this order:

1. Location & Product
2. Measurements
3. Follow-Up Preferences
4. Source & Promotion, only when at least one attribution or promotion value
   exists
5. Notes, last, when notes exist

Each group uses a native `details` and `summary` control. The summary contains
the group title and a short value summary when the group is closed. For
example, a closed Measurements group can show `100 x 100 mm · 1 opening`.
Users can open and close each group without a page reload. The control remains
keyboard accessible and works on narrow screens.

Inside an open group, values use a two-column label/value grid on larger
screens and one column on small screens. Labels use muted text. Values use the
normal body color and wrap long values. Notes use the existing readable
multiline treatment and are visually separated from structured values.

At viewport widths below 450px, the outer request-details card loses its
border, shadow, and inset padding. The existing page gutter remains in place,
but the inner accordion groups expand to the full available width. The groups
keep a clear border or separator between them, and their summary rows keep a
comfortable tap target. This avoids a card inside a card and gives long town
names, product labels, and notes more room to wrap.

## Default open state

The default state uses the lead's last activity timestamp, falling back to
creation time when no activity timestamp exists. The age threshold is the
configured stale-lead window, currently 14 days.

- Recent or actively worked leads open all non-empty groups.
- Older or terminal leads open Location & Product and collapse the remaining
  groups.
- A closed group still exposes its key values in the summary, so collapsing it
  does not make the request context disappear.
- A group with no values is omitted. Optional blank fields do not create empty
  rows or empty accordions.

Using last activity rather than creation time keeps an old lead readable when
staff have recently worked on it. The open state is only the initial view. It
does not restrict access to any data.

## Message parsing

The Worker currently stores the canonical qualification message as text such
as:

`Notes: Big | Town/area: Vanderbijlpark | Product: screens | Product type: Select a product type | Area type: window | Width (mm): 100 | Height (mm): 100 | Openings: 1 | Installation: diy | Timing: asap | Contact method: phone | Promo code: Hallo`

A small pure parser will convert this known label format into a view model for
the page. It will:

- trim labels and values;
- handle missing or empty optional fields;
- preserve unknown or unlabelled text in Notes rather than dropping it;
- tolerate older messages that contain only some of the known labels;
- keep the existing raw message available as a fallback when parsing finds no
  known fields.

The parser will live outside the Svelte markup and have unit tests. No database
migration is needed. New submissions continue to use the same webhook and
storage format, and existing leads render through the same parser.

## Data mapping

The parser maps the current labels as follows:

- Location & Product: `Town/area`, `Product`, `Product type`, `Area type`
- Measurements: `Width (mm)`, `Height (mm)`, `Openings`
- Follow-Up Preferences: `Installation`, `Timing`, `Contact method`
- Source & Promotion: `Affiliate ID`, `Referral date`, `Promo code`
- Notes: `Notes` plus any unrecognised text

The display will keep the submitted values as captured. It may apply simple
human-readable formatting for known enum values such as `screens`, `diy`, and
`asap`, but it will not silently replace a submitted value such as `Select a
product type`. That preserves the source record and makes incomplete form
submissions visible.

## Files and boundaries

- Add a pure lead request-details parser and its unit tests under the existing
  lead domain utilities.
- Update `src/routes/leads/[id]/+page.svelte` to build the view model and
  replace the single long message paragraph with grouped details.
- Keep action forms, lead state transitions, contact fields, and the existing
  webhook adapter unchanged.
- Keep the existing card, token, badge, and responsive styling conventions.

## Validation

The implementation is complete when:

- parser tests cover the full example message, empty optional fields, partial
  older messages, and unknown text;
- the lead detail page type-checks and builds;
- focused unit tests, lint, `svelte-check`, and the project build pass;
- the grouped view is checked at desktop and mobile widths;
- the old long single-line message is no longer the primary presentation;
- existing lead action behavior remains unchanged.
