# Phase 75: Cross-Phase Promise Audit and Location-Presence Reality Closure - Research

**Researched:** 2026-04-30 [VERIFIED: environment current_date]
**Domain:** Worldgen scaffold persistence, location hierarchy, scene presence, and promise-audit closeout [VERIFIED: .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-CONTEXT.md]
**Confidence:** HIGH for root cause and runtime boundary; MEDIUM for final implementation sequencing because no production code was changed in this research pass. [VERIFIED: code reads; GitNexus context/impact queries]

<user_constraints>
## User Constraints (from CONTEXT.md)

### User Request

The user found a live generated JJK/Shibuya world where the prose quality improved and the narrator responded acceptably, but all relevant characters still appeared to be gathered in Shibuya as one broad place. This contradicts earlier work that was supposed to split large locations into smaller places and keep actors scoped to where they actually are. [VERIFIED: 75-CONTEXT.md:3-11]

The user asked for an autonomous overnight GSD cycle: audit previous completed phases, find promises true in planning/docs/schema but not wired into live worldgen/runtime behavior, treat recent implemented decisions as fresher truth than stale older plans, use external review where useful, then plan/review/execute/verify Phase 75 and create gap closure if anything remains. [VERIFIED: 75-CONTEXT.md:3-13]

### Known Trigger Gap

- Phase 43 planned travel/location state and a runtime location model that distinguishes macro, persistent sublocation, and ephemeral scene locations. [VERIFIED: 75-CONTEXT.md:15-23]
- Phase 46 planned encounter scope and presence boundaries, including current scene location and resolver behavior. [VERIFIED: 75-CONTEXT.md:15-23]
- Current worldgen persistence appears to save generated locations as macro locations only. [VERIFIED: 75-CONTEXT.md:15-23; backend/src/worldgen/scaffold-saver.ts:61-89]
- Current NPC placement appears to map location names directly to broad location ids without distribution into scoped sublocations. [VERIFIED: 75-CONTEXT.md:15-23; backend/src/worldgen/scaffold-saver.ts:165-223]
- Runtime scene presence code exists, but generated worlds do not feed it useful scoped data when scaffold rows are flat. [VERIFIED: 75-CONTEXT.md:15-25; 75-LOCATION-PRESENCE-TRACE.md]

### Phase Goal

Audit completed phase promises against the current codebase and close the first material reality gap: dense generated worlds must persist/use scoped sublocations and distribute NPC presence so one macro location does not behave like a single small room. [VERIFIED: 75-CONTEXT.md:27-29]

### Requirements

| ID | Requirement | Research Support |
|----|-------------|------------------|
| P75-R1 | completed phase artifacts are audited against current code/tests with an evidence matrix. | Promise audit exists and identifies location/presence as the first critical gap. [VERIFIED: 75-CONTEXT.md:31-40; 75-PROMISE-AUDIT.md] |
| P75-R2 | user-visible gameplay/worldgen promises are prioritized over cosmetic documentation drift. | The Shibuya-style collapse is player-visible because `/world`, SceneFrame, prompt assembly, and frontend People Here all consume stored scene scope. [VERIFIED: 75-CONTEXT.md:31-40; backend/src/routes/campaigns.ts:64-147; backend/src/engine/scene-frame.ts:781-878; frontend/app/game/page.tsx:105-140] |
| P75-R3 | worldgen creates or preserves scoped persistent sublocations for dense macro locations when generated evidence exists. | Current scaffold type and location prompts do not expose parent/sublocation fields; implementation must add them without backend semantic invention. [VERIFIED: backend/src/worldgen/types.ts:44-50; backend/src/worldgen/scaffold-steps/locations-step.ts:20-55; 75-CONTEXT.md:33-38] |
| P75-R4 | worldgen NPC placement assigns NPCs to appropriate scoped locations/current scene presence when evidence exists. | Current NPC scaffold exposes `locationName` only, and saver writes `currentLocationId` without `currentSceneLocationId`. [VERIFIED: backend/src/worldgen/types.ts:65-76; backend/src/worldgen/scaffold-steps/npcs-step.ts:33-42; backend/src/worldgen/scaffold-saver.ts:165-223] |
| P75-R5 | runtime opening/turn scene participation consumes scoped location/presence data. | Runtime presence already consumes broad plus scene scope when rows contain it, so Phase 75 should feed that data and regression-test the visible path. [VERIFIED: backend/src/engine/scene-presence.ts:183-265; backend/src/engine/scene-frame.ts:405-514; backend/src/routes/campaigns.ts:64-147] |
| P75-R6 | backend deterministic code derives reproducible shape/placement only; LLM/artifacts own semantic interpretation. | Phase 71/72/74 decisions and Phase 75 constraints forbid backend inference of canon/source/franchise meaning from arbitrary strings. [VERIFIED: .planning/STATE.md:121-124; 75-CONTEXT.md:42-49; CLAUDE.md:25-35] |
| P75-R7 | regression coverage proves dense-world NPCs do not all collapse into one macro location. | Existing resolver tests cover scoped presence, but scaffold persistence tests still assert flat macro behavior. [VERIFIED: backend/src/engine/__tests__/scene-presence.test.ts; backend/src/worldgen/__tests__/scaffold-saver.test.ts:244-364] |
| P75-R8 | remaining stale promises are fixed, explicitly moved to Phase 76/gaps, or deprecated from active truth. | Audit identifies Phase 74 live provider conformance and Phase 63/64 planning evidence cleanup as candidates outside the deterministic location fix. [VERIFIED: 75-PROMISE-AUDIT.md; .planning/STATE.md:61-62; .planning/STATE.md:193] |

### Constraints

- Work through GSD and do not replace the GSD cycle with an ad hoc manual fix. [VERIFIED: 75-CONTEXT.md:42-49]
- Do not create side worktrees unless a workflow step absolutely requires isolation. [VERIFIED: 75-CONTEXT.md:42-49]
- Use GitNexus impact analysis before editing code symbols and detect changes before committing. [VERIFIED: 75-CONTEXT.md:42-49; CLAUDE.md:117-141]
- Backend must not infer franchise/canon/source meaning from arbitrary strings; it may deterministically persist, group, cap, and map data already produced by LLM-owned artifacts/scaffolds. [VERIFIED: 75-CONTEXT.md:42-49; .planning/STATE.md:121-124]
- Verification must prove player-visible behavior, not only schema existence. [VERIFIED: 75-CONTEXT.md:42-49]

### Deferred Ideas (OUT OF SCOPE unless Phase 75 gap closure chooses otherwise)

- Live provider conformance remains release-blocking, but it is a Phase 76 candidate if Phase 75 focuses on deterministic location/presence closure. [VERIFIED: 75-PROMISE-AUDIT.md; .planning/STATE.md:61-62; .planning/STATE.md:193]
- Richer ephemeral scene lifecycle and local topology beyond persistent sublocation persistence should be Phase 76 unless required to prove dense-world presence. [ASSUMED]
</user_constraints>

## Project Constraints (from CLAUDE.md and AGENTS.md)

