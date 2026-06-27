# A5 Cast Registry Canvas

## Objective

Build A5a: a pure adapter that turns existing `CharacterDraft` and `ScaffoldNpc` inputs into the campaign kernel `CampaignCastRegistry`.

## Operating Contract

- Accept already-created player, imported, and generated character inputs.
- Do not call character generation, import endpoints, `/api/worldgen/generate`, scaffold generators, or LLM roles.
- Do not persist kernel state in A5.
- Require at most one player character.
- Fail with an error when a cast member has an empty name or when two cast members normalize to the same name.
- Leave database writes, inventory authority, Starting Setup, Opening, and Chat Loop for later slices.
- Defer import/create UI and endpoint wiring to A5b.

## Lanes

### L1 Source Lock
Status: complete
Owner: L1
Scope: Define the A5a registry adapter contract.
Output:

- [sourced] Development order says A5 is `Cast Registry + import/create character`.
- [sourced] Campaign Kernel architecture says Cast Registry owns one player, imported cast, and generated cast.
- [proposed] A5a delivers the registry adapter; A5b wires import/create flows into the campaign kernel path.

### L2 Current-State Map
Status: complete
Owner: L2
Scope: Identify current character input shapes.
Output:

- [inspected] `shared/src/types.ts` defines `CharacterDraft`.
- [inspected] `backend/src/worldgen/types.ts` defines `ScaffoldNpc`.
- [inspected] `backend/src/character/record-adapters.ts` already converts legacy scaffold NPC data into `CharacterDraft`.

### L3 Mapping
Status: complete
Owner: L3
Scope: Define character-to-cast conversion.
Output:

- [proposed] A5 does not infer source. The caller bucketizes and tags inputs as `player_created`, `player_imported`, `npc_imported`, or `npc_generated`.
- [proposed] Player input maps to `playerCharacter` with `campaignRole: "player"` and `importance: "primary"`.
- [proposed] Imported NPC input maps to `importedCast`; generated NPC input maps to `generatedCast`.
- [proposed] NPC `campaignRole` defaults from the converted draft: `key` -> `major_npc`, `temporary` -> `background`, all other tiers -> `minor_npc`.
- [proposed] Semantic roles such as `companion`, `rival`, `enemy`, and `romance` require authored or model-owned intent and are deferred.
- [proposed] Placement uses draft `currentLocationId` and `startLocationId` when present; names remain notes until graph IDs exist.
- [proposed] `ScaffoldNpc.sceneLocationName` is preserved as a placement note until scene graph IDs exist.
- [proposed] Importance derives from the converted draft's `identity.tier`: `key` -> `major`, `supporting` and `persistent` -> `minor`, `temporary` -> `background`, with player forced to `primary`.
- [proposed] `ScaffoldNpc` conversion uses `reconcileDraftBackedScaffoldNpc` when `npc.draft` exists and `fromLegacyScaffoldNpc` otherwise.
- [proposed] Member IDs use `cast:${source}:${slug(name)}-${fnv1a(source:name)}`.

### L4 Boundaries
Status: complete
Owner: L4
Scope: Keep A5 out of generation and persistence.
Output:

- [proposed] A5 returns a registry object only.
- [proposed] Later slices decide how registry data merges into `kernel.json` and database tables.

### L5 Proof
Status: complete
Owner: L5
Scope: Prove registry output and fail-closed behavior.
Output:

- [executed] Focused tests cover player placement, imported cast, generated cast, duplicate names, missing names, key importance, temporary background role, and static import guards.

### L6 Risk
Status: complete
Owner: L6
Scope: Inspect for accidental old generation imports.
Output:

- [inspected] A5 imports `ScaffoldNpc` with `import type` only.
- [inspected] A5 imports `fromLegacyScaffoldNpc` and `reconcileDraftBackedScaffoldNpc` from record adapters; this transitive path is allowed because it normalizes drafts and does not call generation, routes, DB writes, or LLM roles.
- [inspected] A5 module source contains no `/api/worldgen/generate`, `generateCharacter`, `parse-character`, `import-v2-card`, or `scaffold-generator`.

## Integration Notes

- +1 decision: A5a is a pure registry adapter. A5b will wire import/create flows into the campaign kernel path.
- +1 proof target: given one player draft plus imported/generated NPC inputs, produce a registry with one player, imported cast, generated cast, deterministic member IDs, and no old generation calls.
- +1 GLM note: GLM-5.2 requested explicit campaignRole mapping, caller-owned source tags, converted-draft tier mapping, scaffold conversion branch, member ID scheme, sceneLocationName handling, and A5a/A5b split. Those revisions are applied here.
