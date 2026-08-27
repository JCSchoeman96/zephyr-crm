# Bricks Webhook Raw-Field Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cloudflare Worker accept the live Bricks form's stable `form-field-*` payload while preserving the existing canonical webhook contract and idempotent CRM intake.

**Architecture:** Keep authentication, request limits, Zod validation, Supabase RPC calls, and rejection recording in `src/lib/server/bricks-intake.ts`. Add a pure, dependency-free payload adapter in `src/lib/server/bricks-payload.ts`; it will parse duplicate URL-encoded keys, map the known request-quote fields, build a qualification note, and expose no database or browser concerns. The current canonical JSON path remains supported unchanged.

**Tech Stack:** TypeScript, SvelteKit/Cloudflare Workers, Zod, Vitest, Bun, Supabase RPC.

---

### Task 1: Add failing tests for the pure Bricks adapter

**Files:**
- Create: `src/lib/server/bricks-payload.spec.ts`
- Test target: `src/lib/server/bricks-payload.ts` (not yet present)

- [ ] **Step 1: Write the failing unit tests**

Create a Vitest suite that imports `collectFormEncodedPayload` and
`normalizeBricksPayload` and covers the complete approved contract:

```ts
import { describe, expect, it } from 'vitest';
import { collectFormEncodedPayload, normalizeBricksPayload } from './bricks-payload';

const expectedFormId = 'aaa03e';
const externalId = 'ceac5545-70c8-421e-b0a5-634be68bbf85';

describe('Bricks payload adapter', () => {
	it('keeps the canonical JSON contract compatible', () => {
		const result = normalizeBricksPayload(
			{
				form_id: expectedFormId,
				external_submission_id: externalId,
				first_name: 'Canonical',
				last_name: 'Lead',
				email: 'canonical@example.test',
				phone: '+27110000000',
				message: 'Canonical message',
				source: 'bricks'
			},
			expectedFormId
		);

		expect(result.rawMode).toBe(false);
		expect(result.formId).toBe(expectedFormId);
		expect(result.externalId).toBe(externalId);
		expect(result.payload).toMatchObject({
			first_name: 'Canonical',
			last_name: 'Lead',
			email: 'canonical@example.test',
			phone: '+27110000000',
			message: 'Canonical message',
			source: 'bricks'
		});
	});

	it('maps raw Bricks fields and infers the configured form ID', () => {
		const result = normalizeBricksPayload(
			{
				'form-field-bkkmsp': externalId,
				'form-field-dan_name': 'Raw',
				'form-field-dan_surname': 'Lead',
				'form-field-dan_email': 'raw@example.test',
				'form-field-dan_phone': '+27112223333',
				'form-field-dan_town': 'Test Area',
				'form-field-dan_product': 'screens',
				'form-field-dan_product_type': 'insect-screen-single-sided',
				'form-field-dan_area_type': 'window',
				'form-field-dan_width_mm': '1000',
				'form-field-dan_height_mm': '1500',
				'form-field-dan_openings_count': '1',
				'form-field-dan_installation[]': 'install',
				'form-field-dan_timing[]': 'asap',
				'form-field-dan_contact_method[]': 'email',
				'form-field-amyrxq': 'https://danoptics.co.za/contact-us/',
				'form-field-ctlhqn': 'google',
				'form-field-rcbtvz': 'affiliate-123',
				'form-field-hjpjbt': '2026-08-25',
				'form-field-bigere': 'PROMO10',
				'form-field-dan_photo': 'ignored-file-metadata'
			},
			expectedFormId
		);

		expect(result.rawMode).toBe(true);
		expect(result.formId).toBe(expectedFormId);
		expect(result.externalId).toBe(externalId);
		expect(result.payload).toMatchObject({
			first_name: 'Raw',
			last_name: 'Lead',
			email: 'raw@example.test',
			phone: '+27112223333',
			landing_page: 'https://danoptics.co.za/contact-us/',
			utm_source: 'google',
			source: 'bricks'
		});
		expect(result.payload.message).toContain('Town/area: Test Area');
		expect(result.payload.message).toContain('Product: screens');
		expect(result.payload.message).toContain('Width (mm): 1000');
		expect(result.payload.message).toContain('Installation: install');
		expect(result.payload.message).toContain('Promo code: PROMO10');
		expect(result.payload.message).not.toContain('ignored-file-metadata');
	});

	it('reports unknown raw fields for the request parser to reject', () => {
		const result = normalizeBricksPayload(
			{
				'form-field-bkkmsp': externalId,
				'form-field-dan_name': 'Unknown',
				'form-field-dan_email': 'unknown@example.test',
				'form-field-not-on-the-form': 'reject-me'
			},
			expectedFormId
		);

		expect(result.unknownFields).toEqual(['form-field-not-on-the-form']);
	});

	it('omits empty optional raw fields instead of adding empty labels', () => {
		const result = normalizeBricksPayload(
			{
				'form-field-bkkmsp': externalId,
				'form-field-dan_name': 'Minimal',
				'form-field-dan_email': 'minimal@example.test',
				'form-field-dan_town': '',
				'form-field-dan_photo': ''
			},
			expectedFormId
		);

		expect(result.payload.message).toBe('');
	});

	it('collects repeated URL-encoded radio values', () => {
		const payload = collectFormEncodedPayload(
			new URLSearchParams([
				['form-field-dan_installation[]', 'install'],
				['form-field-dan_installation[]', 'unsure'],
				['form-field-dan_name', 'Array'],
				['form-field-dan_email', 'array@example.test']
			])
		);

		expect(payload['form-field-dan_installation[]']).toEqual(['install', 'unsure']);
	});
});
```

