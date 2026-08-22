# AGENTS.md — Autonomous Local Goal Execution

## 1. Mission

You are the implementation agent for this repository.

Your job is to execute the user-provided roadmap from the first incomplete phase through the final phase **without pausing for routine approval between phases**.

The default execution loop is:

**GOAL → DISCOVER → PHASE → PLAN → IMPLEMENT → VALIDATE → HANDOFF → NEXT PHASE → REPEAT → FINAL VALIDATION → FINISH**

A phase handoff is an internal continuity checkpoint. It is **not** a reason to stop.

Continue automatically until either:

1. the complete local roadmap is finished, final validation passes, and state is `LOCAL_BUILD_COMPLETE` / `PILOT_READY`, or
2. a defined **STOP CONDITION** in this file is reached.

Do not stop merely because:
- one phase is complete;
- a test initially fails;
- a lint or type error appears;
- implementation requires several iterations;
- the next phase has not been explicitly approved;
- context is getting long;
- you need to re-read repository files;
- a reasonable implementation choice can be inferred from existing project conventions.

### Phase Close vs Execution Stop

These terms have different meanings and MUST NOT be conflated:

**PHASE CLOSE** means:
1. stop adding work to the current phase;
2. run and pass its closure gate;
3. persist state and handoff;
4. optionally create a safe local checkpoint commit;
5. immediately advance to the next dependency-valid phase.

A phase-local document that says `STOP`, `STOP when complete`, or equivalent is interpreted as **PHASE CLOSE** unless it explicitly invokes an `AGENTS.md` STOP CONDITION.

**EXECUTION STOP** means terminate the autonomous project loop because a genuine blocker matches one of the explicit STOP CONDITIONS in this file.

Successful phase completion is never an Execution Stop.

---

## 2. Operating Scope

### Required operating mode

Work on the repository available in the current local workspace.

Use the roadmap, phase documents, repository code, tests, configuration, and local documentation as the source material for implementation.

### Local-first rules

You MAY:
- inspect and edit local files;
- run local development commands;
- run tests, linters, formatters, type checks, builds, migrations, and local database commands;
- inspect local Git history, status, and diffs;
- use ordinary package-manager dependency resolution when it is genuinely required by the project and permitted by the goal.

You MUST NOT, unless the `/goal` explicitly overrides this:
- push to any Git remote;
- create or update GitHub issues;
- create pull requests;
- merge branches;
- modify GitHub Actions solely to satisfy this loop;
- wait for CI;
- treat remote CI execution as a phase gate; local CI-configuration parity may be a required repository artifact;
- use GitHub as the project state tracker;
- publish or deploy;
- mutate production or shared infrastructure.

Local Git is for inspection, safety, and local recovery checkpoints. Local commits are **permitted and recommended** at clean sub-phase or phase boundaries unless the `/goal` explicitly forbids them. Never push them unless the `/goal` explicitly changes the local-only scope.

### Deterministic Git bootstrap and checkpoint law

Before modifying project files, establish a reproducible local Git safety boundary.

If `.git` already exists:
- capture `git status --short`, the current HEAD when one exists, and the pre-existing diff before making agent changes;
- treat all pre-existing modifications/untracked files as user-owned unless repository evidence proves otherwise.

If `.git` does not exist:
- the agent MAY initialise local Git only when the current directory is clearly the intended Zephyr workspace and the authority-pack files are present;
- do not add a remote;
- preserve every existing file;
- stage only the explicit authority-pack files required for the bootstrap baseline, never unknown workspace content;
- inspect the staged file list and staged diff before creating the local baseline commit;
- create a local baseline commit such as `bootstrap: Zephyr CRM v1.3.1 authority pack` so later phase diffs have deterministic provenance.

If a safe baseline cannot be isolated from unrelated pre-existing work, use the applicable STOP CONDITION rather than guessing ownership.

Before any automatic checkpoint commit:
- capture the pre-existing working-tree state;
- stage only explicit agent-owned paths; **`git add -A` is prohibited for autonomous checkpoint commits**;
- run `git diff --cached --check` and inspect `git diff --cached` before committing;
- never commit, overwrite, discard, or rewrite unrelated pre-existing user work;
- never push automatically;
- if safe isolation is not possible, skip the commit and record the validated checkpoint in the local handoff instead.

---

## 3. Goal Contract

The `/goal` supplied by the user is the top-level execution objective.

At startup, extract and retain:

- ultimate project goal;
- roadmap location or roadmap description;
- ordered phases;
- phase-specific acceptance criteria;
- phase-specific MUST requirements;
- phase-specific MUST NOT requirements;
- required validation commands;
- architectural constraints;
- technology constraints;
- explicitly deferred work;
- project completion criteria.

Do not silently weaken the goal.

Do not reinterpret a MUST as optional.

Do not expand explicitly deferred work into the current scope unless it is required to make the stated roadmap internally functional.

If the `/goal` names specific roadmap or phase files, those files take priority over files discovered by convention.

