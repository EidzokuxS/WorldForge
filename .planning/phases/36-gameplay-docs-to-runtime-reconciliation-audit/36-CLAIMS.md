# Phase 36: Gameplay Claim Register

This file is the authoritative gameplay-facing claim register extracted from the in-scope docs surface for Phase 36.

## Scope

- Primary sources: [docs/concept.md](R:\Projects\WorldForge\docs\concept.md), [docs/mechanics.md](R:\Projects\WorldForge\docs\mechanics.md), [docs/memory.md](R:\Projects\WorldForge\docs\memory.md)
- Secondary historical sources: [docs/plans/2026-03-05-research-agent.md](R:\Projects\WorldForge\docs\plans\2026-03-05-research-agent.md), [docs/plans/2026-03-06-player-character-creation.md](R:\Projects\WorldForge\docs\plans\2026-03-06-player-character-creation.md), [ROADMAP.md](R:\Projects\WorldForge\.planning\ROADMAP.md)
- Explicitly excluded unless they make direct gameplay/runtime promises: `docs/tech_stack.md`, `docs/research.md`

## Register Rules

- One row = one testable gameplay behavior or runtime contract.
- `runtime_status` is intentionally left as `pending_36_02` in this plan.
- Plan 36-02 must replace `pending_36_02` with exactly one of:
  - `implemented_and_wired`
  - `implemented_but_partial`
  - `documented_but_missing`
  - `outdated_or_contradicted`
- `claim_type` is one of: `behavioral_rule`, `data_contract`, `ui_expectation`, `architectural_constraint`.
- Ambiguities and contradictions are preserved in the `Notes` column instead of being silently resolved here.

## Coverage Summary

- Total claims: 136
- Subsystems:
  - Turn loop and Oracle
  - State mechanics
  - NPC tiers and autonomy
  - Reflection and progression
  - World engine and information flow
  - Memory and prompt assembly
  - Persistence and checkpoints
  - Character, start conditions, loadout, and runtime handoff

