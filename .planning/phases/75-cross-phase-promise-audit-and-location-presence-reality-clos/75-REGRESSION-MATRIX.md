# Phase 75 Regression Matrix

This matrix is the execution contract for the generated scaffold -> save-edits -> persistence -> player start -> /world.currentScene -> SceneFrame -> prompt assembler -> People Here chain.

Closeout rule: a completed-phase promise is not implemented from schema, helper, route, or prompt-contract existence alone. A row becomes implemented only when evidence proves source data reaches player-visible behavior, or when the promise is explicitly deprecated or moved to a follow-up.

## Promise Classification

| Source | Material promise | Current evidence | Classification | Owner plan | P75 requirements |
|---|---|---|---|---|---|
| Phase 43 / Phase 46 / Phase 55 | Large generated places should not behave as one small room; macro, persistent sublocation, and scene scope should be real runtime data. | `75-LOCATION-PRESENCE-TRACE.md` shows schema can store hierarchy, but `ScaffoldLocation` is flat and `insertLocations` persists every generated row as `kind: "macro"` with no parent. | stale/unwired | 75-02, 75-03, 75-04, 75-07 | P75-R1, P75-R2, P75-R3, P75-R7, P75-R8 |
| Phase 46 / Phase 70 | NPCs should participate based on actual scene scope, not merely broad location membership. | `resolveScenePresence` and SceneFrame consume broad plus scene ids, but generated NPCs only carry `locationName`; saver omits `currentSceneLocationId`. | stale/unwired | 75-02, 75-04, 75-05, 75-06 | P75-R2, P75-R4, P75-R5, P75-R7 |
| Phase 43 | Travel/location graph should preserve local scope and local happenings. | Current generated save path writes flat macro locations and default edges; richer local topology is not yet proven for generated worlds. | Phase 76/gap candidate after Phase 75 base hierarchy | 75-07 | P75-R1, P75-R3, P75-R8 |
| Phase 46 frontend/world payload | `People Here` and current-scene UI should reflect authoritative scene scope. | Frontend can prefer `/world.currentScene.clearNpcIds`, but generated worlds currently make scene scope collapse to macro fallback. | fixed in Phase 75 only after route/UI proof | 75-05, 75-07 | P75-R2, P75-R5, P75-R7 |
| Phase 55 | Gap-proof verification should prevent stale closed claims. | Prior matrices did not include generated scaffold through player-visible scene presence proof for dense worlds. | fixed in Phase 75 by this matrix plus final verification | 75-01, 75-07 | P75-R1, P75-R2, P75-R8 |
| Phase 70 | ScenePlan is the canonical normal visible-turn bridge. | Current code/tests indicate ScenePlan exists on the runtime path; remaining risk is whether scoped generated data feeds it. | implemented with Phase 75 dependent proof pending | 75-06, 75-07 | P75-R2, P75-R5, P75-R7 |
| Phase 71 / Phase 72 | LLM-authored artifacts own premise/canon/source interpretation; backend stores and validates without inventing source meaning. | State decisions and worldgen prompt contracts preserve artifact authority; Phase 75 must not add string heuristics. | implemented guardrail, must not regress | 75-02, 75-03, 75-04, 75-07 | P75-R6, P75-R8 |
| Phase 73 / Phase 74 | Structured-output/provider readiness should be observable before long flows are trusted. | Local deterministic structured-output gates exist; active live role-provider conformance remains release-blocking due timeout/failure evidence. | Phase 76/gap candidate | 75-07 | P75-R1, P75-R8 |
| Phase 63 / Phase 64 | Personality/backfill evidence and planning status should be fully reconciled. | Historical artifact/status naming is inconsistent in planning state and not tied to the dense-location runtime bug. | Phase 76/gap candidate | 75-07 | P75-R1, P75-R8 |
| Older ephemeral-scene language | Generated dense places require full ephemeral-scene lifecycle before presence can work. | Current release blocker is persistent generated sublocation collapse; schema already has `ephemeral_scene`, but Phase 75 proof can close with persistent sublocations. | deprecated as Phase 75 primary scope | 75-07 | P75-R2, P75-R8 |

## Regression Chain