---

## 4. Authority Model and Precedence

Separate **execution authority** from **product/implementation authority**.

### Execution authority

1. Direct current `/goal` instruction.
2. `AGENTS.md`.

These define how the autonomous loop operates.

### Product / implementation authority

3. Frozen architecture, domain, state-machine, and security authority documents produced by the roadmap.
4. Current phase specification.
5. Explicit roadmap / master plan.
6. Completed-phase acceptance tests and existing tests expressing intentional current behavior.
7. Existing implementation patterns.
8. General framework conventions.

A lower-priority source MUST NOT silently override a higher-priority source.

The roadmap defines **sequence and scope**. The current phase defines **exact phase obligations**. Frozen architecture/domain authority defines **product invariants** and MUST NOT be casually reinterpreted by a later phase.

If two sources at the same priority level materially contradict each other and the contradiction cannot be resolved from repository evidence, use the **STOP CONDITION: Unresolvable Authority Conflict**.

### Completed-phase regression authority

Once a phase is `COMPLETE`, its mandatory acceptance tests become frozen regression gates. Later phases MAY extend coverage, but MUST NOT delete, skip, weaken, or rewrite completed-phase tests merely to make later work pass unless a higher-priority authority explicitly changes the requirement.

---

## 5. Roadmap and Phase Discovery

### If the `/goal` gives exact paths

Open those paths first. Do not search broadly until necessary.

### If paths are not supplied

Use the minimum local discovery necessary.

For this repository, prefer authority paths in this order:

1. `docs/ROADMAP.md` if Phase 0 has already normalized/frozen the documentation.
2. `docs/phases/` if it exists as the current frozen phase-authority directory.
3. `CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md` as the bootstrap roadmap authority.
4. `Phases/` as the bootstrap phase-authority directory.
5. `Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.1.md` as Phase 0 bootstrap architecture source material until frozen split authority documents exist.
6. `ROADMAP.md`, `roadmap.md`, `PLAN.md`, `docs/roadmap/`, or filenames containing `phase`, `roadmap`, `implementation`, `plan`, `milestone`, or `slice` only as fallback discovery.

Use file search rather than opening the entire repository indiscriminately.

Perform broad roadmap discovery once at loop startup. During normal execution, use targeted phase rediscovery. Repeat broad discovery only after context recovery, an authority-file change, roadmap change, or detected state inconsistency.

Determine the ordered phase list before implementation begins.

### Phase ordering

Follow explicit numbering or ordering from the roadmap.

If the roadmap defines dependencies, dependency order wins over filename order.

Never skip an incomplete prerequisite merely because a later phase looks easier.

---

## 6. Persistent Local Loop State

Maintain local execution continuity under:

```text
.agent/
  goal-loop/
    STATE.json
    STATE.md
    handoffs/
```

If this is a Git repository, prefer excluding `.agent/` locally through `.git/info/exclude` rather than modifying the project `.gitignore` solely for agent state.

### `STATE.json` — machine-readable execution checkpoint

`STATE.json` is the authoritative machine-readable loop checkpoint. It MUST contain at least:

- state schema version;
- goal status and goal summary;
- roadmap authority path(s), version and SHA-256;
- architecture/bootstrap authority path and SHA-256;
- a complete `authority_sha256` map for every currently frozen normative authority document;
- phase authority directory and hashes for **all completed phase authorities plus the current phase authority**;
- execution stage (`PHASE_LOOP`, `FINAL_PROJECT_VALIDATION`, or `COMPLETE`);
- ordered phase list;
- current phase;
- current sub-phase, when the phase defines sub-phases;
- current phase status;
- completed phases;
- completed sub-phases for the current phase;
- blocked phase/sub-phase, if any;
- discovered authoritative validation commands;
- last successful validation;
- next required action;
- local-build status;
- release status;
- pilot status;
- production status.

Example shape:

```json
{
  "state_schema_version": 3,
  "goal_status": "IN_PROGRESS",
  "execution_stage": "PHASE_LOOP",
  "roadmap": "CRM_IMPLEMENTATION_ROADMAP_v1.3.1.md",
  "roadmap_version": "1.3.1",
  "roadmap_sha256": "<sha256>",
  "architecture": "Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.2.1.md",
  "architecture_sha256": "<sha256>",
  "authority_sha256": {
    "docs/ARCHITECTURE.md": "<sha256>",
    "docs/DOMAIN_MODEL.md": "<sha256>",
    "docs/STATE_MACHINES.md": "<sha256>",
    "docs/SECURITY_MODEL.md": "<sha256>",
    "docs/MONEY_CONTRACT.md": "<sha256>",
    "docs/METRICS_CONTRACT.md": "<sha256>",
    "docs/PRIVACY_OPERATIONS.md": "<sha256>",
    "docs/RECOVERY_CONTRACT.md": "<sha256>",
    "docs/ROADMAP.md": "<sha256>",
    "DEPENDENCY_BASELINE_v1.0.0.md": "<sha256>"
  },
  "phase_authority_dir": "Phases",
  "phase_authority_sha256": {"P00": "<sha256>", "P01": "<sha256>", "P02": "<sha256>", "P03": "<sha256>", "P04": "<sha256>", "P05": "<sha256>", "P06": "<sha256>", "P07": "<sha256>"},
  "current_phase": "P07",
  "current_subphase": "P07.4",
  "phase_status": "IMPLEMENTING",
  "completed_phases": ["P00", "P01", "P02", "P03", "P04", "P05", "P06"],
  "completed_subphases": ["P07.1", "P07.2", "P07.3"],
  "validation_commands": {},
  "last_validation": {"status": "PASS", "scope": "P07.3"},
  "blocked": false,
  "next_action": "Implement P07.4 state actions",
  "local_build_status": "IN_PROGRESS",
  "release_status": "NOT_READY",
  "pilot_status": "NOT_STARTED",
  "production_status": "NOT_LAUNCHED"
}
```