## Turn Loop And Oracle

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| TURN-01 | architectural_constraint | pending_36_02 | The LLM is the narrator and never the mechanical source of truth for gameplay outcomes. | `docs/concept.md :: Core Idea`; `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: AI Agent Tool System`; `docs/memory.md :: Overview` | Core product invariant repeated across all primary docs. |
| TURN-02 | architectural_constraint | pending_36_02 | Backend code resolves probability, inventory, movement, and other mechanical outcomes before narration is generated. | `docs/concept.md :: Core Idea`; `docs/concept.md :: Anatomy of a Turn`; `docs/memory.md :: Overview` | This is narrower than TURN-01 and explicitly names mechanics. |
| TURN-03 | behavioral_rule | pending_36_02 | A player turn can start from free-text input. | `docs/concept.md :: Anatomy of a Turn` | Input mode claim. |
| TURN-04 | behavioral_rule | pending_36_02 | A player turn can start from a context-sensitive quick-action button. | `docs/concept.md :: Anatomy of a Turn`; `docs/concept.md :: UI: "Solid Slate" Layout` | Quick actions are both input contract and UI contract. |
| TURN-05 | behavioral_rule | pending_36_02 | Context assembly for a turn includes player tags and player status. | `docs/concept.md :: Anatomy of a Turn` | Split from broader context-assembly claim. |
| TURN-06 | behavioral_rule | pending_36_02 | Context assembly for a turn includes current location state. | `docs/concept.md :: Anatomy of a Turn` | Split from broader context-assembly claim. |
| TURN-07 | behavioral_rule | pending_36_02 | Context assembly for a turn includes top relevant vector memories. | `docs/concept.md :: Anatomy of a Turn`; `docs/memory.md :: Prompt Assembly` | `concept.md` is high-level; `memory.md` gives detailed prompt contract. |
| TURN-08 | behavioral_rule | pending_36_02 | Context assembly for a turn includes applicable lore cards. | `docs/concept.md :: Anatomy of a Turn`; `docs/memory.md :: Prompt Assembly` | Lore inclusion is explicit in both docs. |
| TURN-09 | behavioral_rule | pending_36_02 | Non-trivial actions go through a soft-fail Oracle sanity check instead of being hard-blocked. | `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: Soft-Fail System` | Core sandbox openness rule. |
| TURN-10 | behavioral_rule | pending_36_02 | The Oracle outputs a success chance on a 0-100 scale. | `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: The Probability Oracle`; `docs/mechanics.md :: The Oracle Flow` | Numerical output contract. |
| TURN-11 | behavioral_rule | pending_36_02 | The backend rolls D100 to resolve Oracle outcomes. | `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: The Oracle Flow` | Backend-owned roll contract. |
| TURN-12 | behavioral_rule | pending_36_02 | Strong Hit means `roll <= chance × 0.5` and represents full success with possible bonus effect. | `docs/mechanics.md :: The Oracle Flow` | Outcome-tier subclaim. |
| TURN-13 | behavioral_rule | pending_36_02 | Weak Hit means `roll <= chance` and represents success with complication, cost, or partial result. | `docs/mechanics.md :: The Oracle Flow` | Outcome-tier subclaim. |
| TURN-14 | behavioral_rule | pending_36_02 | Miss means `roll > chance` and represents failure with consequences. | `docs/mechanics.md :: The Oracle Flow` | Outcome-tier subclaim. |
| TURN-15 | behavioral_rule | pending_36_02 | The Storyteller receives the resolved outcome tier and narrates accordingly. | `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: The Oracle Flow` | Couples mechanical resolution to narrative output. |
| TURN-16 | behavioral_rule | pending_36_02 | State update after narration can change HP, inventory, tags, entity positions, and episodic memory. | `docs/concept.md :: Anatomy of a Turn`; `docs/mechanics.md :: AI Agent Tool System`; `docs/memory.md :: Episodic Memory (Vector DB)` | `concept.md` states the broad effect; `mechanics.md` and `memory.md` define the update surfaces. |
| TURN-17 | data_contract | pending_36_02 | Oracle evaluation input includes action intent and method. | `docs/mechanics.md :: The Oracle Flow` | Payload field claim. |
| TURN-18 | data_contract | pending_36_02 | Oracle evaluation input includes actor tags, including negative debuffs. | `docs/mechanics.md :: The Oracle Flow` | Payload field claim. |
| TURN-19 | data_contract | pending_36_02 | Oracle evaluation input includes target tags. | `docs/mechanics.md :: The Oracle Flow` | Payload field claim. |
| TURN-20 | data_contract | pending_36_02 | Oracle evaluation input includes environment tags. | `docs/mechanics.md :: The Oracle Flow` | Payload field claim. |
| TURN-21 | architectural_constraint | pending_36_02 | Oracle rulings should come from a fast, cheap Judge model configured separately from the Storyteller. | `docs/mechanics.md :: Oracle Configuration`; `docs/mechanics.md :: Two LLM Roles` | This is partly a runtime contract and partly an ops/config constraint. |
| TURN-22 | architectural_constraint | pending_36_02 | Oracle temperature defaults to `0.0` to keep rulings consistent and logical. | `docs/mechanics.md :: Oracle Configuration` | Determinism-oriented configuration promise. |
| TURN-23 | ui_expectation | pending_36_02 | The gameplay UI uses a three-column CRPG layout with left world context, center narrative log, right player sheet, and bottom input/quick actions. | `docs/concept.md :: UI: "Solid Slate" Layout` | Explicit gameplay-screen presentation contract. |

