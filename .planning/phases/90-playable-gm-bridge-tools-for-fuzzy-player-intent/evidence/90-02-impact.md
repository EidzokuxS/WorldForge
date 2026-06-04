# Phase 90-02 Impact Preflight

Date: 2026-05-10

## Scope

Plan 90-02 adds constrained state-bearing bridge tools for low-risk fuzzy intent: `move_actor`, `create_minor_poi`, `create_scene_extra`, `start_search`, and `record_player_intent`.

## GitNexus Impact Results

| Symbol | Risk | Direct dependents | Affected processes / notes |
| --- | --- | ---: | --- |
| `executeToolCall` | CRITICAL | 7 | Direct: `executeRuntimeTool`, `executeScenePlan`, `createReflectionTools`, `createNpcAgentTools`, `executeAdjudicationPlan`, `executeSingleStep`, `executeActorDecisionPacket`. Affected processes include scene plan execution, GM tool loop, GM tool steps, reflection, NPC agent, and NPC tools. |
| `handleMoveTo` | HIGH | 1 | Direct: `runToolHandler`; reaches `executeToolCall`, scene plan execution, reflection tools, and NPC tools. |
| `handleRevealLocation` | HIGH | 1 | Direct: `runToolHandler`; reaches `executeToolCall`, scene plan execution, reflection tools, and NPC tools. |
| `handleSpawnNpc` | HIGH | 1 | Direct: `runToolHandler`; reaches `executeToolCall`, scene plan execution, reflection tools, and NPC tools. |
| `summarizeRuntimeToolResultForNarrator` | LOW | 2 | Direct: `scenePlanActionToPacketEffect`, `summarizeActionResult`; local narrator-packet impact. |

## Risk Handling

- Preserve existing mutating handler semantics for legacy tool names.
- Add Phase 90 bridge tool names as constrained wrappers/delegates with validation, not as broad new arbitrary creation paths.
- Require legal route/current-scope evidence for movement.
- Restrict minor POIs and scene extras to local, ordinary, low-impact additions.
- Treat search/intent tools as records of intent only; they cannot create proof, discovery, or target truth.
- Update narrator/player-facing summaries so only successful bridge tool results support visible success claims.
