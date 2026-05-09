---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 08
subsystem: backend-validation
tags: [scene-plan, narrator-packet, regression-matrix, documentation, vitest, gitnexus]
requires:
  - phase: 70-07
    provides: "Chat action/retry routes no longer run present-NPC mini-rounds before visible narration."
provides:
  - "Completed Phase 70 regression matrix evidence for SceneFrame -> Oracle -> ScenePlan -> validate -> execute -> packet -> guarded narration."
  - "Phase 70A boundary docs for SceneFrame, ScenePlan, NarratorPacket, validation, and migration cleanup."
  - "GSD index closure for 70A-MIGRATION-PLAN.md through 70A-MIGRATION-SUMMARY.md."
affects: [phase-70-closeout, phase-70a-migration, scene-plan-regressions, narrator-boundary-docs]
tech-stack:
  added: []
  patterns:
    - "Phase closeout documents exact verification commands and GitNexus detection evidence before summary."
    - "70A docs keep engine-owned validation/execution separate from LLM-owned local choice and final prose."
key-files:
  created:
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-SCENE-FRAME-SPEC.md
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-SCENE-PLAN-SCHEMA.md
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-NARRATOR-PACKET-SPEC.md
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-VALIDATION-MATRIX.md
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-SUMMARY.md
  modified:
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-VALIDATION.md
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-PLAN.md
    - backend/src/engine/__tests__/scene-plan-validator.test.ts
    - backend/src/engine/__tests__/scene-turn-packet.test.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
    - backend/src/engine/__tests__/visible-narration-output-guard.test.ts
    - backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts
    - backend/src/routes/__tests__/chat.scene-plan.test.ts
key-decisions:
  - "Documented 70A as boundary and migration guidance, not executable GSD implementation scope."
  - "Kept SCENE_PLAN_ENABLED as a temporary true-by-default isolation flag with explicit cleanup criteria."
  - "Skipped centralized STATE.md and ROADMAP.md updates because this is an isolated worktree execution."
requirements-completed: [P70-R7, P70-R8]
duration: 16 min
completed: 2026-04-25
---

# Phase 70 Plan 08: Regression Matrix and Boundary Docs Summary

**Phase 70 closes with regression proof for canonical ScenePlan ordering, guarded narration, rollback safety, and durable 70A engine-vs-LLM boundary docs.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-25T17:34:00Z
- **Completed:** 2026-04-25T17:50:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Completed and labeled regressions for neutral-input escalation, hidden actor/fact leakage, actor-ID legality, full ToolResult projection, canonical ordering, target-context ordering, no narrative SSE before guard, Storyteller retry-once output guard, retry rollback, action-N rollback, and route removal of `onBeforeVisibleNarration`.
- Updated `70-VALIDATION.md` to green with exact focused, full-suite, typecheck, GitNexus, and phase-plan-index evidence.
- Created the five required 70A docs and the user-requested `70A-MIGRATION-SUMMARY.md` so `70A-MIGRATION-PLAN.md` remains at its required filename without being treated as an incomplete executable plan.
- Preserved review hardening: reference-only `narratorFacts`, actor IDs, backend-only forbidden scan metadata, full ToolResult projection, rollback before unsafe persistence, `SCENE_PLAN_ENABLED` cleanup criteria, and `tickPresentNpcs` outside the normal route critical path.

## Task Commits

1. **Task 1:** `3655b6a` test(70-08): complete Phase 70 regression matrix
2. **Task 2:** `d91f7e1` docs(70-08): write Phase 70A boundary docs

## Files Created/Modified

- `70-VALIDATION.md` - records green Nyquist status and exact command evidence for focused, full, typecheck, GitNexus, and index checks.
- `70A-SCENE-FRAME-SPEC.md` - defines engine-owned SceneFrame inputs, LLM-owned downstream usage, D-01 through D-08 traceability, T70-09 coverage, and deferred work.
- `70A-SCENE-PLAN-SCHEMA.md` - defines the ScenePlan contract, actor-ID action ownership, validation boundaries, traceability, and deferrals.
- `70A-NARRATOR-PACKET-SPEC.md` - defines reference-only narrator facts, hidden/hint actor filtering, backend-only forbidden scan metadata, and no `narrative` SSE before guard.
- `70A-VALIDATION-MATRIX.md` - maps Phase 70 decisions and threat mitigations to regression evidence.
- `70A-MIGRATION-PLAN.md` - documents migration cleanup, `SCENE_PLAN_ENABLED`, `tickPresentNpcs` scope, and Phase 70A deferrals.
- `70A-MIGRATION-SUMMARY.md` - closes the GSD index ambiguity for `70A-MIGRATION-PLAN.md`.
- `backend/src/engine/__tests__/*.test.ts` and `backend/src/routes/__tests__/chat.scene-plan.test.ts` - complete regression labels and one legacy-path isolation fix.

## GitNexus Impact

