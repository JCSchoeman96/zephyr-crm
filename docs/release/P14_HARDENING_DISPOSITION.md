# P14 hardening review disposition

This matrix closes the named PR follow-ups against the frozen hardening authority. A
`FIXED` item has executable or browser/database evidence in the current tree. A
`NON-BLOCKER` item is intentionally not a product change because the authoritative
architecture already satisfies it; the cited evidence remains the controlling proof.

| Item | Disposition | Evidence |
| --- | --- | --- |
| ZH-001 | FIXED | `scripts/check-pilot-readiness-parity.mjs`, `scripts/test-pilot-readiness-parity.mjs`, P14-T22 |
| ZH-002 | FIXED | `.github/workflows/ci.yml`, `scripts/check-ci-contract.mjs`, P14-T23 |
| ZH-003 | FIXED | `playwright.config.ts`, `tests/e2e/domain/stateful-harness.e2e.ts`, P14-T24 |
| ZH-004 | FIXED | `tests/e2e/domain/won-flow.e2e.ts`, P14-T25 |
| ZH-005 | FIXED | `tests/e2e/domain/lost-flow.e2e.ts`, P14-T26 |
| ZH-006 | FIXED | `scripts/test-p14-client-integrity.mjs`, trusted Client migration, P14-T27 |
| ZH-007 | FIXED | `src/lib/components/clients/ClientMaintenance.svelte`, Client action preservation, P14-T27 |
| ZH-008 | FIXED | `scripts/test-p14-contact-integrity.mjs`, Client-first lock-order migration, P14-T28 |
| ZH-009 | FIXED | `src/routes/tasks/+page.server.ts`, `src/routes/tasks/+page.svelte`, P14-T29 |
| ZH-010 | FIXED | `src/lib/domain/quotes/document.spec.ts`, P14-T30 |
| ZH-011 | FIXED | `src/lib/server/quote-actions.ts`, quote email/provider tests, P14-T31 |
| ZH-012 | FIXED | `tests/e2e/domain/navigation.e2e.ts`, `scripts/test-p14-navigation.mjs`, P14-T32 |
| ZH-013 | FIXED | `playwright.config.ts`, Component Lab disabled navigation proof, P14-T32 |
| ZH-014 | NON-BLOCKER | `docs/ARCHITECTURE.md` already defines DB-centric layering and no misleading service scaffolding is required, P14-T34 |
| ZH-015 | FIXED | `scripts/verify-test-evidence.mjs`, `scripts/generate-test-evidence.mjs`, v1.3.2 registry, P14-T34 |
| ZH-016 | FIXED | `tests/e2e/domain/product-flow.e2e.ts`, `tests/e2e/domain/role-accessibility.e2e.ts`, P14-T33 |
| ZH-017 | FIXED | `.agent/goal-loop/STATE.json`, release evidence/manifest, P14-T34 |
| ZH-018 | FIXED | `scripts/test-p14-mutation-parity.mjs` executes current-schema boundary suites, P14-T35 |