| Chain row | Required proof | Current failure mode | Owner plan | P75 requirements |
|---|---|---|---|---|
| Generated scaffold | Scaffold data can explicitly carry macro locations, persistent sublocations, `parentLocationName`, and NPC `sceneLocationName`. | Current `ScaffoldLocation` has no hierarchy fields and `ScaffoldNpc` has no scene placement field. | 75-02, 75-03 | P75-R3, P75-R4, P75-R6, P75-R7 |
| save-edits normalization | `save-edits normalization` preserves explicit `kind`, `parentLocationName`, and `sceneLocationName` fields from edited scaffold data. | `normalizeSavedScaffold` returns only the old flat fields and drops unknown hierarchy data. | 75-02 | P75-R3, P75-R4, P75-R6, P75-R7 |
| Scaffold persistence | Saver writes macro rows and child `persistent_sublocation` rows with valid parent ids. | Saver inserts all scaffold locations as `macro` with `parentLocationId: null`. | 75-04 | P75-R3, P75-R6, P75-R7 |
| NPC persistence | NPCs assigned to sublocations get broad `currentLocationId` and scene `currentSceneLocationId`. | Saver maps only `locationName` to broad `currentLocationId` and never writes scene scope. | 75-04 | P75-R4, P75-R6, P75-R7 |
| Player start | Starting character writes broad macro id plus concrete scene id when the starting location is scoped. | Character save currently sets broad and scene to the same matched location id, which is macro for generated dense worlds. | 75-05 | P75-R5, P75-R7 |
| /world.currentScene | `/world.currentScene` returns current-scene NPC ids and excludes sibling sublocation NPCs under the same macro. | Route can return scoped ids only if stored actor rows contain scene scope. | 75-05 | P75-R2, P75-R5, P75-R7 |
| SceneFrame | SceneFrame roster uses player broad/scene ids so sibling-scene actors are not treated as clear participants. | SceneFrame works for populated scene ids, but generated rows currently collapse to macro scope. | 75-06 | P75-R2, P75-R5, P75-R7 |
| Prompt assembler | `prompt assembler` scene context includes only relevant scene/broad actors and does not leak every same-macro NPC as present. | Current prompt context risks broad-only leakage when queried by one location id without populated scene scope. | 75-06 | P75-R2, P75-R5, P75-R7 |
| Frontend People Here | `People Here` renders authoritative current-scene actors from `/world.currentScene`, not broad fallback. | Frontend fallback can mask backend regressions if tests do not assert currentScene authority. | 75-07 | P75-R2, P75-R5, P75-R7 |

## RED/GREEN Gates

| Chain row | RED test file | RED failing behavior to write first | GREEN passing behavior after implementation |
|---|---|---|---|
| Generated scaffold | `backend/src/worldgen/__tests__/locations-step.test.ts` | Generated/location contract lacks `kind`, `parentLocationName`, `persistent_sublocation`, or bounded macro/sublocation instructions. | Location contract asks for explicit macro plus persistent sublocation rows without source-name inference. |
| Generated scaffold | `backend/src/worldgen/__tests__/npcs-step.test.ts` | NPC contract accepts only broad `locationName` and cannot place NPCs into scoped scenes. | NPC contract carries `sceneLocationName` as explicit current scene evidence while preserving `locationName` as broad/home macro. |
| save-edits normalization | `backend/src/routes/__tests__/worldgen.save-edits.test.ts` | Edited scaffold hierarchy fields disappear after save-edits normalization. | Normalization preserves exact explicit hierarchy and scene-placement fields and rejects invalid references. |
| Scaffold persistence | `backend/src/worldgen/__tests__/scaffold-saver.test.ts` | Dense fixture saves every location as `macro` and null parent. | Dense fixture saves child rows as `persistent_sublocation` with parent macro ids. |
| NPC persistence | `backend/src/worldgen/__tests__/scaffold-saver.test.ts` | Dense fixture NPCs all share macro scene fallback. | NPCs in sublocations store macro broad id plus sublocation scene id. |
| Player start | `backend/src/worldgen/__tests__/starting-location.test.ts` or `backend/src/routes/__tests__/character.starting-location.test.ts` | Player starts with broad id equal to macro scene fallback. | Player starts with macro broad id and concrete starting sublocation scene id. |
| /world.currentScene | `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts` | `/world.currentScene` includes sibling-sublocation NPCs under the same macro. | `/world.currentScene.sceneNpcIds` and clear NPC ids include only actual scene occupants plus valid awareness results. |
| SceneFrame | `backend/src/engine/__tests__/scene-frame.test.ts` | SceneFrame roster marks all same-macro dense-world NPCs as present. | SceneFrame clear/present roster is scoped to the player's scene and excludes sibling sublocation occupants. |
| Prompt assembler | `backend/src/engine/__tests__/prompt-assembler.test.ts` | Scene prompt leaks every same-macro NPC/equipment row into the current scene. | Prompt context names current-scene occupants and preserves broad context separately when appropriate. |
| Frontend People Here | `frontend/app/game/__tests__/page.test.tsx` | People Here uses broad fallback despite authoritative `currentScene` data. | People Here renders authoritative current-scene actors from `/world.currentScene` and excludes same-macro sibling actors. |