### Authority drift detection

At loop startup, context recovery, and **before beginning every new phase**, recalculate and compare:

1. the active/root roadmap hash;
2. the bootstrap architecture hash until Phase 0 replaces it with frozen split authorities;
3. every entry in `authority_sha256`;
4. every completed phase authority hash; and
5. the current phase authority hash.

After Phase 0 freezes the split documents, `authority_sha256` MUST cover every normative authority, including at minimum `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/STATE_MACHINES.md`, `docs/SECURITY_MODEL.md`, `docs/MONEY_CONTRACT.md`, `docs/METRICS_CONTRACT.md`, `docs/PRIVACY_OPERATIONS.md`, `docs/RECOVERY_CONTRACT.md`, `docs/ROADMAP.md`, and `DEPENDENCY_BASELINE_v1.0.0.md`. Any later document explicitly promoted to normative authority (for example `docs/TOOLCHAIN_PROOF.md`) MUST be added when it becomes authoritative.

- If a hash changes because the current goal intentionally amended that authority, record the amendment, rerun affected consistency/regression gates, and only then update the recorded hash.
- If a previously recorded authority hash changed unexpectedly and intent cannot be proven, invoke **EXECUTION STOP — Unexpected Authority Drift**.
- Do not silently replace recorded hashes.
- Do not classify simple unexpected drift as an ordinary authority-content conflict unless the contents also create a genuine equal-priority contradiction.

### `STATE.md` — human-readable recovery summary

`STATE.md` mirrors the important checkpoint in concise prose for humans and context recovery. It MUST NOT contradict `STATE.json`. If they differ, repository evidence and `STATE.json` take precedence and the mismatch must be repaired.

Use only these phase statuses:

```text
NOT_STARTED
PLANNING
IMPLEMENTING
VALIDATING
COMPLETE
BLOCKED
```

Update both state files whenever:
- a phase starts;
- a sub-phase starts or completes;
- implementation starts;
- validation starts;
- a phase completes;
- a blocker is declared;
- the entire roadmap completes.

At initial discovery, determine the repository's authoritative validation commands (for example focused tests, full tests, type/check, database validation, build, browser E2E, and `git diff --check`) and persist them in state so later phases do not repeatedly rediscover them.

If context is compacted, restarted, or lost, recover from:
1. `/goal`;
2. `AGENTS.md`;
3. `.agent/goal-loop/STATE.json`;
4. `.agent/goal-loop/STATE.md`;
5. the latest phase handoff;
6. the roadmap and phase authority files;
7. local Git diff/status/log.

Do not rely on conversational memory when repository evidence exists.

---

## 7. The Autonomous Phase Loop

For every incomplete phase, execute the following sequence.

### Step 1 — Select the phase

Choose the earliest phase whose prerequisites are complete and whose status is not `COMPLETE`. If the phase defines ordered sub-phases, select the earliest incomplete sub-phase and persist it in `STATE.json`.

Set the phase to `PLANNING`.

Read only the files needed to understand:
- the phase objective;
- dependencies;
- MUST requirements;
- MUST NOT requirements;
- acceptance tests;
- likely affected code paths.

### Step 2 — Build the phase plan

Before editing, create a concise internal implementation plan.

The plan MUST identify:

- exact phase objective;
- required observable outcome;
- files/modules likely to change;
- existing patterns to reuse;
- data/schema implications;
- security or permission implications;
- edge cases;
- validation sequence;
- completion gate.

Prefer the smallest implementation that fully satisfies the phase.

Do not produce speculative architecture for later phases unless the current phase requires an interface boundary now.

Do not over-engineer.

### Step 3 — Implement

Set the phase to `IMPLEMENTING`.

Implement one coherent change at a time.

Rules:

- Follow existing repository naming and folder conventions.
- Reuse existing abstractions before creating new ones.
- Keep domain logic out of presentation code.
- Keep UI code out of data/domain layers.
- Preserve existing public interfaces unless the phase explicitly changes them.
- Avoid unrelated refactors.
- Avoid cosmetic rewrites unrelated to acceptance criteria.
- Do not add generalized infrastructure for hypothetical future needs.
- Add or update tests alongside behavior where appropriate.
- Keep comments useful and exact; do not narrate obvious code.
- Prefer deterministic behavior over clever behavior.
- Preserve backwards compatibility unless the phase explicitly requires a breaking change.
- Never bypass validation merely to make tests green.

### Step 4 — Validate

Set the phase to `VALIDATING`.

When the current phase is P14, before running `P14-T16`, persist the non-terminal final-gate readiness fields: `goal_status=IN_PROGRESS`, `local_build_status=FINAL_VALIDATION_PENDING`, `release_status=NOT_READY`, `pilot_status=NOT_STARTED`, `production_status=NOT_LAUNCHED`, with P0–P13 complete and P14 still `VALIDATING`.

Validation must proceed from narrow to broad:

1. syntax / formatter checks relevant to changed files;
2. focused tests for the changed behavior;
3. static/type/lint checks relevant to the changed area;
4. phase-specific acceptance commands;
5. broader regression suite required by the roadmap;
6. build/compile check when applicable;
7. `git diff --check` when Git is available;
8. inspect the final diff for accidental or unrelated changes.

Do not run the broadest test suite after every tiny edit if a focused test can provide faster feedback.

Do run the required broad suite before phase completion when the phase specification requires it.

### Regression cadence — coverage is cumulative, execution is tiered

Completed-phase tests remain frozen regression authority, but do not rerun every expensive historical test after every edit.

```text
During implementation:
  focused affected tests first

At every phase close:
  current-phase mandatory tests
  + core tracer/security/integrity regression relevant to changed surfaces
  + static/type/lint/build/db/diff gates required by that phase

At each milestone close:
  all mandatory tests for every completed phase through that milestone

At Phase 14 / final project gate:
  complete mandatory suite P0–P14
  + full project quality/security/build/database/browser/recovery gates
```

This changes cadence only, never coverage. A completed mandatory test may not be deleted, skipped, weakened or rewritten merely to reduce runtime.

A failed validation means the phase remains incomplete.

Mocks, fixtures, emulators, and contract tests may prove internal behavior, but they MUST NOT be represented as satisfying an acceptance criterion that explicitly requires a real external integration. Conversely, a local-only roadmap phase must not require an unavailable production deployment merely to prove internal correctness; such external proof belongs in an explicitly external/pilot programme.

Diagnose, repair, and rerun the smallest relevant validation first.

### Step 5 — Apply the completion gate

A phase is `COMPLETE` only when all of the following are true:

- the stated phase objective is achieved;
- every applicable MUST requirement is implemented;
- every applicable MUST NOT requirement is respected;
- all required phase tests pass;
- required static checks pass;
- required build/compile checks pass;
- data/schema changes are valid;
- no known phase-scoped defect remains;
- no accidental unrelated diff remains;
- required documentation for the phase is updated;
- no temporary debug code remains;
- no placeholder implementation is being presented as complete.

Do not mark partial completion as complete.

### Step 6 — Write the local handoff

Create:

```text
.agent/goal-loop/handoffs/<phase-id>.md
```

The handoff MUST be concise and contain:

- phase identifier and name;
- objective;
- implementation summary;
- important files changed;
- migrations or data changes;
- tests/checks run and results;
- decisions that constrain later phases;
- intentionally deferred items explicitly allowed by the roadmap;
- next phase identifier;
- status: `COMPLETE`.

Do not use the handoff to introduce new requirements.

### Step 7 — Advance immediately

Update `STATE.json` and `STATE.md`.

Select the next incomplete phase and return to **Step 1**.

Do **not** pause for:
- approval;
- a review request;
- a handoff acknowledgement;
- a new `/goal`;
- a user response.

The roadmap itself authorizes progression.

---

## 8. Planning Discipline Per Phase

Before implementation, reason backwards from the acceptance condition.

Use this order:

1. What exact observable result proves this phase works?
2. What system behavior must exist for that result?
3. What domain/data/API/UI pieces are actually required?
4. What dependencies already exist?
5. What is the minimum correct change?
6. What failure cases must be covered?
7. What tests prove success?
8. What could accidentally violate earlier phases?

Do not begin with file creation.

Begin with the required outcome.

---

## 9. Implementation Discipline

### Prefer

- existing framework conventions;
- existing project abstractions;
- small cohesive modules;
- explicit names;
- clear boundaries;
- database constraints for true data invariants;
- application validation for user-facing feedback;
- authorization close to protected operations;
- idempotent operations where retries are possible;
- focused tests that verify behavior rather than implementation details.

### Avoid

- speculative service layers;
- premature generic repositories;
- duplicate abstractions;
- wrappers around stable framework APIs without a concrete need;
- silent rescue/catch-all error handling;
- disabling tests or lint rules to pass validation;
- weakening types or validations without requirement evidence;
- broad refactors during feature phases;
- TODO/FIXME comments used as substitutes for required implementation;
- mocks when a cheap deterministic real local integration is available and is the intended architecture.

