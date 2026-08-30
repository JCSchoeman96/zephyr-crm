# Zephyr CRM v1.5.1 Operational Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve OA-01 through OA-05 with a wider desktop Quote preview, safe default branding, a visible canonical Builder entry point, trusted Owner/Admin quote-default configuration, and less awkward PDF Product-code wrapping.

**Architecture:** Keep PostgreSQL as the authority for Quote lifecycle, totals, snapshots, and document metadata. Add only a pure quote-default normalizer and a thin Operations route form around the existing `set_app_setting` AAL2 boundary; keep presentation changes in the existing Quote Builder/preview and PDF Template v2 boundaries.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Supabase/PostgreSQL trusted RPCs, pdf-lib 1.17.1, Vitest, Playwright, Bun.

---

## File map

- Create `src/lib/domain/quotes/defaults.ts` and its unit test for the bounded `quote_defaults` shape shared by Operations and new Quote defaults.
- Create `tests/e2e/domain/v151-operational-polish.e2e.ts` for disposable browser evidence at desktop/mobile viewports, fallback branding, the Builder entry point, and Owner/Admin configuration.
- Create `supabase/migrations/20260830100000_v151_operational_polish.sql` as a forward-only correction for existing local/company-identity seed rows that still point at `/favicon.svg`.
- Create `docs/V1.5.1_OPERATIONAL_ACCEPTANCE.md` after validation with command outputs and explicit OA-01–OA-05 PASS evidence.
- Modify `src/lib/config/client-config.ts`, `src/lib/config/client-config.spec.ts`, `config/client.example.json`, and `supabase/seed.sql` to make an empty logo path intentional and valid.
- Modify `src/lib/components/quotes/QuoteDocumentPreview.svelte` and `src/lib/components/quotes/QuoteEditor.svelte` for fallback branding, desktop allocation, numeric readability, and server-provided new-Quote defaults.
- Modify `src/lib/domain/quotes/documents/pdf-v2.ts` and `pdf-v2.spec.ts` for Product-code column allocation and hyphen-aware wrapping.
- Modify `src/routes/leads/[id]/+page.svelte` to expose the existing `/quotes/new?lead_id=…` Builder route beside the preserved quick custom action.
- Modify `src/routes/operations/+page.server.ts` and `src/routes/operations/+page.svelte` for the trusted quote-default form.
- Modify `src/routes/quotes/new/+page.server.ts` and `src/routes/quotes/new/+page.svelte` to load and display normalized server-owned defaults.
- Modify `package.json` only to add the focused v1.5.1 Playwright command; do not change dependencies or lockfiles.

### Task 1: Add a pure, bounded quote-default contract

**Files:**
- Create: `src/lib/domain/quotes/defaults.ts`
- Test: `src/lib/domain/quotes/defaults.spec.ts`

- [ ] **Step 1: Write the failing unit tests.** Cover one valid disposable form, trimming and uppercase prefix normalization, invalid prefix/tax/validity bounds, maximum text lengths, and malformed stored settings falling back to the safe empty-bank default. Tests use `new FormData()` and never contain real banking details.

```ts
it('parses the exact quote-default form shape', () => {
	const form = new FormData();
	form.set('prefix', ' oa- ');
	form.set('tax_label', ' VAT ');
	form.set('tax_rate', '15.000000');
	form.set('validity_days', '45');
	form.set('terms', 'Payment terms');
	form.set('bank_details', 'Disposable Test Bank · Account TEST-001');

	expect(parseQuoteDefaultsForm(form)).toEqual({
		prefix: 'OA-',
		tax_label: 'VAT',
		tax_rate: 15,
		validity_days: 45,
		terms: 'Payment terms',
		bank_details: 'Disposable Test Bank · Account TEST-001'
	});
});

it.each([
	['prefix', 'bad prefix!', /prefix/i],
	['tax_rate', '100.0000001', /tax rate/i],
	['validity_days', '0', /validity/i],
	['validity_days', '366', /validity/i]
])('rejects invalid %s values', (field, value, message) => {
	const form = validForm();
	form.set(field, value);
	expect(() => parseQuoteDefaultsForm(form)).toThrow(message);
});

it('normalizes malformed stored settings without inventing bank details', () => {
	expect(normalizeQuoteDefaults({ prefix: 'bad!', bank_details: 42 })).toEqual({
		...defaultQuoteDefaults,
		bank_details: ''
	});
});
```

- [ ] **Step 2: Run the focused test and confirm the contract is missing.**