- [ ] **Step 2: Run the focused test and confirm the red failure**

Run:

```bash
bun run test:unit -- --run src/lib/server/bricks-payload.spec.ts
```

Expected: Vitest fails because `src/lib/server/bricks-payload.ts` does not
exist yet.

### Task 2: Implement the pure adapter

**Files:**
- Create: `src/lib/server/bricks-payload.ts`
- Test: `src/lib/server/bricks-payload.spec.ts`

- [ ] **Step 1: Add the explicit raw-field map and parser**

Implement `src/lib/server/bricks-payload.ts` with this complete shape:

```ts
export type BricksPayload = Record<string, unknown>;

export type NormalizedBricksPayload = {
	rawMode: boolean;
	formId: string;
	externalId: string;
	payload: Record<string, string>;
	unknownFields: string[];
};

const canonicalFields = new Set([
	'form_id',
	'formId',
	'external_submission_id',
	'submission_id',
	'first_name',
	'last_name',
	'name',
	'email',
	'phone',
	'company',
	'message',
	'landing_page',
	'referrer',
	'referrer_url',
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_content',
	'utm_term',
	'source'
]);

const rawFieldNames = {
	'form-field-bkkmsp': 'external_submission_id',
	'form-field-dan_name': 'first_name',
	'form-field-dan_surname': 'last_name',
	'form-field-dan_email': 'email',
	'form-field-dan_phone': 'phone',
	'form-field-dan_message': 'message',
	'form-field-dan_town': 'town',
	'form-field-dan_product': 'product',
	'form-field-dan_product_type': 'product_type',
	'form-field-dan_area_type': 'area_type',
	'form-field-dan_width_mm': 'width_mm',
	'form-field-dan_height_mm': 'height_mm',
	'form-field-dan_openings_count': 'openings_count',
	'form-field-dan_installation[]': 'installation',
	'form-field-dan_timing[]': 'timing',
	'form-field-dan_contact_method[]': 'contact_method',
	'form-field-rcbtvz': 'affiliate_id',
	'form-field-ctlhqn': 'utm_source',
	'form-field-jrezxg': 'utm_medium',
	'form-field-pnqwvr': 'utm_campaign',
	'form-field-lcwxnh': 'utm_content',
	'form-field-amyrxq': 'landing_page',
	'form-field-hjpjbt': 'referral_date',
	'form-field-bigere': 'promo_code',
	'form-field-dan_photo': 'photo'
} as const;

const rawFields = new Set(Object.keys(rawFieldNames));
const allowedFields = new Set([...canonicalFields, ...rawFields]);

const qualificationFields = [
	['form-field-dan_town', 'Town/area'],
	['form-field-dan_product', 'Product'],
	['form-field-dan_product_type', 'Product type'],
	['form-field-dan_area_type', 'Area type'],
	['form-field-dan_width_mm', 'Width (mm)'],
	['form-field-dan_height_mm', 'Height (mm)'],
	['form-field-dan_openings_count', 'Openings'],
	['form-field-dan_installation[]', 'Installation'],
	['form-field-dan_timing[]', 'Timing'],
	['form-field-dan_contact_method[]', 'Contact method'],
	['form-field-rcbtvz', 'Affiliate ID'],
	['form-field-hjpjbt', 'Referral date'],
	['form-field-bigere', 'Promo code']
] as const;

function textValue(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
	if (Array.isArray(value)) {
		return value.map(textValue).filter(Boolean).join(', ');
	}
	return '';
}

function firstValue(payload: BricksPayload, ...keys: string[]): string {
	for (const key of keys) {
		const value = textValue(payload[key]);
		if (value) return value;
	}
	return '';
}

function qualificationMessage(payload: BricksPayload): string {
	const parts: string[] = [];
	const notes = firstValue(payload, 'message', 'form-field-dan_message');
	if (notes) parts.push(`Notes: ${notes}`);
	for (const [key, label] of qualificationFields) {
		const value = firstValue(payload, key);
		if (value) parts.push(`${label}: ${value}`);
	}
	return parts.join(' | ');
}

export function collectFormEncodedPayload(params: URLSearchParams): BricksPayload {
	const payload: BricksPayload = {};
	for (const [key, value] of params) {
		const previous = payload[key];
		if (previous === undefined) payload[key] = value;
		else if (Array.isArray(previous)) payload[key] = [...previous, value];
		else payload[key] = [previous, value];
	}
	return payload;
}

export function normalizeBricksPayload(
	rawPayload: BricksPayload,
	expectedFormId: string,
	headerFormId = ''
): NormalizedBricksPayload {
	const rawMode = Object.keys(rawPayload).some((key) => rawFields.has(key));
	const formId =
		firstValue(rawPayload, 'form_id', 'formId') || headerFormId || (rawMode ? expectedFormId : '');
	const externalId = firstValue(
		rawPayload,
		'external_submission_id',
		'submission_id',
		'form-field-bkkmsp'
	);
	const message = rawMode
		? qualificationMessage(rawPayload)
		: firstValue(rawPayload, 'message');
	const payload = {
		first_name: firstValue(rawPayload, 'first_name', 'name', 'form-field-dan_name'),
		last_name: firstValue(rawPayload, 'last_name', 'form-field-dan_surname'),
		email: firstValue(rawPayload, 'email', 'form-field-dan_email'),
		phone: firstValue(rawPayload, 'phone', 'form-field-dan_phone'),
		company: firstValue(rawPayload, 'company'),
		message,
		landing_page: firstValue(rawPayload, 'landing_page', 'form-field-amyrxq'),
		referrer: firstValue(rawPayload, 'referrer', 'referrer_url'),
		utm_source: firstValue(rawPayload, 'utm_source', 'form-field-ctlhqn'),
		utm_medium: firstValue(rawPayload, 'utm_medium', 'form-field-jrezxg'),
		utm_campaign: firstValue(rawPayload, 'utm_campaign', 'form-field-pnqwvr'),
		utm_content: firstValue(rawPayload, 'utm_content', 'form-field-lcwxnh'),
		utm_term: firstValue(rawPayload, 'utm_term'),
		source: firstValue(rawPayload, 'source') || (rawMode ? 'bricks' : '')
	};
	return {
		rawMode,
		formId,
		externalId,
		payload,
		unknownFields: Object.keys(rawPayload).filter((key) => !allowedFields.has(key))
	};
}
```

