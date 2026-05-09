# Phase 75 Cross-AI Advisory Prompt

You are reviewing WorldForge Phase 75 planning before implementation. This is a read-only advisory pass.

## Project Goal

WorldForge is a local text RPG/world simulation project. The current milestone is trying to make generated worlds and live player turns behave coherently. The key engineering rule is: the LLM may interpret story/world semantics, but deterministic backend code owns mechanical truth, persistence, validation, visibility, and rollback.

## User-Observed Problem

A generated JJK/Shibuya-style world produced better narration, but the generated cast still behaved as if everyone was in one broad Shibuya room. Earlier phases were supposed to distinguish large macro locations from smaller persistent sublocations and keep actors scoped by actual scene/presence.

The user asked for Phase 75 to audit prior completed phases and find promises that exist in docs/schema but are not wired into current live behavior.

## Current Evidence

Database schema supports location hierarchy:

- `backend/src/db/schema.ts:29-35`: `locations.kind` enum includes `macro`, `persistent_sublocation`, `ephemeral_scene`; `parentLocationId` exists.
- `backend/src/db/schema.ts:151-176`: players and npcs have `currentSceneLocationId`.

Worldgen persistence currently appears flat:

- `backend/src/worldgen/scaffold-saver.ts:62-89`: `insertLocations` saves every scaffold location with `kind: "macro"` and `parentLocationId: null`.
- `backend/src/worldgen/scaffold-saver.ts:166-223`: `insertNpcs` resolves `currentLocationId = locationIds.get(npc.locationName)` and writes only `currentLocationId`, not `currentSceneLocationId`.

Runtime scene presence can use scene scope if fed useful data:

- `backend/src/engine/scene-frame.ts:405-470`: `buildRoster` filters NPCs by broad location, then passes player/NPC `sceneScopeId` into `resolveScenePresence`.
- `backend/src/engine/scene-frame.ts:806-823`: `buildSceneFrame` resolves current scene scope from player state, reads NPC rows, and builds the roster.

Phase docs say this behavior was intended:

- Phase 43 planned macro locations, persistent sublocations, and ephemeral scene nodes.
- Phase 46 planned encounter scope/presence boundaries.
- Phase 70 verified deterministic SceneFrame/presence plumbing, but it depends on stored state being meaningful.

## Phase 75 Proposed Requirements

- Audit completed phase promises against current code/tests.
- Prioritize user-visible gameplay/worldgen promises.
- Fix dense generated worlds so sublocations/presence are persisted and consumed.
- Keep backend deterministic: it may map already generated scaffold fields to runtime structures, but must not infer canon/source meaning from arbitrary strings.
- Add regression coverage proving dense worlds do not collapse all NPCs into one macro location.
- Any extra stale promises found by the audit must be fixed, deprecated, or moved to Phase 76 with evidence.

## Questions

1. Is the root cause analysis for the dense-location bug coherent, or are we missing another current-code layer?
2. What is the simplest maintainable implementation strategy that respects the backend/LLM authority boundary?
3. What should Phase 75 plan explicitly include to avoid becoming another "schema exists but runtime does not use it" phase?
4. What additional completed-phase promise gaps should be audited first, based on the evidence above?
5. What tests are mandatory before this can be called fixed?

Return:

- Verdict: ready-to-plan / needs-more-research / no-go.
- Top risks.
- Recommended plan tasks.
- Verification checklist.
