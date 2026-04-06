---
phase: 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
plan: 04
subsystem: worldgen
tags: [orchestrator, validation, progress, judge-role, frontend]
dependency_graph:
  requires: [34-01, 34-02, 34-03]
  provides: [complete-pipeline-with-validation]
  affects: [scaffold-generator, worldgen-route, concept-workspace, dna-workspace]
tech_stack:
  added: []
  patterns: [per-stage-validation, cross-stage-validation, two-tier-progress]
key_files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-generator.ts
    - backend/src/routes/worldgen.ts
    - frontend/components/campaign-new/concept-workspace.tsx
    - frontend/components/campaign-new/dna-workspace.tsx
decisions:
  - "9-stage pipeline: premise, locations, loc-validation, factions, fac-validation, NPCs, npc-validation, cross-validation, lore"
  - "Validation conditional on judgeRole presence -- graceful degradation when Judge not configured"
  - "Regen callbacks pass current-round arrays via currentEntities parameter (not stale closures)"
  - "Frontend progress uses 1-based step display for user-facing text"
metrics:
  duration: "~7 minutes"
  completed: "2026-04-04T15:11:00Z"
---

# Phase 34 Plan 04: Pipeline Orchestrator Wiring Summary

9-stage scaffold-generator orchestrator with per-stage validation (Judge role), cross-stage validation with bounded 3-round loop, regen helper delegation from external module, and two-tier frontend progress display on concept-workspace and dna-workspace.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Rewire scaffold-generator orchestrator | 3890dad | 9 stages, validateAndFixStage/validateCrossStage, regen delegation, validation prompt builders |
| 2 | Wire Judge role and frontend progress | b4e4e6b | resolveJudge in route, judgeRole passthrough, sub-progress display in both workspaces |

## Key Implementation Details

### scaffold-generator.ts (Task 1)
- **totalSteps = 9**: premise, locations, loc-validation, factions, fac-validation, NPCs, npc-validation, cross-validation, lore
- Per-stage validation via `validateAndFixStage` for locations, factions, and NPCs (conditional on `req.judgeRole`)
- Cross-stage validation via `validateCrossStage` with bounded 3-round loop and NPC/faction regeneration callbacks
- Regen helpers imported from `regen-helpers.ts` (not inlined) -- review fix #7
- All regen callbacks pass `currentEntities` parameter for current-round state -- review fix #4
- Three validation prompt builders: `buildLocationValidationPrompt`, `buildFactionValidationPrompt`, `buildNpcValidationPrompt`
- All prompt builders include `buildStopSlopRules()` and full context block (premise + IP + divergence)

### worldgen route (Task 2)
- Judge role resolved via `resolveJudge(settings)` in the generate handler
- `judgeRole` passed into `generateWorldScaffold` request object
- Warning logged when Judge not configured (validation skipped, not errored)
- `regenerate-section` route unchanged -- no validation in single-section regen

### Frontend (Task 2)
- Both `concept-workspace.tsx` and `dna-workspace.tsx` display two-tier progress
- Main progress: "Step N of M" (1-based)
- Sub-progress: "entity-label (N/M)" when subStep/subTotal available
- `review/page.tsx` NOT modified (correct per review fix #2)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] validateAndFixStage signature mismatch**
- **Found during:** Task 1
- **Issue:** Plan interface showed 5 params (with `log`), actual code has 4 params (no `log` -- uses module-level logger)
- **Fix:** Used actual 4-param signature from validation.ts
- **Files modified:** backend/src/worldgen/scaffold-generator.ts

**2. [Rule 3 - Blocking] validateCrossStage signature mismatch**
- **Found during:** Task 1
- **Issue:** Plan interface showed `log` param, actual code does not accept it
- **Fix:** Used actual signature from validation.ts (no log param)
- **Files modified:** backend/src/worldgen/scaffold-generator.ts

## Verification Results

- Backend typecheck: 0 new errors (pre-existing hono/module errors unchanged)
- Frontend lint: 0 errors, 8 pre-existing warnings
- scaffold-generator contains `const totalSteps = 9`
- scaffold-generator contains `validateAndFixStage` calls for all 3 entity types
- scaffold-generator contains `validateCrossStage` call with bounded loop
- scaffold-generator imports from `./scaffold-steps/regen-helpers.js`
- Validation conditional on `req.judgeRole`
- Regen callbacks use `currentEntities` parameter
- Both concept-workspace and dna-workspace contain `activeSubLabel`
- review/page.tsx NOT modified

## Known Stubs

None -- all wiring is complete with real function calls.

## Self-Check: PASSED

- All 4 modified files exist on disk
- Both task commits (3890dad, b4e4e6b) found in git log
