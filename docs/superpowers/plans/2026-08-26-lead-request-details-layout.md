# Lead request details layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (required) to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the pipe-delimited lead message display with grouped, responsive accordion sections that remain readable for both new and older leads.

**Architecture:** Add a pure parser in the lead domain that converts the existing stored message string into typed request groups. The lead detail page will render those groups with native details and summary elements, choosing initial open state from lead activity age and pipeline stage. The webhook, Worker adapter, database schema, and lead actions remain unchanged.

**Tech Stack:** Svelte 5, TypeScript, Svelte scoped CSS, existing design tokens, Vitest, Bun.

---

### Task 1: Define the request-details parser contract with failing tests

**Files:**
- Create: src/lib/domain/leads/request-details.spec.ts
- Reference: src/lib/domain/leads/request-details.ts (not created until the tests fail)

- [ ] **Step 1: Write focused failing tests**

Create tests for the full captured message, omitted optional values, plain legacy text, display formatting, and initial-open policy:

~~~ts
import { describe, expect, it } from 'vitest';
import {
  formatLeadRequestValue,
  parseLeadRequestMessage,
  shouldExpandLeadRequestDetails
} from './request-details';

const fullMessage =
  'Notes: Big | Town/area: Vanderbijlpark | Product: screens | Product type: Select a product type | Area type: window | Width (mm): 100 | Height (mm): 100 | Openings: 1 | Installation: diy | Timing: asap | Contact method: phone | Promo code: Hallo';

