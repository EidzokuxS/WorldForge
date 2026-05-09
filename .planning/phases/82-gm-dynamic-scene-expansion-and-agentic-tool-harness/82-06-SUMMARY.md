---
phase: 82
plan: 06
subsystem: gm-runtime-tool-loop
status: completed
date: 2026-05-05
key-files:
  created:
    - backend/src/engine/gm-tool-loop.ts
    - backend/src/engine/gm-tool-budget.ts
    - backend/src/engine/__tests__/gm-tool-loop.test.ts
    - .planning/phases/82-gm-dynamic-scene-expansion-and-agentic-tool-harness/82-06-AGENTIC-TOOL-CALL-REMEDIATION.md
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/scene-frame.ts
    - backend/src/engine/scene-planner.ts
    - backend/src/engine/gm-tool-step.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
    - backend/src/engine/__tests__/scene-frame.test.ts
    - backend/src/engine/__tests__/tool-schemas.inventory-authority.test.ts
---

# 82-06 Summary - Agentic GM Tool Calls

## Outcome

Corrective Phase 82 execution replaced the active player-turn checklist/tool-step mutation path with a real AI SDK runtime tool loop.

The GM/Judge now receives a filtered runtime tool registry, calls backend tools, receives backend observations, and only then allows the final visible narrator pass to write prose from settled facts. The backend remains the world/rules authority.

## What Changed

- Added `runGmToolLoop` as the active tool-backed GM path.
- Rewired `processTurnScenePlan` to call `runGmToolLoop` instead of `runGmActionChecklist -> executeGmToolSteps`.
- Kept final narration separate from tool execution.
- Serialized backend tool execution inside `createStorytellerTools`.
- Added shared dynamic creation budget enforcement for repeated equivalent `spawn_npc` / `reveal_location` calls.
- Removed `spawn_item` from default player-turn allowed tools while preserving explicit opt-in.
- Updated ScenePlan ordering and turn-processor tests so the legacy checklist path cannot satisfy the active Phase 82 contract.

## Review Findings Closed

- CR-01 obsolete GM Read test fixture: fixed.
- WR-01 dynamic creation budget lost in active path: fixed by shared helper + loop wrapper.
- WR-02 `spawn_item` model-facing by default: fixed by default SceneFrame allowlist.

## Verification

```bash
npm --prefix backend run typecheck
npm --prefix backend test -- --run src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts
npm --prefix backend test -- --run src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/gm-turn-read.test.ts
```

Results:

- Typecheck: PASS.
- Focused runtime suite: PASS, 155 tests.
- Prompt/narrator contract suite: PASS, 64 tests.

## Live Gate

Fresh backend was started on the normal local backend port after the commit so the smoke did not run against stale pre-change code.

Campaign: `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`

Live turn 1:

- Action: ask the clerk which route is safest after midnight.
- Result: `done=true`, no SSE errors, final narration length 1424.
- Path observed: no-mutation/direct response, settled packet, final narration.

Live turn 2:

- Action: step through the narrow service door and look for whoever is working there.
- Result: `done=true`, no SSE errors, final narration length 1759.
- Path observed: `gm-read -> gm-tool-loop -> spawning-support-npc -> settling-tool-observation -> settled-packet -> final-narration -> done`.
- Backend observations included `spawn_npc` for `Venn the Seal-Presser` and `log_event` for the back-room discovery.

## Deviations

None. This is a corrective execution artifact because Phase 82 had been marked complete before the active runtime path matched the intended agentic tool-call architecture.

## Self-Check

PASSED.