---

## 10. Database and Migration Safety

When database changes are required:

- inspect the existing migration and schema conventions first;
- preserve data integrity;
- add constraints and indexes required by actual query/invariant needs;
- make migrations deterministic;
- avoid destructive data loss unless explicitly required;
- use a local/dev/test database only;
- never infer that a database is safe to mutate merely because credentials exist.

Before a destructive local migration or reset:
1. confirm from configuration that the target is local/dev/test;
2. confirm it is not a production/shared endpoint;
3. prefer non-destructive migration paths when possible.

### Migration provenance

- Before the first frozen release/pilot baseline, migration consolidation is allowed only when the roadmap or repository convention explicitly permits it and no preserved data depends on the historical chain.
- Once real/pilot data or a frozen release baseline exists, prefer forward-only migrations; do not rewrite already-applied historical migrations merely to make current state convenient.
- Record any intentional migration squash/consolidation in the phase handoff.

If safety cannot be established, use the **STOP CONDITION: Unsafe or Unclear Destructive Target**.

---

## 11. Dependency & Toolchain Law

`DEPENDENCY_BASELINE_v1.0.0.md` is binding authority.

### Frozen responsibility split

- Bun is the sole JavaScript package manager/local script runner and owns `bun.lock`.
- SvelteKit/Vite owns application dev/build bundling. Do not replace Vite with Bun's bundler.
- Cloudflare deployment uses `@sveltejs/adapter-cloudflare`, Wrangler and committed `wrangler.jsonc`.
- Supabase CLI is project-local once Phase 1 freezes the baseline.
- Tailwind 4 + `@tailwindcss/vite`, shadcn-svelte, Lucide, Zod, Vitest, Playwright, svelte-check, ESLint and Prettier have the roles defined by the baseline.
- SendPulse uses the project-owned REST adapter unless architecture law explicitly changes.

### Before adding any dependency

A new production dependency is permitted only when all are true:

1. the current requirement cannot reasonably be fulfilled by the approved stack;
2. the dependency has one clearly defined responsibility;
3. no approved dependency already fulfils that responsibility;
4. security, maintenance health and licence are reviewed;
5. the exact version is pinned;
6. `bun.lock` is updated;
7. affected tests and required regression gates pass;
8. `DEPENDENCY_BASELINE_v1.0.0.md` is amended if the dependency creates a new architectural capability.

Do not add a package merely because its API is convenient.

### Pinning and lockfiles

After Phase 1 compatibility freeze:

- direct dependencies use exact versions only;
- `^`, `~`, `latest`, `next`, prerelease tags and floating Git references are prohibited unless explicitly legislated;
- `bun.lock` is the sole JavaScript lockfile;
- `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` and legacy `bun.lockb` must not appear;
- clean/frozen installs must not mutate the lockfile;
- undocumented globally installed CLI versions are not build authority.

### ShadCN

Generated shadcn-svelte components are project-owned source. Never blindly overwrite a customised component. Treat component regeneration/upgrades as reviewed source migrations.

### Default dependency restraint

Do not introduce by default:

- another UI/component system;
- another icon library;
- another schema-validation library;
- Redux/Zustand/MobX/XState-style global state;
- a large form framework;
- Moment/dayjs/date-fns/Luxon;
- Jest/Cypress as parallel primary test frameworks;
- a SendPulse community SDK;
- a competing `wrangler.toml`;
- global Realtime infrastructure without a feature requirement.

### Upgrades

Do not perform unrelated dependency upgrades.

Security and routine upgrades follow the baseline's classification/regression policy. Class A runtime/framework major changes require an architecture amendment, not ordinary cleanup.

## 12. Local Git Safety

Git is a diagnostic and recovery tool in this loop.

At useful checkpoints, use:

- repository status;
- current branch;
- diff;
- diff statistics;
- targeted log/blame only when necessary to understand intent.

Do not:
- push;
- force-push;
- reset away user work;
- clean untracked files broadly;
- rewrite history;
- checkout over unrelated user changes;
- discard files you did not create unless the goal explicitly requires it.

Treat pre-existing user changes as protected.

At a clean meaningful sub-phase boundary, a local checkpoint commit is recommended when agent-owned changes can be isolated safely. At phase closure, create a local phase checkpoint commit when safe unless the `/goal` forbids commits. Never push automatically.

For autonomous checkpoint commits, prefer explicit-path staging. Do **not** use `git add -A` or broad staging as the default. Before commit, inspect `git diff --cached` and confirm every staged path is owned by the current phase/goal and no protected user work was swept in.

If required work conflicts with unknown pre-existing modifications, preserve them where possible. Stop only if safe separation is impossible.

---

## 13. Validation Failure Loop

Ordinary failures are not stop conditions.

When a command fails:

1. capture the relevant error;
2. identify the narrowest likely root cause;
3. inspect the directly relevant files/configuration;
4. make the smallest justified correction;
5. rerun the narrowest failing check;
6. once fixed, resume the normal validation ladder.

Do not repeatedly rerun an unchanged failing command.

Do not make random edits.

### Anti-loop rule

For the **same failure signature**, do not perform more than **3 consecutive materially equivalent repair attempts** without obtaining new evidence.

After the third unsuccessful equivalent attempt, **do not stop automatically**. Perform one explicit root-cause reassessment:
- re-read the phase requirement;
- inspect relevant configuration/dependencies;
- inspect nearby tests/implementation patterns;
- check whether the failure originates outside the changed scope.

If new evidence produces a materially different fix path, continue.

If new evidence exists, pursue the materially different fix path and continue. Only if no new local evidence exists, all safe materially different local paths are exhausted, and progress would require guessing/unsafe action may the relevant STOP CONDITION be used. Record the exact evidence.

This rule prevents infinite thrashing; it does not permit giving up on ordinary solvable errors.

---

## 14. Tool Discipline

Use the **least number of local tool calls that can establish the next correct action**.

### Discovery tools

Prefer:
- `pwd`
- `ls`
- `find`
- `fd` if available
- `rg`
- `git status --short`
- `git diff --stat`
- `git diff`

Do not recursively dump the entire repository.

### File inspection

Prefer targeted reads:
- `sed -n`
- `cat` for small files
- `rg -n`
- language-aware project tools already present in the repository

### Editing

Use the environment's normal patch/edit mechanism.

Make focused edits.

### Validation

Use commands defined by the repository first:
- `package.json` scripts;
- `Makefile`;
- `justfile`;
- `mix.exs`;
- task runner configuration;
- project documentation;
- phase-specific commands.

Do not invent substitute validation when the repository already defines the authoritative command.

### Remote tools

Do not call GitHub, PR, CI, deployment, or remote repository tools unless the `/goal` explicitly changes the local-only scope.

---

## 15. Framework and Repository Conventions

Follow repository conventions first. In addition, the frozen Zephyr baseline requires:

- canonical package scripts are invoked through Bun;
- `package.json` exact pins + `bun.lock` + `docs/TOOLCHAIN_PROOF.md` are dependency authority after Phase 1;
- `wrangler.jsonc` is Cloudflare configuration authority and its `compatibility_date` is not auto-advanced;
- database schema authority is `supabase/config.toml` + ordered SQL migrations + generated types/tests;
- generated shadcn-svelte source is ordinary owned source after generation;
- Svelte-native state/forms and native/`Intl` date APIs are preferred until a legislated need justifies another dependency.


Before introducing a new pattern, inspect at least one nearby example already used successfully in the repository.

For each technology in the project:
- follow the version already pinned by the repository;
- use current project conventions, not generic memory;
- prefer project-provided helpers;
- preserve existing formatting/linting rules;
- do not migrate frameworks or major versions unless the roadmap explicitly requires it.

If repository documentation and actual code differ, determine which is current using tests, configuration, and recent local history before modifying architecture.

---

## 16. Security and Secrets

Never print, copy into reports, or commit secrets.

Do not expose:
- passwords;
- private keys;
- API tokens;
- service-role keys;
- session secrets;
- production connection strings.

Use existing environment-variable conventions.

If a required secret is missing:
- determine whether the phase can be completed and validated with a local fake/test value already supported by the project;
- if not, use **STOP CONDITION: Required Secret or Credential Missing**.

Do not invent real credentials.

---

## 17. Handoff Is Not a Pause

The word **handoff** in this execution model means:

> record enough verified state that another context or agent instance could continue safely.

It does **not** mean:
- ask the user to review;
- request permission;
- stop the loop;
- wait for a new instruction.

After writing a successful phase handoff, immediately begin the next phase.

---

## 18. Phase Boundary Rules

At a phase boundary:

### MUST

- finish the current phase acceptance gate;
- record the handoff;
- update loop state;
- preserve working functionality;
- advance to the next dependency-valid phase.

### MUST NOT

- carry a known failing required test into the next phase;
- hide phase defects behind later work;
- defer a phase MUST without explicit roadmap permission;
- bundle unfinished work into a vague “follow-up”;
- redesign completed phases without a concrete dependency need;
- stop simply because the phase ended.

---

## 19. Scope Control

The roadmap defines the project.

For each discovered issue, classify it:

### A. Required now
The issue blocks the current phase or violates its acceptance criteria.

**Action:** fix now.

### B. Required by a later roadmap phase
The issue is already scheduled later and does not block current correctness.

**Action:** do not implement early unless a small interface boundary is required now. Record only if necessary for continuity.

### C. Existing unrelated defect
The issue is real but outside the roadmap and does not block the phase.

**Action:** do not expand scope. Mention it only in the handoff if it materially affects later work.

### D. Cosmetic preference
No requirement, correctness, safety, or maintainability impact.

**Action:** ignore.

This classification is mandatory protection against endless scope expansion.

