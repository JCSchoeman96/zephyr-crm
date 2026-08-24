# Zephyr CRM v1.3.1 toolchain proof

Status: `PROVEN LOCALLY`  
Proof date: 2026-08-24
Authority: `DEPENDENCY_BASELINE_v1.0.0.md`

The complete candidate stack was exercised together before the direct versions
below were frozen. The proof covered a frozen Bun install, SvelteKit/Vite build,
Cloudflare Workers artifact generation, Wrangler type checking, Tailwind 4,
Svelte diagnostics, ESLint, Prettier, Vitest, Playwright, local Supabase reset,
RLS/security checks, migrations, recovery, and the phase regression suites.

## Runtime and direct dependency versions

| Responsibility | Exact proven version |
| --- | --- |
| Bun package manager/runner | `1.2.22` (`packageManager: bun@1.2.22`) |
| Svelte | `5.56.10` |
| SvelteKit | `2.70.3` |
| Vite | `8.2.2` |
| Cloudflare adapter | `@sveltejs/adapter-cloudflare 7.2.9` |
| Wrangler | `4.125.0` |
| Tailwind CSS / Vite plugin | `4.3.3` |
| shadcn-svelte | `1.5.0` (`new-york`) |
| Lucide | `@lucide/svelte 1.33.0` |
| Supabase JS / CLI | `2.112.3` / `2.115.0` |
| Zod | `4.0.0` |
| TypeScript | `6.0.3`, strict mode |
| svelte-check | `4.7.6` |
| Vitest | `4.1.11` |
| Playwright | `1.62.1` |
| ESLint | `10.9.0` |
| Prettier | `3.9.6` |

Every direct dependency is exact-pinned in `package.json`; `bun.lock` is the
only JavaScript lockfile. Vite owns the SvelteKit build; Bun only installs
dependencies and invokes project scripts. SendPulse uses the project-owned REST
adapter and no provider SDK.

## Candidate deviations

The authority pack listed Bun `1.3.14`, Svelte `5.56.9`, svelte-check `4.7.4`,
ESLint `10.8.1`, and left TypeScript open as compatibility candidates. The
proven stack uses Bun `1.2.22`, Svelte `5.56.10`, svelte-check `4.7.6`, ESLint
`10.9.0`, and TypeScript `6.0.3`. These are compatibility-proof outcomes, not
technology substitutions: the frozen responsibilities and major families are
unchanged, the package manager remains Bun, and the result is exact-pinned.

## Worker artifact proof

`wrangler.jsonc` is the sole Cloudflare configuration authority. It pins an
explicit compatibility date, points `main` at
`.svelte-kit/cloudflare/_worker.js`, and binds Static Assets from
`.svelte-kit/cloudflare` as `ASSETS`. `bun run build` produces that Worker
artifact through Vite and `@sveltejs/adapter-cloudflare`; it does not use the
superseded static-hosting output mode or a second bundler.

## Reproduction gate

```sh
bun install --frozen-lockfile
bun run test:p1:toolchain
bun run test:p1:lifecycle
bun run format:check
bun run lint
bun run check
bun run test:unit -- --run
bun run test:e2e
bun run build
bun run security:bundle
bun run db:reset
bun run db:test
bun run db:security
```

Frozen reinstall gate: `bun install --frozen-lockfile && bun run quality`
must complete without lockfile mutation before the Phase 1 proof is accepted.

The local release gate additionally runs the phase suites, security/public-bundle
checks, recovery rehearsal, authority registry/hash/coverage checks, and
`git diff --check`. Remote deployment and CI are not required for this local
proof.
