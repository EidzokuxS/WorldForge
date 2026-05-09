# Phase 70A Validation Matrix

Scene Planner of Record closeout is evidence-driven. Phase 70 closes only when focused regressions, full backend tests, typecheck, documentation checks, and GitNexus change detection are recorded in 70-VALIDATION.md.

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

Required automated coverage:

| Area | Required proof |
| --- | --- |
| SceneFrame | buildSceneFrame before callOracle, frame-owned candidates, actor IDs |
| ScenePlan schema | strict output, actor IDs, no free-prose narratorFacts |
| Validator | unknown actor and illegal tool input fail before executeScenePlan |
| Executor | full ToolResult projection and action-N failure evidence |
| Turn processor | frame-oracle-plan-validate-execute-packet-narrate ordering |
| Route rollback | restoreSnapshot on ScenePlan validation/execution failure |
| Route critical path | normal action/retry never passes onBeforeVisibleNarration |
| NPC autonomy | tickPresentNpcs is out of normal route imports and visible critical path |
| Narrator packet | hidden observer name absent from narrator packet and final prompt |
| Output guard | T70-09 retry once and throw before appendChatMessages |

## LLM-owned

Validation does not assert literary quality. It asserts that LLM decisions are bounded: ScenePlan semantic choices must pass engine validation, and Storyteller prose must pass packet guard validation before any narrative SSE.

## T70-09 Output Guard Coverage

T70-09 is green only if focused tests prove forbidden Storyteller output retries once with generic guard addendum and second forbidden Storyteller output throws before appendChatMessages.

## Deferred

- Oracle and Scene Planner fusion
- full all-actor global simulation
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema unless proven necessary
- generalized social/combat/romance/economy subsystem redesign
