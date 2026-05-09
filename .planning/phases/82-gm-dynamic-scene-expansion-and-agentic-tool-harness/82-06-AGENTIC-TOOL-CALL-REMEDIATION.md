# 82-06 Corrective Execution - Agentic GM Tool Calls

Date: 2026-05-05
Status: completed

## Why This Reopens Phase 82

Phase 82 was marked verified, but the active player-turn mutation path still behaved like a split checklist:

1. GM wrote a structured checklist/candidate payload.
2. Backend executed those candidate payloads separately.
3. Model did not receive normal tool observations as an agent loop while deciding the turn.

That failed the user's original target: the LLM should act as the GM, while the backend remains the rulebook/world authority. The GM must be able to call runtime tools, receive backend observations, and continue the turn from those observations before the final narrator writes player-facing prose.

## References Reviewed

- https://github.com/fazxes/Claude-code
- https://github.com/chauncygu/collection-claude-code-source-code
- https://github.com/VILA-Lab/Dive-into-Claude-Code
- https://github.com/The-Pocket/PocketFlow
- https://github.com/NousResearch/hermes-agent
- AI SDK tool-calling / loop patterns in local `node_modules/ai`

## Corrective Contract

The runtime turn path must use an agentic tool loop:

- `runGmRead` decides whether the turn needs backend mutation.
- Tool-backed paths enter `runGmToolLoop`.
- The GM/Judge model receives only the model-facing scene packet, legal refs, legal movement/targets, scoped forecast excerpt, and allowed tool registry.
- The model calls runtime tools through the harness.
- Backend tools validate and mutate the authoritative world state.
- Each tool result becomes an observation back to the model inside the same loop.
- Final visible narration is a separate pass over settled backend observations, not over speculative plans.

## Non-Goals

- No gameplay fallback that bypasses required mechanics.
- No arbitrary turn-duration cap.
- No monolithic mega-schema that forces the GM to plan and execute everything in one JSON answer.
- No testing old checklist behavior as if it were the target behavior.

## Acceptance Criteria

- Active `processTurn` ScenePlan path imports and calls `runGmToolLoop`, not `runGmActionChecklist -> executeGmToolSteps`.
- Tool registry is filtered to `SceneFrame.allowedTools` before model use.
- Runtime tool executions are serialized inside one tool set so ordered world mutations do not race.
- Tool-backed GM paths fail loudly if the loop produces zero runtime tool calls or zero successful backend observations.
- Scene-plan ordering and rollback docs name `runGmToolLoop`.
- Focused tests cover allowed-tool filtering, no-call failure, failed-observation failure, and turn ordering.
- Verification is run before any live playtest claims.

## Implementation Notes

`runGmToolLoop` uses the AI SDK tool loop pattern because the existing codebase already uses that pattern in agent-like subsystems. The backend still owns validation and execution through the existing runtime tool executor. The model is not trusted to mutate state directly; it only requests tool calls through the harness.

## Review Fixes Applied

- Moved equivalent dynamic creation budget enforcement into the active `runGmToolLoop` tool wrapper so repeated `spawn_npc` / `reveal_location` calls return failed backend observations in-loop.
- Kept the legacy `gm-tool-step` budget behavior by sharing the same helper.
- Removed `spawn_item` from the default player-turn SceneFrame tool surface; callers can still explicitly allow it for inventory-owned contexts.

## Verification

Commands run:

```bash
npm --prefix backend run typecheck
npm --prefix backend test -- --run src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts
npm --prefix backend test -- --run src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/gm-turn-read.test.ts
```

Results:

- Backend typecheck: PASS.
- Focused agentic tool-loop / scene-frame / turn-processor suite: PASS, 7 files / 155 tests.
- Prompt/narrator/tool contract suite: PASS, 6 files / 64 tests.
