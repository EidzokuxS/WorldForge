# Wave 4B Actor Tool Impact Preflight

Date: 2026-05-07

## GitNexus Blast Radius

| Symbol | Risk | Direct callers / affected flows | Wave 4B handling |
| --- | --- | --- | --- |
| `ActorDecisionPacket` | LOW | No indexed upstream callers. | Move from a tiny citation DTO into a structured packet while keeping citation-compatible fields. |
| `createPlayerTurnToolExecutionContext` | HIGH | `runGmToolLoop`, `executeScenePlan`, `executeGmToolSteps`. | Do not change player context semantics. Add a separate `createActorTurnToolExecutionContext` helper beside it. |
| `handleMoveTo` | HIGH | `runToolHandler` directly; scene-plan, reflection, NPC tools indirectly. | Keep existing player movement path intact. Add actor-only branch gated by `executionContext.scope === "actor_turn"`. |
| `runToolHandler` | CRITICAL | `executeToolCall` and all runtime tool execution flows. | Only pass the existing `executionContext` argument into `handleMoveTo`; no dispatch or result-shape change. |
| `executeToolCall` | CRITICAL | GM loop, scene-plan executor, hidden adjudication, old NPC tools, reflection tools. | Do not change core execution semantics. Actor tools call this existing authority bridge. |

## Direct-Write Inventory

- `npc-tools.ts` already has actor-like `speak`, `move_to`, and `update_own_goal`, but these mutate directly or write memory without the Phase 88 authority context. Wave 4B does not reuse those writes for the new critical path.
- Existing runtime tools already provide authority-ready `log_event`, `move_to`, `set_relationship`, `add_tag`, `remove_tag`, `spawn_item`, `transfer_item`, and `set_condition` through `executeToolCall`.
- Actor movement must update `npcs`, not `players`, and must still validate connected travel via the same location graph.

## Intended Constraint

Actor LLM output chooses intent and tool requests. Backend owns truth through schema validation, ActorFrame citation validation, grounding checks, base-world-version validation, and ToolResult authority traces.

## Wave 4D Contested Outcome Preflight

Date: 2026-05-08

Purpose: add a backend-owned contested/combat bounds tool so actor or GM prompts cannot settle attacks, captures, escapes, pursuits, or defenses purely in prose.

| Symbol | Risk | Direct callers / affected flows | Wave 4D handling |
| --- | --- | --- | --- |
| `validateToolInputGrounding` | CRITICAL | `executeToolCall`, `validateToolPlanGrounding`, scene-plan validation, GM tool execution. | Add a narrow `request_contested_outcome` branch that requires both actor and target refs to be legal local actors in scoped player/actor contexts. |
| `stateDeltaRefsForToolResult` | HIGH | `finalizeAuthorityResult`. | Do not infer refs from large guidance strings for contested outcomes; contested bounds traces use empty state deltas because they are not canonical mutations. |
| `runActorDecisionBrain` | LOW | Actor decision pass. | Add prompt guidance that contests produce bounds first, not settled victory. |
| `assertActorDecisionPacket` | LOW | Actor decision validation. | Allow the new tool only through the declared actor legal tool surface and existing schema validation. |
| `buildActorDecisionPrompt` | LOW | Actor LLM prompt. | State that HP/movement/inventory/tags/relationships/durable memory still require separate successful tools. |
| `executeToolCall` | CRITICAL | GM loop, scene-plan executor, hidden adjudication, actor tools, old NPC tools, reflection tools. | Add one dispatch case; handler returns bounds and authority trace but does not mutate canonical entity state. |
| `createStorytellerTools` | LOW | Tool schema exposed to LLM callers. | Expose `request_contested_outcome` as a runtime tool with a description that explicitly forbids direct state mutation. |

High/critical risk acknowledgement: the edited symbols sit on the shared runtime tool gateway. The implementation is intentionally contract-only: it resolves visible character refs, builds backend combat/narrative bounds, records the adjudication as an authority result, and leaves all concrete aftermath to existing mutation tools.

## Wave 4D Review Fix Preflight

Date: 2026-05-08

The first Wave 4D code review blocked shipping on five authority/visibility defects. The follow-up patch changed shared seams, so blast-radius review was rerun for the affected symbols.

| Symbol | Risk | Direct callers / affected flows | Review-fix handling |
| --- | --- | --- | --- |
| `validateToolInputGrounding` | HIGH | `executeToolCall`, `validateToolPlanGrounding`, `validateToolInputScope`, `groundingValidationError`; affected actor/scene-plan tool execution flows. | Added `subjectActorRefs` and per-action scene-plan contexts so `actorName` must match the current actor/action owner while `targetName` remains scoped to visible actors. |
| `executeScenePlan` | LOW | Scene-plan turn execution. | Executes each planned action with an action-owned tool context and folds successful observations back into the shared context. |
| `finalizeAuthorityResult` | HIGH | `executeToolCall`; affected GM, actor, scene-plan, hidden adjudication, and old NPC/reflection tool paths. | Allows `request_contested_outcome` to commit an authority trace with empty `stateDeltaRefs`; mutation tools still require deltas. |
| `buildHiddenAdjudicationPromptContract` | LOW | Hidden adjudication prompt assembly. | Filters `request_contested_outcome` out because hidden adjudication has no authority-bearing context. |
| `scenePlanActionToPacketEffect` | LOW | Narrator packet effects for executed scene-plan actions. | Passes accepted tool results into narrator summaries so final narration sees actual bounds. |
| `createActorTurnToolExecutionContext` | LOW | Actor required-before-done tool execution. | Populates subject refs from the acting ActorFrame observer for contest ownership grounding. |
| `summarizeRuntimeToolResultForNarrator` | LOW | Narrator packet summaries. | Summarizes public bounds only, not raw combat math. |

Review-fix verification targets the d=1 callers above: actor tools, scene-plan validation/execution, hidden adjudication prompt/schema, narrator packet summaries, GM tool loop mocks, route tests, and the shared tool executor authority tests.