Run: `bun run test:unit -- --run src/lib/domain/quotes/defaults.spec.ts`

Expected: FAIL because the new module and exported functions do not exist.

- [ ] **Step 3: Implement the minimal normalizer/parser.** Export `QuoteDefaults`, `defaultQuoteDefaults`, `normalizeQuoteDefaults`, and `parseQuoteDefaultsForm`. Accept only `prefix`, `tax_label`, `tax_rate`, `validity_days`, `terms`, and `bank_details`; trim all strings; uppercase the prefix; store numeric tax/validity values; enforce prefix 1–12 `[A-Z0-9-]`, tax 0–100 with at most six decimals, validity 1–365, tax label ≤40, terms ≤10,000, and bank details ≤5,000. `normalizeQuoteDefaults` must accept JSON numeric strings/numbers and return safe defaults for invalid stored values.

- [ ] **Step 4: Run the focused test and confirm it passes.**

Run: `bun run test:unit -- --run src/lib/domain/quotes/defaults.spec.ts`

Expected: PASS with all quote-default contract cases green.

### Task 2: Make default branding safe and visible

**Files:**
- Modify: `src/lib/config/client-config.ts`
- Modify: `src/lib/config/client-config.spec.ts`
- Modify: `config/client.example.json`
- Modify: `supabase/seed.sql`
- Create: `supabase/migrations/20260830100000_v151_operational_polish.sql`
- Modify: `src/lib/components/quotes/QuoteDocumentPreview.svelte`
- Test: `src/lib/server/quote-documents.spec.ts`

- [ ] **Step 1: Add failing configuration and logo-resolution tests.** Assert that an intentionally empty `brand.logoPath` parses, that the default configuration/example/seed no longer use `/favicon.svg` as the client logo, and that an empty logo resolves to `null` without invoking an asset fetch.

```ts
it('accepts an intentionally empty logo path for the safe monogram fallback', () => {
	const configuration = parseClientConfiguration({
		...defaultClientConfiguration,
		brand: { ...defaultClientConfiguration.brand, logoPath: '' }
	});

	expect(configuration.brand.logoPath).toBe('');
});

it('does not fetch an empty logo asset', async () => {
	let requests = 0;
	expect(await resolveLogoAsset('', { fetch: async () => { requests += 1; return new Response(); } })).toBeNull();
	expect(requests).toBe(0);
});
```

- [ ] **Step 2: Run the focused tests and confirm the current default fails.**

Run: `bun run test:unit -- --run src/lib/config/client-config.spec.ts src/lib/server/quote-documents.spec.ts`

Expected: FAIL on empty-path validation and the stale `/favicon.svg` default assertion.

- [ ] **Step 3: Implement the safe default and forward data correction.**

  - Change the code/example/seed default logo path to `""` and allow an empty `brand.logoPath` while retaining local-path/HTTPS validation for non-empty values.
  - Add the forward migration below. It only corrects an old default row and preserves any configured non-default asset.

```sql
begin;

update public.app_settings
set setting_value = setting_value || jsonb_build_object('logo_path', ''),
	updated_at = now()
where setting_key = 'company_identity'
	and setting_value ->> 'logo_path' = '/favicon.svg';

commit;
```

  - In `QuoteDocumentPreview.svelte`, render a `data-testid="quote-brand-fallback"` monogram mark using the existing `companyMonogram` helper whenever `logoAsset` is empty or the image emits `error`. Keep approved image assets supported and make the failed-image path non-broken and decorative.

- [ ] **Step 4: Run the focused tests and inspect the diff.**

Run: `bun run test:unit -- --run src/lib/config/client-config.spec.ts src/lib/server/quote-documents.spec.ts`

Expected: PASS; `git diff --check` reports no whitespace errors.

### Task 3: Correct desktop Quote preview allocation

**Files:**
- Modify: `src/lib/components/quotes/QuoteEditor.svelte`
- Modify: `src/lib/components/quotes/QuoteDocumentPreview.svelte`
- Test: `tests/e2e/domain/v151-operational-polish.e2e.ts`

- [ ] **Step 1: Add the failing browser assertions.** At a 1280px viewport, assert the preview card has a usable width (at least 420px), the document preview has no horizontal overflow, desktop price/amount cells use no-wrap presentation, and the terms remain a normal wrapped paragraph. At 390px, assert document width does not exceed the viewport.

