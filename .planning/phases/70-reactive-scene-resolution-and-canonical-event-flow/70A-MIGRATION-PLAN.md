# Phase 70A Migration Plan

Scene Planner of Record is a local visible-turn migration, not a global simulation rewrite. Phase 70A keeps Oracle separate, migrates the existing normal turn pipeline, validates every model-authored ScenePlan before mutation, and gives final prose only a player-perceivable committed packet.

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

Engine-owned migration sequence:

1. Build SceneFrame from deterministic backend state.
2. Call Oracle as the bounded outcome authority for Phase 70A.
3. Run ScenePlan generation through the judge lane.
4. Validate ScenePlan actor IDs, target refs, allowed tools, runtimeToolInputSchemas, narratorFacts references, and Oracle bounds.
5. Execute planned actions through executeScenePlan and preserve full ToolResult projection.
6. Build CanonicalTurnPacket and NarratorPacket from committed, player-perceivable facts.
7. Run buffered output guard before assistant persistence and before any narrative SSE.
8. Let the route own restoreSnapshot on validation failure, action-N execution failure, or output guard failure.

## LLM-owned

LLM-owned migration scope:

- Judge: interpret freeform action inside SceneFrame and propose one ScenePlan.
- Storyteller: write final prose only from NarratorPacket.

The LLM does not own actor existence, persistence, visibility, rollback, route snapshots, schema repair success, or hidden fact release.

## ScenePlan Rollout Flag

`SCENE_PLAN_ENABLED` is a temporary rollback isolation flag for the normal player-turn processor path.

- Default and unset: ScenePlan path runs.
- Exact string `false`: isolated legacy path runs.
- Any other value: ScenePlan path runs.

## Cleanup Criteria

Remove the flag after focused Phase 70 route and typecheck tests pass on the ScenePlan path:

- `npm --prefix backend run typecheck`
- `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.observability.test.ts`
- `cd backend && npx vitest run src/routes/__tests__/chat.scene-plan.test.ts src/routes/__tests__/chat.test.ts`

If the flag remains after Phase 70 closeout, add a dated follow-up here with the failing rollback evidence that still requires the legacy path.

## tickPresentNpcs Status

tickPresentNpcs remains only for background/offscreen/future non-critical autonomy. It is not imported by the normal action/retry route critical path and must not run as an independent present-NPC mini-round before final narration.

## T70-09 Output Guard Coverage

T70-09 is part of the migration boundary. The final Storyteller output is scanned after generation and before persistence. Forbidden exact actor names and fact markers retry once with generic guard addendum, then throw before appendChatMessages and before narrative SSE if still unsafe.

## Deferred

- Oracle and Scene Planner fusion
- full all-actor global simulation
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema unless proven necessary
- generalized social/combat/romance/economy subsystem redesign