- Respond to the user in Russian for conversational closeout. [VERIFIED: CLAUDE.md:106]
- Backend stack is Hono plus TypeScript strict; database access uses Drizzle ORM over better-sqlite3 SQLite; validation uses Zod. [VERIFIED: CLAUDE.md:16-21; backend/package.json]
- The LLM is narrator only, deterministic engine code owns mechanics, and backend validates structured tool calls before execution. [VERIFIED: CLAUDE.md:25-29]
- SQLite is the source of truth for game state. [VERIFIED: CLAUDE.md:29]
- Use Drizzle query builder instead of raw SQL. [VERIFIED: CLAUDE.md:33-35]
- GitNexus index was checked live and was current at indexed/current commit `0a43970`. [VERIFIED: `npx gitnexus status` on 2026-04-30]
- Before production edits, run GitNexus impact on modified symbols; before commit, run GitNexus detect changes. [VERIFIED: CLAUDE.md:117-141]
- This research did not edit production code and did not run long test suites. [VERIFIED: git status before write; user scope]

## Summary

The root cause is not the scene presence resolver. The root cause is the worldgen-to-persistence bridge: generated scaffold locations are currently typed as flat names with no parent or kind, location prompts request a flat 5-8 item list, `insertLocations` persists every generated row as `kind: "macro"` with no parent, and `insertNpcs` writes only broad `currentLocationId`. [VERIFIED: backend/src/worldgen/types.ts:44-50; backend/src/worldgen/scaffold-steps/locations-step.ts:20-55; backend/src/worldgen/scaffold-saver.ts:61-89; backend/src/worldgen/scaffold-saver.ts:165-223]

Runtime already has a usable broad-vs-scene boundary when data is populated: `locations.kind` supports macro/persistent_sublocation/ephemeral_scene, `players` and `npcs` have `currentSceneLocationId`, `resolveScenePresence` compares resolved scene scope, SceneFrame filters by broad location then buckets by scene presence, and `/world` returns bounded `currentScene` ids. [VERIFIED: backend/src/db/schema.ts:29-54; backend/src/db/schema.ts:151-176; backend/src/engine/scene-presence.ts:183-265; backend/src/engine/scene-frame.ts:405-514; backend/src/routes/campaigns.ts:64-147]

Primary recommendation: extend the scaffold and save path so LLM-authored location hierarchy and NPC scene placement are preserved into `locations.parentLocationId`, `locations.kind`, `npcs.currentLocationId`, `npcs.currentSceneLocationId`, and player start scope, while keeping semantic interpretation outside backend code. [VERIFIED: 75-CROSS-AI-DISCUSSION.md; 75-LOCATION-PRESENCE-TRACE.md; 75-CONTEXT.md:42-49]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Semantic location hierarchy | AI/worldgen scaffold | Backend validation | LLM prompts/artifacts own what places exist and which are contained; backend should only validate exact references and persist deterministic rows. [VERIFIED: 75-CONTEXT.md:42-49; .planning/STATE.md:121-124] |
| Broad/current scene persistence | API / Backend | Database / Storage | Saver translates scaffold names into stable location ids, parent ids, and broad/scene actor columns in SQLite. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:61-89; backend/src/worldgen/scaffold-saver.ts:165-223; backend/src/db/schema.ts:29-54] |
| Scene presence resolution | API / Backend | Database / Storage | `resolveScenePresence` consumes actor broad and scene scope from stored rows and should remain the canonical presence resolver. [VERIFIED: backend/src/engine/scene-presence.ts:183-265] |
| Opening player placement | API / Backend | AI/worldgen scaffold | Character save and starting-location resolution choose a stored location; Phase 75 must map sublocation starts to broad plus scene ids. [VERIFIED: backend/src/routes/character.ts:58-80; backend/src/routes/character.ts:297-360; backend/src/worldgen/starting-location.ts:22-105] |
| Player-visible roster | API / Backend | Browser / Client | `/world`, SceneFrame, prompt assembly, and frontend People Here already use bounded current scene data when present. [VERIFIED: backend/src/routes/campaigns.ts:64-147; backend/src/engine/scene-frame.ts:781-878; backend/src/engine/prompt-assembler.ts:737-807; frontend/app/game/page.tsx:105-140] |

## Evidence Matrix

| Area | Current Evidence | Conclusion |
|------|------------------|------------|
| Schema capacity | `locations.kind`, `parentLocationId`, `anchorLocationId`, `persistence`, and actor `currentSceneLocationId` columns already exist. [VERIFIED: backend/src/db/schema.ts:29-54; backend/src/db/schema.ts:151-176] | Schema can represent Phase 75 without a migration unless new scaffold-only fields are persisted outside existing columns. [VERIFIED: code read] |
| Scaffold location shape | `ScaffoldLocation` contains `name`, `description`, `tags`, `isStarting`, and `connectedTo`; it has no kind or parent field. [VERIFIED: backend/src/worldgen/types.ts:44-50] | The current TypeScript contract cannot carry persistent sublocation hierarchy from the LLM. [VERIFIED: code read] |
| Location prompt | Location plan schema requests `name`, `purpose`, `isStarting`; detail schema requests `description`, `tags`, `connectedTo`; contract says 5-8 locations. [VERIFIED: backend/src/worldgen/scaffold-steps/locations-step.ts:20-55] | The model is not explicitly asked for containment/sublocation rows. [VERIFIED: code read] |
| Scaffold NPC shape | `ScaffoldNpc` and `PlannedNpc` expose `locationName`; schemas do not expose `sceneLocationName`. [VERIFIED: backend/src/worldgen/types.ts:65-76; backend/src/worldgen/scaffold-steps/npcs-step.ts:33-42; backend/src/worldgen/scaffold-steps/npcs-step.ts:95-101] | NPC generation cannot distinguish broad macro from current scene. [VERIFIED: code read] |
| Saver locations | `insertLocations` inserts every scaffold location as `kind: "macro"` with null parent and anchor. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:61-89] | Generated dense places collapse into macro rows at persistence time. [VERIFIED: code read] |
| Saver NPC placement | `insertNpcs` resolves `locationName` to `currentLocationId` and omits `currentSceneLocationId` in the insert. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:165-223] | Generated NPCs cannot be scoped below the macro location. [VERIFIED: code read] |
| Player start placement | Save-character queries locations by id/name/isStarting and inserts player `currentLocationId` and `currentSceneLocationId` as the same matched location id. [VERIFIED: backend/src/routes/character.ts:297-360] | If the matched generated location remains macro, the player starts in macro scene scope. [VERIFIED: code read] |
| Runtime resolver | `resolveStoredSceneScopeId` falls back scene to broad, and `resolveScenePresence` compares broad and resolved scene scope. [VERIFIED: backend/src/engine/scene-presence.ts:129-134; backend/src/engine/scene-presence.ts:183-265] | Runtime behaves correctly for populated scene ids and compatibly for legacy rows. [VERIFIED: code read; backend/src/engine/__tests__/scene-presence.test.ts] |
| Current scene API | `buildWorldCurrentScene` uses player scene scope and NPC scene scope to return `sceneNpcIds`, `clearNpcIds`, and awareness. [VERIFIED: backend/src/routes/campaigns.ts:64-147] | `/world` can expose scoped presence once generated data is fixed. [VERIFIED: code read; backend/src/routes/__tests__/campaigns.inventory-authority.test.ts] |
| Frontend roster | Frontend prefers `currentScene.clearNpcIds` through `getAuthoritativeSceneNpcs`; fallback only broad-filters when no current scene exists. [VERIFIED: frontend/app/game/page.tsx:105-140; frontend/app/game/page.tsx:518-523] | Main UI path is ready, but fallback can mask backend regressions if tests do not assert currentScene presence. [VERIFIED: code read] |