- [ ] **Step 2: Run the focused tests and confirm green**

Run:

```bash
bun run test:unit -- --run src/lib/server/bricks-payload.spec.ts
```

Expected: all adapter tests pass.

- [ ] **Step 3: Commit the pure adapter**

```bash
git add src/lib/server/bricks-payload.ts src/lib/server/bricks-payload.spec.ts
git diff --cached --check
git commit -m "feat: add Bricks raw-field payload adapter"
```

### Task 3: Integrate the adapter into the Worker intake route

**Files:**
- Modify: `src/lib/server/bricks-intake.ts`
- Test: `src/lib/server/bricks-payload.spec.ts`

- [ ] **Step 1: Replace local payload parsing with the adapter**

Keep bearer verification, body-size checks, content-type checks, Zod schema,
form-ID comparison, UUID validation, Supabase RPC invocation, operational event
recording, and rejection recording in the existing file. Change only the
payload plumbing so that:

```ts
const expectedFormId = env.CLIENT_CONFIG_JSON?.trim()
	? trusted.configuration.integrations.bricks.formId
	: env.BRICKS_FORM_ID?.trim() || trusted.configuration.integrations.bricks.formId;

const normalized = normalizeBricksPayload(
	rawPayload,
	expectedFormId,
	event.request.headers.get('x-bricks-form-id')?.trim() ?? ''
);
const context = {
	formId: normalized.formId.length <= MAX_FORM_ID_LENGTH ? normalized.formId : '',
	externalId:
		normalized.externalId.length <= MAX_EXTERNAL_ID_LENGTH ? normalized.externalId : '',
	payload: normalized.payload
};
```

