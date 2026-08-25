# Zephyr CRM Dependency & Toolchain Baseline Amendment

**Document Version:** 1.0.1
**Parent Authority:** `DEPENDENCY_BASELINE_v1.0.0.md`
**Roadmap:** `CRM_IMPLEMENTATION_ROADMAP_v1.3.2.md`
**Status:** Architecture Law / Additive P14 Amendment
**Effective Date:** 2026-08-24

## Purpose

This amendment preserves every responsibility and governance rule in the
v1.0.0 dependency baseline while approving one narrowly scoped production
capability required by the P14 hardening authority.

## Approved additive capability

| Package   | Exact version | Responsibility                                    | Boundary                                                                     |
| --------- | ------------: | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pdf-lib` |      `1.17.1` | Deterministic customer-facing Quote PDF rendering | Domain document generation only; no UI, persistence, or provider integration |

`pdf-lib@1.17.1` is approved because the existing prototype renderer cannot
produce production-fit, deterministic, multi-page customer documents with the
required supported-character behavior. No approved dependency already owns PDF
generation, and no second PDF or document framework is introduced.

The package is exact-pinned in `package.json` and recorded in `bun.lock`.
Worker compatibility is proven by the local build and release document tests.
The renderer uses an explicit embedded standard-font contract, immutable quote
snapshot data, deterministic metadata settings, and a fail-closed unsupported
glyph error. It must never substitute generic company identity or silently
discard customer text.

All other dependency, lockfile, package-manager, upgrade, and toolchain laws in
`DEPENDENCY_BASELINE_v1.0.0.md` remain binding.
