# Phase 88 Final Plan Review 2

## Verdict

**BLOCK**

The blocker fixes materially improved Phase 88. The plans now cover P88-R1 through P88-R12, preserve the full living-world/key-NPC co-player architecture from `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`, and no MVP/scope-reduction shortcut is present.

Execution still should not start. Three structural blockers remain: one dependency entry is not a valid plan dependency, task-level verification is not Nyquist-compliant even though `.planning/config.json` enables `workflow.nyquist_validation` and `88-RESEARCH.md` contains `## Validation Architecture`, and four high-risk plans exceed the GSD task-count threshold.

## What Now Passes

| Dimension | Status | Evidence |
| --- | --- | --- |
| Full architecture fidelity | PASS | Plans implement backend authority, versioned jobs/proposals, ActorFrame, PlayerFacingPacket, KeyActorProcess, actor tools, offscreen catch-up, memory/beliefs, faction command networks, WorldThreads, latency traces, rollback, and live proof. |
| Requirement coverage | PASS | Every P88-R1..P88-R12 appears in at least one `requirements` frontmatter list across `88-01` through `88-11`. |
| Context compliance | PASS | `88-CONTEXT.md` non-negotiables are honored: no polling-every-NPC shortcut, no hidden narrator truth, no faction ghost mind, no fake latency pass. |
| Research resolution | PASS | `88-RESEARCH.md` now has `## Open Questions (RESOLVED)`. |
| Sectional architecture | PASS | `88-EXECUTION-WAVES.md` keeps authority/POV/turn-boundary before actor/faction/world-thread expansion, with per-wave evidence folders. |
| AGENTS.md safety | PASS | Every plan includes GitNexus impact preflight and detect-changes postflight in task flow. |
| Pattern compliance | SKIP | No Phase 88 `PATTERNS.md` found. |

## Blockers

### 1. Invalid plan dependency in 88-01

**Severity:** BLOCKER

**Dimension:** dependency_correctness

**Evidence:**

- `88-01-PLAN.md:8` declares `depends_on:`
- `88-01-PLAN.md:9` declares `- Phase 87 complete`
- All other Phase 88 dependencies reference plan ids like `88-01`, `88-02`, etc.

**Why this blocks:**

GSD plan dependencies are plan ids inside the phase. `Phase 87 complete` is a roadmap/preflight dependency, not a Phase 88 plan id. If the executor builds a dependency graph from frontmatter, `88-01` references a non-existent plan and can fail or create an unresolvable dependency.

**Fix:**

In `88-01-PLAN.md` frontmatter, replace:

```yaml
depends_on:
  - Phase 87 complete
```

with:

```yaml
depends_on: []
```

Keep the Phase 87 prerequisite in `.planning/ROADMAP.md` / phase preflight, not in plan-local `depends_on`.

### 2. Task-level automated verification is missing

**Severity:** BLOCKER

**Dimension:** nyquist_compliance / task_completeness

**Evidence:**

- `.planning/config.json:11` sets `nyquist_validation` to `true`.
- `88-RESEARCH.md:144` contains `## Validation Architecture`.
- `88-VALIDATION.md` exists.
- Plans contain many task-level `verify:` blocks, but no `<automated>` blocks and most task verifies are prose checks rather than runnable commands.
- Examples: `88-01-PLAN.md:80`, `88-02-PLAN.md:74`, `88-03-PLAN.md:76`, `88-04-PLAN.md:74`, `88-05-PLAN.md:76`, `88-06-PLAN.md:73`, `88-07-PLAN.md:80`, `88-08-PLAN.md:74`, `88-09-PLAN.md:79`, `88-10-PLAN.md:81`, `88-11-PLAN.md:83`.

**Why this blocks:**

The phase itself says hard invariants must be proven before live routes. Current plan-level commands are useful, but task-level `verify:` sections do not give the executor a fast automated signal per task. That breaks the Nyquist gate and leaves early tasks dependent on manual review.

**Fix:**

For every task in `88-01-PLAN.md` through `88-11-PLAN.md`, add a runnable automated verification command or an explicit `MISSING` reference linked to a preceding task that creates the test. Use the project's XML-style plan convention where possible:

```xml
<verify>
  <automated>npm --prefix backend run test -- src/engine/__tests__/actor-frame.test.ts</automated>
</verify>
```

For audit/artifact tasks, use deterministic existence/content checks, for example:

```xml
<automated>$p = ".planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-2/packet-surface-inventory.md"; if (-not (Test-Path $p)) { throw "Missing packet inventory" }; if ((Get-Content -Raw $p) -notmatch "NarratorPacket") { throw "Packet inventory incomplete" }</automated>
```

### 3. Several plans exceed GSD task-count threshold

**Severity:** BLOCKER

**Dimension:** scope_sanity

**Evidence:**

- `88-01-PLAN.md` has 5 tasks.
- `88-02-PLAN.md` has 5 tasks.
- `88-07-PLAN.md` has 5 tasks.
- `88-11-PLAN.md` has 5 tasks.

