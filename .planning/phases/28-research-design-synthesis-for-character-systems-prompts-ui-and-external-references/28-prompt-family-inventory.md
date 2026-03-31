# Phase 28 Prompt Family Inventory

## Runtime

### Storyteller runtime contract

| Family | Owner files | Current contract | Current inputs |
| --- | --- | --- | --- |
| Runtime narration system prompt | `backend/src/engine/prompt-assembler.ts` | Large `SYSTEM_RULES` block defining narrator behavior, mechanical restrictions, movement/tool obligations, HP handling, world consistency, and quick-action requirements | assembled sections: world premise, scene, world state, player state, NPC states, relationships, action result, lore context, episodic memory, recent conversation |
| Turn outcome framing | `backend/src/engine/turn-processor.ts`, `backend/src/engine/prompt-assembler.ts` | Oracle result is emitted separately, then outcome-specific instructions are layered onto narration generation | Oracle chance/roll/outcome + assembled prompt |
| Storyteller tool contract | `backend/src/engine/tool-schemas.ts` | AI SDK tool descriptions define the action surface and embed many behavior requirements directly in tool descriptions | campaign-scoped execution tools, input schemas, outcome tier |

### Runtime support prompts

| Family | Owner files | Current contract | Current inputs |
| --- | --- | --- | --- |
| Conversation importance detection | `backend/src/engine/prompt-assembler.ts` | Structured-output batch classification of important chat messages for compression | recent chat history, judge role |
| NPC active agent | `backend/src/engine/npc-agent.ts` | System prompt asking a key NPC to choose one action using goals, beliefs, memories, relationships, and local scene | NPC persona/tags/goals/beliefs + location + nearby entities + episodic memory + relationship graph |
| Reflection | `backend/src/engine/reflection-agent.ts` | System prompt asking an NPC to update beliefs/goals/relationships/wealth/skills based on evidence | NPC beliefs/goals + recent episodic events |
| Oracle / Judge | `backend/src/engine/oracle.ts` | Deterministic structured chance evaluation with calibration bands and explicit reasoning expectations | intent, method, actor tags, target tags, environment tags, scene context |
| World engine | `backend/src/engine/world-engine.ts` | Faction-level macro-action evaluation prompt | faction tags/goals + world context + neighbor factions |

### Runtime observations

- Runtime narration mixes immutable worldview rules, tool-call obligations, combat mechanics, item constraints, and world-consistency reminders inside one giant `SYSTEM_RULES` block.
- The tool descriptions in `tool-schemas.ts` repeat some of the same constraints already stated in `SYSTEM_RULES`, especially around quick actions, condition updates, and movement.
- Runtime prompt assembly still describes the game as primarily tag-based even though Phase 28 has now defined a richer shared character ontology.

## Worldgen

### Worldgen generation families

| Family | Owner files | Structured-output contract | Current inputs |
| --- | --- | --- | --- |
| DNA suggestion | `backend/src/worldgen/seed-suggester.ts` | structured seed category outputs | premise, optional IP context, premise divergence, stop-slop rules |
| Premise refinement | `backend/src/worldgen/scaffold-steps/premise-step.ts` | refined premise/world-state summary | premise, seeds, IP context, divergence |
| Location planning/detail | `backend/src/worldgen/scaffold-steps/locations-step.ts` | planning arrays plus location cards | refined premise, seeds, known location lists, IP/divergence helper blocks |
| Faction planning/detail | `backend/src/worldgen/scaffold-steps/factions-step.ts` | planning arrays plus faction cards | refined premise, location names, IP/divergence helper blocks |
| NPC planning/detail | `backend/src/worldgen/scaffold-steps/npcs-step.ts` | key/supporting NPC planning and NPC reference cards | refined premise, location names, faction names, IP/divergence helper blocks |
| Lore extraction | `backend/src/worldgen/lore-extractor.ts` | `loreCards[]` schema | world scaffold, IP/divergence helper blocks, stop-slop rules |
| Starting location resolution | `backend/src/worldgen/starting-location.ts` | `locationName` + short narrative | premise, known location names, user prompt |

### Worldgen support families

| Family | Owner files | Current role |
| --- | --- | --- |
| Canon/delta helper layer | `backend/src/worldgen/scaffold-steps/prompt-utils.ts` | Shared helper blocks for canon fidelity, divergence, known-IP generation contract, and anti-slop rules |
| Premise divergence interpretation | `backend/src/worldgen/premise-divergence.ts` | Structured interpretation of how user premise changes canon |
| IP research and sufficiency | `backend/src/worldgen/ip-researcher.ts`, `backend/src/worldgen/mcp-research.ts` | Research prompts that gather, judge sufficiency, and synthesize canon facts |
| Worldbook classification | `backend/src/worldgen/worldbook-importer.ts` | Classification prompt for imported worldbook entries |

### Worldgen observations

- Worldgen has the cleanest prompt-family layering in the repo because `prompt-utils.ts` already centralizes canon fidelity, divergence, and anti-slop guidance.
- Even there, some plan/detail prompts still duplicate stop-slop or mechanical-precision reminders inline instead of deriving from one family-level contract.
- Starting-location resolution is conceptually worldgen-adjacent but contractually too small for the new character/start model because it only returns location plus narrative.

