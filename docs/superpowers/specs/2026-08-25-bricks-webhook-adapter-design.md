# Bricks webhook raw-field adapter design

Date: 2026-08-25

## Context

The live Bricks webhook endpoint accepts the canonical JSON contract and has
successfully accepted a static connectivity payload. Real form submissions
currently fail because the Bricks Data template is manually bound to rendered
six-character element IDs. The stable field names emitted by the form are the
`form-field-*` names, while optional qualification fields are not represented
in the CRM lead RPC as separate columns.

## Objective

Accept the form's raw Bricks field payload without changing the existing
canonical webhook contract or the database schema. Preserve idempotency,
authentication, form validation, and rejection recording.

## Chosen approach

Add a pure normalization layer at the SvelteKit/Cloudflare Worker intake
boundary with two compatible input modes:

1. Existing canonical payloads continue to accept `form_id`,
   `external_submission_id`, `first_name`, `last_name`, `email`, and the
   existing CRM fields.
2. Raw Bricks payloads accept the known stable `form-field-*` names from the
   request-quote form. The adapter maps the core contact fields, derives the
   external submission ID from `form-field-bkkmsp`, and uses the configured
   expected form ID when raw Bricks fields are present without an explicit
   `form_id`.

The raw-field allowlist is explicit. Unknown fields remain rejected. The
optional photo field is allowlisted and ignored. Empty optional values are
omitted from the qualification note; the existing required validation remains
name, valid email, and UUID external submission ID.

Qualification fields are appended to the existing canonical `message` field
with stable labels. This keeps the current lead schema and RPC unchanged while
preserving the submitted product, measurement, installation, timing, contact,
affiliate, referral, and promotional information for staff.

URL-encoded duplicate keys are collected as arrays before normalization so
Bricks radio fields remain safe whether they arrive as a scalar or array.

## Field mapping

| Bricks field | Canonical destination |
| --- | --- |
| `form-field-dan_name` | `first_name` |
| `form-field-dan_surname` | `last_name` |
| `form-field-dan_email` | `email` |
| `form-field-dan_phone` | `phone` |
| `form-field-dan_message` | `message` |
| `form-field-amyrxq` | `landing_page` |
| `form-field-ctlhqn` | `utm_source` |
| `form-field-jrezxg` | `utm_medium` |
| `form-field-pnqwvr` | `utm_campaign` |
| `form-field-lcwxnh` | `utm_content` |
| `form-field-bkkmsp` | `external_submission_id` |
| `form-field-dan_town` | qualification note |
| `form-field-dan_product` | qualification note |
| `form-field-dan_product_type` | qualification note |
| `form-field-dan_area_type` | qualification note |
| `form-field-dan_width_mm` | qualification note |
| `form-field-dan_height_mm` | qualification note |
| `form-field-dan_openings_count` | qualification note |
| `form-field-dan_installation[]` | qualification note |
| `form-field-dan_timing[]` | qualification note |
| `form-field-dan_contact_method[]` | qualification note |
| `form-field-rcbtvz` | qualification note |
| `form-field-hjpjbt` | qualification note |
| `form-field-bigere` | qualification note |
| `form-field-dan_photo` | ignored |

## Security and compatibility

- Bearer-secret verification remains unchanged and happens before payload
  processing.
- Canonical unknown-field rejection remains unchanged.
- Raw Bricks fields have a separate explicit allowlist; raw unknown fields are
  rejected rather than silently persisted.
- Body-size, UUID, form-ID, email, and message-length limits remain enforced.
- The normalized payload passed to Supabase contains only the existing
  canonical fields.
- No migration, RPC signature change, or new production dependency is needed.

## Rollout

1. Add failing unit tests for canonical compatibility, raw mapping, optional
   empties, radio arrays, photo omission, missing required fields, unknown raw
   fields, and form-ID inference.
2. Implement the pure adapter and integrate it into the existing request
   parser.
3. Run focused tests plus type, lint, format, build, and diff checks.
4. Deploy the Worker while the website script and Bricks webhook are disabled.
5. Configure Bricks to send all form fields after deployment; retain the
   existing authorization header with a rotated secret.
6. Submit one new real test with a fresh UUID and verify HTTP 201 and the CRM
   lead before re-enabling normal traffic.

## Alternatives rejected

- Manually repairing every `{{field_id}}` token: depends on rendered element
  IDs and is fragile when the form is edited or regenerated.
- Adding database columns for every qualification field: unnecessary for the
  current CRM workflow and expands the migration/RLS surface.
