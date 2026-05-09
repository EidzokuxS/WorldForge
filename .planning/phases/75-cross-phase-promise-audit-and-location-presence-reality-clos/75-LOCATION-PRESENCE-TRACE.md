# Phase 75 Location-Presence Trace

## Verdict

The dense-location bug is upstream of scene presence. Runtime scoping works when stored rows contain real scene scopes. Generated worlds collapse because worldgen saves dense places as flat macro locations, then saves NPCs with only broad `currentLocationId`.

## Evidence Chain

### Schema Supports Scope

- `backend/src/db/schema.ts:29-35`: `locations.kind` supports `macro`, `persistent_sublocation`, and `ephemeral_scene`; `parentLocationId` exists.
- `backend/src/db/schema.ts:151-176`: players and NPCs have `currentSceneLocationId`.

### Worldgen Emits Flat Locations

- `backend/src/worldgen/types.ts`: `ScaffoldLocation` has `name`, `description`, `tags`, `isStarting`, and `connectedTo`, but no parent/sublocation fields.
- `backend/src/worldgen/scaffold-steps/locations-step.ts`: location planning asks for 5-8 flat locations.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts`: NPC planning asks for `locationName` from the flat known-location list.

### Saver Flattens Persistence

- `backend/src/worldgen/scaffold-saver.ts:62-89`: `insertLocations` assigns a UUID for each location name and inserts every row with `kind: "macro"` and `parentLocationId: null`.
- `backend/src/worldgen/scaffold-saver.ts:166-223`: `insertNpcs` resolves `currentLocationId = locationIds.get(npc.locationName) ?? null`, writes `currentLocationId`, and never writes `currentSceneLocationId`.

### Runtime Correctly Consumes Bad Data

- `backend/src/engine/scene-presence.ts`: `resolveStoredSceneScopeId` falls back missing scene scope to broad location.
- `backend/src/engine/scene-frame.ts:405-470`: `buildRoster` filters NPCs by broad location, then asks `resolveScenePresence` to compute awareness using the scene scope fields it receives.
- `backend/src/engine/scene-frame.ts:806-823`: `buildSceneFrame` resolves player scene scope from player state and passes all NPC rows into roster construction.
- `backend/src/engine/turn-processor.ts`: opening/turn flows use the stored player scene scope, which is currently broad macro for generated worlds.

## Concrete Failure Scenario

For a generated Shibuya world:

1. Worldgen creates `Shibuya District` as a single scaffold location.
2. Saver stores it as one `macro` row.
3. NPCs such as Gojo, students, enemies, civilians, and support cast all receive `currentLocationId = Shibuya`.
4. NPCs receive no `currentSceneLocationId`.
5. The player starts at `currentSceneLocationId = Shibuya`.
6. Scene presence sees all actors as sharing broad location and resolved scene scope `Shibuya`.
7. The player-facing scene behaves as if the whole district is one room.

## Missing Wiring

- Scaffold location type needs deterministic hierarchy fields, at minimum a parent location reference.
- Location prompt contract must ask for physically contained sublocations without asking the backend to infer world semantics.
- Saver must persist `persistent_sublocation` rows with `parentLocationId`.
- NPC placement must support scoped placement and write both broad and scene ids.
- Player starting placement must choose a concrete starting scene and write both broad and scene ids.
- `/world`, SceneFrame, prompt assembly, and frontend People Here must be verified against the generated scoped rows.

## Required Regression Coverage

- Dense scaffold save: macro plus sublocation rows exist; parent ids are valid.
- NPC save: NPC assigned to a sublocation has macro broad id and sublocation scene id.
- Player start: player starts in concrete sublocation when the generated starting location is scoped.
- SceneFrame: player in sublocation A does not see NPC in sibling sublocation B.
- `/world`: current scene does not return every actor under the same macro.
- Prompt assembly: scoped scene does not leak all broad-location NPC/equipment context.
- Frontend, if current tests exist cheaply: People Here reads current-scene clear actors, not broad macro actors.