## Authority Guardrails

| Guardrail | Required behavior | Proof owner |
|---|---|---|
| Explicit fields only | Backend maps only explicit `kind`, `parentLocationName`, `sceneLocationName`, and stored artifact/source fields. | 75-02, 75-03, 75-04 |
| No source-name heuristics | Backend must not infer hierarchy, canon, franchise, source role, or character truth from names like `Shibuya`, `Jujutsu`, `Naruto`, `canon`, or franchise labels. | 75-02 through 75-07 |
| Exact reference validation | New hierarchy fields must point at exact scaffold location names or fail validation/repair. Silent macro fallback is allowed only for legacy flat scaffolds without new hierarchy fields. | 75-02, 75-04 |
| Bounded generation | Prompt contracts cap total generated location rows and scoped children so dense worlds do not create unbounded topology. | 75-03 |
| Artifact authority preserved | If source/canon data matters, it must come from stored artifact/source fields already approved by LLM-owned worldgen research, not backend string parsing. | 75-03, 75-07 |
| Visible proof over schema proof | Final closeout must cite route/runtime/frontend evidence, not just DB columns, Zod schemas, or helper functions. | 75-07 |

## Fixture Contract

`backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts` intentionally uses local test-only extended types:

- `DenseScaffoldLocation = ScaffoldLocation & { kind; parentLocationName }`
- `DenseScaffoldNpc = ScaffoldNpc & { sceneLocationName }`
- `DenseLocationWorldScaffold` replaces `WorldScaffold.locations` and `WorldScaffold.npcs` with those explicit fields.

This keeps Plan 75-01 out of production scaffold symbols while giving downstream RED tests the exact hierarchy and NPC placement evidence they must fail on before Plan 75-02 lands production contract fields.

## Phase 76 Candidate Ledger

| Candidate | Reason | Not Phase 75 primary | Evidence source |
|---|---|---|---|
| Active role-model live conformance release gate | Phase 74 still records active provider conformance as release-blocking due timeout/failure. | Phase 75 can close deterministic scaffold/presence data without waiting for live provider stability. | `.planning/STATE.md`, `75-PROMISE-AUDIT.md` |
| Live gameplay/UAT with real generated dense IP-like world | Subjective live quality must be checked after deterministic data path works. | Deterministic regression has to land first so live UAT has a stable target. | `75-CONTEXT.md`, `75-RESEARCH.md` |
| Richer ephemeral-scene lifecycle | Schema supports `ephemeral_scene`, but current bug is persistent generated sublocation collapse. | Phase 75 primary scope is macro/persistent sublocation/NPC scene placement. | `75-LOCATION-PRESENCE-TRACE.md` |
| Broader travel topology and local crowd distribution | Containment edges and local movement may need richer behavior than minimum scoped presence. | Base generated hierarchy and scene actor rows unblock meaningful follow-up topology. | `75-RESEARCH.md` |
| Frontend hierarchy editing UX | Manual editing may need UI controls for hierarchy fields. | Phase 75 only needs save-edits preservation and visible roster proof unless route tests expose UI breakage. | `75-RESEARCH.md` |
| Phase 63/64 planning evidence cleanup | Historical planning artifacts appear inconsistent. | It is lower priority than user-visible dense-location collapse. | `75-PROMISE-AUDIT.md`, `.planning/STATE.md` |

## Requirement Coverage

| Requirement | Matrix coverage |
|---|---|
| P75-R1 | Promise Classification, Phase 76 Candidate Ledger |
| P75-R2 | Regression Chain rows from `/world.currentScene` through People Here |
| P75-R3 | Generated scaffold, save-edits normalization, Scaffold persistence gates |
| P75-R4 | NPC persistence and scene placement gates |
| P75-R5 | Player start, `/world.currentScene`, SceneFrame, prompt assembler, People Here gates |
| P75-R6 | Authority Guardrails |
| P75-R7 | Dense-world RED/GREEN gates across scaffold, persistence, route, runtime, prompt, frontend |
| P75-R8 | Promise Classification and Phase 76 Candidate Ledger |