```ts
const desktop = await page.locator('.quote-editor-layout').evaluate((layout) => {
	const preview = layout.querySelector('.quote-preview-card');
	const priceCell = layout.querySelector('[data-label="Unit price"]');
	return {
		previewWidth: preview?.getBoundingClientRect().width ?? 0,
		priceWhiteSpace: priceCell ? getComputedStyle(priceCell).whiteSpace : '',
		documentWidth: document.documentElement.scrollWidth,
		viewportWidth: window.innerWidth
	};
});
expect(desktop.previewWidth).toBeGreaterThanOrEqual(420);
expect(desktop.priceWhiteSpace).toBe('nowrap');
expect(desktop.documentWidth).toBeLessThanOrEqual(desktop.viewportWidth);
```

- [ ] **Step 2: Run the new browser test and confirm the desktop assertion fails against the 1.5.0 grid.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "desktop Quote preview"`

Expected: FAIL because the existing preview column is approximately 320px at the 1280px viewport.

- [ ] **Step 3: Implement the minimal CSS correction.** Use `grid-template-columns: minmax(0, 1fr) minmax(26rem, 1fr)` at desktop, switch to one column at a breakpoint that prevents a squeezed editor, preserve the sticky preview on desktop, and apply `white-space: nowrap; overflow-wrap: normal` only to desktop numeric cells. Restore normal wrapping in the mobile card/table rules and change terms/copy wrapping to prefer word boundaries while still breaking long tokens.

- [ ] **Step 4: Rerun the focused browser test at desktop and mobile.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "desktop Quote preview"`

Expected: PASS with preview width ≥420px and no viewport overflow at either viewport.

### Task 4: Improve PDF Product-code wrapping

**Files:**
- Modify: `src/lib/domain/quotes/documents/pdf-v2.ts`
- Test: `src/lib/domain/quotes/documents/pdf-v2.spec.ts`

- [ ] **Step 1: Add failing PDF layout tests.** Export a small `wrapPdfProductCode` helper and test that a long hyphenated code prefers segment boundaries, preserves the full code, and falls back to character wrapping only for an oversized segment. Add a generated-PDF fixture assertion that the existing long code remains present and fitness remains zero.

```ts
it('wraps Product codes at hyphen boundaries before splitting a segment', async () => {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont(StandardFonts.Helvetica);

	expect(wrapPdfProductCode('OPS-ROOF-INSPECT-01', 52, font, 8.2)).toEqual([
		'OPS-ROOF-',
		'INSPECT-01'
	]);
	expect(wrapPdfProductCode('UNBROKENPRODUCTCODE', 30, font, 8.2).join('')).toBe(
		'UNBROKENPRODUCTCODE'
	);
});
```

- [ ] **Step 2: Run the focused PDF test and confirm the helper is missing.**

Run: `bun run test:unit -- --run src/lib/domain/quotes/documents/pdf-v2.spec.ts`

Expected: FAIL because `wrapPdfProductCode` is not exported and the current code-column layout is unchanged.

- [ ] **Step 3: Implement the minimal layout change.** Widen the fixed PDF code column to approximately 98pt, rebalance description/numeric columns within the existing A4 content width, use an 8pt code font, and implement `wrapPdfProductCode` by greedily adding hyphen-delimited chunks, then using the existing `wrapWord` fallback for any single chunk that exceeds the cell. Use the helper in `itemSegments` and the same code size in `drawItemRow`; do not change template/generator versions, margins, pagination, or document metadata.

- [ ] **Step 4: Run the focused PDF suite.**

Run: `bun run test:unit -- --run src/lib/domain/quotes/documents/pdf-v2.spec.ts src/lib/domain/quotes/documents/presentation-model.spec.ts src/lib/server/quote-documents.spec.ts`

Expected: PASS with deterministic hashes, A4 dimensions, long-content fitness, logo fallback, and Product-code wrapping green.

### Task 5: Expose the existing canonical Quote Builder entry point

**Files:**
- Modify: `src/routes/leads/[id]/+page.svelte`
- Test: `tests/e2e/domain/v151-operational-polish.e2e.ts`

- [ ] **Step 1: Add the failing browser assertion.** On a proposal-stage Lead with no Quote, assert the existing `Create a simple quote` card contains a link to `/quotes/new?lead_id=<lead id>` with copy explaining that Quote Builder supports catalogue Products, while the existing `item_name`, `quantity`, `unit_price`, `tax_rate`, and `Create quote` controls remain available for the frozen quick custom journey.