## Root Cause

### Direct Cause

Worldgen currently emits and saves a flat location/NPC placement model: location generation has no parent/kind contract, NPC generation has no scene-scope contract, saver persists all locations as macros, and NPC saver omits scene scope. [VERIFIED: backend/src/worldgen/types.ts:44-76; backend/src/worldgen/scaffold-steps/locations-step.ts:20-55; backend/src/worldgen/scaffold-steps/npcs-step.ts:33-42; backend/src/worldgen/scaffold-saver.ts:61-223]

### Why Earlier Promises Did Not Materialize

Phase 43/46/55/70 created or validated runtime capacity for location hierarchy and scoped presence, but the generated scaffold path never started producing/persisting that shape for dense generated worlds. [VERIFIED: 75-PROMISE-AUDIT.md; 75-LOCATION-PRESENCE-TRACE.md; backend/src/db/schema.ts:29-54; backend/src/engine/__tests__/scene-frame.test.ts]

The current tests prove resolver behavior with handcrafted scoped rows, but they do not prove that worldgen creates those rows or that generated NPC placement writes `currentSceneLocationId`. [VERIFIED: backend/src/engine/__tests__/scene-presence.test.ts; backend/src/engine/__tests__/scene-frame.test.ts; backend/src/worldgen/__tests__/scaffold-saver.test.ts:244-364]

### Non-Cause

The bug is not that `resolveScenePresence` is unaware of sublocations; it already supports broad and scene scope. [VERIFIED: backend/src/engine/scene-presence.ts:183-265]

The bug is not that the frontend cannot render scoped presence; the authoritative frontend path consumes `/world.currentScene.clearNpcIds` when supplied. [VERIFIED: frontend/lib/api.ts:397-426; frontend/app/game/page.tsx:105-140]

## Proposed Architecture

### 1. Extend Scaffold Contracts, Not Runtime Semantics

Add explicit hierarchy fields to scaffold data so generated evidence can survive the save boundary. Recommended minimum: `ScaffoldLocation.kind` constrained to `macro | persistent_sublocation`, `ScaffoldLocation.parentLocationName?: string | null`, and `ScaffoldNpc.sceneLocationName?: string | null`. [ASSUMED]

Keep `ScaffoldNpc.locationName` as the broad/home location compatibility field unless implementation chooses to derive broad from `sceneLocationName`; if both exist, `sceneLocationName` should be the current scene and `locationName` should be the broad macro. [ASSUMED]

Do not introduce generated `ephemeral_scene` rows in Phase 75 unless a test proves they are required for dense-world closeout; existing schema supports ephemeral scenes, but Phase 75 target is persistent scoped sublocations. [VERIFIED: backend/src/db/schema.ts:29-54; 75-CONTEXT.md:33-40]

### 2. Update Worldgen Prompts to Ask for Physical Containment

Location prompts should ask for macro places plus physically contained persistent sublocations when the premise/artifact/scaffold evidence supports dense spaces. [VERIFIED: 75-CROSS-AI-DISCUSSION.md; 75-LOCATION-PRESENCE-TRACE.md]

Prompt contracts must keep source-rule authority text: backend/model-facing code may use artifact rules, but it must not infer source/canon roles from names like "Shibuya", "Jujutsu", or "Naruto". [VERIFIED: .planning/STATE.md:121-124; backend/src/worldgen/scaffold-steps/npcs-step.ts:187-279; backend/src/worldgen/__tests__/scaffold-resilience.test.ts]

The planner should set an explicit bounded cap for combined macro+sublocation rows because the current location plan cap is 5-8 flat locations. [VERIFIED: backend/src/worldgen/scaffold-steps/locations-step.ts:20-55] [ASSUMED]

### 3. Persist Locations in Two Passes

Saver should first allocate/stabilize ids for every scaffold location name, then insert macro rows before persistent sublocation rows so parent ids can be resolved deterministically. [ASSUMED]

For a persistent sublocation row, persist `kind: "persistent_sublocation"`, `parentLocationId` equal to the macro parent id, `persistence: "persistent"`, and existing tags/description fields unchanged except for existing normalization. [VERIFIED: backend/src/db/schema.ts:29-54; backend/src/worldgen/scaffold-saver.ts:61-89]

For legacy/flat scaffolds with no parent/kind fields, keep current compatibility behavior by saving rows as macros and leaving scene-scope fallback intact. [VERIFIED: backend/src/engine/scene-presence.ts:129-134] [ASSUMED]

Reject, drop, or repair invalid parent references deterministically using exact known scaffold location names; do not invent missing parent semantics. [VERIFIED: 75-CONTEXT.md:42-49] [ASSUMED]

### 4. Derive Broad and Scene Actor Columns

For an NPC assigned to a persistent sublocation, save `currentLocationId` as the parent macro id and `currentSceneLocationId` as the sublocation id. [VERIFIED: backend/src/db/schema.ts:151-176; backend/src/engine/scene-presence.ts:183-265] [ASSUMED]

For an NPC assigned to a macro, save `currentLocationId` and `currentSceneLocationId` as that macro id for compatibility with current fallback behavior. [VERIFIED: backend/src/engine/scene-presence.ts:129-134] [ASSUMED]

If `sceneLocationName` is invalid but `locationName` is valid, planner should choose whether to fail scaffold validation or fall back to macro scene; failing or explicit warning is safer for Phase 75 because silent fallback can recreate the Shibuya collapse. [ASSUMED]

### 5. Start Player in a Scene-Capable Location

Starting-location resolution and save-character logic should load `kind` and `parentLocationId` in addition to id/name/isStarting, then compute a pair: broad location id plus current scene location id. [VERIFIED: backend/src/routes/character.ts:58-80; backend/src/routes/character.ts:297-360; backend/src/worldgen/starting-location.ts:22-105] [ASSUMED]

If the matched starting row is a persistent sublocation, player `currentLocationId` should be the parent macro and `currentSceneLocationId` should be the sublocation. [VERIFIED: backend/src/db/schema.ts:151-176; backend/src/engine/scene-presence.ts:183-265] [ASSUMED]

If the matched starting row is a macro with generated child sublocations, use an explicit generated `isStarting` child only if present; do not choose "Platform 7" or equivalent from string meaning. [VERIFIED: 75-CONTEXT.md:42-49] [ASSUMED]

### 6. Keep Runtime Resolver Stable, Add Consumer Fixes Only Where Data Shape Requires It

`resolveScenePresence`, `buildWorldCurrentScene`, and SceneFrame roster bucketing should be treated as consumers to verify first, not rewrite targets. [VERIFIED: backend/src/engine/scene-presence.ts:183-265; backend/src/routes/campaigns.ts:64-147; backend/src/engine/scene-frame.ts:405-514]

