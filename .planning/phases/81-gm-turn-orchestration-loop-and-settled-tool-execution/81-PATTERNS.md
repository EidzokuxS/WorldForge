# Phase 81 PATTERNS - Existing Code To Reuse

## Keep

- `SceneFrame` as the deterministic turn context boundary.
- `buildModelFacingScenePacket` as the prompt-safe local view, but build/pass it consistently.
- `world-forecast` scoped excerpt as advisory pressure.
- Oracle binding and outcome bounds.
- Existing runtime tool schemas and grounding validation.
- `executeScenePlan` sequential semantics where later tool effects can see earlier DB state.
- Narrator packet as settled-truth boundary.

## Refactor

- Merge player-turn `world-brain` and `gm-turn-decision` responsibilities into GM Read.
- Remove concrete `plannedTools` from GM Read/decision.
- Replace always-on ScenePlanner with conditional action planning/checklist for mutating paths.
- On the happy path, allow bounded checklist item candidate tool requests so mutating turns do not require one extra LLM call per tool. Backend still validates each candidate request as a separate step.
- Centralize recent conversation filtering and forbidden/private term redaction.

## Avoid

- Reusing `gm-beat-plan` as the main plan.
- Adding a huge schema that contains read, checklist, tool payloads, and narration brief together.
- Letting direct/continue/clarification turns pass through mutating planner code.

## Plan Dependencies

- `81-00`: preflight/baseline and review incorporation.
- `81-01`: depends on `81-00`.
- `81-02`: depends on `81-01`.
- `81-03`: depends on `81-01`.
- `81-04`: depends on `81-02`, `81-03`; do not parallelize with other central turn-runtime edits.
- `81-05`: depends on `81-04`.
- `81-06`: depends on `81-01` through `81-05`.

## Key Files

- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/world-brain.ts`
- `backend/src/engine/gm-turn-decision.ts`
- `backend/src/engine/scene-planner.ts`
- `backend/src/engine/scene-plan-validator.ts`
- `backend/src/engine/scene-plan-executor.ts`
- `backend/src/engine/narrator-packet.ts`
- `backend/src/routes/chat.ts`
- `frontend/app/game/page.tsx`
