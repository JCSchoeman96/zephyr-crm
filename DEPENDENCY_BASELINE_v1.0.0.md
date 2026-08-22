# Zephyr CRM Dependency & Toolchain Baseline

**Document Version:** 1.0.0  
**Roadmap:** `CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md`
**Status:** Architecture Law / Pre-Implementation Baseline  
**Effective Date:** 2026-08-21

---

## 1. Purpose

This document freezes the approved technology choices, package-management authority, dependency-governance rules, and upgrade process for Zephyr CRM.

It exists to prevent autonomous or human implementation from silently changing framework, build, deployment, styling, validation, testing, state-management, or provider integration choices.

> **Technology choices are frozen now. Exact direct package versions become canonical only after the Phase 1 compatibility proof demonstrates that the complete stack builds and tests together. Once proven, every direct dependency is exact-pinned and `bun.lock` is committed.**

An individually current package is not automatically a compatible project baseline.

---

## 2. Runtime and Build Responsibility

```text
Bun
├── package manager
├── dependency installer
├── lockfile owner
├── package-script runner
└── local JavaScript/TypeScript command runtime

SvelteKit
└── application framework

Vite
├── SvelteKit dev/build pipeline
├── HMR
└── Tailwind Vite integration

@sveltejs/adapter-cloudflare
└── SvelteKit → Cloudflare Workers output

Wrangler
├── Cloudflare configuration
├── local Worker tooling where required
├── type generation where required
└── deployment command

Cloudflare workerd
└── production JavaScript runtime
```

**Bun must not replace Vite as the SvelteKit application bundler/build pipeline.** Bun invokes the canonical project scripts.

If an approved CLI cannot execute correctly under Bun, Phase 1 may retain a pinned Node runtime solely as a compatibility runtime for that tool. This does **not** permit npm/pnpm/Yarn or Node to become dependency authority.

Canonical commands must be exposed through `package.json`, for example `bun run dev`, `bun run check`, `bun run lint`, `bun run test`, `bun run test:e2e`, `bun run build`, `bun run quality`, and `bun run deploy`.

---

## 3. Frozen Technology Choices

| Concern | Frozen choice | Governance |
|---|---|---|
| Package manager / local runner | **Bun** | Exact Bun version in `packageManager`; no npm/pnpm/yarn workflow |
| Node compatibility fallback | **Only if an approved tool requires it** | Pin/document exact Node version; never becomes package-manager authority |
| Lockfile | **`bun.lock`** | Sole JavaScript dependency lockfile |
| Language | **TypeScript, strict mode** | Exact compatible compiler version proven in Phase 1 |
| Component/runtime framework | **Svelte 5** | No alternate frontend framework |
| Application framework | **SvelteKit 2** | No alternate meta-framework |
| Dev/build pipeline | **Vite 8** | SvelteKit/Vite owns bundling |
| Cloudflare adapter | **`@sveltejs/adapter-cloudflare`** | Workers with Static Assets target |
| Cloudflare CLI | **Wrangler 4** | Project-local exact dependency |
| Cloudflare config | **`wrangler.jsonc`** | Repository source of truth; `wrangler.toml` prohibited as competing authority |
| Production runtime | **Cloudflare workerd** | Governed through adapter/Wrangler and frozen compatibility date |
| CSS system | **Tailwind CSS 4** | First-party Vite integration |
| Tailwind integration | **`@tailwindcss/vite`** | No legacy Tailwind 3/PostCSS pipeline without amendment |
| UI source kit | **shadcn-svelte** | `new-york`; generated components become project-owned source |
| Icons | **`@lucide/svelte`** | One icon system |
| Backend platform | **Supabase** | PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron |
| Application SDK | **`@supabase/supabase-js`** | Exact project dependency after proof |
| Supabase tooling | **`supabase` CLI package** | Project-local exact dev dependency |
| Transactional email | **SendPulse REST API** | Trusted project-owned HTTP adapter; no arbitrary community SDK |
| Unit/domain testing | **Vitest** | Single unit test runner |
| Browser/E2E testing | **`@playwright/test`** | Single browser test runner |
| Svelte static checking | **`svelte-check`** | Canonical Svelte diagnostics |
| Lint | **ESLint** | One canonical lint configuration |
| Format | **Prettier** | One canonical formatter |
| Boundary/schema validation | **Zod** | One ordinary validation library unless amended |
| Client state | **Svelte-native state first** | No Redux/Zustand/MobX/XState by default |
| Forms | **SvelteKit-native forms/actions first** | No large form framework by default |
| Dates | **Native platform + `Intl` first** | No Moment/dayjs/date-fns/Luxon by default |
| Realtime | **Feature-driven Supabase Realtime only** | Not enabled globally by default |