`buildSceneSection` in `prompt-assembler.ts` is a likely consumer gap after hierarchy is fixed because it receives a scene id but queries NPC equipment rows by `npcs.currentLocationId == locationId`; for scene sublocations this can miss NPCs whose broad id is the macro and scene id is the sublocation. [VERIFIED: backend/src/engine/prompt-assembler.ts:629-726; backend/src/engine/prompt-assembler.ts:737-807]

Recommended fix for prompt assembly is to source visible/hidden actor context from the existing presence snapshot or query by broad id plus `currentSceneLocationId`, not by scene id alone. [VERIFIED: backend/src/engine/prompt-assembler.ts:737-943] [ASSUMED]

## Authority Boundary

| Decision | Owner | Allowed Backend Work | Forbidden Backend Work |
|----------|-------|----------------------|------------------------|
| Which places exist | LLM-authored scaffold and research artifact | Validate shape, cap list sizes, preserve generated rows. [VERIFIED: 75-CONTEXT.md:42-49] | Create franchise-specific places from arbitrary strings. [VERIFIED: 75-CONTEXT.md:42-49] |
| Parent/child containment | LLM-authored scaffold | Resolve exact parent names to ids and reject/drop invalid references. [VERIFIED: 75-CROSS-AI-DISCUSSION.md] | Decide that a location is dense because its name matches a known IP, city, district, or canon term. [VERIFIED: 75-CONTEXT.md:42-49] |
| NPC current scene | LLM-authored scaffold | Convert generated scene name into broad and scene ids. [VERIFIED: backend/src/db/schema.ts:151-176] | Move named NPCs based on canon knowledge or string heuristics. [VERIFIED: .planning/STATE.md:121-124] |
| Presence visibility | Deterministic backend | Use `resolveScenePresence` and stored actor scope. [VERIFIED: backend/src/engine/scene-presence.ts:183-265] | Let narrator prose decide who is mechanically present. [VERIFIED: CLAUDE.md:25-29] |
| Legacy compatibility | Deterministic backend | Fallback null scene scope to broad for old rows. [VERIFIED: backend/src/engine/scene-presence.ts:129-134] | Treat fallback as proof that generated dense worlds are correctly scoped. [VERIFIED: 75-CONTEXT.md:31-40] |

## Affected Files and Symbols

| File | Symbols / Surfaces | Required Action |
|------|--------------------|-----------------|
| `backend/src/worldgen/types.ts` | `ScaffoldLocation`, `ScaffoldNpc`, `WorldScaffold` | Add hierarchy and scene-placement fields while preserving old scaffold compatibility. [VERIFIED: backend/src/worldgen/types.ts:44-95] |
| `backend/src/worldgen/scaffold-steps/locations-step.ts` | `locationPlanSchema`, `locationDetailSingleSchema`, `LOCATION_SCAFFOLD_PROMPT_CONTRACT`, `generateLocationsStep` | Add contract/schema support for macro vs persistent sublocation and parent references. [VERIFIED: backend/src/worldgen/scaffold-steps/locations-step.ts:20-204] |
| `backend/src/worldgen/scaffold-steps/npcs-step.ts` | `npcPlanSchema`, `PlannedNpc`, `NPC_SCAFFOLD_PROMPT_CONTRACT`, key/supporting NPC planners, `generateNpcsStep` | Add scene placement field and known scene/sublocation prompt context without weakening artifact source rules. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:33-42; backend/src/worldgen/scaffold-steps/npcs-step.ts:132-152; backend/src/worldgen/scaffold-steps/npcs-step.ts:332-433; backend/src/worldgen/scaffold-steps/npcs-step.ts:817-906] |
| `backend/src/worldgen/scaffold-generator.ts` | `generateWorldScaffold` location/NPC orchestration | Pass scene-capable location metadata, not only flat `locationNames`, into NPC generation. [VERIFIED: backend/src/worldgen/scaffold-generator.ts:286-360; backend/src/worldgen/scaffold-generator.ts:413-417] |
| `backend/src/worldgen/scaffold-saver.ts` | `insertLocations`, `updateAdjacency`, `insertNpcs`, `saveScaffoldToDb` | Persist two-pass hierarchy, containment edges, broad/scene actor ids, and keep legacy fallback. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:38-300] |
| `backend/src/routes/worldgen.ts` | `normalizeSavedScaffold`, `/generate`, `/regenerate-section`, `/save-edits` | Preserve new hierarchy fields through generated and edited scaffold saves. [VERIFIED: backend/src/routes/worldgen.ts:96-145; backend/src/routes/worldgen.ts:474-516; backend/src/routes/worldgen.ts:665-698] |
| `backend/src/worldgen/starting-location.ts` | `resolveStartingLocation` | Return or support scene-capable start resolution instead of id/name-only macro selection. [VERIFIED: backend/src/worldgen/starting-location.ts:22-105] |
| `backend/src/routes/character.ts` | `resolveDraftLocation`, `/save-character` | Resolve matched start row into broad plus scene columns. [VERIFIED: backend/src/routes/character.ts:58-80; backend/src/routes/character.ts:297-360] |
| `backend/src/engine/prompt-assembler.ts` | `buildSceneSection`, `buildEncounterPromptContext`, `buildNpcStatesSection` | Verify/fix NPC equipment and visible actor context for sublocation scene ids. [VERIFIED: backend/src/engine/prompt-assembler.ts:629-943] |
| `backend/src/routes/campaigns.ts` | `buildWorldCurrentScene`, `buildWorldNpcPayload`, `buildWorldPlayerPayload` | Prefer tests over code changes unless implementation reveals payload mismatch. [VERIFIED: backend/src/routes/campaigns.ts:64-192; backend/src/routes/campaigns.ts:246-325] |
| `backend/src/engine/scene-frame.ts` | `buildRoster`, `buildSceneFrame` | Prefer regression coverage over code changes; existing logic consumes broad and scene ids. [VERIFIED: backend/src/engine/scene-frame.ts:405-514; backend/src/engine/scene-frame.ts:781-878] |
| `backend/src/engine/scene-presence.ts` | `resolveStoredSceneScopeId`, `resolveScenePresence` | Do not rewrite unless tests expose a resolver bug; current behavior supports scoped data. [VERIFIED: backend/src/engine/scene-presence.ts:129-265] |
| `frontend/lib/api.ts` | `parseWorldCurrentScene`, `parseWorldData` | Verify parser continues to preserve `currentScene` and `sceneScopeId`. [VERIFIED: frontend/lib/api.ts:397-542] |
| `frontend/app/game/page.tsx` | `getAuthoritativeSceneNpcs`, `getFallbackSceneNpcs`, People Here derivation | Add/adjust tests so authoritative current scene is required for generated-world roster correctness. [VERIFIED: frontend/app/game/page.tsx:105-140; frontend/app/game/page.tsx:518-523] |

## GitNexus Impact Snapshot

