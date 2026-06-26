---
phase: 90-playable-gm-bridge-tools-for-fuzzy-player-intent
fixed_at: 2026-05-10T10:14:00Z
status: all_fixed
findings_in_scope: 6
fixed: 6
skipped: 0
iteration: 1
commits:
  - 2bed867c fix(90): keep bridge prompt refs model-facing
  - 7cc22125 fix(90): enforce bridge tool settlement boundaries
---

# Phase 90 Code Review Fix Report

## Summary

All Phase 90 review blockers and warnings were fixed.

## Fixes

- BL-01 fixed: GM tool-loop candidate refs now come from `ModelFacingSceneView.visibleActors`, `legalTargets`, and `legalMovement`, not raw `SceneFrame.roster.support`. Regression covers hidden support actor label/id exclusion.
- BL-02 fixed: observation-only lookup results are filtered out of GM-loop `ScenePlan` actions, narrator facts, executed action results, generated perceivable effects, and existing effect pass-through.
- BL-03 fixed: `move_actor` now projects as legacy movement, including `successfulTravel` and `location_change` `state_update`.
- BL-04 fixed: minor POI and scene extra guards reject Russian high-impact/secret/faction/key/remote terms.
- WR-01 fixed: tourist/courier acceptance now parses `start_search` input through the runtime schema and uses supported `browse` method.
- WR-02 fixed: state-bearing bridge tools are explicit strict `ScenePlan` action variants; observation lookup tools remain invalid as planned actions.

## Impact Preflight

- `buildGmToolLoopPrompt`: LOW; direct caller `runGmToolLoop`.
- `successfulToolStepResults`, `buildScenePlanFromGmToolLoop`, `buildExecutedScenePlanFromGmToolLoop`: LOW; GM-loop ScenePlan projection only.
- `prepareCreateMinorPoiInput`, `prepareCreateSceneExtraInput`, `buildStartSearchResult`: LOW; direct bridge validation/executor paths.
- `buildNarratorPacket`: LOW; no upstream processes reported.
- `scene-plan-schema.ts`: LOW by file impact; schema constants were not individually indexed.
- `buildRuntimeToolInputContract`: HIGH blast radius was reviewed but not modified.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/bridge-state-tools.test.ts src/engine/__tests__/tool-schemas.bridge-tools.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/turn-processor.bridge-tools.test.ts src/engine/__tests__/turn-processor.test.ts`: passed, 5 files / 125 tests.
- `npm --prefix backend run typecheck`: passed.
- `npx tsx e2e/90-tourist-courier-bridge.ts --dry-run`: passed and rewrote Phase 90 output artifacts.
- `npm --prefix backend run test -- src/engine/__tests__/bridge-candidate-tools.test.ts src/engine/__tests__/tool-schemas.bridge-tools.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/bridge-state-tools.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/clarification-reviewer.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.bridge-tools.test.ts src/engine/__tests__/turn-processor.test.ts`: passed, 14 files / 277 tests.
- `git diff --check`: passed with CRLF working-copy warnings only.
- `gitnexus_detect_changes(scope=all)`: LOW before commit; changed symbols matched expected prompt, projection, narrator, and guard code.
- `npx gitnexus analyze`: passed after fix commits.