---

## 4. Current Stable Candidate Set — Not Yet Canonical

The following versions were externally verified as current stable candidates on **2026-08-21**. They are scaffold seeds, not proof of mutual compatibility.

| Package / Tool | Candidate |
|---|---:|
| Bun | `1.3.14` |
| `svelte` | `5.56.9` |
| `@sveltejs/kit` | `2.70.3` |
| `vite` | `8.2.2` |
| `@sveltejs/adapter-cloudflare` | `7.2.9` |
| `wrangler` | `4.125.0` |
| `tailwindcss` | `4.3.3` |
| `@tailwindcss/vite` | `4.3.3` |
| `shadcn-svelte` | `1.5.0` |
| `@supabase/supabase-js` | `2.112.3` |
| `supabase` CLI | `2.115.0` |
| `vitest` | `4.1.11` |
| `@playwright/test` | `1.62.1` |
| `svelte-check` | `4.7.4` |
| `prettier` | `3.9.6` |
| `eslint` | `10.8.1` |

**TypeScript is deliberately not pre-frozen to the latest published stable release.** Phase 1 must choose the exact compatible compiler version as part of the full-stack proof.

Any candidate deviation must be recorded in `docs/TOOLCHAIN_PROOF.md`; changing a frozen technology choice or major family requires an architecture amendment.

---

## 5. Phase 1 Exact Freeze Procedure

Phase 1 must:

1. scaffold the SvelteKit project using Bun;
2. configure Svelte 5 + SvelteKit 2 + Vite 8;
3. configure `@sveltejs/adapter-cloudflare`;
4. create and commit `wrangler.jsonc`;
5. configure Tailwind 4 through `@tailwindcss/vite`;
6. initialise shadcn-svelte with the approved configuration;
7. install Supabase JS and a project-local Supabase CLI;
8. configure Vitest, Playwright, `svelte-check`, ESLint and Prettier;
9. configure strict TypeScript and Zod;
10. execute clean install, check, lint, unit tests, browser smoke, production build, Workers artifact and local Supabase lifecycle together;
11. write `docs/TOOLCHAIN_PROOF.md` with exact proven versions and any approved candidate deviation;
12. exact-pin every direct dependency with no `^`, `~`, `latest`, `next`, prerelease or floating Git reference;
13. set exact `packageManager: "bun@<proven-version>"`;
14. generate and commit `bun.lock`;
15. remove/prohibit `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, and legacy `bun.lockb`;
16. re-run the complete Phase 1 gate from a frozen clean install using `bun ci` or the proven frozen-lockfile equivalent.

After this proof, `package.json` + `bun.lock` + `docs/TOOLCHAIN_PROOF.md` are the exact dependency authority.

---

## 6. Exact-Pin Law

Allowed:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "2.112.3"
  }
}
```

Prohibited:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.112.3",
    "zod": "~4.0.0",
    "some-package": "latest"
  }
}
```

Prerelease tags and floating Git references are prohibited in the production baseline unless explicitly legislated. Transitive dependencies are governed by `bun.lock`. Undocumented global CLI versions are not build authority.

---

## 7. ShadCN Source-Ownership Law

shadcn-svelte is a source generator, not a permanent remote component runtime.

```text
shadcn-svelte CLI
        ↓
generated component source
        ↓
