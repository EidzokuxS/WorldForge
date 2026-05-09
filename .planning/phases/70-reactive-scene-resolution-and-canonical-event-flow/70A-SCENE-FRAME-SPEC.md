# Phase 70A SceneFrame Spec

Scene Planner of Record starts from one engine-built SceneFrame. The frame is the deterministic situation packet for a normal visible player turn. It replaces broad loose prompt assembly as the planner input, but it is not a global simulation rewrite.

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

SceneFrame is Engine-owned. It derives campaign id, tick, player actor id, current location, scene scope, active/support/background roster buckets, awareness bands, recent local events, target candidates, movement candidates, allowed tools, Oracle input context, and optional combat envelope from existing backend state and services.

Engine rules:

- actor references use stable actor IDs, not display names
- hidden and hint-band identities may inform validation and guard metadata, but player-facing labels stay filtered
- target-context classifier work cannot run before SceneFrame on the ScenePlan path
- movement and target interpretation after SceneFrame must use frame-owned candidates or bypass the old classifier path
- SceneFrame construction performs no persistence mutation

## LLM-owned

The LLM may interpret the player action after the frame exists. It may choose likely local response shape, support beats, and control-return timing through the ScenePlan. It does not decide actor existence, awareness, location legality, tool legality, or visibility.

## T70-09 Output Guard Coverage

T70-09 is downstream of SceneFrame. Frame hidden/hint actor labels become backend-only forbiddenActorNames and forbiddenFactMarkers after packet projection. Those values are never prompt text, but final Storyteller output is scanned after generation and before persistence.

## Deferred

- Oracle and Scene Planner fusion
- full all-actor global simulation
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema unless proven necessary
- generalized social/combat/romance/economy subsystem redesign