Reject `normalized.unknownFields` with the existing 422 error shape, validate
`normalized.formId`, `normalized.externalId`, and `normalized.payload`, and
return the same `{ formId, externalId, payload }` result currently consumed by
the RPC call. Use the raw-mode-specific required-field message when form ID was
inferred so the response is accurate.

- [ ] **Step 2: Run the focused tests and static checks**

Run:

```bash
bun run test:unit -- --run src/lib/server/bricks-payload.spec.ts
bun run check
bun run lint
```

Expected: adapter tests, Svelte type-checking, and ESLint pass.

- [ ] **Step 3: Commit the Worker integration**

```bash
git add src/lib/server/bricks-intake.ts
git diff --cached --check
git commit -m "fix: normalize raw Bricks form submissions"
```

### Task 4: Run the repository validation ladder

**Files:**
- Inspect only: `src/lib/server/bricks-intake.ts`, `src/lib/server/bricks-payload.ts`, tests, and the final diff.

- [ ] **Step 1: Run formatting and focused regression checks**

```bash
bun run format:check
bun run test:unit -- --run src/lib/server/bricks-payload.spec.ts src/lib/security/secrets.spec.ts
```

- [ ] **Step 2: Run the Worker build**

```bash
bun run build
```

Expected: Wrangler type generation and Vite/Cloudflare build pass.

- [ ] **Step 3: Inspect the final diff and check whitespace**

```bash
git diff --check HEAD~2..HEAD
git status --short
git diff HEAD~2..HEAD -- src/lib/server/bricks-intake.ts src/lib/server/bricks-payload.ts src/lib/server/bricks-payload.spec.ts
```

Confirm no secrets, browser scripts, database migrations, unrelated files, or
changes to user-owned untracked files are included.

### Task 5: Deploy and verify the disabled integration

**Files:**
- Modify: `wrangler.jsonc:16` to keep the production Bricks form identifier at
  `aaa03e`.
- No secret changes in source; use the existing deploy script.

- [ ] **Step 1: Reconcile the non-secret production form identifier**

Confirm `wrangler.jsonc` contains:

```jsonc
"BRICKS_FORM_ID": "aaa03e"
```

This prevents a deploy from reintroducing the old `contact-form` identifier
while `--keep-vars` preserves dashboard-managed environment values.

- [ ] **Step 2: Deploy the verified Worker with retained variables**

```bash
bun run deploy
```

Expected: Wrangler reports a new deployed Worker version without replacing
dashboard-managed variables.

- [ ] **Step 3: Verify the route with a redacted diagnostic request**

Send a request using the configured secret without printing the secret. Confirm
the route responds and the deployed version is the new one. Do not use a real
lead or reuse the static test UUID.

- [ ] **Step 4: Reconfigure Bricks after deployment**

Keep the endpoint URL without a trailing slash and keep JSON format. Rotate the
previously exposed webhook secret, update the Authorization header in Bricks,
then clear the custom Data JSON so Bricks sends all form fields. Do not include
the photo field in a production test.

- [ ] **Step 5: Run one real form test**

Re-enable only the Bricks webhook, leave the page UUID script disabled until
the Worker route is confirmed, and submit one test with a fresh UUID supplied
by the existing hidden field. Confirm Bricks reports no webhook failure, the
Worker returns HTTP 201, and a new lead appears in Zephyr. Re-enable the page
script after that test and repeat once to verify the browser-generated UUID.

- [ ] **Step 6: Record the result without exposing secrets or PII**

Capture only HTTP status, route, Worker version, and the CRM lead ID in the
handoff. Never record the Authorization value, service-role key, or full lead
payload.
