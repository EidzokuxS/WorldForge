# Phase 28 Character Systems Audit

## Current-State Inventory

### Shared and persisted shapes

| Surface | Current representation | Owner files | Notes |
| --- | --- | --- | --- |
| Saved player | `players` row with `name`, `race`, `gender`, `age`, `appearance`, `hp`, `tags`, `equippedItems`, `currentLocationId` | `backend/src/db/schema.ts`, `backend/src/routes/character.ts`, `shared/src/types.ts` | Player data is partly structured and partly flat-tag driven. Equipment is stored twice: `players.equippedItems` and `items`. |
| Saved NPC | `npcs` row with `name`, `persona`, `tags`, `tier`, `currentLocationId`, `goals`, `beliefs`, `unprocessedImportance`, `inactiveTicks` | `backend/src/db/schema.ts`, `backend/src/worldgen/types.ts` | NPCs own richer motivation state than players, but lose physical/profile parity. |
| Worldgen scaffold NPC | `ScaffoldNpc` with `persona`, `tags`, `goals`, `locationName`, `factionName`, optional `tier` | `backend/src/worldgen/types.ts`, `backend/src/worldgen/scaffold-generator.ts` | Pre-save NPCs already differ from saved NPCs because `tier` is optional and there is no profile block shared with players. |
| Generated player draft | `ParsedCharacter` / `PlayerCharacter` with profile fields, flat `tags`, `hp`, `equippedItems`, `locationName` | `backend/src/character/generator.ts`, `shared/src/types.ts` | This is the most complete player shape, but it never becomes a reusable cross-role draft contract. |
| Generated NPC draft | `GeneratedNpc` with `persona`, `tags`, nested `goals`, `locationName`, `factionName` | `backend/src/character/npc-generator.ts` | NPC generation omits race/gender/age/appearance/equipment entirely, even though runtime and UI care about some of those ideas. |
| Runtime player prompt view | `[PLAYER STATE]` block with profile text, flat tags, wealth tag extraction, equipped items, and inventory | `backend/src/engine/prompt-assembler.ts` | Runtime prompt derives semantics by re-reading tag piles instead of a canonical ontology. |
| Runtime NPC prompt view | `[NPC STATES]` block with `persona`, flat tags, flattened goals, beliefs, and tier | `backend/src/engine/prompt-assembler.ts` | NPC runtime context has richer motivational state than player runtime context, but weaker physical/profile detail. |

### Player creation and import entry points

| Entry point | Input style | Output shape | Owner files | Current implications |
| --- | --- | --- | --- | --- |
| Free-text parse | Description text | `ParsedCharacter` | `backend/src/character/generator.ts`, `frontend/components/character-creation/character-form.tsx` | Persona-like data is squeezed into profile text, tags, items, and location. |
| AI generate | Premise + known locations/factions | `ParsedCharacter` | `backend/src/character/generator.ts`, `frontend/app/campaign/[id]/character/page.tsx` | No structured persona template input. Character motivation exists only as implied tags/background. |
| Archetype research | Archetype + optional researched text | `ParsedCharacter` | `backend/src/character/generator.ts`, `backend/src/character/archetype-researcher.ts` | Archetype becomes a hidden upstream persona/template source, but only for players in this path. |
| V2 import | ST card sections + import mode | `ParsedCharacter` | `backend/src/character/generator.ts`, `backend/src/character/import-utils.ts` | Import mode already behaves like a persona/context adapter, but is not modeled as such. |

### NPC creation and worldgen entry points

| Entry point | Input style | Output shape | Owner files | Current implications |
| --- | --- | --- | --- | --- |
| Free-text parse | Description text | `GeneratedNpc` | `backend/src/character/npc-generator.ts`, `backend/src/routes/character.ts` | NPCs get `persona` and goals, but no shared profile or item/loadout concept. |
| Archetype generation | Archetype + optional research | `GeneratedNpc` | `backend/src/character/npc-generator.ts`, `backend/src/character/archetype-researcher.ts` | Archetype is already a reusable persona seed, but only for NPC-specific prompts. |
| V2 import | ST card sections + import mode | `GeneratedNpc` | `backend/src/character/npc-generator.ts`, `backend/src/character/import-utils.ts` | Import mode affects biography/goals rather than a reusable start/origin model. |
| World scaffold generation | World premise + location/faction names | `ScaffoldNpc` | `backend/src/worldgen/types.ts`, `backend/src/worldgen/scaffold-generator.ts` | Worldgen NPCs enter review with a different draft model than route-generated NPCs. |

## Contradictions

### Player and NPC are different character ideas, not different roles on one model

- Players are modeled as physical/profile-heavy entities with weak motivation structure.
- NPCs are modeled as motivation/persona-heavy entities with weak profile and inventory structure.
- Worldgen NPCs add another intermediate model with optional tier and name-based references instead of canonical ids.
- Runtime prompt assembly has to flatten or reconstruct meaning from whichever shape happened to survive upstream.