## State Mechanics

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| STATE-01 | architectural_constraint | pending_36_02 | Tags are the universal descriptive language across characters, factions, locations, and items. | `docs/mechanics.md :: Tag-Based System` | Foundational mechanics model. |
| STATE-02 | data_contract | pending_36_02 | Trait tags are a distinct category of character/world tags. | `docs/mechanics.md :: Tag Categories` | Tag taxonomy claim. |
| STATE-03 | data_contract | pending_36_02 | Skill tags are a distinct category of character/world tags. | `docs/mechanics.md :: Tag Categories` | Tag taxonomy claim. |
| STATE-04 | data_contract | pending_36_02 | Flaw tags are a distinct category of character/world tags. | `docs/mechanics.md :: Tag Categories` | Tag taxonomy claim. |
| STATE-05 | data_contract | pending_36_02 | Status tags are a distinct category of character/world tags. | `docs/mechanics.md :: Tag Categories` | Tag taxonomy claim. |
| STATE-06 | data_contract | pending_36_02 | Structural location tags are a distinct category of character/world tags. | `docs/mechanics.md :: Tag Categories` | Tag taxonomy claim. |
| STATE-07 | data_contract | pending_36_02 | Faction tags are a distinct category of character/world tags. | `docs/mechanics.md :: Tag Categories` | Tag taxonomy claim. |
| STATE-08 | data_contract | pending_36_02 | HP on a 1-5 scale is the only primary numeric stat in the system. | `docs/mechanics.md :: Minimal Numerics`; `docs/memory.md :: Player State` | Narrowed to the actual numeric stat claim. |
| STATE-09 | behavioral_rule | pending_36_02 | Wealth is represented as qualitative tag tiers rather than a currency balance sheet. | `docs/mechanics.md :: Minimal Numerics` | Wealth contract. |
| STATE-10 | behavioral_rule | pending_36_02 | Skill capability is represented as descriptive tiers rather than numeric stats. | `docs/mechanics.md :: Minimal Numerics` | Skill contract. |
| STATE-11 | behavioral_rule | pending_36_02 | Relationships are represented as qualitative tags rather than numeric scores. | `docs/mechanics.md :: Minimal Numerics`; `docs/memory.md :: Relationships` | Shared contract across mechanics and storage docs. |
| STATE-12 | data_contract | pending_36_02 | Player factual state includes HP, tags, equipped items, and current location node. | `docs/memory.md :: Player State` | Factual-state storage contract. |
| STATE-13 | data_contract | pending_36_02 | Inventory is a strict structured table of items with explicit ownership by a character or a location node. | `docs/mechanics.md :: AI Agent Tool System`; `docs/memory.md :: Inventory` | Mechanics and storage docs describe the same contract from different angles. |
| STATE-14 | architectural_constraint | pending_36_02 | If the Storyteller references an item that is not actually in inventory, the backend rejects it. | `docs/memory.md :: Inventory` | Validation boundary claim. |
| STATE-15 | data_contract | pending_36_02 | The world map is a location graph of connected nodes rather than a 2D coordinate grid. | `docs/concept.md :: World Structure` | Spatial model claim. |
| STATE-16 | data_contract | pending_36_02 | Each location node stores structural tags. | `docs/concept.md :: World Structure`; `docs/memory.md :: Locations` | Shared world-state claim. |
| STATE-17 | data_contract | pending_36_02 | Each location node stores the entities currently present there. | `docs/concept.md :: World Structure`; `docs/memory.md :: Locations` | Shared world-state claim. |
| STATE-18 | data_contract | pending_36_02 | Each location node stores a local event log or recent local happenings. | `docs/concept.md :: World Structure`; `docs/memory.md :: Locations` | Shared world-state claim. |
| STATE-19 | behavioral_rule | pending_36_02 | Travel between connected nodes consumes abstract turns based on edge distance. | `docs/concept.md :: World Structure` | Movement-time contract. |
| STATE-20 | behavioral_rule | pending_36_02 | New location nodes can be generated on the fly when the player explores beyond the initial scaffold. | `docs/concept.md :: World Structure`; `docs/PROJECT.md :: Active` | `PROJECT.md` restates this as active scope; primary source is `concept.md`. |

