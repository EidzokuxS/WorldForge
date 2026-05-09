# Phase 75: Nyquist Validation Matrix

**Phase:** 75 - Cross-Phase Promise Audit and Location-Presence Reality Closure
**Status:** Planned validation gate
**Created:** 2026-04-30

## Goal

Prove that the phase closes the player-visible dense-location collapse instead of only adding schema capacity or documentation.

## Requirement Coverage

| Validation ID | Requirement(s) | Acceptance Signal | Evidence Artifact |
|---------------|----------------|-------------------|-------------------|
| P75-V01 | P75-R1, P75-R2 | Completed phase promises are audited against current code and prioritized by user-visible gameplay impact. | `75-PROMISE-AUDIT.md`, `75-01-SUMMARY.md` |
| P75-V02 | P75-R1, P75-R8 | The audit produces a regression matrix and classifies remaining stale promises as fixed, deprecated, or Phase 76/gap candidates. | `75-REGRESSION-MATRIX.md`, `75-07-SUMMARY.md`, `75-VERIFICATION.md` |
| P75-V03 | P75-R3, P75-R6 | Scaffold types, save-edits normalization, schemas, and World Review round-trips preserve explicit macro/persistent-sublocation fields without backend source-name inference. | `75-02-SUMMARY.md`, backend schema/route tests, frontend World Review tests |
| P75-V04 | P75-R3, P75-R4, P75-R6, P75-R7 | Worldgen prompts request explicit location hierarchy and NPC scene placement with exact bounded output caps. | `75-03-SUMMARY.md`, `scaffold-resilience.test.ts`, `npcs-step.test.ts` |
| P75-V05 | P75-R3, P75-R4, P75-R7 | Scaffold persistence writes macro and persistent sublocation rows, containment edges, and NPC broad/scene ids. | `75-04-SUMMARY.md`, `scaffold-saver.test.ts`, `worldgen.test.ts` |
| P75-V06 | P75-R4, P75-R5, P75-R7 | Starting-location and character save persist player broad and scene ids for macro and persistent sublocation starts. | `75-05-SUMMARY.md`, `starting-location.test.ts`, `character.test.ts` |
| P75-V07 | P75-R5, P75-R7 | `/world.currentScene`, SceneFrame, and prompt assembly include same-scene actors and exclude sibling-sublocation actors. | `75-05-SUMMARY.md`, `75-06-SUMMARY.md`, route and engine tests |
| P75-V08 | P75-R2, P75-R5, P75-R7 | Frontend People Here uses authoritative `currentScene.clearNpcIds` and does not broad-list all NPCs under one macro when scoped data exists. | `75-07-SUMMARY.md`, frontend API/game tests |
| P75-V09 | P75-R3, P75-R4, P75-R7 | World Review load/edit/regenerate/save preserves `kind`, `parentLocationName`, and `sceneLocationName` so authoring does not re-flatten generated hierarchy. | `75-02-SUMMARY.md`, `world-data-helpers.test.ts`, World Review component/page tests |

## Threats to Validate

| Threat | Required Proof |
|--------|----------------|
| Flat generated scaffolds still collapse dense worlds. | Dense fixture saves at least one macro with multiple persistent sublocations and NPCs distributed across sibling scenes. |
| Backend invents semantic source/canon meaning from names. | Prompt and saver tests show hierarchy comes from explicit scaffold/artifact fields, not hard-coded franchise/name rules. |
| World Review re-flattens generated hierarchy before save-edits. | Frontend round-trip tests prove editable scaffold conversion and review components preserve hierarchy and scene fields. |
| Starting player placement remains macro-only. | Starting-location and character route tests prove selected sublocation becomes `currentSceneLocationId` while parent macro becomes `currentLocationId`. |
| Frontend fallback hides backend regression. | Frontend tests assert authoritative currentScene path is used when present and fallback only runs when it is absent. |

## Minimal Closeout Gate

Before Phase 75 can be marked complete:

1. `75-VERIFICATION.md` must map P75-R1 through P75-R8 to evidence and status.
2. The focused backend dense-location regression bundle must pass.
3. Frontend current-scene People Here tests must pass.
4. GitNexus impact/scope proof must be recorded in implementation summaries or final verification.
5. Remaining stale promises must be explicitly routed to Phase 76/gaps, deprecated, or marked not active truth.