**Why this blocks:**

The GSD plan-checker threshold treats 5+ tasks in one plan as a split-required scope risk. These are high-risk runtime slices touching authority, visibility, memory, and final verification. Even with preflight/proof tasks included, the executor context risk is real.

**Fix:**

Split or collapse these into 2-3 implementation tasks plus a separate checkpoint/proof task, or create small follow-on checkpoint plans:

- `88-01`: split authority schema/ToolResult from rollback invalidation proof if needed.
- `88-02`: split ActorFrame/CommandNodeFrame from PlayerFacingPacket/Narrator leak proof if needed.
- `88-07`: split knowledge model from memory/retrieval/reflection if needed.
- `88-11`: split final deterministic integration from Playwright/live closeout if needed.

## Flags

| Flag | Severity | Owner wave | Fix during execution |
| --- | --- | --- | --- |
| `ContextBudgetTrace` appears in Wave 2 and again as a dedicated module in `88-10`; schema drift risk. | WARNING | Wave 2 and Wave 7 | Wave 2 should define the minimal trace contract; Wave 7 should extend it without changing field meanings. |
| `88-EXECUTION-WAVES.md` groups some dependent plans in the same conceptual wave (`88-04` -> `88-05`, `88-06` -> `88-07`, `88-08` -> `88-09`, `88-10` -> `88-11`). | WARNING | Waves 4-7 | Executor must honor `depends_on` inside each conceptual wave, or split wave labels into subwaves. |
| `must_haves.artifacts` mostly names evidence outputs, not implementation artifacts with expected exports/content. | WARNING | All waves | Add expected module exports or artifact shape checks when revising for automated verification. |

## Coverage Summary

| Requirement | Covered by plans | Status |
| --- | --- | --- |
| P88-R1 authority spine | 88-01, 88-05 | Covered |
| P88-R2 done boundary/proposals | 88-01, 88-03, 88-06 | Covered |
| P88-R3 ActorFrame/PlayerFacingPacket | 88-02, 88-07, 88-09 | Covered |
| P88-R4 KeyActorProcess | 88-04, 88-05, 88-06 | Covered |
| P88-R5 ActorDecisionPacket/tools | 88-05 | Covered |
| P88-R6 world-time plan execution/catch-up | 88-06, 88-09 | Covered |
| P88-R7 memory/belief/report/rumor | 88-07, 88-08 | Covered |
| P88-R8 faction command networks | 88-08, 88-09 | Covered |
| P88-R9 WorldThreads | 88-09 | Covered |
| P88-R10 latency/context observability | 88-02, 88-04, 88-07, 88-08, 88-10 | Covered |
| P88-R11 rollback/retry/restore | 88-01, 88-03, 88-04, 88-07, 88-11 | Covered |
| P88-R12 deterministic/live proof | 88-10, 88-11 | Covered |

## Structured Issues

```yaml
issues:
  - plan: "88-01"
    dimension: "dependency_correctness"
    severity: "blocker"
    description: "88-01 depends_on contains 'Phase 87 complete', which is not a Phase 88 plan id."
    fix_hint: "Change 88-01 depends_on to [] and leave Phase 87 prerequisite in ROADMAP/preflight."

  - plan: "88-01..88-11"
    dimension: "nyquist_compliance"
    severity: "blocker"
    description: "Nyquist validation is enabled and 88-RESEARCH.md has Validation Architecture, but task-level verify blocks lack runnable <automated> commands."
    fix_hint: "Add per-task automated commands or MISSING references tied to prior test-creation tasks."

  - plan: "88-01,88-02,88-07,88-11"
    dimension: "scope_sanity"
    severity: "blocker"
    description: "Four plans have 5 tasks, exceeding the GSD 5+ task blocker threshold."
    fix_hint: "Split or collapse to 2-3 implementation tasks plus a checkpoint/proof task, or create separate small checkpoint plans."

  - plan: "88-02,88-10"
    dimension: "cross_plan_data_contracts"
    severity: "warning"
    description: "ContextBudgetTrace is introduced early for wave-2 gates and later as a dedicated wave-7 module, creating trace-schema drift risk."
    fix_hint: "Define a single minimal trace contract in Wave 2 and extend compatibly in Wave 7."

  - plan: "88-04..88-11"
    dimension: "dependency_correctness"
    severity: "warning"
    description: "Execution wave labels group plans that have depends_on relationships inside the same conceptual wave."
    fix_hint: "Document subwave sequencing or split wave labels so execution follows dependency order."

  - plan: "88-01..88-11"
    dimension: "verification_derivation"
    severity: "warning"
    description: "must_haves artifacts mostly name evidence outputs rather than implementation artifact contracts."
    fix_hint: "Add expected exports/content or artifact shape checks while adding automated verification."
```

## Final Call

**BLOCK.** Updated Phase 88 plans are faithful to the full architecture and much closer to executable. They are not yet dependency-safe or Nyquist-executable. Fix the `88-01` dependency, add task-level automated verification, and reduce/split the 5-task plans before starting execution.