## NPC Tiers And Autonomy

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| NPC-01 | data_contract | pending_36_02 | Temporary NPCs are extras created for immediate scene context. | `docs/mechanics.md :: Character System (3 Tiers) / Temporary (Extras)` | Tier-definition claim. |
| NPC-02 | behavioral_rule | pending_36_02 | Temporary NPCs are not simulated after the player leaves the scene. | `docs/mechanics.md :: Character System (3 Tiers) / Temporary (Extras)` | Tier-behavior claim. |
| NPC-03 | behavioral_rule | pending_36_02 | Temporary NPCs can be promoted if they become narratively important. | `docs/mechanics.md :: Character System (3 Tiers) / Temporary (Extras)` | Promotion entry point. |
| NPC-04 | data_contract | pending_36_02 | Persistent NPCs are named characters with permanent world existence. | `docs/mechanics.md :: Character System (3 Tiers) / Persistent (NPCs)` | Tier-definition claim. |
| NPC-05 | data_contract | pending_36_02 | Persistent NPCs have full tag sets, relationship tags, and memory. | `docs/mechanics.md :: Character System (3 Tiers) / Persistent (NPCs)`; `docs/memory.md :: NPCs` | Combined behavior/storage contract. |
| NPC-06 | behavioral_rule | pending_36_02 | Persistent NPCs remain affected permanently by world state and player actions rather than vanishing. | `docs/mechanics.md :: Character System (3 Tiers) / Persistent (NPCs)` | Persistence-behavior claim. |
| NPC-07 | data_contract | pending_36_02 | Key Characters are fully autonomous agents with goals, plans, beliefs, and evolving relationships. | `docs/mechanics.md :: Character System (3 Tiers) / Key Characters ("AI Players")` | Autonomy-definition claim. |
| NPC-08 | behavioral_rule | pending_36_02 | Key Characters in the player's location receive individual LLM calls each tick. | `docs/mechanics.md :: Character System (3 Tiers) / Key Characters ("AI Players")` | On-screen sim contract. |
| NPC-09 | behavioral_rule | pending_36_02 | Key Characters in the player's location can generate interactions and narrative hooks during their tick. | `docs/mechanics.md :: Character System (3 Tiers) / Key Characters ("AI Players")` | Split from tick execution claim. |
| NPC-10 | behavioral_rule | pending_36_02 | Off-screen Key Characters are simulated by a single batch LLM call every N ticks. | `docs/mechanics.md :: Character System (3 Tiers) / Key Characters ("AI Players")` | Off-screen sim contract. |
| NPC-11 | data_contract | pending_36_02 | Off-screen Key Character simulation returns structured updates including new location, action summary, and goal progress. | `docs/mechanics.md :: Character System (3 Tiers) / Key Characters ("AI Players")` | Output-shape claim. |
| NPC-12 | behavioral_rule | pending_36_02 | NPC actions are resolved through the Oracle rather than treated as automatic success. | `docs/mechanics.md :: AI Agent Tool System / NPC context`; `ROADMAP.md :: Phase 6 Success Criteria` | `mechanics.md` implies this via `act(action_text)` description; roadmap makes it explicit. |
| NPC-13 | data_contract | pending_36_02 | NPC-agent tool contracts include `act`, `speak`, `move_to`, and `update_own_goal`. | `docs/mechanics.md :: AI Agent Tool System / NPC context` | Tool-surface claim. |
| NPC-14 | behavioral_rule | pending_36_02 | Characters imported from SillyTavern V2 cards can be parsed into the tag system. | `docs/mechanics.md :: Promotion & Import`; `docs/concept.md :: Character Import` | Import applies to both player and NPC pipelines. |

## Reflection And Progression

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| REFL-01 | behavioral_rule | pending_36_02 | Reflection for an NPC triggers when cumulative unprocessed event importance reaches or exceeds 15. | `docs/mechanics.md :: AI Agent Tool System / Reflection context`; `docs/memory.md :: NPC Reflections` | Threshold appears identically in both docs. |
| REFL-02 | behavioral_rule | pending_36_02 | Reflection reads recent episodic memories involving the triggering NPC. | `docs/memory.md :: NPC Reflections / How It Works` | Input-retrieval claim. |
| REFL-03 | data_contract | pending_36_02 | Reflection can create or update beliefs with attached evidence references. | `docs/mechanics.md :: AI Agent Tool System / Reflection context`; `docs/memory.md :: NPC Reflections / How It Works` | Belief-storage contract. |
| REFL-04 | behavioral_rule | pending_36_02 | Reflection can create or reprioritize goals for an NPC. | `docs/mechanics.md :: AI Agent Tool System / Reflection context`; `docs/memory.md :: NPC Reflections / How It Works` | Goal-evolution claim. |
| REFL-05 | behavioral_rule | pending_36_02 | Reflection can drop obsolete goals. | `docs/mechanics.md :: AI Agent Tool System / Reflection context` | Explicit only in `mechanics.md`. |
| REFL-06 | behavioral_rule | pending_36_02 | Reflection can update qualitative relationship tags based on accumulated interactions. | `docs/mechanics.md :: AI Agent Tool System / Reflection context`; `docs/mechanics.md :: Minimal Numerics` | Relationship-evolution claim. |
| REFL-07 | architectural_constraint | pending_36_02 | Reflection results are written back to SQLite structured state rather than to a separate graph database. | `docs/memory.md :: NPC Reflections` | Persistence authority claim. |
| REFL-08 | behavioral_rule | pending_36_02 | Wealth progression is expected to happen through reflection-driven updates to wealth-tier tags rather than via numeric economy counters. | `docs/mechanics.md :: Minimal Numerics` | Design intent claim; phrased as progression behavior, not just representation. |
| REFL-09 | behavioral_rule | pending_36_02 | Skill progression is expected to happen through reflection-driven updates to descriptive skill tiers rather than XP counters. | `docs/mechanics.md :: Minimal Numerics` | Design intent claim. |