- [ ] **Step 2: Run the focused browser assertion and confirm the Builder link is absent.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "Quote Builder entry point"`

Expected: FAIL because the 1.5.0 card exposes only the direct quick custom form.

- [ ] **Step 3: Add the explicit two-option presentation.** Keep the card heading and existing form action intact. Add a recommended Quote Builder block with `Open Quote Builder` linking to the existing `/quotes/new?lead_id=…` route, explain that it searches active catalogue Products and supports multiple/custom lines, and label the retained form `Quick custom quote` with a custom-only note. Do not add another server action or route.

- [ ] **Step 4: Run the focused browser assertion and the frozen P17/P19 browser journeys.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "Quote Builder entry point"`

Run: `bun run test:e2e -- tests/e2e/domain/p17-sales-fulfilment.e2e.ts tests/e2e/domain/p19-fulfilment.e2e.ts`

Expected: PASS; existing quick custom workflows still create/send/accept Quotes and the new Builder CTA is visible.

### Task 6: Add the trusted Owner/Admin quote-default configuration form

**Files:**
- Modify: `src/routes/operations/+page.server.ts`
- Modify: `src/routes/operations/+page.svelte`
- Test: `tests/e2e/domain/v151-operational-polish.e2e.ts`

- [ ] **Step 1: Add failing browser assertions.** With a disposable Owner at AAL2, assert `/operations` loads the current `quote_defaults`, accepts the exact form, shows a success status after save, and does not expose the bank value in any error/log contract. The test submits only disposable values.

- [ ] **Step 2: Run the focused browser assertion and confirm the form is absent.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "quote-default configuration"`

Expected: FAIL because Operations currently only renders diagnostics.

- [ ] **Step 3: Implement the route and UI.**

  - Load `quote_defaults` alongside diagnostics and return `normalizeQuoteDefaults(setting_value)` plus a `saved` query flag.
  - Add `saveQuoteDefaults`: require an active Owner/Admin, parse the form with `parseQuoteDefaultsForm`, call `supabase.rpc('set_app_setting', { p_setting_key: 'quote_defaults', p_setting_value: parsed, p_description: 'Customer-facing Quote defaults and payment instructions' })`, map errors through `actionFailureDetails`/`logActionFailure`, and redirect to `/operations?saved=quote-defaults` on success.
  - Add labelled prefix, tax label, tax rate, validity days, terms, and bank-details controls. Explain that the setting is customer-facing, applies to new Quotes, is captured into the immutable Quote snapshot at Ready, and requires current MFA verification. Do not print or log submitted values.

- [ ] **Step 4: Run the focused browser test and the existing Auth/AAL2 regression.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "quote-default configuration"`

Run: `bun run auth:readiness`

Expected: PASS; AAL2 is enforced by the existing trusted RPC and the route does not bypass it.

### Task 7: Apply server-owned defaults in new Quotes

**Files:**
- Modify: `src/routes/quotes/new/+page.server.ts`
- Modify: `src/routes/quotes/new/+page.svelte`
- Modify: `src/lib/components/quotes/QuoteEditor.svelte`
- Test: `tests/e2e/domain/v151-operational-polish.e2e.ts`

- [ ] **Step 1: Add the failing browser assertion.** After saving disposable Operations defaults, open `/quotes/new?lead_id=…` and assert the Builder displays the configured tax label/rate, terms, and a validity date calculated from the configured validity days rather than the build-time public configuration.

