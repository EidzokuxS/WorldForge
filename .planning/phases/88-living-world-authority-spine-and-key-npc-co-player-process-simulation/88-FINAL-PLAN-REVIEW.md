# Phase 88 Final Plan Review

## Verdict

**BLOCK**

The finalized artifacts cover the full living-world architecture at the concept and acceptance-gate level. No MVP/scope-reduction language was found in the final Phase 88 artifacts. The 11 plan slices map cleanly to P88-R1 through P88-R12 in intent.

Execution should still not start. The final `88-??-PLAN.md` files are not executable GSD plans: they have no requirement frontmatter, no dependency metadata, no `must_haves`, no task blocks, no file lists, no action steps, no done criteria, and no key links. They describe what must exist, but not enough concrete work for an executor to build and prove each wave.

## Scope Coverage

| Target | Status | Planning coverage |
| --- | --- | --- |
| Authority spine and versioned world time | PASS | `88-01-PLAN.md`; P88-R1 |
| No detached post-`done` mutation | PASS | `88-03-PLAN.md`; P88-R2 |
| ActorFrame, CommandNodeFrame, PlayerFacingPacket, NarratorPacket | PASS | `88-02-PLAN.md`; P88-R3 |
| Key NPC co-player processes | PASS | `88-04-PLAN.md`; P88-R4 |
| ActorDecisionPacket and validated actor tools | PASS | `88-05-PLAN.md`; P88-R5 |
| World-time plan execution and offscreen catch-up | PASS | `88-06-PLAN.md`; P88-R6 |
| Memory, beliefs, reports, rumors, reflection | PASS | `88-07-PLAN.md`; P88-R7 |
| Faction command/report/resource networks | PASS | `88-08-PLAN.md`; P88-R8 |
| World threads and diegetic surfacing | PASS | `88-09-PLAN.md`; P88-R9 |
| Latency/context observability and parallelism | PASS | `88-10-PLAN.md`; P88-R10 |
| Rollback/checkpoint safety | FLAG | `88-11-PLAN.md` covers it, but `88-EXECUTION-WAVES.md:14` also needs early rollback pieces from 88-11 in Wave 1 while `88-EXECUTION-WAVES.md:117` leaves remaining 88-11 for Wave 7. That split is not executable without separate tasks. |
| Deterministic, integration, live testing | PASS | `88-VALIDATION.md`, `88-TEST-STRATEGY.md`, `88-11-PLAN.md`; P88-R12 |
| Sectional execution with per-wave proof | FLAG | `88-EXECUTION-WAVES.md:5` and `88-CONTEXT.md:90` require wave proof, but the plan files do not define checkpoint tasks or proof artifacts per wave. |

## Blockers

### 1. [requirement_coverage / task_completeness] PLAN files are not executable plans

**Severity:** BLOCKER

Evidence:

- All 11 files `88-01-PLAN.md` through `88-11-PLAN.md` lack `requirements`, `depends_on`, `must_haves`, and task blocks.
- Static scan result: every plan had `HasFrontmatter=False`, `HasRequirements=False`, `HasDependsOn=False`, `HasMustHaves=False`, `TaskBlocks=0`, `HasFiles=False`, `HasAction=False`, `HasDone=False`.
- Roadmap requires P88-R1 through P88-R12 at `.planning/ROADMAP.md:815`; requirements are defined at `.planning/REQUIREMENTS.md:299` through `.planning/REQUIREMENTS.md:310`.

Why this blocks:

- Requirement coverage cannot be machine-verified because no plan frontmatter names P88-R1 through P88-R12.
- Executors cannot know exact files, functions, migrations, route seams, task ordering, or acceptance criteria.
- Key links are not planned: e.g. schema -> authority service -> tool executor -> turn boundary -> rollback -> tests is described broadly but not wired as tasks.

Required fix:

- Rewrite each `88-??-PLAN.md` into executable plan format with:
  - frontmatter: `requirements`, `depends_on`, `files_modified`, `must_haves.truths`, `must_haves.artifacts`, `must_haves.key_links`;
  - task blocks containing `files`, `action`, `verify`, and `done`;
  - explicit automated verification commands;
  - exact target files/functions/modules where known.

### 2. [research_resolution] RESEARCH.md still has unresolved open questions

**Severity:** BLOCKER

Evidence:

- `88-RESEARCH.md:186` has `## Open Questions`, not `## Open Questions (RESOLVED)`.
- Open questions at `88-RESEARCH.md:188` through `88-RESEARCH.md:192` cover world-time representation, job/proposal storage, old `simulateOffscreenNpcs` compatibility, key-actor eligibility, and live latency budget.
- The assumptions log still marks schema/time choices as assumed at `88-RESEARCH.md:214` and `88-RESEARCH.md:215`.

Why this blocks:

- These are not cosmetic decisions. They control schema design, rollback semantics, scheduler eligibility, migration compatibility, and latency acceptance.
- Executing without resolving them risks incompatible migrations or hidden scope changes during implementation.

Required fix:

- Resolve all five questions before execution.
- Mark the section as `## Open Questions (RESOLVED)`.
- Update affected plan tasks with the chosen decisions.

### 3. [dependency_correctness / sectional_execution] 88-11 is split across Wave 1 and Wave 7 without task-level decomposition

**Severity:** BLOCKER

Evidence:

- `88-EXECUTION-WAVES.md:14` places "first rollback/snapshot pieces from `88-11-PLAN.md`" in Wave 1.
- `88-EXECUTION-WAVES.md:117` places "remaining `88-11-PLAN.md`" in Wave 7.
- `88-11-PLAN.md:9` through `88-11-PLAN.md:10` bundle rollback implementation and full deterministic suite in one scope.
- `88-11-PLAN.md:19` also bundles live playtest proof.

Why this blocks:

- A single undecomposed plan cannot be partly executed in Wave 1 and finished in Wave 7 under the current plan format.
- Wave 1 depends on rollback/snapshot safety before later waves rely on authority metadata, but the rollback work is not separable from final verification tasks.

Required fix:

- Split `88-11-PLAN.md` into at least:
  - early rollback/snapshot invalidation plan, dependent on or folded into `88-01`;
  - final integration/live verification gate plan, dependent on `88-01` through `88-10`.
- Add explicit dependencies and checkpoint proof after the early rollback work.

### 4. [key_links_planned / verification_derivation] Per-wave proof exists as prose but not as executable proof tasks

**Severity:** BLOCKER

Evidence:

- `88-EXECUTION-WAVES.md:5` says each wave must leave the system coherent and tested.
- `88-CONTEXT.md:90` says each wave must produce its own proof before later waves rely on it.
- `88-VALIDATION.md:60` through `88-VALIDATION.md:73` require turn logs, packet dumps, world version/time sequence, job/proposal ledger, actor frame audit, tool result ledger, state diff summary, latency/context traces, and screenshots when frontend is involved.
- Plan files contain verification commands, but no tasks produce or preserve these artifact paths per wave.

Why this blocks:

- Later waves can start without concrete evidence that authority, visibility, rollback, scheduler, or POV invariants are green.
- Final deep live routes cannot compensate for an unproven earlier invariant, per the context itself.

Required fix:

- Add a checkpoint/proof task to each wave.
- Each checkpoint must name:
  - exact deterministic/integration test commands;
  - artifact output paths;
  - required state diff, packet dump, ledger, and trace files;
  - done criteria that block the next wave if missing.

### 5. [agents_md_compliance] GitNexus impact/detect-changes requirements are not carried through implementation plans

**Severity:** WARNING

Evidence:

- Project AGENTS.md requires GitNexus impact analysis before editing any function/class/method and `gitnexus_detect_changes()` before committing.
- Only `88-01-PLAN.md:30` mentions GitNexus impact analysis.
- Plans `88-02` through `88-11` do not include the required project-specific safety step.

Why this matters:

- Phase 88 touches central runtime symbols and high-risk execution flows. Omitting the required impact/change-scope checks raises execution risk.

Required fix:

- Add GitNexus impact-analysis and detect-changes verification steps to every implementation plan, or to a mandatory per-wave preflight/postflight task that applies to all source edits.

## Structured Issues

```yaml
issues:
  - plan: "88-01..88-11"
    dimension: "task_completeness"
    severity: "blocker"
    description: "Final PLAN files have no executable task blocks, file lists, action steps, done criteria, dependency metadata, requirement frontmatter, must_haves, or key_links."
    fix_hint: "Rewrite every PLAN with requirements/depends_on/must_haves frontmatter and task blocks containing files/action/verify/done."

  - plan: null
    dimension: "research_resolution"
    severity: "blocker"
    description: "88-RESEARCH.md has unresolved Open Questions covering world_time shape, job/proposal storage, simulateOffscreenNpcs compatibility, key-actor eligibility, and latency budget."
    fix_hint: "Resolve all questions, mark the section '## Open Questions (RESOLVED)', and propagate decisions into the affected plans."

  - plan: "88-11"
    dimension: "dependency_correctness"
    severity: "blocker"
    description: "88-11 is assigned partly to Wave 1 and partly to Wave 7, but the plan is not decomposed into executable tasks or separate dependent plans."
    fix_hint: "Split early rollback/snapshot invalidation from final verification/live-proof work, then add explicit dependencies."

  - plan: "88-01..88-11"
    dimension: "key_links_planned"
    severity: "blocker"
    description: "Per-wave proof is required by CONTEXT and EXECUTION-WAVES, but plan tasks do not create named proof artifacts or block later waves on those artifacts."
    fix_hint: "Add checkpoint tasks per wave with exact commands, artifact paths, ledgers, packet dumps, trace outputs, and done criteria."

  - plan: "88-02..88-11"
    dimension: "agents_md_compliance"
    severity: "warning"
    description: "Project-required GitNexus impact analysis and detect_changes checks are not included across implementation plans."
    fix_hint: "Add GitNexus pre-edit and post-change checks to every plan or mandatory wave preflight/postflight."
```

## Required Fixes Before Execution

1. Convert all 11 plan files from scope summaries into executable GSD plans with frontmatter, tasks, file paths, actions, verification, and done criteria.
2. Resolve `88-RESEARCH.md` open questions and update affected plan tasks.
3. Split rollback foundation from final verification so Wave 1 can prove rollback/snapshot invalidation before actor/faction/thread layers rely on it.
4. Add per-wave checkpoint proof tasks with named artifacts, not just final deep matrix language.
5. Add project-rule compliance steps for GitNexus impact analysis and change-scope detection.

## Final Call

**BLOCK.** The artifacts do not reduce Phase 88 to an MVP, and the architecture target is broadly covered. They are not ready for execution because the finalized PLAN files are still high-level briefs, not executable, dependency-safe, per-wave-verifiable implementation plans.