## World Engine And Information Flow

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| WORLD-01 | architectural_constraint | pending_36_02 | Factions are modeled as meta-characters using the same qualitative tag language as the rest of the world. | `docs/mechanics.md :: Factions` | Core modeling claim. |
| WORLD-02 | data_contract | pending_36_02 | A faction record contains tags, goals, assets, and chronicle context rather than numeric power stats. | `docs/mechanics.md :: Factions` | Data-shape claim. |
| WORLD-03 | behavioral_rule | pending_36_02 | The world changes independently of the player through macro-simulation. | `docs/mechanics.md :: World Engine (Macro-Simulation)`; `docs/concept.md :: The "What If" Sandbox` | High-level simulation promise. |
| WORLD-04 | behavioral_rule | pending_36_02 | Every N in-game days or after a major arc, the World Engine runs one LLM decision pass per faction. | `docs/mechanics.md :: Macro Ticks` | Timing contract is qualitative because `N` is left unspecified. |
| WORLD-05 | data_contract | pending_36_02 | Faction macro-sim input includes faction tags, faction goals, World Chronicle context, and neighboring factions. | `docs/mechanics.md :: Macro Ticks` | World-engine prompt/input contract. |
| WORLD-06 | data_contract | pending_36_02 | Faction macro-sim output is structured JSON describing the faction action, outcome, and state changes. | `docs/mechanics.md :: Macro Ticks` | Output-shape claim. |
| WORLD-07 | behavioral_rule | pending_36_02 | World-engine state updates can change location ownership. | `docs/mechanics.md :: Macro Ticks` | Mutation contract. |
| WORLD-08 | behavioral_rule | pending_36_02 | World-engine state updates can add or remove faction tags to reflect strategic outcomes. | `docs/mechanics.md :: Macro Ticks` | Mutation contract. |
| WORLD-09 | behavioral_rule | pending_36_02 | World-engine state updates append entries to the World Chronicle. | `docs/mechanics.md :: Macro Ticks` | Mutation contract. |
| WORLD-10 | behavioral_rule | pending_36_02 | World-engine state updates can add contextual tags to nearby locations such as `War Zone` or `Martial Law`. | `docs/mechanics.md :: Macro Ticks` | Mutation contract. |
| WORLD-11 | behavioral_rule | pending_36_02 | The World Engine may introduce unexpected world events such as plagues, disasters, or magical anomalies when narratively appropriate. | `docs/mechanics.md :: Macro Ticks` | Explicit stochastic/world-event claim. |
| WORLD-12 | behavioral_rule | pending_36_02 | NPC knowledge about world events is inferred from proximity, faction affiliation, and time elapsed rather than guaranteed explicit propagation. | `docs/mechanics.md :: Information Flow`; `docs/concept.md :: The "What If" Sandbox` | `concept.md` frames a living world; `mechanics.md` defines the actual information-flow model. |
| WORLD-13 | behavioral_rule | pending_36_02 | NPC prompts should include location history plus World Chronicle or episodic context so the model can infer what the NPC realistically knows. | `docs/mechanics.md :: Information Flow`; `docs/memory.md :: NPCs` | Split from WORLD-12 because it is a prompt/input contract. |

