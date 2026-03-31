# Phase 29-30 Character Foundation Handoff

## Scope Split

### Phase 29

Phase 29 must establish the shared ontology and compatibility seam.

Required outcomes:

- introduce the canonical `CharacterRecord` / `CharacterDraft` contracts
- separate source-of-truth structured fields from derived runtime tags
- align player, NPC, and scaffold character readers onto one shared model
- preserve existing gameplay/runtime behavior while migrating prompt and tool readers
- define migration rules for existing `players`, `npcs`, and scaffold data

Primary modules likely to touch:

- `shared/src/types.ts`
- `backend/src/db/schema.ts`
- `backend/src/character/generator.ts`
- `backend/src/character/npc-generator.ts`
- `backend/src/worldgen/types.ts`
- `backend/src/worldgen/scaffold-generator.ts`
- `backend/src/routes/character.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/reflection-agent.ts`
- frontend API type surfaces and character/world-review editors that currently assume split models

### Phase 30

Phase 30 must build on the Phase 29 ontology instead of inventing parallel structures.

Required outcomes:

- replace loose starting-location resolution with persisted `startConditions`
- materialize canonical loadouts from structured scenario/context rules
- introduce persona templates as reusable draft inputs for player and NPC generation
- wire start conditions and persona/template choices into prompt-facing draft assembly
- update creation/review UI seams to expose the new fields without creating alternate models

Primary modules likely to touch:

- `backend/src/worldgen/starting-location.ts`
- `backend/src/routes/character.ts`
- `backend/src/character/*`
- `backend/src/db/schema.ts`
- `backend/src/engine/prompt-assembler.ts`
- character creation and world-review UI/editor surfaces

## Phase 29 Execution Map

1. Define canonical shared types in `shared/` and backend-local helper types.
2. Decide persistence shape and compatibility layer for existing saves.
3. Migrate generation/import/worldgen outputs into one shared draft pipeline.
4. Add deterministic derivation helpers for runtime tags.
5. Switch prompt/runtime readers to consume structured field groups first.
6. Update review/editor/API surfaces to read the new contract.

## Phase 30 Execution Map

1. Replace transient start-resolution behavior with persisted `startConditions`.
2. Define scenario-to-loadout derivation rules and item materialization seam.
3. Add reusable persona template storage/selection contract.
4. Route free-text parse, archetype, import, and template selection through the shared draft pipeline.
5. Update character creation and relevant review surfaces for start/persona/loadout editing.

## Dependencies to Preserve

- Existing runtime mechanics still expect HP, items, locations, and NPC goals/beliefs to work.
- `prompt-assembler.ts` and NPC/reflection agents depend on fast compact views even if the source model becomes richer.
- Known-IP worldgen and divergence work from Phases 24-25 should remain additive; the character-model rewrite must not break those prompt contracts.
- World review save flows and existing route contracts should stay migration-friendly where possible.

## Non-Goals

- Do not rewrite prompt families wholesale in Phase 29 or 30; that belongs to Phase 31.
- Do not redesign the non-game UI shell in these phases; that belongs to Phase 32.
- Do not introduce broad memory/retrieval redesign while migrating characters.
- Do not solve gameplay-balance tuning beyond what is necessary to preserve current behavior.

## Risks

- Existing saves may require backfill or compatibility parsing because player and NPC data live in different schemas today.
- Derived runtime tags could drift from canonical fields if derivation is not centralized early.
- Start-condition and loadout work will sprawl if Phase 29 does not first establish a clean source-of-truth model.
- UI/editor work can accidentally fork the model again if review and character-creation surfaces are updated independently.

## Migration Seams

- Keep old flat-tag readers behind explicit derivation helpers while runtime systems are migrated.
- Treat `players.equippedItems` as a bridge field only until canonical loadout materialization is in place.
- Preserve existing `goals`/`beliefs` JSON parsing behavior until the new structured model has fully replaced legacy readers.
- Expect scaffold NPC review models to be an early friction point because they currently use names and reduced fields rather than canonical ids and full groups.

## Open Questions for Phase 29 Start

- Should the shared persisted table strategy be one unified table plus role/tier fields, or coordinated player/NPC tables with one shared serialized profile contract during migration?
- Which existing tags become first-class fields immediately versus temporarily remaining derived caches?
- What minimum protagonist motivation set must be persisted in Phase 29 so Phase 31 prompt rewrites have something stable to consume?

## Open Questions for Phase 30 Start

- Which start-condition subfields are required in v1 of the scenario model versus optional enrichment?
- How much of canonical loadout generation is deterministic rules vs AI-assisted draft suggestion before save?
- Do persona templates need standalone persistence in Phase 30, or can they begin as file/config-backed structured presets with later CRUD?
