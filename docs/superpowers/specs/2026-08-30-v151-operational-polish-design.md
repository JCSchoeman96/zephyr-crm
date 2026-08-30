# Zephyr CRM v1.5.1 Operational Polish Design

## Goal

Resolve OA-01 through OA-05 from the v1.5 operational acceptance review while
preserving the established Product → Quote → PDF → Client → Fulfilment
architecture and all frozen lifecycle, snapshot, money, document, delivery,
and security contracts.

## Scope and invariants

This is a presentation, configuration-entry, and document-layout patch. It
does not introduce a new service, dependency, queue, payment flow, portal,
or quote-creation architecture. Existing database trusted actions remain the
authority for Quote state, totals, snapshots, and document attachment.

The existing quick custom quote action remains available for completed-phase
regression journeys. The lead detail page will make its custom-only nature
explicit and expose the existing canonical Quote Builder route for catalogue
selection. No second catalogue flow is introduced.

## Components and data flow

### Quote Builder and preview

`QuoteEditor.svelte` will allocate approximately equal desktop space to the
editor and preview, with a preview minimum that is usable within the 1280px
acceptance viewport. A narrower viewport will use the existing single-column
layout. `QuoteDocumentPreview.svelte` will keep the current presentation-model
projection and add a branded monogram mark when no safe logo asset is present.
Configured image failures will switch to that same fallback so a broken image
cannot remain visible.

### Default branding

The default non-secret client configuration, seed data, and forward migration
will no longer point at the unavailable `/favicon.svg`. Empty logo paths are a
valid intentional state. Preview and PDF rendering will consistently use the
company monogram when no approved PNG/JPEG can be resolved. Existing static or
inline PNG/JPEG configuration remains supported; external or unsupported PDF
assets continue to fail closed.

### Quote creation entry point

The existing Ready-for-Quote card will retain the quick custom form and its
server action so frozen v1.4 journeys continue to work. Its copy will call it
“Quick custom quote”, explain that it does not use the catalogue, and provide
a primary Builder link. The Builder remains the only route for multi-line,
catalogue-backed quote construction.

### Quote defaults and banking configuration

The Operations page will load the existing `quote_defaults` AppSetting and
render an Owner/Admin-only form for prefix, tax label/rate, validity days,
terms, and customer-facing bank details. The server will trim, bound, and
type-check this exact shape, then call the existing `set_app_setting` trusted
RPC. That RPC already enforces Owner/Admin role and current-session AAL2; the
route will not log submitted values or bypass it. New Quote Builder defaults
will come from the server-loaded setting, while ready Quote snapshots remain
the immutable source for later PDF/email output.

No real banking details will be stored in source or fixtures. Browser and
database evidence will use disposable values and restore the local setting
afterward.

### PDF Product-code layout

`pdf-v2.ts` will give the code column enough space for normal long codes,
prefer breaks at Product-code hyphens, and fall back to character wrapping
only when an individual segment cannot fit. Numeric columns retain fitting
behavior and all blocks remain inside the existing A4 content margins. The
renderer version and immutable attachment contract do not change.

## Error handling and security

Malformed quote-default form input returns the existing safe action error
shape without invoking the RPC. AAL1, non-Owner/Admin, unauthenticated, and
direct AppSetting mutation attempts remain denied by the existing trusted
boundary. Bank details are customer-facing configuration, not credentials,
but are handled as sensitive form content: they are neither logged nor
committed. Failed logo resolution is a non-fatal, visible monogram fallback.

## Tests and acceptance evidence

The patch will add focused unit tests for empty/default logo handling,
quote-default validation, PDF code wrapping, and PDF determinism. A focused
Playwright journey will exercise disposable Quote/Lead data at desktop and
mobile viewports, the Builder entry point, fallback branding, and the
Owner/Admin Operations form with a disposable bank-details value. Existing
P7/P8/v1.5 regression suites remain unchanged and are rerun as required.

The acceptance record will be written to
`docs/V1.5.1_OPERATIONAL_ACCEPTANCE.md` with explicit PASS evidence for each
OA item, the focused and regression commands, and the local-only/disposable
test conditions. It will not claim production delivery, real mailbox proof,
or a deployed environment.