## Memory And Prompt Assembly

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| MEM-01 | architectural_constraint | pending_36_02 | SQLite is the source of truth for structured world state and the LLM must not contradict it. | `docs/memory.md :: Overview`; `docs/concept.md :: Core Idea` | Core authority invariant. |
| MEM-02 | architectural_constraint | pending_36_02 | Vector storage is semantic memory for episodic events and lore, not the primary authority for factual state. | `docs/memory.md :: Overview` | Storage-role separation. |
| MEM-03 | behavioral_rule | pending_36_02 | Every significant action, conversation, or event is summarized into a short factual episodic-memory entry. | `docs/memory.md :: Episodic Memory (Vector DB)` | Event-ingestion claim. |
| MEM-04 | data_contract | pending_36_02 | Episodic-memory entries include the in-game tick in metadata. | `docs/memory.md :: Episodic Memory / Entry Structure` | Metadata field claim. |
| MEM-05 | data_contract | pending_36_02 | Episodic-memory entries include the location in metadata. | `docs/memory.md :: Episodic Memory / Entry Structure` | Metadata field claim. |
| MEM-06 | data_contract | pending_36_02 | Episodic-memory entries include participants in metadata. | `docs/memory.md :: Episodic Memory / Entry Structure` | Metadata field claim. |
| MEM-07 | data_contract | pending_36_02 | Episodic-memory entries include an importance score in metadata. | `docs/memory.md :: Episodic Memory / Entry Structure`; `docs/memory.md :: Importance Scoring` | Metadata plus scoring semantics. |
| MEM-08 | data_contract | pending_36_02 | Episodic-memory entries include an event type in metadata. | `docs/memory.md :: Episodic Memory / Entry Structure` | Metadata field claim. |
| MEM-09 | behavioral_rule | pending_36_02 | Event importance is rated on a 1-10 scale by a fast LLM when the event is logged. | `docs/memory.md :: Importance Scoring` | Scoring-procedure claim. |
| MEM-10 | behavioral_rule | pending_36_02 | Episodic-memory retrieval uses a composite score of similarity × 0.4, recency × 0.3, and importance × 0.3. | `docs/memory.md :: Retrieval Strategy` | Exact weighting contract. |
| MEM-11 | behavioral_rule | pending_36_02 | Standard prompts retrieve the top 3-5 episodic memories for immediate context. | `docs/memory.md :: Retrieval Strategy` | Retrieval-budget claim. |
| MEM-12 | data_contract | pending_36_02 | The global world premise is a 2-3 sentence anchor that is injected into every prompt. | `docs/memory.md :: World Lexicon / The Global Premise`; `docs/concept.md :: World Generation / Step 3 - Scaffold Generation` | Shared world-anchor claim. |
| MEM-13 | data_contract | pending_36_02 | Lore cards are structured entries describing concepts, locations, factions, abilities, or world rules. | `docs/memory.md :: World Lexicon / Lore Cards` | Lore schema intent. |
| MEM-14 | behavioral_rule | pending_36_02 | Lore retrieval uses keyword plus vector similarity and injects only the 2-3 most relevant lore cards into prompt context. | `docs/memory.md :: World Lexicon / Lore Retrieval` | Retrieval-budget and retrieval-method claim. |
| MEM-15 | behavioral_rule | pending_36_02 | Lore ingestion supports automatic extraction from the generated premise during setup. | `docs/memory.md :: World Lexicon / Lore Ingestion`; `docs/concept.md :: World Generation / Step 3 - Scaffold Generation` | Shared ingestion claim. |
| MEM-16 | behavioral_rule | pending_36_02 | Lore ingestion supports SillyTavern WorldBook import. | `docs/memory.md :: World Lexicon / Lore Ingestion`; `docs/concept.md :: World Generation / World Sources (Input)` | Shared ingestion claim. |
| MEM-17 | behavioral_rule | pending_36_02 | Lore ingestion supports wiki scraping from a user-provided Fandom/wiki URL. | `docs/memory.md :: World Lexicon / Lore Ingestion`; `docs/concept.md :: World Generation / World Sources (Input)` | Shared ingestion claim. |
| MEM-18 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[SYSTEM RULES]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-19 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[WORLD PREMISE]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-20 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[SCENE]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-21 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[PLAYER STATE]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-22 | data_contract | pending_36_02 | Storyteller prompt assembly includes an `[NPC STATE]` block when an NPC is in the scene. | `docs/memory.md :: Prompt Assembly` | Conditional prompt-block contract. |
| MEM-23 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[LORE CONTEXT]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-24 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[RETRIEVED MEMORIES]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-25 | data_contract | pending_36_02 | Storyteller prompt assembly includes a `[RECENT CONVERSATION]` block. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |
| MEM-26 | data_contract | pending_36_02 | Storyteller prompt assembly includes an `[ACTION RESULT]` block containing the player action and Oracle ruling. | `docs/memory.md :: Prompt Assembly` | Prompt-block contract. |