- Pre-edit impact checks returned LOW risk for resolvable symbols: `runVisibleNarrationWithPacketGuard`, `validateScenePlan`, `executeScenePlan`, `buildNarratorPacket`, `buildSceneFrame`, `runScenePlanner`, and `chat.ts` route surface.
- `processTurn` and `turn-processor.inventory-authority.test.ts` were not resolvable GitNexus targets in this index.
- No HIGH or CRITICAL risk warning was returned.
- `gitnexus_detect_changes(scope: staged)` before Task 1 and Task 2 commits reported LOW risk with 0 affected processes.
- `gitnexus_detect_changes(scope: all)` during Task 2 closeout reported LOW risk and only the pre-existing dirty `CLAUDE.md` drift as an indexed changed symbol outside the staged plan files.

## Decisions Made

- Treated `70A-MIGRATION-PLAN.md` as a required Phase 70A migration document and added `70A-MIGRATION-SUMMARY.md` instead of renaming it away from the required filename.
- Kept the legacy inventory authority hidden-adjudication regression by explicitly setting `SCENE_PLAN_ENABLED=false` inside that test and restoring the prior environment value in `finally`.
- Did not update `STATE.md` or `ROADMAP.md` in this isolated worktree; the execute-plan workflow says the orchestrator handles centralized state in parallel/worktree mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Isolated legacy inventory authority regression from default ScenePlan path**
- **Found during:** Task 2 full backend verification
- **Issue:** `npm --prefix backend test` failed in `turn-processor.inventory-authority.test.ts` because the legacy hidden-adjudication transfer seam now entered the default ScenePlan path and hit an invalid mocked planner JSON response.
- **Fix:** Scoped that test with `process.env.SCENE_PLAN_ENABLED = "false"` and restored the previous value after the turn.
- **Files modified:** `backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts`
- **Verification:** Targeted inventory test, focused Phase 70 suite, full backend test, and backend typecheck passed.
- **Committed in:** `d91f7e1`

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Test-scope compatibility fix only; no production behavior or architecture scope changed.

## Issues Encountered

- Task 1 was marked `tdd=true`, but the completed regression labels passed immediately because prior Phase 70 plans had already implemented the behavior. The closeout added proof and validation evidence rather than a new RED/GREEN production cycle.
- A PowerShell wildcard form for `rg ... 70A-*.md` treated the glob literally; verification was rerun using `Get-ChildItem ... | ForEach-Object FullName` and passed.
- `CLAUDE.md` was dirty before execution from GitNexus/context drift and remained unstaged/uncommitted as requested.

## Known Stubs

None. Stub scan matched only test accumulators, default override helpers, and nullable spy state; no user-facing placeholder, TODO/FIXME, unwired mock data, or goal-blocking stub was introduced.

## Threat Flags

None. This plan added documentation and regression coverage, not new network endpoints, auth paths, file access patterns, persistence schema, or trust boundaries.

## Verification

- `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat.scene-plan.test.ts` - passed: 7 files, 59 tests.
- `npm --prefix backend run typecheck` - passed.
- `cd backend && npx vitest run src/engine/__tests__/turn-processor.inventory-authority.test.ts` - passed: 1 file, 1 test.
- `npm --prefix backend test` - passed: 133 files passed, 3 skipped, 1649 tests passed, 30 todo.
- `rg` acceptance checks for regression labels, output guard terms, validation green status, 70A doc ownership/deferred terms, and `SCENE_PLAN_ENABLED` cleanup terms - passed.
- `gitnexus_detect_changes(scope: staged)` before Task 2 commit - LOW risk, 8 changed files, 0 changed symbols, 0 affected processes.
- `phase-plan-index 70` after `70A-MIGRATION-SUMMARY.md` - `70A-MIGRATION` has `task_count: 0` and `has_summary: true`; incomplete list contained only real plan `70-08` before this summary.

## TDD Gate Compliance

- A `test(70-08)` commit exists: `3655b6a`.
- There is no matching `feat(70-08)` GREEN commit because Task 1 closeout regressions passed immediately against behavior already delivered by Phase 70-01 through 70-07.
- This is a compliance warning, not a functional blocker: the plan objective was closeout proof and documentation, and verification passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Phase 70 verification and future 70A planning: the canonical event-flow boundary is documented, deferred work is explicit, the full backend suite is green, and GSD index ambiguity for `70A-MIGRATION-PLAN.md` is closed.

## Self-Check: PASSED

- Verified `70-08-SUMMARY.md` and all six 70A closeout docs exist.
- Verified task commits exist: `3655b6a`, `d91f7e1`.
- Verified `phase-plan-index 70` reports `incomplete: []`; `70A-MIGRATION` has `task_count: 0` and `has_summary: true`.
- Verified `P70-R7` and `P70-R8` are not present in `.planning/REQUIREMENTS.md`, so no requirement checklist update was available in this worktree.
- Verified only pre-existing dirty `CLAUDE.md` plus this new summary remained before the metadata commit.