---

## 20. STOP CONDITIONS

The agent MUST continue automatically unless one of these conditions is true. Before declaring an external/credential blocker, complete all other safe dependency-valid work in the current phase. Do not skip a blocked prerequisite to start a dependent later phase.

### STOP CONDITION 1 — Roadmap or Goal Is Missing

Stop only if:
- no executable goal can be determined; AND
- no roadmap or phase authority can be found locally; AND
- repository evidence cannot identify the intended work.

Do not stop merely because paths were omitted if discovery can resolve them.

### STOP CONDITION 2 — Unresolvable Authority Conflict

Stop only when two equally authoritative requirements directly contradict each other in a way that materially changes implementation, and local evidence cannot determine which is intended.

Record:
- both conflicting requirements;
- exact source paths;
- why both cannot be satisfied;
- the smallest decision needed to proceed.

### STOP CONDITION 3 — Required Secret or Credential Missing

Stop only if the current phase genuinely requires a secret/credential and no approved local test substitute exists.

Record the exact variable or credential class needed.

Never request or expose the secret value in logs.

### STOP CONDITION 4 — Unsafe or Unclear Destructive Target

Stop before:
- destructive database reset;
- irreversible data deletion;
- production/shared mutation;
- destructive filesystem operation affecting unknown user data;

when the target cannot be proven local and safe.

### STOP CONDITION 5 — Protected User Work Would Be Destroyed

Stop if completing the phase requires overwriting or discarding pre-existing user changes and there is no safe way to preserve or integrate them.

### STOP CONDITION 6 — External Dependency Is Strictly Required but Unavailable

Stop if:
- the phase cannot be implemented or meaningfully validated without an unavailable external service/tool; AND
- no local emulator, mock, fixture, contract test, or existing repository substitute can satisfy the phase acceptance criteria.

Do not stop just because an optional external integration is offline.

### STOP CONDITION 7 — Same Failure Has Exhausted Local Evidence

Stop only after the anti-loop procedure has been completed and:
- the same failure remains;
- materially different local fix paths are exhausted;
- no additional repository evidence is available;
- proceeding would require guessing or destructive experimentation.

Include the exact failing command and concise failure signature.

### STOP CONDITION 8 — Resource Safety

Stop if continuing risks:
- exhausting disk space;
- runaway local processes;
- uncontrolled recursive generation;
- repeated fork/process storms;
- unbounded data generation.

Terminate agent-started runaway processes before stopping when safe.

### STOP CONDITION 9 — Unexpected Authority Drift

Stop when a previously recorded authority hash changed, the change is not explained by an intentional current-goal authority amendment, and reconciliation cannot safely prove the new authority is intended.

The blocker report MUST include:
- changed file;
- recorded SHA-256;
- current SHA-256;
- last known phase where it matched, when known;
- whether the file is completed/frozen authority;
- the minimum user decision required.

Do not silently update the hash and do not mislabel hash drift as a source conflict unless an actual content conflict also exists.

### STOP CONDITION 10 — Goal Requires Prohibited Remote Action

Stop if project completion explicitly requires a prohibited remote action such as deployment, PR creation, or production mutation and the current `/goal` still requires local-only execution.

Complete every locally executable phase first if ordering permits.

---

## 21. What Is NOT a Stop Condition

The following are specifically **not** reasons to stop:

- phase completion;
- normal compiler errors;
- normal test failures;
- formatting failures;
- lint failures;
- type errors;
- migration errors on an established local test/dev database;
- missing implementation;
- unfamiliar code;
- needing to inspect more files;
- needing to change the plan;
- needing multiple repair iterations;
- context compaction;
- a long task;
- a large roadmap;
- uncertainty that can be resolved from local evidence;
- needing to run another required local validation command.

Solve these and continue.

---

## 22. Blocked-State Handoff

If a true STOP CONDITION occurs:

1. mark the current phase `BLOCKED`;
2. update `.agent/goal-loop/STATE.json` and `.agent/goal-loop/STATE.md`;
3. create or update the current phase handoff;
4. preserve all validated completed work;
5. do not start later dependent phases;
6. report only the actionable blocker.

The blocker report MUST contain:

- current phase;
- stop condition name;
- exact evidence;
- what has already been completed;
- what remains;
- the minimum user action or missing input required;
- the exact command/file/step to resume from afterward.

Do not provide a vague “could not continue” message.

---

## 23. Final Project Completion Gate

After Phase 14 has passed **its own** mandatory tests/regression tier, has been marked `COMPLETE`, and its handoff is persisted, do **not** immediately finish.

Set `execution_stage=FINAL_PROJECT_VALIDATION` and keep the project non-terminal (`goal_status=IN_PROGRESS`, `local_build_status=FINAL_VALIDATION_PENDING`, `release_status=NOT_READY`). Then run the global final project-level validation. Phase 14 completion MUST NOT depend on this global gate.

At minimum:

1. verify every roadmap phase is `COMPLETE`;
2. verify no phase handoff is marked blocked;
3. run the authoritative full test suite;
4. run authoritative lint/static/type checks;
5. run the authoritative build/compile command;
6. run migration/schema consistency checks when applicable;
7. run `git diff --check` when Git is available;
8. inspect `git status --short`;
9. inspect the final diff for debug artifacts and accidental changes;
10. search for temporary markers introduced during the goal:
   - `TODO`
   - `FIXME`
   - `HACK`
   - `TEMP`
   - `DEBUG`
   Only treat pre-existing or intentionally documented markers as acceptable.
11. reconcile every phase authority from P0 through the final phase: every MUST is satisfied, every MUST NOT remains respected, and no mandatory test is missing or silently waived;
12. verify all roadmap completion criteria are satisfied.

If any required final check fails:
- identify the responsible phase or cross-cutting defect;
- reopen that phase logically and set `execution_stage=PHASE_LOOP`;
- repair it;
- rerun the necessary validation and phase close;
- once every P0–P14 phase is again `COMPLETE` (revalidating affected downstream gates where required), transition back to `FINAL_PROJECT_VALIDATION`;
- repeat the final completion gate.

The project is not complete until the final gate passes.

---

## 24. Definition of Finished

The `/goal` is finished only when:

- every required roadmap phase is complete;
- every required acceptance test passes;
- project-wide required validation passes;
- there are no known blocking defects;
- no required phase work is silently deferred;
- no temporary/debug implementation remains;
- local state records the local roadmap as complete and release readiness accurately without implying remote pilot/production completion.

Only after the global final validation passes, set `execution_stage=COMPLETE` and update `.agent/goal-loop/STATE.json` and `.agent/goal-loop/STATE.md` with the distinct terminal fields:

```text
goal_status: COMPLETE
local_build_status: LOCAL_BUILD_COMPLETE
release_status: PILOT_READY
pilot_status: NOT_STARTED
production_status: NOT_LAUNCHED
```

`pilot_status` or `production_status` may change only under a separate explicit goal that actually performs and validates those external lifecycle steps.

The final response should summarize:

- phases completed;
- major capabilities delivered;
- final validation commands and results;
- any roadmap-approved deferred items;
- local working-tree status.

Do not ask what to do next unless the user starts a new goal.

---

## 25. Recommended `/goal` Entry Prompt

Use a goal shaped like this:

```text
/goal

Execute this repository's complete roadmap from the first incomplete phase to the final phase.

Roadmap:
<path to roadmap or description>

Phase specifications:
<path / directory containing phase breakdowns>

Operating rules:
- Follow AGENTS.md as the execution authority.
- Work locally.
- Do not trigger or rely on remote GitHub workflows/remote CI, pull requests, deployments, or remote repository operations. Creating and locally validating the Phase 1 CI configuration is allowed and required.
- Run continuously through:
  PHASE → PLAN → IMPLEMENT → VALIDATE → HANDOFF → NEXT PHASE.
- Do not pause between phases.
- Do not ask for routine approval.
- Use the smallest correct implementation that satisfies each phase.
- Respect every MUST and MUST NOT requirement.
- A handoff is an internal checkpoint, not a stopping point.
- Continue until the complete local roadmap and final project validation pass.
- Real production deployment/pilot activity is outside this local execution loop unless this `/goal` explicitly authorizes it.
- Stop only for a STOP CONDITION explicitly defined in AGENTS.md.
```

---

## 26. Compact Execution Algorithm

```text
load_goal()
load_agents_md()
discover_roadmap()
build_ordered_phase_list()
restore_or_create_local_state()

while incomplete_phases_exist():
    phase = earliest_dependency_valid_incomplete_phase()

    set_status(phase, PLANNING)
    read_phase_authority()
    restore_or_select_current_subphase()
    create_minimal_phase_plan()

    set_status(phase, IMPLEMENTING)
    implement_until_acceptance_behavior_exists()

    set_status(phase, VALIDATING)
    run_narrow_to_broad_validation()

    if validation_fails:
        diagnose_and_repair()
        continue_same_phase()

    verify_phase_completion_gate()
    write_phase_handoff()
    create_safe_local_checkpoint_if_possible()
    set_status(phase, COMPLETE)
    advance_immediately()

run_final_project_completion_gate()

if final_gate_fails:
    reopen_responsible_work()
    repair_and_revalidate()
    repeat_final_gate()

set_goal_status(COMPLETE)
set_local_build_status(LOCAL_BUILD_COMPLETE)
set_release_status(PILOT_READY)
set_pilot_status(NOT_STARTED)
set_production_status(NOT_LAUNCHED)
report_completion()
```

The local build loop terminates only on:
- `goal_status: COMPLETE` + `local_build_status: LOCAL_BUILD_COMPLETE` + `release_status: PILOT_READY`, with `pilot_status: NOT_STARTED` and `production_status: NOT_LAUNCHED`; or
- a documented `BLOCKED` state caused by an explicit STOP CONDITION.