- [ ] **Step 2: Run the focused assertion and confirm it shows the old defaults.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "server-owned Quote defaults"`

Expected: FAIL because `/quotes/new` does not currently load `app_settings.quote_defaults`.

- [ ] **Step 3: Load and pass the normalized setting.** Fetch `quote_defaults` in the existing new-Quote `Promise.all`, normalize it, return it in `PageData`, calculate the initial ISO validity date in `+page.svelte`, and pass `terms`, `taxLabel`, `taxRate`, and `validUntil` to the existing `QuoteEditor`. Keep currency and lifecycle behavior unchanged.

- [ ] **Step 4: Run the focused assertion and quote-builder regression.**

Run: `bun run test:e2e -- tests/e2e/domain/v151-operational-polish.e2e.ts -g "server-owned Quote defaults"`

Run: `bun run test:e2e -- tests/e2e/domain/p24-quote-builder.e2e.ts`

Expected: PASS; the Builder reads defaults from the server while P24 Product selection/snapshot behavior remains green.

### Task 8: Build the focused acceptance journey and evidence

**Files:**
- Create: `tests/e2e/domain/v151-operational-polish.e2e.ts`
- Modify: `package.json`
- Create: `docs/V1.5.1_OPERATIONAL_ACCEPTANCE.md`

- [ ] **Step 1: Write the focused Playwright journey around the already-failing assertions.** Use `createStaff`, `ingestLead`, `signIn`, `signInWithAal2`, and `cleanupLead` from the existing helpers. Capture and restore the local `quote_defaults` JSON in a localhost-only SQL cleanup helper, use a disposable bank string such as `Disposable Test Bank · Account TEST-001`, and never commit that value. Cover OA-01 through OA-04 in the browser; OA-05 is covered by the PDF unit suite. Record viewport metrics in assertions rather than relying only on a screenshot.

- [ ] **Step 2: Add the focused package script.** Add exactly:

```json
"test:v151:operational-acceptance": "playwright test tests/e2e/domain/v151-operational-polish.e2e.ts"
```

Do not add a dependency, lockfile change, CI change, or second browser framework.

- [ ] **Step 3: Run the focused test through the full local fixture.**

Run: `bun run test:v151:operational-acceptance`

Expected: PASS with disposable local Supabase/Auth data and no production/provider claim.

- [ ] **Step 4: Write the acceptance evidence document from actual output.** Include baseline commit `298e26b6826d7eaec5192c2a7a452cc7d337c59b`, the five OA rows with exact passing commands/evidence, local disposable conditions, explicit AAL2/configuration evidence, PDF fit evidence, and the fact that real banking details, mailbox rendering, deployment, and production remain outside this run.

### Task 9: Run validation ladder and hand off

**Files:**
- Modify only files already listed above if validation reveals a scoped defect.
- Create/update: `.agent/goal-loop/STATE.json`, `.agent/goal-loop/STATE.md`, `.agent/goal-loop/handoffs/v151-operational-polish.md` in local agent state.

- [ ] **Step 1: Run changed-file formatting and static checks.**

Run: `bun run format:check`

Run: `bun run lint`

Run: `bun run check`

Expected: PASS with no generated dependency or lockfile mutation.

- [ ] **Step 2: Run focused and v1.5/P7/P8 regression gates.**

Run: `bun run test:unit -- --run src/lib/domain/quotes/defaults.spec.ts src/lib/config/client-config.spec.ts src/lib/server/quote-documents.spec.ts src/lib/domain/quotes/documents/pdf-v2.spec.ts src/lib/domain/quotes/documents/presentation-model.spec.ts`

Run: `bun run test:p7:quotes`

Run: `bun run test:p8:documents`

Run: `bun scripts/test-p24-quote-builder.mjs`

Run: `bun run test:v151:operational-acceptance`

Expected: PASS; no completed P7/P8/v1.5 acceptance test is deleted, weakened, or skipped.

- [ ] **Step 3: Run broader quality/build/database gates.**

Run: `bun run test`

Run: `bun run build`

Run: `bun run db:test`

Run: `bun run db:types:check`

Run: `bun run db:security`

Run: `bun run diff:check`

Expected: PASS, with local Supabase used only for local database checks and all disposable fixtures cleaned up.

- [ ] **Step 4: Inspect final status/diff and prohibited markers.**

Run: `git status --short`

Run: `git diff --stat origin/main...HEAD`

Run: `rg -n 'TODO|FIXME|HACK|TEMP|DEBUG|SUPABASE_SERVICE_ROLE_KEY|SENDPULSE_CLIENT_SECRET|TEST-001' src/lib/config src/lib/domain/quotes src/lib/components/quotes 'src/routes/leads/[id]' src/routes/operations 'src/routes/quotes/new' tests/e2e/domain/v151-operational-polish.e2e.ts docs/V1.5.1_OPERATIONAL_ACCEPTANCE.md config/client.example.json supabase/seed.sql supabase/migrations/20260830100000_v151_operational_polish.sql package.json`

Expected: no new temporary markers, secrets, or disposable banking values in tracked source/evidence; only the focused feature branch files are changed.

- [ ] **Step 5: Persist the local handoff and create a safe checkpoint commit.** Exclude `.agent/` through `.git/info/exclude`, write the state/handoff with `goal_status=IN_PROGRESS`, local validation PASS, `release_status=NOT_READY`, `pilot_status=NOT_STARTED`, and `production_status=NOT_LAUNCHED`, then stage explicit agent-owned paths only. Run `git diff --cached --check`, inspect `git diff --cached`, and commit with a focused message. Do not stage the original checkout’s unrelated Bricks changes and do not merge/deploy.
