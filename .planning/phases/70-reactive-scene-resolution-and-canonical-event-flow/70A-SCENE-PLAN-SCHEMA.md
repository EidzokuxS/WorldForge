# Phase 70A ScenePlan Schema

Scene Planner of Record returns one strict ScenePlan for the normal visible turn. The schema is the only model-authored state-change proposal accepted on the ScenePlan path.

## Decision Traceability

- D-01: Keep Oracle separate for Phase 70A.
- D-02: Replace WorldBrainSceneDirection, HiddenAdjudicationPlan, and tickPresentNpcs on the visible critical path with one ScenePlan.
- D-03: Backend owns validation, execution, state, rollback, visibility, and tick boundaries.
- D-04: LLM owns semantic local response selection and final prose inside bounded packets.
- D-05: Present NPC autonomy cannot run as an independent critical mini-round.
- D-06: Background drift does not block visible response.
- D-07: Storyteller receives only the player-perceivable committed packet.
- D-08: Migrate the existing pipeline, no rewrite.

## Engine-owned

Engine-owned validation checks every ScenePlan before execution:

- strict Zod parse, no fallback narration on invalid model output
- all planned actions use actor IDs, not display names
- unknown actor and background actor actions fail before executeScenePlan
- tool names must be in SceneFrame.allowedTools
- tool inputs must pass runtimeToolInputSchemas
- narratorFacts are reference-only backend refs: anchorEventId, eventIds, responseIds, actionIds, and toolResultRefs
- free prose in narratorFacts is rejected before packet projection
- Oracle outcome and outcome bounds cannot be contradicted by planned actions
- executeScenePlan returns full ToolResult projection: action order, action id, actor id, tool name, input, args alias, and raw result

Route snapshot restore remains the rollback owner. Validation failure throws before mutation. Execution failure after action-N throws with partial ToolResult evidence so the route can restore the pre-turn boundary and remove partial mutations.

## LLM-owned

The LLM owns bounded semantic fields:

- actionInterpretation
- anchorEvent selection from legal actors and targets
- primaryResponse and supportResponses
- plannedActions chosen from allowed runtime tools
- deferredHooks as non-persistent semantic notes for later work
- hiddenRationale as non-narrator scratch context

The LLM does not own persistence, schema repair outcome, actor legality, tool legality, or whether a hidden fact is visible.

## T70-09 Output Guard Coverage

T70-09 depends on the schema rejecting prose narratorFacts. Because narratorFacts are references only, forbidden exact names and fact markers come from engine packet metadata, not from LLM prose that could smuggle hidden facts into final narration.

## Deferred

- Oracle and Scene Planner fusion
- full all-actor global simulation
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema unless proven necessary
- generalized social/combat/romance/economy subsystem redesign