## Persistence And Checkpoints

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| SAVE-01 | architectural_constraint | pending_36_02 | A campaign is represented as a local directory rather than a cloud-backed account object. | `docs/memory.md :: Save / Load System` | Local-first storage claim. |
| SAVE-02 | data_contract | pending_36_02 | A campaign directory contains `state.db`, a vector storage directory, `config.json`, and `chat_history.json`. | `docs/memory.md :: Save / Load System` | File-layout contract. |
| SAVE-03 | behavioral_rule | pending_36_02 | Starting a new campaign creates the directory and initializes the campaign data stores. | `docs/memory.md :: Save / Load System / Operations` | New-campaign persistence contract. |
| SAVE-04 | behavioral_rule | pending_36_02 | Loading a campaign reopens the existing directory-backed data stores. | `docs/memory.md :: Save / Load System / Operations` | Load contract. |
| SAVE-05 | behavioral_rule | pending_36_02 | A checkpoint snapshots `state.db` plus the semantic-memory store into a timestamped subdirectory. | `docs/memory.md :: Save / Load System / Operations`; `docs/mechanics.md :: Death & Defeat` | `mechanics.md` frames the player-facing use case. |
| SAVE-06 | behavioral_rule | pending_36_02 | Checkpoints are intended for death recovery and "what if" branching. | `docs/memory.md :: Save / Load System / Operations`; `docs/mechanics.md :: Death & Defeat` | Use-case contract. |
| SAVE-07 | behavioral_rule | pending_36_02 | Deleting a campaign removes the local campaign directory. | `docs/memory.md :: Save / Load System / Operations` | Delete contract. |

## Character, Start Conditions, Loadout, And Runtime Handoff

