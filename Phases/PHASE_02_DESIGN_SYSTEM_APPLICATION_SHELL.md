# Phase 2 — Design System & Application Shell

**Project:** Small Business CRM  
**Roadmap Version:** 1.1.0  
**Phase:** 2  
**Milestone:** M0 — Foundation  
**Status:** Implementation Authority  
**Architecture:** SvelteKit + TypeScript + Cloudflare Pages + Supabase PostgreSQL/Auth/RLS/Storage/Edge Functions/Cron + SendPulse + WordPress/Bricks  
**Deployment model:** One isolated stack per client

> This document is the execution authority for this phase. The coding agent must not expand beyond this boundary without an explicit architecture decision.

---

# Exact Goal

Establish the reusable visual language, semantic design tokens, accessibility baseline, and application shell before feature screens are built, so later UI work does not create design debt or client-specific forks.

# Preconditions

Phase 1 quality gates pass. No CRM business UI should yet be considered final.

# Phase Boundary

This phase owns only the work described below. Any adjacent capability not listed under **MUST happen** is out of scope unless required solely to make a listed item testable.

# MUST Happen

- Define semantic tokens for typography, spacing, radii, surfaces, borders, text, primary/accent, success/warning/danger/info.
- Define semantic pipeline-state tokens without hard-coding feature colours throughout components.
- Create a small primitive component set: Button, IconButton, Input, Textarea, Select, Checkbox, Badge, Card, StatCard, DataTable shell, FilterBar shell, Modal/Drawer, PageHeader, SectionHeader, Empty/Loading/Error states.
- Create AppShell, Sidebar, Topbar, responsive main content layout, and navigation.
- Ensure components support keyboard focus, labels, disabled state, errors, and responsive layouts.
- Keep client branding configurable through tokens/settings rather than component forks.
- Provide a visual/component test route or Storybook-equivalent only if it remains lightweight and justified.

# MUST NOT Happen

- Do not build functional Leads, Quotes, Clients, Tasks, Reports, or Settings screens.
- Do not add business API calls.
- Do not hard-code one client's brand throughout components.
- Do not create dozens of speculative components before real feature demand exists.
- Do not use raw arbitrary colours where a semantic token exists.
- Do not make desktop-only layouts.

# Detailed Execution Breakdown

| Sub-phase | Exact Outcome |
|---|---|
| **P2.1 Token Contract** | Create design primitives and semantic tokens. |
| **P2.2 Form Primitives** | Implement accessible form controls and validation presentation. |
| **P2.3 Data/Feedback Primitives** | Implement cards, badges, table shell, loading/error/empty states. |
| **P2.4 Application Shell** | Implement sidebar, topbar, responsive content frame, navigation. |
| **P2.5 Accessibility Baseline** | Keyboard, focus, labels, contrast, reduced-motion considerations. |
| **P2.6 Brand Override Proof** | Prove a brand can be changed by token/config changes without component edits. |

# Mandatory Test Matrix

**Every test below is a release gate for this phase. A phase cannot be marked complete while any mandatory test is failing, skipped without an explicit written waiver, or replaced by an unverified assumption.**

| ID | Mandatory Test | Type | Exact Pass Criterion |
|---|---|---|---|
| `P2-T01` | Component render | Unit/browser | Every base component renders without runtime errors in default, disabled, error, and loading states where applicable. |
| `P2-T02` | Keyboard navigation | Browser | Primary shell/navigation and interactive primitives can be reached and operated by keyboard. |
| `P2-T03` | Label/accessibility check | Browser/a11y | Form controls have programmatic labels; obvious accessibility violations are absent. |
| `P2-T04` | Responsive shell | Browser | Shell is usable at mobile, tablet, and desktop widths without horizontal overflow from layout chrome. |
| `P2-T05` | Token compliance | Static review | Core primitives do not duplicate client brand values where semantic tokens exist. |
| `P2-T06` | Brand swap proof | Browser/manual | Changing the configured brand tokens visibly updates the shell/primitives without editing component source. |
| `P2-T07` | Project quality gate | Automated | All Phase 1 quality commands still pass. |

# Definition of Done

- Feature teams can compose screens from existing primitives.
- Branding can be changed globally.
- The app shell is responsive and accessible enough to become the permanent base.

# Handoff to Next Phase

Phase 3 may implement identity, persistence, and permissions. It should reuse the shell but not yet build full CRM feature screens.

# Phase Closure Checklist

- [ ] All MUST items are implemented or documented exactly as required.
- [ ] No MUST NOT item was introduced.
- [ ] Every mandatory phase test passes.
- [ ] All prior-phase regression tests still pass and none were weakened, skipped, or removed merely to make this phase pass.
- [ ] Project-wide format/lint/type/test/build/database/diff gates pass.
- [ ] Migrations are deterministic and clean where applicable.
- [ ] Security/RLS assumptions are test-backed where applicable.
- [ ] No secrets are exposed.
- [ ] No unrelated feature scope was introduced.
- [ ] Git diff is reviewable and limited to this phase's outcomes.
- [ ] Phase documentation is updated to match the implemented truth.

# Global Rules Inherited by This Phase

The following rules apply to every phase:

1. **One codebase, isolated client deployments.**
2. **PostgreSQL is the durable source of truth.**
3. **RLS is mandatory for exposed business data.**
4. **Secrets must never enter browser code or public environment variables.**
5. **Sent quotes are immutable.**
6. **External integrations must be retry-safe and idempotent.**
7. **Do not introduce Redis, microservices, Kafka, background infrastructure, or a separate analytics system unless a measured requirement proves they are necessary.**
8. **Use the smallest number of tools and dependencies necessary.**
9. **Do not implement functionality allocated to a later phase.**
10. **Every phase closes with focused tests plus the complete existing project quality gate.**

# Standard Agent Tool Policy

Use only the tools required by the current task.

**Default tools**
- filesystem read/write
- shell
- git

**Add only when required**
- Supabase CLI for schema, migrations, Edge Functions, Auth/RLS, or database tests
- browser for UI or end-to-end verification
- SendPulse/API access only for the communication integration phase and explicit end-to-end verification
- WordPress/Bricks access only for webhook integration verification

Do not browse, install dependencies, or call external services merely because they are available.

# Global Execution STOP Conditions

Execution may stop only under a genuine `AGENTS.md` **EXECUTION STOP** condition. Ordinary test/build/lint/migration failures, phase completion, or reaching this phase's scope boundary are not execution stops; diagnose/repair or close the phase as defined by `AGENTS.md`.

# Phase Close Condition

Once all required outcomes in this document are implemented, every mandatory phase test passes, all completed-phase regression gates still pass, the project-wide quality gate passes, migrations are clean, and no unrelated scope was introduced:

1. **STOP WORK ON THIS PHASE.**
2. Mark the phase `COMPLETE`.
3. Persist `STATE.json` / `STATE.md` and the local phase handoff.
4. Create a safe local checkpoint commit when permitted and isolatable.
5. **Immediately advance to the next dependency-valid phase.**

This is a **PHASE CLOSE**, not an `EXECUTION STOP`. Do not “improve” adjacent systems before advancing.

---