## Character

### Character generation/import families

| Family | Owner files | Structured-output contract | Current inputs |
| --- | --- | --- | --- |
| Player parse | `backend/src/character/generator.ts` | `ParsedCharacter` schema | premise, known locations, free-text description |
| Player V2 import | `backend/src/character/generator.ts` | `ParsedCharacter` schema | premise, known locations, card sections, import mode |
| Player generate | `backend/src/character/generator.ts` | `ParsedCharacter` schema | premise, known locations, known factions |
| Player archetype generate | `backend/src/character/generator.ts` | `ParsedCharacter` schema | premise, locations, factions, archetype research |
| NPC parse | `backend/src/character/npc-generator.ts` | `GeneratedNpc` schema | premise, locations, factions, free-text description |
| NPC V2 import | `backend/src/character/npc-generator.ts` | `GeneratedNpc` schema | premise, locations, factions, card sections, import mode |
| NPC archetype generate | `backend/src/character/npc-generator.ts` | `GeneratedNpc` schema | premise, locations, factions, archetype research |
| Archetype research | `backend/src/character/archetype-researcher.ts` | unstructured research summary | archetype name, optional research provider |

### Character observations

- Player and NPC prompt families do not share one contract. They are parallel families with different schemas and different assumptions about what counts as a character.
- Import-mode guidance and archetype research already act like persona/template layers, but they are injected as prompt fragments instead of passing through one shared draft contract.
- Player prompts preserve explicit user profile facts well, but they still instruct the model to think in the old "tag-only system" language.

## Judge

### Judge-family prompt inventory

| Family | Owner files | Primary job | Risk if rewritten carelessly |
| --- | --- | --- | --- |
| Oracle chance evaluation | `backend/src/engine/oracle.ts` | deterministic probability judgment | breaks mechanical fairness or calibration |
| Chat compression importance classifier | `backend/src/engine/prompt-assembler.ts` | preserve critical history | loses important story beats or bloats context |
| NPC agent decision prompt | `backend/src/engine/npc-agent.ts` | autonomous scene-local NPC action | NPCs become passive or incoherent |
| Reflection prompt | `backend/src/engine/reflection-agent.ts` | evidence-based belief/goal updates | relationship/progression drift |
| Faction/world engine prompts | `backend/src/engine/world-engine.ts` | macro simulation choices | world events become noisier or less consistent |

### Judge observations

- "Judge" is not one prompt. It is several distinct task families with different output modes: structured JSON, tool calling, and deterministic classification.
- Phase 31 should not audit these as one blob; Oracle, NPC agent, reflection, and world-engine prompts each need separate regression expectations.

## Shared helper layers

### Prompt helper ownership today

- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` is the strongest current example of family-level prompt reuse.
- Character generation lacks an equivalent shared contract layer. Important rules are copied across player and NPC prompts instead.
- Runtime narration has no helper-level split between immutable worldview rules, tool-use rules, and character-context injection.

## Contradictions

### Contract drift against the new character ontology

- Runtime `SYSTEM_RULES` still frames the world as primarily tag-based, while Plan 28-01 now defines structured character field groups with derived runtime tags.
- Character prompts for players and NPCs still produce different schemas, so Phase 31 cannot merely "clean wording"; it must anchor prompts to the shared ontology from `28-character-ontology-spec.md`.
- Starting-location resolution still assumes start state is basically location selection plus flavor text, which conflicts with the structured `startConditions` direction.

### Duplicated authority

- Quick-action obligations live in `SYSTEM_RULES` and in the `offer_quick_actions` tool description.
- HP/condition obligations live in `SYSTEM_RULES` and in the `set_condition` tool description.
- Canon fidelity and anti-slop guidance are centralized for worldgen but not for character or runtime prompt families.

### Inconsistent character semantics

- Player prompts ask for race/gender/age/appearance/equipment but not explicit goals or beliefs.
- NPC prompts ask for persona/goals/faction but not race/gender/age/appearance/equipment.
- Runtime prompt assembly then flattens those asymmetries into scene narration, making downstream behavior depend on whichever path authored the character.

## Stale instructions

### Repo-backed stale or aging instructions

- `backend/src/character/generator.ts` still says "Use the tag-only system" even though the next milestone's target model is explicitly richer.
- `backend/src/worldgen/starting-location.ts` returns only `locationName` and `narrative`, which is now an underspecified prompt contract for the queued start-condition work.
- `backend/src/engine/prompt-assembler.ts` keeps several mechanical and stylistic requirements in one monolith, making it easy for docs and downstream prompt families to drift from the live runtime contract.

## Phase 31 dependency on Plan 28-01

- Phase 31 must rewrite prompt families around the shared character ontology rather than preserving the old player-vs-NPC split.
- Prompt surfaces that touch protagonist or NPC creation, runtime character context, or starting-state context must consume `Source of Truth` field groups first and emit `Derived Runtime Tags` second.
- The rewrite target is not "better prompts" in the abstract. It is prompt contracts that match the new character/start model without duplicating or contradicting each other.
