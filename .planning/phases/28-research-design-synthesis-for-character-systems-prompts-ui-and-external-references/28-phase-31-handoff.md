# Phase 31 Prompt Harmonization Handoff

## Goal

Audit and rewrite prompt families so WorldForge behaves like one coherent machine after the Phase 29-30 character/start-model changes.

## Audit Order

1. Shared contract anchors
2. Runtime narration and storyteller tool contract
3. Character drafting families
4. Start-condition resolution
5. Worldgen planning/detail/lore families
6. Judge/support families
7. Research/import helpers that feed the above

Rationale:

- Shared ontology and start-condition language must be established first or later rewrites will drift again.
- Runtime narration and character drafting are the most user-visible and most exposed to the new model.
- Worldgen and support-family rewrites should follow the new contract vocabulary rather than inventing their own.

## File Groups

### Group 1: shared contract anchors

- `backend/src/worldgen/scaffold-steps/prompt-utils.ts`
- any new character prompt-helper layer introduced during Phase 31
- `28-character-ontology-spec.md`
- `28-prompt-contract-rules.md`

### Group 2: runtime narration and tool contract

- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/tool-schemas.ts`
- `backend/src/engine/turn-processor.ts`

### Group 3: character drafting

- `backend/src/character/generator.ts`
- `backend/src/character/npc-generator.ts`
- `backend/src/character/import-utils.ts`
- `backend/src/character/archetype-researcher.ts`

### Group 4: start conditions

- `backend/src/worldgen/starting-location.ts`
- any new Phase 30 start-condition assembly helpers
- `backend/src/routes/character.ts`

### Group 5: worldgen families

- `backend/src/worldgen/seed-suggester.ts`
- `backend/src/worldgen/scaffold-steps/premise-step.ts`
- `backend/src/worldgen/scaffold-steps/locations-step.ts`
- `backend/src/worldgen/scaffold-steps/factions-step.ts`
- `backend/src/worldgen/scaffold-steps/npcs-step.ts`
- `backend/src/worldgen/lore-extractor.ts`

### Group 6: Judge and support families

- `backend/src/engine/oracle.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/reflection-agent.ts`
- `backend/src/engine/world-engine.ts`
- `backend/src/engine/prompt-assembler.ts` conversation-importance sub-prompt

## Rewrite sequence

1. Define reusable wording for the new character ontology and `startConditions`.
2. Refactor runtime narration/tool-family authority boundaries.
3. Rewrite character prompts around one shared draft contract.
4. Replace the location-only start-resolution prompt with a structured start-condition contract.
5. Update worldgen NPC and any character-adjacent generation prompts to emit the new shared model.
6. Audit Judge/support families for stale assumptions about tags, goals, persona, or start-state context.

## Regression Seams

- Oracle calibration bands and deterministic behavior in `backend/src/engine/oracle.ts`.
- Runtime narration hard constraints in `backend/src/engine/prompt-assembler.ts`: narrative-only output, outcome fidelity, world-consistency, movement/tool obligations, and HP handling.
- Known-IP canon/delta layering from Phase 25 in `prompt-utils.ts`, `seed-suggester.ts`, scaffold steps, and `lore-extractor.ts`.
- Character parse/import preservation of explicit user facts in `backend/src/character/generator.ts`.
- Existing import-mode guidance that keeps outsider/native status in biography or persona rather than noisy tags.
- Any Phase 30 start-condition/loadout semantics once those contracts exist; Phase 31 must consume them, not reinterpret them.

## Regression hotspots after the new ontology lands

- Old tag-centric instructions lingering in player or runtime prompt families after structured fields become canonical.
- Divergence between player and NPC drafting language if one file group is rewritten before the other.
- Tool descriptions silently disagreeing with runtime system rules.
- Start-state prompts that still reduce the contract to location-only behavior.
- Worldgen NPC outputs that still target the old split `GeneratedNpc` / `ParsedCharacter` world.

## Non-Goals

- Do not rewrite gameplay UI or route layout in Phase 31.
- Do not redesign providers, model selection, or fallback infrastructure unless a prompt contract is impossible without it.
- Do not broaden scope into memory architecture or retrieval redesign beyond prompt-consumption clarity.
- Do not collapse all prompt families into one mega-helper; family boundaries still matter.

## Verification guidance for Phase 31

- Use targeted prompt/regression tests where they already exist.
- Add prompt assertions for any newly centralized helper blocks.
- Verify that character-family prompts mention structured source-of-truth fields before derived tags.
- Verify that known-IP prompt families still preserve unaffected canon while applying divergence.
- Verify that runtime narration and tool descriptions no longer contain contradictory authority.

## Expected deliverables from Phase 31

- rewritten or centralized prompt contract helpers where needed
- prompt-family inventory updated against live files
- regression notes for protected seams
- docs or summaries that explain how the new character/start contract now flows through runtime, character generation, and worldgen prompts
