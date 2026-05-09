# Phase 80 Validation Matrix

## Verification Goal

Phase 80 is valid only if a normal `/action` turn cannot reach runtime tool execution or final narration without an explicit per-turn BeatPlan, while forecasts remain advisory, scoped, rollback-safe, and separate from backend authority.

Review amendment: this gate includes direct/no-roll, continue, clarification, and `/retry` branches unless explicitly documented otherwise. It also includes final narration retry/correction prompt paths, not only the primary final prompt.

## Required Test Coverage

| Requirement | Coverage | Target Tests |
|-------------|----------|--------------|
| P80-R1 Forecast Contract | Forecast schema caps, strict shape, advisory-only fields, no executable deltas. | `backend/src/engine/__tests__/world-forecast.test.ts` |
| P80-R2 Forecast Builder And Invalidation | Forecast refresh from durable facts; invalidation on committed durable changes; no invalidation from scene-local transient events; no persistence after failed turn. | `backend/src/engine/__tests__/world-forecast.test.ts`, `backend/src/routes/__tests__/chat.scene-plan.test.ts` |
| P80-R3 Scoped Forecast Excerpt | Remote/offscreen forecast entries do not appear in local GM, BeatPlan, ScenePlanner, final narration, or retry/correction prompts. | `backend/src/engine/__tests__/gm-beat-plan.test.ts`, `backend/src/engine/__tests__/gm-turn-decision.test.ts`, `backend/src/engine/__tests__/scene-planner.test.ts`, `backend/src/engine/__tests__/prompt-assembler.test.ts` |
| P80-R4 Per-Turn Beat Plan | Every normal turn builds a BeatPlan before ScenePlan execution or final narration. Direct/no-roll turns still get non-mutating beat guidance. | `backend/src/engine/__tests__/gm-beat-plan.test.ts`, `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` |
| P80-R5 ScenePlan Integration | Forecast refs are not legal runtime refs unless grounded by local tool context; illegal plans fail before mutation. | `backend/src/engine/__tests__/scene-planner.test.ts`, `backend/src/engine/__tests__/scene-plan-validator.test.ts`, `backend/src/engine/__tests__/tool-executor.test.ts`, `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` |
| P80-R6 Narrator Packet Integration | Final narration sees settled player-facing beat notes and never private forecast internals. | `backend/src/engine/__tests__/scene-turn-packet.test.ts`, `backend/src/engine/__tests__/prompt-assembler.test.ts` |

## Red Cases

1. A forecast mentions `Forest Outpost` and a hidden actor while the local frame is Shibuya. No model-facing prompt for the local turn may include those private names.
2. A BeatPlan object includes `hpDelta`, `locationId`, `inventoryAdd`, `relationshipDelta`, `durableEvent`, `plannedActions`, `toolInput`, or `narratorFacts`. Schema validation rejects it.
3. ScenePlanner receives a BeatPlan with an offscreen forecast ref and tries to spawn a local service NPC at that remote ref. Validation rejects before mutation.
4. A route-level turn fails after forecast/BeatPlan generation. Snapshot restore leaves no committed forecast revision from the failed turn.
5. A durable committed event invalidates a relevant forecast entry. A scene-local `log_event` does not invalidate or create long-horizon forecast pressure.
6. Final narration prompt includes player-facing beat guidance but excludes private forecast fields, private rationale, hidden actor names, and offscreen location names.
7. Invalid/missing/throwing BeatPlan prevents ScenePlanner, tool execution, final narration prompt assembly, narration model call, chat append, and forecast commit.
8. Forecast/BeatPlan nested smuggling fields such as `metadata.toolInput`, `revealBudget.durableEvent`, `payload`, and `plannedActions` are rejected.
9. ScenePlanner repair and visible-output retry/correction prompts do not leak private forecast/BeatPlan internals.
10. `/retry` failure after forecast/BeatPlan generation restores forecast/BeatPlan artifacts to the pre-retry boundary.
11. GMDecision and BeatPlan always receive scoped forecast excerpts, even when empty.
12. BeatPlan narrowing to no-mutation/pure narration rejects unrelated state-changing ScenePlans before mutation.

## Required Commands

Focused Phase 80 suite:

```bash
npm --prefix backend exec vitest run src/engine/__tests__/world-forecast.test.ts src/engine/__tests__/gm-beat-plan.test.ts src/engine/__tests__/gm-turn-decision.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/chat.scene-plan.test.ts
```

Typecheck:

```bash
npm --prefix backend run typecheck
```

GitNexus closeout:

```text
gitnexus_detect_changes({ scope: "all" })
```