| Symbol | Impact Result | Planning Note |
|--------|---------------|---------------|
| `insertLocations` | LOW; direct dependent `saveScaffoldToDb`. [VERIFIED: GitNexus impact query on 2026-04-30] | Central persistence change, but caller surface is narrow. [VERIFIED: GitNexus context query] |
| `insertNpcs` | LOW; direct dependent `saveScaffoldToDb`. [VERIFIED: GitNexus impact query on 2026-04-30] | Central NPC placement change, same transaction boundary. [VERIFIED: GitNexus context query] |
| `saveScaffoldToDb` | Incoming route from `backend/src/routes/worldgen.ts`. [VERIFIED: GitNexus context query on 2026-04-30] | Generated and save-edits paths both need coverage. [VERIFIED: backend/src/routes/worldgen.ts:474-516; backend/src/routes/worldgen.ts:694-698] |
| `generateLocationsStep` | LOW in GitNexus impact; route imports exist in code. [VERIFIED: GitNexus impact/context query; backend/src/routes/worldgen.ts:665-667] | Treat GitNexus route underreporting as a reason to test route/scaffold outputs directly. [ASSUMED] |
| `generateNpcsStep` | LOW in GitNexus impact; route imports exist in code. [VERIFIED: GitNexus impact/context query; backend/src/routes/worldgen.ts:673-675] | Must update prompt tests and source-rule guardrails. [VERIFIED: backend/src/worldgen/__tests__/npcs-step.test.ts; backend/src/worldgen/__tests__/scaffold-resilience.test.ts] |
| `resolveDraftLocation` | LOW; direct route-local dependency. [VERIFIED: GitNexus impact query on 2026-04-30] | Safe to refactor if tested through `/save-character`. [VERIFIED: backend/src/routes/character.ts:297-360] |
| `resolveScenePresence` | GitNexus impact underreported zero impacted symbols, but context shows callers from campaigns, SceneFrame, prompt assembler, roster, and NPC agent flow. [VERIFIED: GitNexus context query on 2026-04-30] | Avoid resolver edits unless tests fail; caller evidence proves it is shared. [VERIFIED: GitNexus context query] |
| `buildEncounterPromptContext` | LOW with 3 impacted symbols: direct `assemblePrompt`, indirect final narration and judge prompts. [VERIFIED: GitNexus impact query on 2026-04-30] | Prompt context changes need focused prompt assembler tests. [VERIFIED: backend/src/engine/prompt-assembler.ts:737-807] |

## Implementation Waves Recommended for Planner

### Wave 1: Scaffold Shape and Prompt Contract

Add type/schema fields for location hierarchy and NPC scene placement, then update prompt contracts and prompt tests so the LLM can emit parent/scene references explicitly. [VERIFIED: backend/src/worldgen/types.ts:44-76; backend/src/worldgen/scaffold-steps/locations-step.ts:20-55; backend/src/worldgen/scaffold-steps/npcs-step.ts:33-152]

Keep artifact source-rule tests in scope because Phase 72/74 decisions remain active authority. [VERIFIED: .planning/STATE.md:121-124; backend/src/worldgen/__tests__/scaffold-resilience.test.ts; backend/src/worldgen/__tests__/npcs-step.test.ts]

### Wave 2: Persistence Bridge

Refactor scaffold saver to persist macro/sublocation hierarchy and broad/scene NPC ids inside the existing transaction. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:274-300]

Add containment graph edges or equivalent deterministic connectivity so sublocations are reachable and `connectedTo` compatibility projection does not isolate them. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:92-142; backend/src/db/schema.ts:47-54] [ASSUMED]

### Wave 3: Player Start and Worldgen Route Preservation

Preserve new fields through generated save, regenerate-section, and save-edits normalization. [VERIFIED: backend/src/routes/worldgen.ts:96-145; backend/src/routes/worldgen.ts:665-698]

Update starting-location and character save to compute broad plus scene location ids. [VERIFIED: backend/src/worldgen/starting-location.ts:22-105; backend/src/routes/character.ts:297-360]

### Wave 4: Runtime/Prompt/UI Regression

Add end-to-end-ish targeted tests that persist a Shibuya-style macro with multiple persistent sublocations, place player/NPCs in different sublocations, then assert `/world`, SceneFrame, prompt assembly, and frontend People Here do not collapse all NPCs into the macro. [VERIFIED: 75-CONTEXT.md:31-40; backend/src/routes/__tests__/campaigns.inventory-authority.test.ts; backend/src/engine/__tests__/scene-frame.test.ts; backend/src/engine/__tests__/prompt-assembler.test.ts; frontend/app/game/__tests__/page.test.tsx]

## Test Strategy

### Existing Test Infrastructure

| Property | Value |
|----------|-------|
| Backend framework | Vitest 3.2.4 through `backend/package.json` script `test: vitest run`. [VERIFIED: backend/package.json] |
| Frontend framework | Vitest 3.2.4 through `frontend/package.json` script `test: vitest`; use `npm --prefix frontend exec vitest run -- ...` for non-watch targeted runs. [VERIFIED: frontend/package.json] |
| Backend config | `backend/vitest.config.ts` exists. [VERIFIED: file listing on 2026-04-30] |
| Frontend config | `frontend/vitest.config.ts` exists. [VERIFIED: file listing on 2026-04-30] |
| Full backend suite | `npm --prefix backend run test`; do not run during research per user instruction. [VERIFIED: backend/package.json; user request] |
| Typecheck | `npm --prefix backend run typecheck` and `npm --prefix frontend run typecheck`. [VERIFIED: backend/package.json; frontend/package.json] |

### Required Regression Cases

