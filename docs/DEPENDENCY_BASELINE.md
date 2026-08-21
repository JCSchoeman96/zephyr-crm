# Zephyr CRM Dependency Baseline

The candidate stack was installed and proven together before direct dependency versions were pinned. The proof consisted of a clean Svelte CLI scaffold, Bun installation, Svelte check, Vitest unit run, Wrangler type generation/check, Vite Cloudflare build, ESLint, Prettier, and Playwright browser smoke execution.

Direct development dependencies are pinned exactly in `package.json` and resolved by `bun.lock`:

| Package | Version |
|---|---:|
| `@eslint/js` | `10.0.1` |
| `@playwright/test` | `1.62.1` |
| `@sveltejs/adapter-cloudflare` | `7.2.9` |
| `@sveltejs/kit` | `2.70.3` |
| `@sveltejs/vite-plugin-svelte` | `7.3.0` |
| `@tailwindcss/vite` | `4.3.3` |
| `@types/node` | `24.13.3` |
| `eslint` | `10.9.0` |
| `eslint-config-prettier` | `10.1.8` |
| `eslint-plugin-svelte` | `3.23.0` |
| `globals` | `17.11.0` |
| `prettier` | `3.9.6` |
| `prettier-plugin-svelte` | `4.1.1` |
| `prettier-plugin-tailwindcss` | `0.8.1` |
| `svelte` | `5.56.10` |
| `svelte-check` | `4.7.6` |
| `tailwindcss` | `4.3.3` |
| `typescript` | `6.0.3` |
| `typescript-eslint` | `8.67.0` |
| `vite` | `8.2.2` |
| `vitest` | `4.1.11` |
| `wrangler` | `4.125.0` |

The Phase 2 runtime UI dependency is also pinned exactly:

| Package | Version |
|---|---:|
| `lucide-svelte` | `1.0.1` |

The project uses Vite as the SvelteKit build pipeline, `@tailwindcss/vite` for Tailwind CSS 4, Cloudflare Pages output through `@sveltejs/adapter-cloudflare`, Lucide for ordinary icons, and Bun as package manager/runner. No second package manager, alternate bundler, UI system, state framework, form framework, or provider SDK is introduced.

Run `bun install --frozen-lockfile` to reproduce the dependency graph. Run `bun run authority:verify` before phase work to detect frozen authority drift.