describe('lead request details', () => {
  it('maps the captured qualification message into concern-based groups', () => {
    const result = parseLeadRequestMessage(fullMessage);

    expect(result.hasStructuredFields).toBe(true);
    expect(result.notes).toBe('Big');
    expect(result.groups.map((group) => group.key)).toEqual([
      'location-product',
      'measurements',
      'follow-up',
      'source-promotion',
      'notes'
    ]);
    expect(result.groups[0].fields).toEqual([
      { key: 'town', label: 'Town / area', value: 'Vanderbijlpark' },
      { key: 'product', label: 'Product', value: 'screens' },
      { key: 'product-type', label: 'Product type', value: 'Select a product type' },
      { key: 'area-type', label: 'Area type', value: 'window' }
    ]);
    expect(result.groups[1].summary).toBe('100 mm × 100 mm · 1 opening');
    expect(result.groups[2].summary).toBe('DIY · ASAP · Phone');
    expect(result.groups[3].fields).toEqual([
      { key: 'promo-code', label: 'Promo code', value: 'Hallo' }
    ]);
    expect(result.groups[4].fields).toEqual([
      { key: 'notes', label: 'Notes', value: 'Big' }
    ]);
  });

  it('omits blank optional fields and creates a source group only when populated', () => {
    const result = parseLeadRequestMessage(
      'Town/area: Vanderbijlpark | Product: screens | Width (mm): 100 | Promo code: Hallo'
    );

    expect(result.groups.map((group) => group.key)).toEqual([
      'location-product',
      'measurements',
      'source-promotion'
    ]);
    expect(result.groups[0].fields.map((field) => field.label)).toEqual([
      'Town / area',
      'Product'
    ]);
    expect(result.groups[1].fields).toEqual([
      { key: 'width', label: 'Width', value: '100' }
    ]);
    expect(result.groups[2].fields).toEqual([
      { key: 'promo-code', label: 'Promo code', value: 'Hallo' }
    ]);
  });

  it('preserves unlabelled and unknown labelled text in Notes', () => {
    const result = parseLeadRequestMessage(
      'Town/area: Vanderbijlpark | Internal note: call after 5pm | Please check access'
    );

    expect(result.notes).toBe('Internal note: call after 5pm | Please check access');
  });

  it('falls back to the complete message when no known fields are present', () => {
    const result = parseLeadRequestMessage('Customer asked for a site visit');

    expect(result.hasStructuredFields).toBe(false);
    expect(result.groups).toEqual([]);
    expect(result.fallbackMessage).toBe('Customer asked for a site visit');
  });

  it('formats known captured slugs without changing the stored values', () => {
    expect(formatLeadRequestValue('installation', 'diy')).toBe('DIY');
    expect(formatLeadRequestValue('timing', '2-4-weeks')).toBe('Within 2–4 weeks');
    expect(formatLeadRequestValue('product-type', 'insect-screen-single-sided')).toBe(
      'Insect screen single sided'
    );
    expect(formatLeadRequestValue('product-type', 'Select a product type')).toBe(
      'Select a product type'
    );
  });

  it('opens all non-empty groups for recent active leads', () => {
    const now = Date.parse('2026-08-26T10:00:00.000Z');

    expect(
      shouldExpandLeadRequestDetails({
        createdAt: '2026-08-20T10:00:00.000Z',
        lastActivityAt: '2026-08-26T09:00:00.000Z',
        pipelineStage: 'QUALIFICATION',
        now
      })
    ).toBe(true);
  });

  it('collapses older or terminal leads to the first available group', () => {
    const now = Date.parse('2026-08-26T10:00:00.000Z');

    expect(
      shouldExpandLeadRequestDetails({
        createdAt: '2026-07-01T10:00:00.000Z',
        lastActivityAt: '2026-07-01T10:00:00.000Z',
        pipelineStage: 'PROPOSAL',
        now
      })
    ).toBe(false);
    expect(
      shouldExpandLeadRequestDetails({
        createdAt: '2026-08-20T10:00:00.000Z',
        lastActivityAt: '2026-08-20T10:00:00.000Z',
        pipelineStage: 'LOST',
        now
      })
    ).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify the red failure**

Run:

~~~bash
bun run test:unit -- --run src/lib/domain/leads/request-details.spec.ts
~~~

Expected result: Vitest fails because request-details does not exist. Do not create the implementation before observing this failure.

- [ ] **Step 3: Commit the contract tests**

Stage only src/lib/domain/leads/request-details.spec.ts and create a local checkpoint:

~~~bash
git add src/lib/domain/leads/request-details.spec.ts
git diff --cached --check
git commit -m "test: define lead request details contract"
~~~

### Task 2: Implement the pure parser and open-state policy

**Files:**
- Create: src/lib/domain/leads/request-details.ts
- Test: src/lib/domain/leads/request-details.spec.ts

- [ ] **Step 1: Add the typed parser implementation**

Implement these exported types and functions:

~~~ts
export type LeadRequestField = {
  key: string;
  label: string;
  value: string;
};

export type LeadRequestGroup = {
  key: 'location-product' | 'measurements' | 'follow-up' | 'source-promotion' | 'notes';
  title: string;
  fields: LeadRequestField[];
  summary: string;
};

export type ParsedLeadRequestMessage = {
  hasStructuredFields: boolean;
  fallbackMessage: string;
  notes: string;
  groups: LeadRequestGroup[];
};

export function parseLeadRequestMessage(
  message: string | null | undefined
): ParsedLeadRequestMessage;

export function formatLeadRequestValue(key: string, value: string): string;

export function shouldExpandLeadRequestDetails(input: {
  createdAt: string;
  lastActivityAt: string | null;
  pipelineStage: string;
  now?: number;
  recentDays?: number;
}): boolean;
~~~

Use the known labels from the Worker qualification message. Split only before a known label, so a pipe inside unknown text is preserved. Store unknown labelled or unlabelled segments in Notes. Ignore known labels whose values are blank. Build groups in the fixed order from the design. Build summaries from formatted field values, with measurements shown as width × height · openings and follow-up shown as the available preference values separated by ·.

Use a 14-day default freshness window, matching the current CRM stale-lead setting. Use lastActivityAt when available, then createdAt. Terminal stages WON and LOST always return false. Invalid or missing dates return true for non-terminal leads so an unreadable date does not hide request details by default.

- [ ] **Step 2: Run the focused tests and verify green**

Run:

~~~bash
bun run test:unit -- --run src/lib/domain/leads/request-details.spec.ts
~~~

Expected result: all parser and open-state tests pass.

- [ ] **Step 3: Commit the parser checkpoint**

~~~bash
git add src/lib/domain/leads/request-details.ts src/lib/domain/leads/request-details.spec.ts
git diff --cached --check
git commit -m "feat: parse lead request details"
~~~

### Task 3: Replace the long message paragraph with grouped accordions

**Files:**
- Modify: src/routes/leads/[id]/+page.svelte
- Reference: src/lib/components/ui/Card.svelte, src/lib/components/ui/SectionHeader.svelte, src/lib/styles/tokens.css

- [ ] **Step 1: Add the parser import and derived view state**

Import formatLeadRequestValue, parseLeadRequestMessage, and shouldExpandLeadRequestDetails. Derive the parsed request data from data.lead.message and the initial open policy from data.lead.created_at, data.lead.last_activity_at, and data.lead.pipeline_stage:

~~~ts
const leadRequestDetails = $derived(parseLeadRequestMessage(data.lead.message));
const leadRequestOpenAll = $derived(
  shouldExpandLeadRequestDetails({
    createdAt: data.lead.created_at,
    lastActivityAt: data.lead.last_activity_at,
    pipelineStage: data.lead.pipeline_stage
  })
);
~~~

- [ ] **Step 2: Replace the single message paragraph**

Keep the existing contact and pipeline details unchanged. Replace the old long message paragraph with:

~~~svelte
{#if leadRequestDetails.hasStructuredFields}
  <section class="lead-request-card" aria-labelledby="lead-request-title">
    <SectionHeader
      title="Request details"
      description="Captured from the quote request form."
    />
    <div class="lead-request-groups">
      {#each leadRequestDetails.groups as group, index (group.key)}
        <details
          class={'lead-request-group lead-request-group--' + group.key}
          open={leadRequestOpenAll || index === 0}
        >
          <summary>
            <span class="lead-request-group__summary">
              <strong>{group.title}</strong>
              {#if group.summary}<span>{group.summary}</span>{/if}
            </span>
          </summary>
          {#if group.key === 'notes'}
            <p class="lead-request-note">{leadRequestDetails.notes}</p>
          {:else}
            <dl class="lead-request-fields">
              {#each group.fields as field (field.key)}
                <div>
                  <dt>{field.label}</dt>
                  <dd>{formatLeadRequestValue(field.key, field.value)}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </details>
      {/each}
    </div>
  </section>
{:else if leadRequestDetails.fallbackMessage}
  <p class="lead-message">{leadRequestDetails.fallbackMessage}</p>
{/if}
~~~

Give the section an aria-labelledby target by adding id="lead-request-title" to its rendered section heading if the shared SectionHeader cannot provide one without changing its public API. Prefer leaving the shared component unchanged and use a visually hidden heading inside the section if needed.

- [ ] **Step 3: Add scoped responsive styles**

Use existing tokens. The desktop presentation should remain inside the summary card, with grouped white accordions, a visible disclosure indicator, a two-column field grid, and one-column fields below 760px. At widths below 450px, remove the outer request card border, shadow, and inset padding while keeping the app shell page gutter. Let each inner group use the full available width, keep a clear separator, and give summaries a minimum 44px interaction height. Ensure long values wrap with overflow-wrap: anywhere and notes keep white-space: pre-wrap.

- [ ] **Step 4: Run type checking before broader tests**

Run:

~~~bash
bun run check
~~~

Expected result: svelte-check and generated Wrangler types complete with zero errors and zero warnings.

- [ ] **Step 5: Commit the page integration checkpoint**

~~~bash
git add 'src/routes/leads/[id]/+page.svelte'
git diff --cached --check
git commit -m "feat: group lead request details"
~~~

### Task 4: Run focused regression checks and inspect the final diff

**Files:**
- Test: src/lib/domain/leads/request-details.spec.ts
- Inspect: src/routes/leads/[id]/+page.svelte

- [ ] **Step 1: Run the parser tests and full unit suite**

~~~bash
bun run test:unit -- --run src/lib/domain/leads/request-details.spec.ts
bun run test:unit -- --run
~~~

Expected result: both commands exit 0 with zero failed tests.

- [ ] **Step 2: Run formatting, lint, and build checks**

~~~bash
bun run format:check
bun run lint
bun run build
~~~

Expected result: all commands exit 0. The build must include the Cloudflare/Wrangler type check and Vite production build.

- [ ] **Step 3: Verify the responsive presentation in a browser**

Run the local app with the repository's existing development command, open an authenticated lead detail page containing the example message, and inspect it at a desktop viewport and at 440px or less. Confirm that:

- Location & Product, Measurements, Follow-Up Preferences, optional Source & Promotion, and Notes appear in that order.
- Recent active leads open all populated groups.
- Older or terminal leads open only the first populated group and retain summaries for collapsed groups.
- Empty optional values do not create blank rows or groups.
- At 440px, the outer card frame disappears and inner groups use the full content width.
- Opening and closing groups works with mouse and keyboard.

- [ ] **Step 4: Run the final repository diff checks**

~~~bash
git diff --check
git status --short
git diff --stat HEAD~3..HEAD
~~~

Confirm that only the parser, parser tests, lead detail page, and the documented design/plan commits belong to this work. Do not stage or alter the existing Bricks adapter changes or unrelated untracked files.
