# Observability Auth 500 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent post-login and authenticated-page 500 responses caused by concurrent request-level Supabase SSR auth calls attempting late response-cookie mutations, while keeping Workers observability enabled.

**Architecture:** Keep `@supabase/ssr` as the cookie-session authority. Add a small request-local auth-state loader that memoizes the existing user/profile lookup so SvelteKit layout and page loads share one in-flight result and one cookie mutation path per request. Preserve the existing authorization and profile semantics.

**Tech Stack:** SvelteKit 2, TypeScript, `@supabase/ssr`, Vitest, Bun, Wrangler.

---

### Task 1: Add a failing request-auth memoization test

**Files:**
- Create: `src/lib/server/auth-state.spec.ts`
- Create: `src/lib/server/auth-state.ts`

- [ ] **Step 1: Write the failing test**

Create a test that supplies a fake Supabase client, invokes the request auth loader twice concurrently, and proves that the user lookup and profile lookup each run once while both callers receive the same active profile result.

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAuthStateLoader } from './auth-state';

describe('request auth state', () => {
	it('shares one user/profile lookup across concurrent server loads', async () => {
		const getUser = vi.fn(async () => ({
			data: { user: { id: 'user-1', email: 'staff@example.test' } },
			error: null
		}));
		const maybeSingle = vi.fn(async () => ({
			data: { id: 'user-1', status: 'active' },
			error: null
		}));
		const supabase = {
			auth: { getUser },
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({ maybeSingle }))
				}))
			}))
		} as never;

		const getAuthState = createAuthStateLoader(supabase);
		const [first, second] = await Promise.all([getAuthState(), getAuthState()]);

		expect(first).toEqual(second);
		expect(first.profile?.status).toBe('active');
		expect(getUser).toHaveBeenCalledTimes(1);
		expect(maybeSingle).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:unit -- --run src/lib/server/auth-state.spec.ts`

Expected: FAIL because `src/lib/server/auth-state.ts` does not exist yet.

### Task 2: Implement the minimal request-local auth loader

**Files:**
- Create: `src/lib/server/auth-state.ts`
- Modify: `src/hooks.server.ts:1-3,64-80`

- [ ] **Step 1: Implement the loader**

Move the existing user/profile lookup into `createAuthStateLoader`, cache the promise for the lifetime of the request, and return the existing null state when no Supabase client is configured.

- [ ] **Step 2: Connect the loader in the server hook**

Assign `event.locals.getAuthState = createAuthStateLoader(supabase)` after the request client is created. Do not change authorization decisions, profile columns, cookie options, or route behavior.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `bun run test:unit -- --run src/lib/server/auth-state.spec.ts`

Expected: PASS with one test and zero failures.

### Task 3: Validate the correction and release artifact

**Files:**
- Verify: `wrangler.jsonc`
- Verify: `src/lib/server/auth-state.ts`
- Verify: `src/hooks.server.ts`

- [ ] **Step 1: Run focused and auth integration checks**

Run: `bun run test:unit -- --run src/lib/server/auth-state.spec.ts src/lib/config/env.spec.ts`

Run: `bun run auth:integration`

- [ ] **Step 2: Run build and deployment dry-run**

Run: `bun run build`

Run: `bunx wrangler deploy --dry-run`

- [ ] **Step 3: Run the authenticated Lost-flow regression**

Run: `bun run test:p14:lost-flow`

Expected: the existing authenticated journey passes without the late `cookies.set` exception.

- [ ] **Step 4: Inspect the final diff and commit only owned files**

Run: `git diff --check` and `git diff --stat HEAD~1..HEAD` after committing the plan, code, and test changes. Preserve unrelated user changes in the original worktree.

### Task 4: Push and trigger the release build

- [ ] **Step 1: Push the isolated branch**

Run: `git push -u origin fix/observability-auth-500`

- [ ] **Step 2: Confirm the repository quality workflow starts for the pushed commit**

Run: `gh run list --branch fix/observability-auth-500 --limit 5`

- [ ] **Step 3: Trigger the Cloudflare deployment path**

Run the repository-authorized deployment command for the verified commit: `bun run deploy`.

- [ ] **Step 4: Verify the deployed Worker version and observability settings**

Run: `bunx wrangler deployments status`

Confirm the new deployment is newer than the pre-change version and the live Worker is serving the verified commit. Inspect Cloudflare Workers Logs for the reproduced route and confirm no new late-cookie 500 occurs.