### Canonical data and derived data are mixed together inconsistently

- `players.tags` and `npcs.tags` are treated as both authoring surface and runtime mechanics surface.
- `prompt-assembler.ts` extracts wealth from tags, inventory from `items`, equipped state from `players.equippedItems`, and NPC goals from nested JSON.
- The system has no single place that says which fields are authored facts, which are structured semantics, and which are runtime derivations.

### Saved state and review/editor state are not aligned

- Character creation edits a `ParsedCharacter` draft in `frontend/components/character-creation/character-card.tsx`.
- World review edits scaffold NPCs via review components and later saves them into DB-backed NPC rows.
- The same conceptual character can exist as player draft, scaffold NPC, saved NPC, and prompt-only summary without one canonical cross-surface contract.

### Motivation state is richer for NPCs than for protagonists

- NPCs persist `goals` and `beliefs`.
- Players persist none of that structure, even though player creation prompts talk about reasons to explore and compelling flaws.
- Downstream prompt and UI work cannot treat protagonist and major NPC motivation symmetrically because the data model forbids it.

## Start State

### Current start-state flow

- Player generation and parsing produce a single `locationName` field in `ParsedCharacter`.
- The character page adds a free-text "Starting Situation" box and calls `/resolve-starting-location`.
- `backend/src/worldgen/starting-location.ts` converts that text into `locationName` plus a short narrative only.
- `backend/src/routes/character.ts` persists only the matched location id on save; the starting-situation text and narrative are discarded.

### Current problems

- Start state is not persisted as a structured game fact. It is a transient helper used to overwrite `locationName`.
- Arrival conditions, social posture, recent events, injuries, debt, travel context, escort status, disguise state, and other scenario-defining facts cannot survive the save boundary.
- Prompt consumers later see only the saved location and the generic player tags. They cannot recover how the character entered the world.
- The UI already hints that "starting situation" is more than location, but the backend contract collapses it back to a location chooser.

## Equipment

### Current equipment representation

- Player drafts include `equippedItems: string[]` directly in `ParsedCharacter`.
- Saved players also store `equippedItems` as JSON text on the `players` table.
- Runtime inventory is separately modeled in the `items` table, and prompt assembly reads owned items from `items` while also reading `equippedItems` from the player row.
- NPC drafts and saved NPCs have no equivalent equipment/loadout structure.

### Current problems

- "Equipped" is currently a player-only string list, while the actual world inventory is item-table based.
- Starting gear from character creation does not obviously map onto first-class item entities or equip slots/states.
- NPCs can own items in runtime tables, but generation/review flows do not expose a consistent NPC loadout concept.
- Downstream phases cannot make canonical loadouts reliable while two different storage patterns remain authoritative at different moments.

## Persona

### Existing persona-like behavior already in the repo

- NPC generation has an explicit `persona` field that blends personality, background, and role.
- Player generation lacks `persona`, but free-text description, imported card sections, archetype research, and tags collectively play the same role.
- `buildImportModeGuidance()` and `importMode` already act like a structured origin/status adapter.
- Archetype research in `backend/src/character/archetype-researcher.ts` is already a template source for both player and NPC generation.
- Worldbook import and franchise research also act as indirect persona/context seeding for characters created inside a specific world premise.

### Current problems

- Persona/template behavior exists, but it leaks in through prompt text and helper functions rather than a first-class draft contract.
- NPCs get one free-text `persona` blob; players get profile fields plus tags; imports and archetypes inject context differently for each path.
- There is no shared "character draft" surface where parser output, archetype research, persona template choice, and import mode converge before save.

## Why flat tags are a symptom, not the root problem

- Tags are doing too many jobs at once: authoring shorthand, runtime lookup, progression markers, wealth tiers, skill tiers, social descriptors, and sometimes narrative vibe.
- The real issue is the lack of a canonical ontology that decides where traits, motivations, biography, state, loadout, and runtime derivations live.
- Flat tags stay noisy because they are compensating for missing structure elsewhere: start state, persona input, motivation, profile parity, and loadout semantics.

## Blocks Phase 29

- Phase 29 cannot replace noisy tags safely until the authoritative field groups are named and separated from derived runtime tags.
- Runtime prompt assembly cannot be updated coherently while player, NPC, and scaffold contracts still disagree on what a character is.
- DB migration work is underdefined until there is a clear seam between persisted source-of-truth data and runtime derivations.

## Blocks Phase 30

- Phase 30 cannot make start conditions meaningful while the current system only persists a location id and drops the rest of the scenario.
- Canonical loadouts cannot be introduced cleanly while player equipment is split between `equippedItems` strings and `items` rows and NPC loadouts are mostly absent.
- Persona templates cannot become reusable for both protagonists and NPCs until parse/import/archetype/worldgen flows converge on one shared draft pipeline.