| ID | Claim Type | Runtime Status | Normalized Claim | Provenance | Notes |
| --- | --- | --- | --- | --- | --- |
| CHAR-01 | behavioral_rule | pending_36_02 | A new campaign may use free-text prompt input as a world-generation source. | `docs/concept.md :: World Generation / World Sources (Input)` | Startup-source claim. |
| CHAR-02 | behavioral_rule | pending_36_02 | A new campaign may use a known-IP prompt as a world-generation source. | `docs/concept.md :: World Generation / World Sources (Input)` | Startup-source claim. |
| CHAR-03 | behavioral_rule | pending_36_02 | A new campaign may use a SillyTavern WorldBook as a world-generation source. | `docs/concept.md :: World Generation / World Sources (Input)` | Startup-source claim. |
| CHAR-04 | behavioral_rule | pending_36_02 | A new campaign may use a wiki URL as a world-generation source. | `docs/concept.md :: World Generation / World Sources (Input)` | Startup-source claim. |
| CHAR-05 | behavioral_rule | pending_36_02 | World-generation sources are intended to be combinable rather than mutually exclusive. | `docs/concept.md :: World Generation / World Sources (Input)` | Combination-source claim. |
| CHAR-06 | behavioral_rule | pending_36_02 | Known-IP world generation performs a research-and-grounding step before scaffold generation. | `docs/concept.md :: World Generation / The Generation Pipeline / Step 1 — Research & Grounding`; `docs/plans/2026-03-05-research-agent.md :: Goal`; `docs/plans/2026-03-05-research-agent.md :: Контекст: Текущий пайплайн` | Secondary plan clarifies this as Step 0/1 before scaffold stages. |
| CHAR-07 | behavioral_rule | pending_36_02 | Research output for known-IP generation is intended to ground all downstream scaffold prompts rather than only the premise step. | `docs/plans/2026-03-05-research-agent.md :: Контекст: Текущий пайплайн`; `docs/plans/2026-03-05-research-agent.md :: Task 1.2` | Secondary-source-only gameplay handoff claim. |
| CHAR-08 | behavioral_rule | pending_36_02 | World DNA is optional rather than mandatory. | `docs/concept.md :: World Generation / Step 2 — World DNA (Uniqueness Engine) [OPTIONAL]` | Startup constraint claim. |
| CHAR-09 | behavioral_rule | pending_36_02 | Enabled World DNA seeds are injected as hard constraints into scaffold generation. | `docs/concept.md :: World Generation / Step 2 — World DNA (Uniqueness Engine) [OPTIONAL]` | Constraint contract. |
| CHAR-10 | behavioral_rule | pending_36_02 | Scaffold generation produces a global world premise anchor. | `docs/concept.md :: World Generation / Step 3 — Scaffold Generation` | Startup-to-runtime handoff claim. |
| CHAR-11 | behavioral_rule | pending_36_02 | Scaffold generation produces a starting location node plus 3-5 connected nodes. | `docs/concept.md :: World Generation / Step 3 — Scaffold Generation` | Startup-to-runtime world-structure claim. |
| CHAR-12 | behavioral_rule | pending_36_02 | Scaffold generation produces 30-50 lore cards. | `docs/concept.md :: World Generation / Step 3 — Scaffold Generation` | Startup-to-runtime lore claim. |
| CHAR-13 | behavioral_rule | pending_36_02 | Scaffold generation produces 5 Key Characters with personas, tags, goals, relationships, and starting locations. | `docs/concept.md :: World Generation / Step 3 — Scaffold Generation` | Exact count is only specified here. |
| CHAR-14 | behavioral_rule | pending_36_02 | Scaffold generation produces 2-3 factions with tags, goals, and territorial claims. | `docs/concept.md :: World Generation / Step 3 — Scaffold Generation` | Exact count is only specified here. |
| CHAR-15 | behavioral_rule | pending_36_02 | Player-character generation parses a character concept into tags. | `docs/concept.md :: World Generation / Step 4 — Player Character`; `docs/plans/2026-03-06-player-character-creation.md :: Goal` | Shared creation-flow claim. |
| CHAR-16 | behavioral_rule | pending_36_02 | Player-character generation parses a character concept into HP. | `docs/concept.md :: World Generation / Step 4 — Player Character`; `docs/plans/2026-03-06-player-character-creation.md :: Goal` | Shared creation-flow claim. |
| CHAR-17 | behavioral_rule | pending_36_02 | Player-character generation parses a character concept into starting inventory or equipped items. | `docs/concept.md :: World Generation / Step 4 — Player Character`; `docs/plans/2026-03-06-player-character-creation.md :: Goal` | Shared creation-flow claim. |
| CHAR-18 | behavioral_rule | pending_36_02 | Player-character creation places the protagonist into the starting node before gameplay begins. | `docs/concept.md :: World Generation / Step 4 — Player Character` | Runtime-entry claim. |
| CHAR-19 | ui_expectation | pending_36_02 | Character creation must support both free-text parsing and AI generation before save. | `docs/plans/2026-03-06-player-character-creation.md :: Goal`; `docs/plans/2026-03-06-player-character-creation.md :: Task 4` | Secondary-source-only UX contract. |
| CHAR-20 | ui_expectation | pending_36_02 | Character creation must present parsed/generated character data in an editable form before "Begin Adventure". | `docs/plans/2026-03-06-player-character-creation.md :: Goal`; `docs/plans/2026-03-06-player-character-creation.md :: Task 4` | Secondary-source-only UX contract. |
| CHAR-21 | data_contract | pending_36_02 | Saved player-character runtime data is expected to include name, tags, HP, equipped items, and starting location. | `docs/plans/2026-03-06-player-character-creation.md :: Goal`; `docs/plans/2026-03-06-player-character-creation.md :: Task 2`; `docs/memory.md :: Player State` | Secondary plan gives exact save payload; `memory.md` confirms overlapping runtime state. |
| CHAR-22 | behavioral_rule | pending_36_02 | The product is strictly singleplayer with one player and one protagonist. | `docs/concept.md :: The "What If" Sandbox`; `docs/PROJECT.md :: What This Is`; `docs/plans/2026-03-06-player-character-creation.md :: Key Design Decisions` | Repeated across concept, project, and implementation plan. |
| CHAR-23 | behavioral_rule | pending_36_02 | NPC companions may accompany the protagonist, but the game does not promise party management or tactical squad control. | `docs/concept.md :: The "What If" Sandbox` | Negative-scope gameplay contract that still constrains runtime expectations. |
| CHAR-24 | behavioral_rule | pending_36_02 | The World Chronicle starts empty at campaign creation and fills as events occur. | `docs/concept.md :: World Generation / Step 5 — World Chronicle` | Startup-state claim. |

## Noted Source Tensions To Preserve For 36-02

- `CHAR-13` and `CHAR-14` carry explicit scaffold counts from `concept.md`. Later worldgen phases and roadmap history evolved the generation model for known-IP quality, so these counts may end up classified as `outdated_or_contradicted` or `implemented_but_partial` rather than assumed current truth.
- `CHAR-06` and `CHAR-07` come from a mix of primary and secondary sources. `concept.md` promises known-IP research grounding in broad terms; the 2026-03-05 plan tightens that into a pipeline-wide context-injection contract. Plan 36-02 must decide whether the stronger secondary contract is actually wired.
- `TURN-23` is a gameplay UI contract from the original concept doc. It should be classified against the live `/game` surface only, not against non-game shell work from later phases.
- `WORLD-12` and `WORLD-13` intentionally preserve the docs' "infer realistic knowledge" wording instead of silently converting it into a strict propagation system requirement.