Zephyr-owned source code
```

- commit `components.json`;
- use the approved `new-york` style;
- generated dependencies become exact-pinned;
- generated components may be intentionally customised;
- never blindly overwrite/regenerate a customised component;
- destructive `--overwrite` regeneration requires reviewed source diff;
- component updates are source migrations, not invisible package updates.

---

## 8. Tailwind Law

The canonical styling pipeline is **Tailwind CSS 4 + `@tailwindcss/vite` + SvelteKit/Vite**. Do not introduce a legacy Tailwind 3 configuration or PostCSS pipeline from habit.

Tailwind/shadcn do not replace semantic design tokens. Client branding remains controlled through semantic tokens/settings.

---

## 9. Supabase Dependency and Schema Law

Use exact-pinned `@supabase/supabase-js` and an exact project-local `supabase` CLI dev dependency after Phase 1 proof.

Database evolution authority is:

```text
supabase/config.toml
+
ordered SQL migrations
+
seed/test fixtures
+
generated database types
+
RLS/database tests
```

Manual remote dashboard schema changes are prohibited as ordinary workflow. An emergency remote correction must be reconciled into a migration before normal development resumes. Generated TypeScript DB types must have a repeatable generation command and drift check where practical.

---

## 10. SendPulse Law

Use a project-owned trusted HTTP adapter to the SendPulse transactional REST API. Do not add a community/convenience SendPulse npm SDK without architecture approval.

The adapter must preserve logical-message idempotency, append-only attempts, `submission_unknown`, provider correlation, webhook deduplication, controlled retry, and the rule that provider events cannot alone cause dangerous business transitions.

---

## 11. State, Forms, Dates and Realtime

**State:** Svelte-native state primitives first. Separate global state frameworks require measured need and architecture approval.

**Forms:** SvelteKit-native form actions/enhancement + Zod first. Formsnap/Superforms or similar substantial form frameworks require an explicit dependency decision.

**Dates:** native/platform date and `Intl` APIs first, while preserving UTC/IANA domain law. If a date library becomes necessary, approve one library only.

**Realtime:** feature-driven only. Realtime never becomes durable truth or substitutes for persistence/authorization.

---

## 12. Dependency Classification

| Class | Examples | Upgrade Authority |
|---|---|---|
| **A — Runtime/Foundation** | Bun, Svelte, SvelteKit, Vite, TypeScript | Architecture-controlled upgrade |
| **B — Platform** | adapter-cloudflare, Wrangler, Supabase CLI | Controlled platform upgrade |
| **C — UI System** | Tailwind, shadcn-svelte, Lucide | Controlled UI-system upgrade |
| **D — Application Library** | supabase-js, Zod | Reviewed dependency upgrade |
| **E — Test/Quality** | Vitest, Playwright, svelte-check, ESLint, Prettier | Reviewed toolchain upgrade |
| **F — Generated/Transitive** | shadcn-generated deps, transitives | `bun.lock` + source/review controls |

Class A major upgrades are never routine maintenance.

---

## 13. Cloudflare Configuration and Compatibility Date

Use committed **`wrangler.jsonc`**, not `wrangler.toml`, as the canonical Cloudflare configuration source of truth. Emergency dashboard changes must be reconciled into source control.

The Worker `compatibility_date` is a versioned runtime control and is frozen after Phase 1 proof. Never automatically set it to today's date. A change requires changelog review, affected tests, build/preview proof, and an explicit committed update.

Secrets remain outside source control.

---

## 14. Autonomous Dependency-Addition Gate

An autonomous agent must not introduce a new production dependency unless all are true:

1. the requirement cannot reasonably be fulfilled by the approved stack;
2. the dependency has one clear architectural responsibility;
3. no approved dependency already fulfils it;
4. security, maintenance health and licence are reviewed;
5. exact version is pinned;
6. `bun.lock` is updated;
7. affected tests and required regressions pass;
8. this baseline is amended if a new architectural capability is introduced.

A package must never be added merely because the agent prefers its API. Unrelated dependency upgrades are prohibited.

---

## 15. Security and Upgrade Policy

Exact pinning does not mean permanent stagnation.

- Perform a monthly dependency/security review.
- Do not auto-merge dependency updates.
- Review changelog/advisory information for direct dependencies.
- Prefer coherent/small upgrade sets.
- Regenerate `bun.lock` and run the required regression tier.
- Relevant security advisories may trigger a targeted out-of-cycle update.
- Runtime/framework/toolchain major changes require a dedicated architecture amendment/hardening slice.

---

## 16. Prohibited Dependency Drift

Without explicit amendment, do not:

- replace Bun with npm/pnpm/Yarn;
- replace Vite with Bun bundling for the SvelteKit app;
- replace Svelte/SvelteKit;
- replace Tailwind as primary CSS system;
- add a second general UI system or icon library;
- add a second ordinary schema-validation library;
- add Redux/Zustand/MobX/XState by default;
- add Moment/dayjs/date-fns/Luxon by default;
- add Jest/Cypress as parallel primary runners;
- add a SendPulse community SDK by convenience;
- use `wrangler.toml` as a second config authority;
- enable global Realtime without a feature contract;
- commit multiple package-manager lockfiles or secrets.

---

## 17. Canonical Authority

After Phase 1 closes:

```text
DEPENDENCY_BASELINE_v1.0.0.md
        ↓
docs/TOOLCHAIN_PROOF.md
        ↓
package.json exact direct pins
        ↓
bun.lock exact dependency graph
        ↓
wrangler.jsonc + compatibility_date
        ↓
supabase/config.toml + SQL migrations
```

If these disagree, reconcile the contradiction before dependency-sensitive work continues.