| Req | Behavior | Test Type | Targeted Command |
|-----|----------|-----------|------------------|
| P75-R3 | Saver stores macro `Shibuya Station` plus persistent sublocations with parent ids. | unit | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-saver.test.ts` [VERIFIED: backend/package.json; backend/src/worldgen/__tests__/scaffold-saver.test.ts] |
| P75-R4 | NPC in `Platform 7` saves broad `currentLocationId = Shibuya Station` and scene `currentSceneLocationId = Platform 7`; sibling rooftop NPC saves same broad but different scene. | unit | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-saver.test.ts` [VERIFIED: backend/package.json; backend/src/worldgen/__tests__/scaffold-saver.test.ts] |
| P75-R3/P75-R6 | Location/NPC prompts expose hierarchy fields while preserving artifact source-rule guardrails. | unit | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts` [VERIFIED: backend/package.json; backend/src/worldgen/__tests__/scaffold-resilience.test.ts; backend/src/worldgen/__tests__/npcs-step.test.ts] |
| P75-R5 | Character save starts player broad at macro and scene at selected/generated sublocation. | route/unit | `npm --prefix backend run test -- src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts` [VERIFIED: backend/package.json; backend/src/worldgen/__tests__/starting-location.test.ts; backend/src/routes/character.ts:297-360] |
| P75-R5/P75-R7 | SceneFrame active/support/background buckets exclude same-broad sibling scene from active People Here path. | unit | `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts` [VERIFIED: backend/package.json; backend/src/engine/__tests__/scene-frame.test.ts] |
| P75-R5/P75-R7 | Prompt assembly excludes same-broad sibling actors and includes current-scene actor context/equipment after hierarchy fix. | unit | `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts` [VERIFIED: backend/package.json; backend/src/engine/__tests__/prompt-assembler.test.ts; backend/src/engine/prompt-assembler.ts:629-943] |
| P75-R5/P75-R7 | `/world.currentScene.sceneNpcIds` and `clearNpcIds` are bounded to current sublocation. | route/unit | `npm --prefix backend run test -- src/routes/__tests__/campaigns.inventory-authority.test.ts src/routes/__tests__/campaigns.test.ts` [VERIFIED: backend/package.json; backend/src/routes/__tests__/campaigns.inventory-authority.test.ts; backend/src/routes/__tests__/campaigns.test.ts] |
| P75-R7 | Frontend People Here uses authoritative current scene and does not broad-fallback when currentScene exists. | frontend unit | `npm --prefix frontend exec vitest run -- app/game/__tests__/page.test.tsx lib/__tests__/api.test.ts` [VERIFIED: frontend/package.json; frontend/app/game/__tests__/page.test.tsx; frontend/lib/__tests__/api.test.ts] |

### Minimal Verification Gate

- Per changed backend task: run the narrow Vitest file(s) touching that surface. [VERIFIED: backend/package.json]
- Before closeout: run the dense-world regression cluster above plus backend typecheck. [VERIFIED: backend/package.json] [ASSUMED]
- Do not claim Phase 75 complete from schema tests alone; include `/world` or UI-visible roster evidence. [VERIFIED: 75-CONTEXT.md:42-49]
- Before commit after implementation, run GitNexus detect changes. [VERIFIED: CLAUDE.md:117-141]

## Common Pitfalls

| Pitfall | What Goes Wrong | Avoidance |
|---------|-----------------|-----------|
| Optional hierarchy fields silently disappear | Tests pass with flat legacy scaffolds while generated dense worlds still collapse. [VERIFIED: current scaffold-saver tests assert macro-only rows at backend/src/worldgen/__tests__/scaffold-saver.test.ts:244-264] | Add positive tests requiring parent/kind/scene fields and negative tests for invalid references. [ASSUMED] |
| Backend infers semantics from names | Phase 75 violates Phase 72/74 authority by deciding what "Shibuya" means. [VERIFIED: 75-CONTEXT.md:42-49; .planning/STATE.md:121-124] | Only persist explicit LLM/artifact/scaffold containment and placement. [VERIFIED: 75-CONTEXT.md:42-49] |
| Name collisions corrupt maps | `locationIds` is currently a `Map` by location name, so duplicate names can overwrite or misresolve. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:61-142] | Require globally unique scaffold location names or introduce qualified names in the contract. [ASSUMED] |
| Save-edits drops new fields | `normalizeSavedScaffold` currently returns only existing location/NPC fields. [VERIFIED: backend/src/routes/worldgen.ts:96-145] | Update normalization with tests before relying on manual/edit routes. [ASSUMED] |
| Sub locations become unreachable | Existing adjacency logic only follows `connectedTo`; parent/child containment is not inserted today. [VERIFIED: backend/src/worldgen/scaffold-saver.ts:92-142] | Add containment edges or explicit path tests for macro-to-sublocation movement. [ASSUMED] |
| Character starts at macro | Current character save sets broad and scene to the same matched id. [VERIFIED: backend/src/routes/character.ts:354-360] | Resolve selected/generated sublocation into broad plus scene ids. [ASSUMED] |
| Prompt context misses scene NPC equipment | `buildSceneSection` queries NPCs by `currentLocationId == sceneId`, which misses NPCs whose broad id is macro and scene id is sublocation. [VERIFIED: backend/src/engine/prompt-assembler.ts:629-726] | Query by presence snapshot or broad+scene pair. [ASSUMED] |
| Frontend fallback hides backend regression | `getFallbackSceneNpcs` broad-filters if `currentScene` is absent. [VERIFIED: frontend/app/game/page.tsx:122-140] | Regression tests should assert `currentScene` exists and authoritative IDs are used. [ASSUMED] |

## Do Not Hand-Roll

| Problem | Do Not Build | Use Instead | Why |
|---------|--------------|-------------|-----|
| Presence resolution | A second custom NPC filtering algorithm in saver, routes, or frontend. [ASSUMED] | Existing `resolveScenePresence`. [VERIFIED: backend/src/engine/scene-presence.ts:183-265] | Existing resolver already encodes broad/scene/hint semantics and is covered by tests. [VERIFIED: backend/src/engine/__tests__/scene-presence.test.ts] |
| Source/canon interpretation | String heuristics for IP/franchise/canon placement. [VERIFIED: 75-CONTEXT.md:42-49] | Artifact/source-rule prompt context plus backend validation. [VERIFIED: .planning/STATE.md:121-124; backend/src/worldgen/scaffold-steps/npcs-step.ts:187-279] | Phase 72/74 explicitly made semantic source roles artifact/model-owned. [VERIFIED: .planning/STATE.md:121-124] |
| Scene ids | Random ad hoc scene ids outside stored `locations`. [ASSUMED] | Persist scene scopes as `locations` rows with kind/parent. [VERIFIED: backend/src/db/schema.ts:29-54] | Runtime, `/world`, and actor rows already use location ids as scene scopes. [VERIFIED: backend/src/routes/campaigns.ts:64-147; backend/src/engine/scene-frame.ts:781-878] |
| Test oracle | Only snapshot scaffold JSON. [ASSUMED] | Persisted DB rows plus `/world`/SceneFrame/prompt/frontend assertions. [VERIFIED: 75-CONTEXT.md:42-49] | User-visible behavior is the closeout requirement. [VERIFIED: 75-CONTEXT.md:42-49] |

## Validation Architecture

### Phase Requirements to Test Map

| Req ID | Behavior | Automated Evidence | File Exists? |
|--------|----------|--------------------|--------------|
| P75-R1 | Promise audit exists and maps stale promises to code evidence. | Review `75-PROMISE-AUDIT.md` and final `75-VERIFICATION.md`. [VERIFIED: 75-PROMISE-AUDIT.md] | Yes. [VERIFIED: file listing] |
| P75-R2 | User-visible location/presence gap prioritized. | Dense-world regression cluster includes saver, route, prompt, frontend. [ASSUMED] | Partial; new saver/prompt/route/frontend cases required. [VERIFIED: rg test scan] |
| P75-R3 | Scaffold creates/preserves persistent sublocations. | `scaffold-saver.test.ts` and prompt contract tests. [VERIFIED: backend/src/worldgen/__tests__/scaffold-saver.test.ts; backend/src/worldgen/__tests__/scaffold-resilience.test.ts] | Existing files yes; new cases needed. [VERIFIED: rg test scan] |
| P75-R4 | NPCs get scoped scene placement. | `scaffold-saver.test.ts`, `npcs-step.test.ts`. [VERIFIED: backend/src/worldgen/__tests__/scaffold-saver.test.ts; backend/src/worldgen/__tests__/npcs-step.test.ts] | Existing files yes; new cases needed. [VERIFIED: rg test scan] |
| P75-R5 | Runtime consumes scoped data. | SceneFrame, prompt assembler, campaigns route, frontend People Here tests. [VERIFIED: backend/src/engine/__tests__/scene-frame.test.ts; backend/src/engine/__tests__/prompt-assembler.test.ts; backend/src/routes/__tests__/campaigns.inventory-authority.test.ts; frontend/app/game/__tests__/page.test.tsx] | Existing files yes; likely targeted updates. [VERIFIED: rg test scan] |
| P75-R6 | Backend derives only deterministic mapping. | Source-rule guardrail tests keep artifact authority and no source string inference. [VERIFIED: backend/src/worldgen/__tests__/scaffold-resilience.test.ts; backend/src/worldgen/__tests__/npcs-step.test.ts] | Existing files yes; update for new fields. [ASSUMED] |
| P75-R7 | Dense-world NPCs do not collapse into one macro. | Add Shibuya-style fixture spanning scaffold save -> `/world` or SceneFrame. [VERIFIED: 75-CONTEXT.md:3-11] [ASSUMED] | Missing exact generated persistence case. [VERIFIED: rg test scan] |
| P75-R8 | Remaining stale promises classified. | Update verification/gap docs with Phase 76 candidates. [VERIFIED: 75-PROMISE-AUDIT.md] | Needs final verification artifact after implementation. [ASSUMED] |

### Wave 0 Gaps

- Add or update scaffold saver fixture with macro plus persistent sublocations and NPC scene placement. [VERIFIED: backend/src/worldgen/__tests__/scaffold-saver.test.ts:244-364]
- Add or update worldgen prompt contract fixtures to include hierarchy fields and source-rule guardrails. [VERIFIED: backend/src/worldgen/__tests__/scaffold-resilience.test.ts; backend/src/worldgen/__tests__/npcs-step.test.ts]
- Add character/start resolution tests for parent macro plus scene sublocation. [VERIFIED: backend/src/routes/character.ts:297-360; backend/src/worldgen/__tests__/starting-location.test.ts]
- Add prompt assembler regression for sublocation scene id with broad-location NPC rows. [VERIFIED: backend/src/engine/prompt-assembler.ts:629-943]
- Add route/frontend currentScene regression proving authoritative scene ids exclude same-broad sibling NPCs. [VERIFIED: backend/src/routes/__tests__/campaigns.inventory-authority.test.ts; frontend/app/game/__tests__/page.test.tsx]

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No direct Phase 75 change. [VERIFIED: affected file list] | Existing route/auth behavior unchanged. [ASSUMED] |
| V3 Session Management | No direct Phase 75 change. [VERIFIED: affected file list] | Existing session behavior unchanged. [ASSUMED] |
| V4 Access Control | Indirectly yes for campaign-scoped routes. [VERIFIED: backend/src/routes/worldgen.ts; backend/src/routes/character.ts; backend/src/routes/campaigns.ts] | Preserve existing campaign id route scoping and route tests. [ASSUMED] |
| V5 Input Validation | Yes. [VERIFIED: backend/src/worldgen/scaffold-steps/locations-step.ts:20-33; backend/src/worldgen/scaffold-steps/npcs-step.ts:33-42] | Extend Zod schemas and fail/normalize invalid model/save-edits references deterministically. [VERIFIED: CLAUDE.md:21; CLAUDE.md:35] [ASSUMED] |
| V6 Cryptography | No direct Phase 75 change. [VERIFIED: affected file list] | Do not introduce custom crypto. [ASSUMED] |

Known threat pattern: malformed or adversarial scaffold JSON can reference nonexistent parent or scene names and silently degrade to macro collapse if accepted without diagnostics. [VERIFIED: current saver map fallback at backend/src/worldgen/scaffold-saver.ts:165-223] Mitigation is strict Zod shape, exact reference validation, deterministic fallback only for legacy rows, and regression tests. [VERIFIED: CLAUDE.md:21; CLAUDE.md:35] [ASSUMED]

## Risks

| Risk | Level | Evidence | Mitigation |
|------|-------|----------|------------|
| Scope creep into Phase 74 provider conformance | MEDIUM | Phase 74 live OpenCode role-model conformance remains release-blocking after timeout. [VERIFIED: .planning/STATE.md:61-62; .planning/STATE.md:193] | Keep Phase 75 deterministic data fix separate; record provider readiness as Phase 76 candidate. [ASSUMED] |
| Regressing artifact authority | HIGH | Phase 72/74 state decisions forbid backend invention of source roles/canon facts. [VERIFIED: .planning/STATE.md:121-124] | Keep source-rule tests active and avoid string heuristics. [VERIFIED: backend/src/worldgen/__tests__/scaffold-resilience.test.ts; backend/src/worldgen/__tests__/npcs-step.test.ts] |
| Breaking save-edits/manual review | MEDIUM | `normalizeSavedScaffold` currently drops unknown new fields by returning only known fields. [VERIFIED: backend/src/routes/worldgen.ts:96-145] | Update save-edits normalization in same wave as type changes. [ASSUMED] |
| Overfitting to Shibuya | MEDIUM | User example is Shibuya, but constraint forbids franchise/canon inference. [VERIFIED: 75-CONTEXT.md:3-11; 75-CONTEXT.md:42-49] | Test with Shibuya-style dense fixture but make data explicit in scaffold fields. [ASSUMED] |
| Current prompt assembler misses sublocation actors | MEDIUM | `buildSceneSection` queries `npcs.currentLocationId == locationId` where caller passes scene id. [VERIFIED: backend/src/engine/prompt-assembler.ts:629-807] | Add focused prompt test before/with fix. [ASSUMED] |
| GitNexus underreports some route impact | LOW | `generateLocationsStep` and `generateNpcsStep` impact was LOW/zero while route imports exist. [VERIFIED: GitNexus impact/context query; backend/src/routes/worldgen.ts:665-675] | Use GitNexus plus direct code/test audit for route-level surfaces. [ASSUMED] |

## Phase 76 Candidates

| Candidate | Why It Is Not Primary Phase 75 | Source |
|-----------|--------------------------------|--------|
| Active provider structured-output conformance release gate | Phase 75 can close deterministic data/presence collapse without waiting on live provider stability. | [VERIFIED: .planning/STATE.md:61-62; .planning/STATE.md:193; 75-PROMISE-AUDIT.md] |
| Richer ephemeral-scene lifecycle | Existing schema supports ephemeral scene kind, but current bug is persistent generated sublocation collapse. | [VERIFIED: backend/src/db/schema.ts:29-54; 75-CONTEXT.md:31-40] |
| Broader travel topology and local crowd distribution | Containment/scene rows are needed first; richer topology can follow after base data path works. | [VERIFIED: 75-LOCATION-PRESENCE-TRACE.md] |
| Frontend hierarchy editing UX | Phase 75 must preserve save-edits fields, but full hierarchy authoring UI can be separated if backend route tests prove correctness. | [VERIFIED: backend/src/routes/worldgen.ts:96-145] [ASSUMED] |
| Phase 63/64 planning evidence cleanup | Promise audit flags stale planning evidence cleanup as non-primary compared with player-visible worldgen/runtime collapse. | [VERIFIED: 75-PROMISE-AUDIT.md] |
| Live UAT pass with real generated JJK/Shibuya world | Implementation should create deterministic regression first; live model/provider variability can be a final gate or Phase 76 follow-up if blocked by provider conformance. | [VERIFIED: 75-CONTEXT.md:3-13; .planning/STATE.md:193] [ASSUMED] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Minimum scaffold fields should be `kind`, `parentLocationName`, and `sceneLocationName`. | Proposed Architecture | Planner may choose a different but equivalent shape; tests must still prove parent persistence and broad/scene actor ids. |
| A2 | Legacy flat scaffolds should continue saving as macro rows. | Proposed Architecture | If product wants fail-closed only, implementation would need migration/repair instead of compatibility fallback. |
| A3 | Containment edges should be added or equivalently tested for reachability. | Proposed Architecture / Pitfalls | Without graph edges, sublocations may be present but unreachable through travel. |
| A4 | Frontend code likely needs tests more than production changes. | Affected Files | If parser/UI fallback masks a regression, frontend code may need a small change. |
| A5 | Full hierarchy editing UI can be Phase 76 if save-edits preserves fields. | Phase 76 Candidates | Manual world editing may remain awkward after backend fix. |

## Resolved Planner Decisions

1. Invalid generated parent or scene references must fail validation or enter explicit repair for new hierarchy fields; they must not silently fall back to macro placement. [RESOLVED]
   - What we know: current code often normalizes or falls back for resilience. [VERIFIED: backend/src/worldgen/__tests__/scaffold-resilience.test.ts]
   - Decision: legacy flat scaffolds may remain macro-compatible, but a scaffold that opts into `persistent_sublocation`, `parentLocationName`, or `sceneLocationName` must use exact known references. Silent fallback would recreate the release-blocking macro-collapse bug. [RESOLVED]

2. `locationName` remains the broad/home macro field, while `sceneLocationName` is the NPC's current scene scope when known. [RESOLVED]
   - What we know: current prompt contracts and tests use `locationName` everywhere. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:132-152; backend/src/worldgen/__tests__/npcs-step.test.ts]
   - Decision: add explicit `sceneLocationName` instead of changing the meaning of `locationName`, reducing blast radius across existing NPC/faction/worldgen flows. [RESOLVED]

3. Generated location output uses a bounded combined cap: 5-12 total location rows, no more than 6 macro rows, no more than 6 persistent sublocation rows, and no more than 3 generated sublocations under any one macro. [RESOLVED]
   - What we know: current plan schema caps locations at 8 flat rows. [VERIFIED: backend/src/worldgen/scaffold-steps/locations-step.ts:20-26]
   - Decision: the cap increases only enough to let dense macro locations carry scoped sublocations without inviting unbounded output. Prompt contract tests must lock this exact bounded instruction. [RESOLVED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| GitNexus CLI/index | Impact and context research | Yes | Current index at commit `0a43970`. [VERIFIED: `npx gitnexus status`] | Direct code reads plus rg, but edits still require GitNexus per project rules. [VERIFIED: CLAUDE.md:117-141] |
| Backend Vitest | Targeted backend regression tests | Yes | `vitest` dependency `^3.2.4`. [VERIFIED: backend/package.json] | None needed. [ASSUMED] |
| Frontend Vitest | Targeted UI/parser tests | Yes | `vitest` dependency `^3.2.4`. [VERIFIED: frontend/package.json] | None needed. [ASSUMED] |
| SQLite/Drizzle schema | Persistence behavior | Yes | `better-sqlite3` and `drizzle-orm` dependencies present. [VERIFIED: backend/package.json] | Mock DB tests for narrow units, but route/persistence needs schema-compatible tests. [ASSUMED] |

Missing dependencies with no fallback: none found for research/planning. [VERIFIED: package.json reads; GitNexus status]

Missing dependencies with fallback: live provider conformance remains separate and can be recorded as Phase 76 if not available. [VERIFIED: .planning/STATE.md:61-62; .planning/STATE.md:193]

## Sources

### Primary

- `75-CONTEXT.md` - user request, requirements, constraints, deliverables. [VERIFIED: file read]
- `75-PROMISE-AUDIT.md` - stale promise matrix and Phase 76 candidates. [VERIFIED: file read]
- `75-LOCATION-PRESENCE-TRACE.md` - source-to-runtime trace of flat worldgen and scoped runtime. [VERIFIED: file read]
- `75-CROSS-AI-DISCUSSION.md` - external review consensus and risks. [VERIFIED: file read]
- `CLAUDE.md` - project stack, source-of-truth, validation, GitNexus rules. [VERIFIED: file read]
- `backend/src/worldgen/scaffold-saver.ts` - persistence root cause. [VERIFIED: file read; GitNexus context]
- `backend/src/worldgen/types.ts` - scaffold shape. [VERIFIED: file read; GitNexus context]
- `backend/src/worldgen/scaffold-steps/locations-step.ts` - location prompt/schema shape. [VERIFIED: file read; GitNexus context]
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - NPC prompt/schema shape and artifact guardrails. [VERIFIED: file read; GitNexus context]
- `backend/src/engine/scene-presence.ts` - canonical resolver. [VERIFIED: file read; GitNexus context]
- `backend/src/engine/scene-frame.ts` - runtime roster consumer. [VERIFIED: file read; GitNexus context]
- `backend/src/routes/character.ts` - player start persistence. [VERIFIED: file read; GitNexus context]
- `backend/src/routes/campaigns.ts` - `/world.currentScene` payload. [VERIFIED: file read; GitNexus context]
- `backend/src/engine/prompt-assembler.ts` - prompt context consumer and likely scene-id gap. [VERIFIED: file read; GitNexus context]

### Secondary

- Phase 43/46/55/70/74 docs and `.planning/STATE.md` - historical promise/current decision context. [VERIFIED: rg/file reads]
- Backend/frontend package files - targeted command and dependency availability. [VERIFIED: backend/package.json; frontend/package.json]
- GitNexus status/context/impact - graph freshness and affected symbol snapshot. [VERIFIED: `npx gitnexus status`; GitNexus MCP queries]

### Tertiary

- No web search was used; this phase is repo-internal and source evidence was sufficient. [VERIFIED: tool usage]

## Metadata

**Confidence breakdown:**

- Root cause: HIGH - direct source evidence shows flat scaffold shape, flat location saver, and missing NPC scene id write. [VERIFIED: backend/src/worldgen/types.ts:44-76; backend/src/worldgen/scaffold-saver.ts:61-223]
- Runtime resolver boundary: HIGH - resolver, SceneFrame, campaigns route, and existing tests prove scoped data is consumed when present. [VERIFIED: backend/src/engine/scene-presence.ts:183-265; backend/src/engine/__tests__/scene-presence.test.ts; backend/src/routes/__tests__/campaigns.inventory-authority.test.ts]
- Proposed scaffold field names: MEDIUM - field names are research recommendations; planner may choose equivalent names. [ASSUMED]
- Test strategy: HIGH for targeted file selection; MEDIUM for exact final command set until implementation changes are known. [VERIFIED: backend/package.json; frontend/package.json] [ASSUMED]
- Phase 76 candidates: MEDIUM - grounded in audit/state evidence, but final classification belongs to implementation closeout. [VERIFIED: 75-PROMISE-AUDIT.md; .planning/STATE.md:61-62; .planning/STATE.md:193]

**Research date:** 2026-04-30 [VERIFIED: environment current_date]
**Valid until:** 2026-05-14 for repo architecture; provider-specific readiness should be refreshed before release gates. [ASSUMED]

## RESEARCH COMPLETE
