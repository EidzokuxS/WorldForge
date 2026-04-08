# Phase 36 Runtime Matrix

This matrix classifies every gameplay-facing claim in [`36-CLAIMS.md`](R:\Projects\WorldForge\.planning\phases\36-gameplay-docs-to-runtime-reconciliation-audit\36-CLAIMS.md) against live runtime evidence.

## Classification Summary

| Classification | Count |
| --- | ---: |
| `implemented_and_wired` | 75 |
| `implemented_but_partial` | 48 |
| `documented_but_missing` | 7 |
| `outdated_or_contradicted` | 6 |
| Total claims | 136 |

## Classification Contract

- `implemented_and_wired`: the full documented behavior executes in a real runtime path without dead seams.
- `implemented_but_partial`: some runtime path exists, but a documented trigger, consequence, or integrity boundary is missing or unreliable.
- `documented_but_missing`: no live runtime path satisfies the claim; dormant scaffolding alone does not qualify.
- `outdated_or_contradicted`: the docs claim no longer matches the live architecture or later implemented design.

## Integrity-Critical Seams

These seams are elevated out of row-level noise because they affect gameplay trust, rollback fidelity, or transport integrity.

| Seam | Status | Evidence | Why it matters |
| --- | --- | --- | --- |
| Rollback / retry fidelity | `implemented_but_partial` | `backend/src/engine/state-snapshot.ts` snapshots player HP, tags, location, equipped items, `characterRecord`, derived tags, current tick, and spawned IDs, but does not restore off-screen NPC mutations, faction/world mutations, chronicle entries, vector writes, or chat-history side effects. | `/api/chat/retry` and `/api/chat/undo` can restore the player shell while leaving post-turn simulation artifacts behind. |
| Checkpoint fidelity | `implemented_but_partial` | `backend/src/campaign/checkpoints.ts` copies `state.db`, `vectors/`, `chat_history.json`, and `meta.json`, but never snapshots `config.json`. | Campaign-level state such as `currentTick`, saved worldgen context, and other config-backed runtime data can drift across checkpoint restore. |
| Inventory / equipment state authority | `implemented_but_partial` | `backend/src/character/record-adapters.ts` projects structured character data into legacy player rows; `backend/src/routes/character.ts` saves canonical items to the `items` table; `backend/src/engine/tool-executor.ts` mutates `items.ownerId/locationId`; `backend/src/engine/prompt-assembler.ts` reads both `items` rows and loadout fallbacks. | Inventory truth is split across `characterRecord`, `equippedItems`, loadout seeds, and table rows, so persistence and narrative visibility are not perfectly aligned. |
| Reflection trigger viability | `documented_but_missing` | `backend/src/engine/reflection-agent.ts` only queries NPCs where `unprocessedImportance >= 10` and resets it to `0`, while `rg -n "unprocessedImportance"` across `backend/src` shows no live increment path outside defaults and reset sites. | Reflection code exists, but the trigger budget never accumulates through the runtime, so the loop is effectively inert. |
| Session-scoped gameplay transport | `implemented_but_partial` | `backend/src/routes/helpers.ts` offers `requireLoadedCampaign(...)`, but `backend/src/routes/chat.ts` still uses `getActiveCampaign()` in `/history`, `/action`, `/retry`, `/undo`, and `/edit`. | Gameplay still depends on in-memory active-session state instead of reloading by `campaignId`, so transport robustness lags behind worldgen/character routes. |
| Player-visible vs deferred post-turn simulation | `implemented_but_partial` | `backend/src/engine/turn-processor.ts` emits `done` before firing `onPostTurn`; `backend/src/routes/chat.ts` schedules NPC ticks, off-screen sim, reflection, and faction ticks inside `buildOnPostTurn(...)`. | The turn the player sees complete is not the same boundary as the world-simulation boundary, which weakens causality, rollback expectations, and UI trust. |

## Turn Loop And Oracle

### Evidence Anchors

- `TURN-E1`: `backend/src/routes/chat.ts:382-489` wires `/api/chat/action`, snapshots, checkpoint guards, and SSE turn execution.
- `TURN-E2`: `backend/src/engine/turn-processor.ts:358-575` calls the Oracle, builds the storyteller prompt, executes tools, emits `done`, and then hands off post-turn work.
- `TURN-E3`: `backend/src/engine/oracle.ts:23-128` defines judge payload, `temperature: 0`, chance schema, `rollD100()`, and outcome resolution.
- `TURN-E4`: `backend/src/engine/prompt-assembler.ts:347-771` assembles `[PLAYER STATE]`, `[SCENE]`, `[NPC STATES]`, `[LORE CONTEXT]`, `[EPISODIC MEMORY]`, `[WORLD STATE]`, and `[ACTION RESULT]`.
- `TURN-E5`: `frontend/app/game/page.tsx:215-316` supports free-text entry, quick-action submission, and SSE event handling.
- `TURN-E6`: `frontend/lib/api.ts:443-472` parses turn SSE event types.
- `TURN-A1`: absence check: `backend/src/engine/turn-processor.ts:363` hard-codes `targetTags: []`; targeted search across `backend/src/routes`, `backend/src/engine`, and prompt assembly found no target-resolution path populating them.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TURN-01 | Turn loop and Oracle | `concept::Core Idea`; `concept::Anatomy of a Turn`; `mechanics::AI Agent Tool System`; `memory::Overview` | `implemented_and_wired` | high | `TURN-E1`, `TURN-E2`, `TURN-E3` | The runtime resolves Oracle outcomes and tool mutations in backend code, then asks the storyteller to narrate within that resolved state. | - |
| TURN-02 | Turn loop and Oracle | `concept::Core Idea`; `concept::Anatomy of a Turn`; `memory::Overview` | `implemented_but_partial` | high | `TURN-E2`, `TURN-E3`, `backend/src/engine/tool-executor.ts:16-983` | Probability is backend-owned before narration, but many concrete state consequences still happen through post-story tool execution instead of a fully pre-narration mechanical pass. | integrity-relevant |
| TURN-03 | Turn loop and Oracle | `concept::Anatomy of a Turn` | `implemented_and_wired` | high | `TURN-E5` | `/game` submits arbitrary free-text player input through the action bar. | - |
| TURN-04 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `concept::UI: Solid Slate Layout` | `implemented_and_wired` | high | `TURN-E5` | Quick actions are rendered and submitted as player turns. | - |
| TURN-05 | Turn loop and Oracle | `concept::Anatomy of a Turn` | `implemented_and_wired` | high | `TURN-E4` | Prompt assembly builds a dedicated `[PLAYER STATE]` block with tags and status. | - |
| TURN-06 | Turn loop and Oracle | `concept::Anatomy of a Turn` | `implemented_and_wired` | high | `TURN-E4` | Prompt assembly builds the current scene/location block from the player's current node. | - |
| TURN-07 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `memory::Prompt Assembly` | `implemented_but_partial` | medium | `TURN-E4`; `backend/src/vectors/episodic-events.ts:129-181` | Vector memories are retrieved and injected, but the docs' "top relevant" promise is inferential rather than directly proven in live gameplay and the retrieval budget is fixed at 5 rather than doc-flexible. | - |
| TURN-08 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `memory::Prompt Assembly` | `implemented_but_partial` | medium | `TURN-E4`; `backend/src/vectors/lore-cards.ts:89-105` | Lore cards are retrieved and injected, but retrieval is vector-only rather than the docs' keyword+vector model, and relevance quality remains approximate. | - |
| TURN-09 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `mechanics::Soft-Fail System` | `implemented_and_wired` | high | `TURN-E2`, `TURN-E3` | Non-trivial actions route through the Oracle and produce Strong Hit / Weak Hit / Miss instead of hard blockers. | - |
| TURN-10 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `mechanics::Probability Oracle`; `mechanics::Oracle Flow` | `implemented_but_partial` | high | `TURN-E3` | The live Oracle emits a numeric chance, but the schema is `1..99`, not a full `0..100` scale. | - |
| TURN-11 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | `rollD100()` is the actual resolution roll. | - |
| TURN-12 | Turn loop and Oracle | `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | `resolveOutcome()` classifies Strong Hit as `roll <= chance * 0.5`. | - |
| TURN-13 | Turn loop and Oracle | `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | `resolveOutcome()` classifies Weak Hit as `roll <= chance`. | - |
| TURN-14 | Turn loop and Oracle | `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | `resolveOutcome()` classifies Miss as `roll > chance`. | - |
| TURN-15 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E2`, `TURN-E4` | The resolved Oracle result is passed into prompt assembly and narration. | - |
| TURN-16 | Turn loop and Oracle | `concept::Anatomy of a Turn`; `mechanics::AI Agent Tool System`; `memory::Episodic Memory` | `implemented_and_wired` | medium | `TURN-E2`; `backend/src/engine/tool-executor.ts:330-983`; `backend/src/routes/chat.ts:96-121` | Tool execution mutates HP, tags, items, movement, relationships, and log-event memory rows in the normal turn path. | - |
| TURN-17 | Turn loop and Oracle | `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | The judge payload includes `actionIntent` and `actionMethod`. | - |
| TURN-18 | Turn loop and Oracle | `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | The judge payload includes actor tags. | - |
| TURN-19 | Turn loop and Oracle | `mechanics::Oracle Flow` | `documented_but_missing` | high | `TURN-A1` | The payload shape supports `targetTags`, but the live turn loop always passes an empty array and no target-resolution path was found. | gameplay-gap |
| TURN-20 | Turn loop and Oracle | `mechanics::Oracle Flow` | `implemented_and_wired` | high | `TURN-E3` | The judge payload includes environment tags. | - |
| TURN-21 | Turn loop and Oracle | `mechanics::Oracle Configuration`; `mechanics::Two LLM Roles` | `implemented_and_wired` | medium | `TURN-E3`; `backend/src/settings/roles.ts` | The Oracle uses a separately resolved judge profile rather than the storyteller profile. | - |
| TURN-22 | Turn loop and Oracle | `mechanics::Oracle Configuration` | `implemented_and_wired` | high | `TURN-E3` | Oracle calls are made with `temperature: 0`. | - |
| TURN-23 | Turn loop and Oracle | `concept::UI: Solid Slate Layout` | `outdated_or_contradicted` | high | `TURN-E5`; `frontend/app/game/page.tsx:31-46` | The live `/game` surface includes toolbar/navigation shell and an additional lore panel; it is not the strict three-column concept mock. | docs-drift |

## State Mechanics

### Evidence Anchors

- `STATE-E1`: `backend/src/character/runtime-tags.ts:33-127` derives runtime tags from structured traits, skills, flaws, wealth, conditions, social status, drives, and frictions.
- `STATE-E2`: `backend/src/character/record-adapters.ts:534-662` projects structured character records into legacy player/NPC rows and derived tags.
- `STATE-E3`: `backend/src/engine/tool-executor.ts:330-983` mutates tags, items, movement, revealed locations, HP, and ownership.
- `STATE-E4`: `backend/src/db/schema.ts:15-156` defines players, locations, items, NPCs, factions, relationships, and chronicle tables.
- `STATE-A1`: absence check: `backend/src/db/schema.ts:15-31` shows `locations` only store `name`, `description`, `tags`, `isStarting`, and `connectedTo`; no `localEvents` / `eventLog` field exists, and targeted search across runtime modules found no location-scoped event-log persistence.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| STATE-01 | State mechanics | `mechanics::Tag-Based System` | `implemented_but_partial` | medium | `STATE-E1`, `STATE-E2`, `STATE-E3`, `STATE-E4` | Tags are everywhere, but the live character model is increasingly structured and tags are a derived projection rather than a single universal source of truth. | integrity-relevant |
| STATE-02 | State mechanics | `mechanics::Tag Categories` | `implemented_but_partial` | medium | `STATE-E1`, `STATE-E2` | Trait-like categories exist in structured character records and derived tags, but they are not enforced as a first-class runtime taxonomy on every entity. | - |
| STATE-03 | State mechanics | `mechanics::Tag Categories` | `implemented_but_partial` | medium | `STATE-E1`, `STATE-E2` | Skill information exists structurally and becomes runtime tags, but not as a uniform cross-entity tagged category. | - |
| STATE-04 | State mechanics | `mechanics::Tag Categories` | `implemented_but_partial` | medium | `STATE-E1`, `STATE-E2` | Flaws exist structurally and can derive tags, but the system no longer treats them as a clean shared tag namespace across all entities. | - |
| STATE-05 | State mechanics | `mechanics::Tag Categories` | `implemented_but_partial` | medium | `STATE-E1`, `STATE-E4` | Status information exists as conditions / flags and can derive tags, but not as a uniform generic tag category stored across all entities. | - |
| STATE-06 | State mechanics | `mechanics::Tag Categories` | `implemented_but_partial` | medium | `STATE-E4` | Location tags exist, but "structural location tags" are not a dedicated typed subsystem beyond generic string tags. | - |
| STATE-07 | State mechanics | `mechanics::Tag Categories` | `implemented_but_partial` | medium | `STATE-E4`; `backend/src/engine/faction-tools.ts:18-228` | Faction tags exist and are mutated, but they are still plain string arrays rather than a stricter typed category system. | - |
| STATE-08 | State mechanics | `mechanics::Minimal Numerics`; `memory::Player State` | `implemented_but_partial` | high | `STATE-E4`; `backend/src/db/schema.ts:41-57` | HP is the only prominent primary numeric stat, but `currentTick`, `importance`, and other numeric runtime counters still materially exist. | - |
| STATE-09 | State mechanics | `mechanics::Minimal Numerics` | `implemented_and_wired` | medium | `STATE-E1`; `backend/src/engine/reflection-tools.ts:295-350` | Wealth is represented as qualitative tiers/tags rather than a currency ledger. | - |
| STATE-10 | State mechanics | `mechanics::Minimal Numerics` | `implemented_and_wired` | medium | `STATE-E1`; `backend/src/engine/reflection-tools.ts:352-413` | Skill capability is represented through descriptive tiers/tags rather than numeric stats. | - |
| STATE-11 | State mechanics | `mechanics::Minimal Numerics`; `memory::Relationships` | `implemented_and_wired` | high | `STATE-E4`; `backend/src/engine/tool-executor.ts:458-576` | Relationships are stored as tag arrays plus optional reason text, not numeric scores. | - |
| STATE-12 | State mechanics | `memory::Player State` | `implemented_and_wired` | high | `STATE-E4`; `backend/src/routes/character.ts:210-307` | Player runtime state stores HP, tags, equipped items, and current location. | - |
| STATE-13 | State mechanics | `mechanics::AI Agent Tool System`; `memory::Inventory` | `implemented_and_wired` | high | `STATE-E4`; `backend/src/engine/tool-executor.ts:621-960` | Inventory is an `items` table with explicit owner/location fields. | - |
| STATE-14 | State mechanics | `memory::Inventory` | `documented_but_missing` | high | `backend/src/engine/prompt-assembler.ts:136`; targeted search across `tool-executor.ts`, `turn-processor.ts`, and `routes/chat.ts` found no global backend rejection path for narrated-but-nonexistent items | The prompt warns the storyteller not to mention nonexistent items, but there is no general backend validator rejecting hallucinated narrative references. | integrity-relevant |
| STATE-15 | State mechanics | `concept::World Structure` | `implemented_and_wired` | high | `STATE-E4`; `backend/src/engine/tool-executor.ts:705-742` | The world is stored as a graph of connected locations via `connectedTo`, not coordinates. | - |
| STATE-16 | State mechanics | `concept::World Structure`; `memory::Locations` | `implemented_and_wired` | high | `STATE-E4` | Each location row stores tag arrays. | - |
| STATE-17 | State mechanics | `concept::World Structure`; `memory::Locations` | `implemented_but_partial` | high | `STATE-E4`; `backend/src/engine/prompt-assembler.ts:374-452` | Entities present at a location are reconstructed by querying `items.locationId` and `npcs.currentLocationId`; the location node itself does not store an embedded entity list. | - |
| STATE-18 | State mechanics | `concept::World Structure`; `memory::Locations` | `documented_but_missing` | high | `STATE-A1` | No per-location event-log field or location-scoped recent-happenings persistence exists. | gameplay-gap |
| STATE-19 | State mechanics | `concept::World Structure` | `documented_but_missing` | high | targeted search across `tool-executor.ts`, `chat.ts`, and DB schema found movement and graph connections but no abstract travel-cost system tied to edge distance | Travel is location-to-location movement, but there is no abstract travel-cost system tied to edge distance. | gameplay-gap |
| STATE-20 | State mechanics | `concept::World Structure`; `PROJECT::Active` | `implemented_but_partial` | medium | `backend/src/engine/tool-schemas.ts:138-148`; `backend/src/engine/tool-executor.ts:705-742` | The storyteller can reveal new connected locations at runtime, but this is an authorial/tool path rather than a robust exploration subsystem with explicit player-facing guarantees. | - |

## NPC Tiers And Autonomy

### Evidence Anchors

- `NPC-E1`: `backend/src/db/schema.ts:59-83` defines NPC tiers `temporary`, `persistent`, and `key`.
- `NPC-E2`: `backend/src/engine/npc-agent.ts:221-260` queries on-screen `key` NPCs at the player location.
- `NPC-E3`: `backend/src/engine/npc-offscreen.ts:257-323` batches off-screen `key` NPC simulation every 5 ticks.
- `NPC-E4`: `backend/src/engine/npc-tools.ts:39-219` exposes `act`, `speak`, `move_to`, and `update_own_goal`.
- `NPC-E5`: `backend/src/routes/campaigns.ts:243-285` exposes the promotion route for NPC tiers.
- `NPC-E6`: `backend/src/routes/character.ts`; `backend/src/routes/schemas.ts`; `backend/src/worldgen/worldbook-importer.ts` support imported character/worldbook content and V2-card parsing.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NPC-01 | NPC tiers and autonomy | `mechanics::Temporary (Extras)` | `implemented_and_wired` | high | `NPC-E1` | Temporary NPCs are a real persisted tier. | - |
| NPC-02 | NPC tiers and autonomy | `mechanics::Temporary (Extras)` | `implemented_and_wired` | high | `NPC-E2`, `NPC-E3` | Only `key` NPCs are ticked on-screen or off-screen; temporary NPCs are not simulated after scene exit. | - |
| NPC-03 | NPC tiers and autonomy | `mechanics::Temporary (Extras)` | `implemented_but_partial` | medium | `NPC-E5` | Promotion exists as a backend route, but promotion is not a central gameplay loop surfaced through moment-to-moment play. | - |
| NPC-04 | NPC tiers and autonomy | `mechanics::Persistent (NPCs)` | `implemented_and_wired` | high | `NPC-E1` | Persistent NPCs are a real tier distinct from temporary and key. | - |
| NPC-05 | NPC tiers and autonomy | `mechanics::Persistent (NPCs)`; `memory::NPCs` | `implemented_but_partial` | medium | `NPC-E1`; `backend/src/character/record-adapters.ts:583-662`; `backend/src/engine/prompt-assembler.ts:443-548` | Persistent NPCs can carry persona, tags, relationships, and stored state, but the richer goal/belief/memory/autonomy loop is concentrated on `key` NPC handling. | - |
| NPC-06 | NPC tiers and autonomy | `mechanics::Persistent (NPCs)` | `implemented_and_wired` | medium | `NPC-E1`; `STATE-E4` | Persistent NPCs are durable DB rows that remain in world state rather than vanishing with the scene. | - |
| NPC-07 | NPC tiers and autonomy | `mechanics::Key Characters` | `implemented_but_partial` | medium | `NPC-E2`, `NPC-E3`; `backend/src/engine/reflection-agent.ts:158-177` | Key NPCs do have goals, beliefs, and relationship evolution hooks, but the reflection trigger seam prevents the full documented autonomy loop from reliably running. | integrity-relevant |
| NPC-08 | NPC tiers and autonomy | `mechanics::Key Characters` | `implemented_and_wired` | high | `NPC-E2` | On-screen key NPCs receive per-NPC LLM calls. | - |
| NPC-09 | NPC tiers and autonomy | `mechanics::Key Characters` | `implemented_but_partial` | medium | `NPC-E2`; `NPC-E4`; `frontend/lib/api.ts:467-472` | On-screen key NPCs can generate actions and hooks, but the player SSE surface does not expose a distinct NPC-action feed, so consequences are less directly surfaced than the docs imply. | - |
| NPC-10 | NPC tiers and autonomy | `mechanics::Key Characters` | `implemented_and_wired` | high | `NPC-E3` | Off-screen key NPCs are batch-simulated every 5 ticks. | - |
| NPC-11 | NPC tiers and autonomy | `mechanics::Key Characters` | `implemented_and_wired` | high | `backend/src/engine/npc-offscreen.ts:33-40`; `backend/src/engine/npc-offscreen.ts:221-248` | Off-screen simulation returns and persists `newLocation`, `actionSummary`, and `goalProgress`. | - |
| NPC-12 | NPC tiers and autonomy | `mechanics::AI Agent Tool System / NPC context`; `ROADMAP::Phase 6` | `implemented_but_partial` | medium | `NPC-E4`; `backend/src/engine/npc-tools.ts:85-97` | NPC `act` calls the Oracle, but only that tool path is covered; not every NPC consequence path is equally Oracle-mediated. | - |
| NPC-13 | NPC tiers and autonomy | `mechanics::AI Agent Tool System / NPC context` | `implemented_and_wired` | high | `NPC-E4` | The documented NPC tool set is live. | - |
| NPC-14 | NPC tiers and autonomy | `mechanics::Promotion & Import`; `concept::Character Import` | `implemented_and_wired` | medium | `NPC-E6` | Import flows parse external card/worldbook content into the tag/character system. | - |

## Reflection And Progression

### Evidence Anchors

- `REFL-E1`: `backend/src/engine/reflection-agent.ts:26-177` defines reflection thresholding, retrieval, and reset behavior.
- `REFL-E2`: `backend/src/engine/reflection-tools.ts:48-413` defines reflection tools for beliefs, goals, relationships, wealth, and skills.
- `REFL-E3`: `backend/src/engine/npc-tools.ts:118-131`; `backend/src/engine/npc-offscreen.ts:221-248`; `backend/src/vectors/episodic-events.ts:23-55` show event writes with importance metadata.
- `REFL-A1`: absence check: `rg -n "unprocessedImportance"` across `backend/src` finds defaults, threshold query, and reset sites, but no runtime increment path that accumulates importance onto NPC rows.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REFL-01 | Reflection and progression | `mechanics::Reflection context`; `memory::NPC Reflections` | `outdated_or_contradicted` | high | `REFL-E1` | The live threshold is `10`, not the documented `15`. | docs-drift |
| REFL-02 | Reflection and progression | `memory::NPC Reflections / How It Works` | `implemented_but_partial` | medium | `REFL-E1`; `backend/src/vectors/episodic-events.ts:129-181` | Reflection retrieval uses recent episodic events, but because the trigger seam is broken the full loop is not dependably reachable in runtime. | integrity-relevant |
| REFL-03 | Reflection and progression | `mechanics::Reflection context`; `memory::NPC Reflections / How It Works` | `implemented_but_partial` | high | `REFL-E2` | The `set_belief` tool accepts `evidence`, but the persistence layer only stores belief text, not durable evidence references. | integrity-relevant |
| REFL-04 | Reflection and progression | `mechanics::Reflection context`; `memory::NPC Reflections / How It Works` | `implemented_but_partial` | medium | `REFL-E2`, `REFL-A1` | Goal creation/reprioritization tools exist, but reliable reflection-triggered execution is blocked by the missing importance accumulation path. | integrity-relevant |
| REFL-05 | Reflection and progression | `mechanics::Reflection context` | `implemented_and_wired` | medium | `REFL-E2` | A dedicated `drop_goal` reflection tool exists. | - |
| REFL-06 | Reflection and progression | `mechanics::Reflection context`; `mechanics::Minimal Numerics` | `implemented_but_partial` | medium | `REFL-E2`, `REFL-A1` | Relationship retagging is supported by reflection tools, but the trigger loop is not reliably alive. | integrity-relevant |
| REFL-07 | Reflection and progression | `memory::NPC Reflections` | `implemented_and_wired` | high | `REFL-E2`; `STATE-E4` | Reflection writes go back into SQLite-backed NPC rows and relationship rows rather than an external graph store. | - |
| REFL-08 | Reflection and progression | `mechanics::Minimal Numerics` | `implemented_but_partial` | medium | `REFL-E2`, `REFL-A1` | Wealth-tier upgrade tools exist, but the promised reflection-driven progression loop is not viable end-to-end. | - |
| REFL-09 | Reflection and progression | `mechanics::Minimal Numerics` | `implemented_but_partial` | medium | `REFL-E2`, `REFL-A1` | Skill-tier upgrade tools exist, but the reflection trigger seam makes the progression contract incomplete. | - |

## World Engine And Information Flow

### Evidence Anchors

- `WORLD-E1`: `backend/src/engine/world-engine.ts:172-347` runs faction macro-sim every 5 ticks, gathering tags, goals, assets, chronicle, and other factions.
- `WORLD-E2`: `backend/src/engine/faction-tools.ts:18-228` mutates faction tags/goals, location tags, chronicle entries, and world events.
- `WORLD-E3`: `backend/src/db/schema.ts:102-154` defines faction and chronicle state.
- `WORLD-E4`: `backend/src/engine/prompt-assembler.ts:443-705` injects NPC, world-state, chronicle, and retrieved-context blocks into prompts.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WORLD-01 | World engine and information flow | `mechanics::Factions` | `implemented_but_partial` | medium | `WORLD-E1`, `WORLD-E3` | Factions are modeled through tags/goals/assets, but not all downstream mechanics treat them as fully equivalent "meta-characters." | - |
| WORLD-02 | World engine and information flow | `mechanics::Factions` | `implemented_and_wired` | high | `WORLD-E3` | Faction records store tags, goals, and assets rather than numeric power stats. | - |
| WORLD-03 | World engine and information flow | `mechanics::World Engine`; `concept::What If Sandbox` | `implemented_and_wired` | medium | `WORLD-E1`, `WORLD-E2` | Macro-simulation does run independently of direct player action. | - |
| WORLD-04 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_but_partial` | high | `WORLD-E1` | The engine runs every 5 ticks, but not on the documented "every N in-game days or after a major arc" contract. | - |
| WORLD-05 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_and_wired` | high | `WORLD-E1` | Faction macro-sim prompts include faction tags, goals, chronicle context, and other factions as neighbors. | - |
| WORLD-06 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_but_partial` | high | `WORLD-E1`, `WORLD-E2` | The macro layer uses tool-calling plus generated text rather than returning one authoritative structured JSON outcome object. | - |
| WORLD-07 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_but_partial` | medium | `WORLD-E2` | Ownership-like effects are encoded via location tags such as `controlled by ...`, not a dedicated ownership field. | - |
| WORLD-08 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_and_wired` | high | `WORLD-E2` | World-engine tools add and remove faction/location tags. | - |
| WORLD-09 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_and_wired` | high | `WORLD-E2`, `WORLD-E3` | Chronicle entries are appended through faction tools. | - |
| WORLD-10 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_and_wired` | high | `WORLD-E2` | Faction/world events add contextual tags to affected locations. | - |
| WORLD-11 | World engine and information flow | `mechanics::Macro Ticks` | `implemented_and_wired` | medium | `WORLD-E2` | The `declare_world_event` tool supports emergent world events. | - |
| WORLD-12 | World engine and information flow | `mechanics::Information Flow`; `concept::What If Sandbox` | `implemented_but_partial` | medium | `WORLD-E1`, `WORLD-E4`; `backend/src/engine/npc-agent.ts:132-176` | Prompts include chronicle/location context that allows inference, but there is no formal knowledge-propagation system tied to proximity/faction/time. | - |
| WORLD-13 | World engine and information flow | `mechanics::Information Flow`; `memory::NPCs` | `implemented_but_partial` | medium | `WORLD-E4`; `backend/src/engine/npc-agent.ts:132-176` | NPC prompts include scene, chronicle, and episodic context, but not a dedicated "what this NPC can realistically know" model with clear causal boundaries. | - |

## Memory And Prompt Assembly

### Evidence Anchors

- `MEM-E1`: `backend/src/engine/prompt-assembler.ts:347-771` builds prompt blocks and pulls state from SQLite plus vectors.
- `MEM-E2`: `backend/src/vectors/episodic-events.ts:23-181` stores episodic events, embeds them, and retrieves them with composite reranking.
- `MEM-E3`: `backend/src/vectors/lore-cards.ts:17-105` stores and vector-searches lore cards.
- `MEM-E4`: `backend/src/routes/chat.ts:96-121`; `backend/src/engine/npc-tools.ts:118-131`; `backend/src/engine/npc-offscreen.ts:221-248` write episodic events from gameplay and NPC paths.
- `MEM-A1`: absence check: no runtime path was found that calls an LLM to score event importance on a 1-10 scale during event logging; importance is supplied directly by callers.
- `MEM-A2`: absence check: direct wiki/Fandom URL ingestion routes were searched across `backend/src/routes`, `backend/src/worldgen`, and `frontend/src`; no user-facing URL import path exists.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MEM-01 | Memory and prompt assembly | `memory::Overview`; `concept::Core Idea` | `implemented_but_partial` | high | `MEM-E1`; `STATE-E4` | SQLite remains the main factual source, but split authority around inventory/loadout and rollback fidelity prevents a clean "must not contradict it" guarantee. | integrity-relevant |
| MEM-02 | Memory and prompt assembly | `memory::Overview` | `implemented_and_wired` | high | `MEM-E2`, `MEM-E3`, `STATE-E4` | Vector stores are used for semantic retrieval while structured factual state stays in SQLite/config. | - |
| MEM-03 | Memory and prompt assembly | `memory::Episodic Memory` | `implemented_but_partial` | medium | `MEM-E4` | Significant events are often written as episodic rows, but the runtime does not guarantee every important player action/conversation becomes an episodic entry. | - |
| MEM-04 | Memory and prompt assembly | `memory::Entry Structure` | `implemented_and_wired` | high | `MEM-E2` | Episodic rows persist tick metadata. | - |
| MEM-05 | Memory and prompt assembly | `memory::Entry Structure` | `implemented_but_partial` | medium | `MEM-E2`, `MEM-E4` | Location metadata exists, but not every event path supplies a meaningful location. | - |
| MEM-06 | Memory and prompt assembly | `memory::Entry Structure` | `implemented_but_partial` | medium | `MEM-E2`, `MEM-E4` | Participant metadata exists, but coverage varies by event source. | - |
| MEM-07 | Memory and prompt assembly | `memory::Entry Structure`; `memory::Importance Scoring` | `implemented_and_wired` | high | `MEM-E2`, `MEM-E4` | Events store an importance field. | - |
| MEM-08 | Memory and prompt assembly | `memory::Entry Structure` | `implemented_and_wired` | high | `MEM-E2`, `MEM-E4` | Events store an event type field. | - |
| MEM-09 | Memory and prompt assembly | `memory::Importance Scoring` | `documented_but_missing` | high | `MEM-A1` | Importance is not scored by a fast LLM at log time; callers provide a number directly. | gameplay-gap |
| MEM-10 | Memory and prompt assembly | `memory::Retrieval Strategy` | `implemented_and_wired` | high | `MEM-E2` | Retrieval uses the documented `0.4 / 0.3 / 0.3` weighting. | - |
| MEM-11 | Memory and prompt assembly | `memory::Retrieval Strategy` | `implemented_but_partial` | medium | `MEM-E1`, `MEM-E2` | Prompt assembly retrieves 5 episodic memories rather than a flexible 3-5 budget. | - |
| MEM-12 | Memory and prompt assembly | `memory::World Premise`; `concept::Scaffold Generation` | `implemented_but_partial` | medium | `MEM-E1`; `backend/src/worldgen/scaffold-generator.ts:152-205` | A world premise is injected broadly, but the live source is a richer scaffold artifact rather than a strict doc-style 2-3 sentence anchor everywhere. | - |
| MEM-13 | Memory and prompt assembly | `memory::Lore Cards` | `implemented_and_wired` | medium | `MEM-E3`; `backend/src/worldgen/lore-extractor.ts:19-224` | Lore cards are structured typed entries produced and stored by the current pipeline. | - |
| MEM-14 | Memory and prompt assembly | `memory::Lore Retrieval` | `implemented_but_partial` | high | `MEM-E1`, `MEM-E3` | Lore retrieval is top-3, but it is vector-only rather than keyword+vector. | - |
| MEM-15 | Memory and prompt assembly | `memory::Lore Ingestion`; `concept::Scaffold Generation` | `implemented_and_wired` | high | `backend/src/worldgen/lore-extractor.ts:19-224`; `backend/src/routes/worldgen.ts:274-377` | Lore is automatically extracted from generated scaffold context during setup. | - |
| MEM-16 | Memory and prompt assembly | `memory::Lore Ingestion`; `concept::World Sources` | `implemented_and_wired` | high | `backend/src/worldgen/worldbook-importer.ts`; `backend/src/routes/worldgen.ts:110-174` | WorldBook import is a live ingest path. | - |
| MEM-17 | Memory and prompt assembly | `memory::Lore Ingestion`; `concept::World Sources` | `documented_but_missing` | high | `MEM-A2` | No user-facing wiki/Fandom URL scrape/import path exists. | gameplay-gap |
| MEM-18 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_and_wired` | high | `MEM-E1` | `[SYSTEM RULES]` is built and injected. | - |
| MEM-19 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_and_wired` | high | `MEM-E1` | `[WORLD PREMISE]` is built and injected. | - |
| MEM-20 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_and_wired` | high | `MEM-E1` | `[SCENE]` is built and injected. | - |
| MEM-21 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_and_wired` | high | `MEM-E1` | `[PLAYER STATE]` is built and injected. | - |
| MEM-22 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_and_wired` | high | `MEM-E1` | `[NPC STATES]` is conditionally built when NPCs are present. | - |
| MEM-23 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_but_partial` | high | `MEM-E1`, `MEM-E3` | `[LORE CONTEXT]` exists, but the retrieval method is weaker than the docs promise. | - |
| MEM-24 | Memory and prompt assembly | `memory::Prompt Assembly` | `outdated_or_contradicted` | high | `MEM-E1` | The live block is `[EPISODIC MEMORY]`, not `[RETRIEVED MEMORIES]`. | docs-drift |
| MEM-25 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_and_wired` | high | `MEM-E1` | `[RECENT CONVERSATION]` is built and injected. | - |
| MEM-26 | Memory and prompt assembly | `memory::Prompt Assembly` | `implemented_but_partial` | medium | `MEM-E1`; `TURN-E3` | `[ACTION RESULT]` includes the Oracle ruling/outcome, but it is not a strict canonical block containing both the verbatim player action and Oracle ruling in the exact documented shape. | - |

## Persistence And Checkpoints

### Evidence Anchors

- `SAVE-E1`: `backend/src/campaign/manager.ts` manages local campaign directories and storage initialization.
- `SAVE-E2`: `backend/src/campaign/checkpoints.ts:18-168` creates and restores checkpoints.
- `SAVE-E3`: `backend/src/routes/campaigns.ts` creates, loads, lists, and deletes campaign directories.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SAVE-01 | Persistence and checkpoints | `memory::Save / Load System` | `implemented_and_wired` | high | `SAVE-E1`, `SAVE-E3` | Campaigns are local directories. | - |
| SAVE-02 | Persistence and checkpoints | `memory::Save / Load System` | `implemented_and_wired` | high | `SAVE-E1`; `SAVE-E2` | Campaign directories contain `state.db`, vectors, `config.json`, and `chat_history.json`. | - |
| SAVE-03 | Persistence and checkpoints | `memory::Operations` | `implemented_and_wired` | high | `SAVE-E1`, `SAVE-E3` | New campaign creation initializes directory-backed stores. | - |
| SAVE-04 | Persistence and checkpoints | `memory::Operations` | `implemented_and_wired` | high | `SAVE-E1`, `SAVE-E3` | Load reopens an existing directory-backed campaign. | - |
| SAVE-05 | Persistence and checkpoints | `memory::Operations`; `mechanics::Death & Defeat` | `implemented_but_partial` | high | `SAVE-E2` | Checkpoints snapshot DB, vectors, and chat history, but omit `config.json`. | integrity-critical |
| SAVE-06 | Persistence and checkpoints | `memory::Operations`; `mechanics::Death & Defeat` | `implemented_but_partial` | medium | `SAVE-E2`; `backend/src/routes/chat.ts:413-434` | Checkpoints are used for death recovery and dangerous-turn safety, but the missing config snapshot weakens true "what if" fidelity. | integrity-critical |
| SAVE-07 | Persistence and checkpoints | `memory::Operations` | `implemented_and_wired` | high | `SAVE-E3` | Campaign deletion removes the local campaign directory. | - |

## Character, Start Conditions, Loadout, And Runtime Handoff

### Evidence Anchors

- `CHAR-E1`: `backend/src/routes/worldgen.ts:110-174` supports free-text, known-IP, and worldbook-backed seed suggestion with cached `ipContext` and divergence.
- `CHAR-E2`: `backend/src/routes/worldgen.ts:212-377` generates scaffold, lore, and saves the world.
- `CHAR-E3`: `backend/src/worldgen/scaffold-generator.ts:152-462` defines current scaffold counts and per-stage generation behavior.
- `CHAR-E4`: `backend/src/routes/character.ts:24-367` supports parse/generate/import, save, loadout preview, and starting-location resolution.
- `CHAR-E5`: `backend/src/worldgen/starting-location.ts:14-180` resolves textual starting situations into location and arrival state.
- `CHAR-E6`: `backend/src/character/loadout-deriver.ts:19-253` derives canonical starting loadout from draft and start conditions.
- `CHAR-E7`: `frontend/components/title/use-new-campaign-wizard.ts:318-349` requires prepared DNA before routed creation can continue.

| Claim | Subsystem | Provenance | Classification | Confidence | Evidence | Reasoning | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CHAR-01 | Character / start / loadout / handoff | `concept::World Sources` | `implemented_and_wired` | high | `CHAR-E1` | Free-text premise input is a live worldgen source. | - |
| CHAR-02 | Character / start / loadout / handoff | `concept::World Sources` | `implemented_and_wired` | high | `CHAR-E1` | Known-IP premise input is a live worldgen source. | - |
| CHAR-03 | Character / start / loadout / handoff | `concept::World Sources` | `implemented_and_wired` | high | `CHAR-E1` | WorldBook input is a live worldgen source. | - |
| CHAR-04 | Character / start / loadout / handoff | `concept::World Sources` | `documented_but_missing` | high | targeted search across `frontend`, `backend/src/routes/worldgen.ts`, and importers found no user-facing wiki-URL ingest path | The product docs still advertise wiki URL as a world source, but runtime wiring does not exist. | gameplay-gap |
| CHAR-05 | Character / start / loadout / handoff | `concept::World Sources` | `implemented_but_partial` | medium | `CHAR-E1`; `backend/src/worldbook-library/index.ts`; `frontend/components/title/use-new-campaign-wizard.ts` | Sources can be combined in backend, especially premise + reusable worldbooks, but the routed UI still constrains the flow around the DNA path and does not expose every combination equally cleanly. | - |
| CHAR-06 | Character / start / loadout / handoff | `concept::Research & Grounding`; `plan 2026-03-05` | `implemented_and_wired` | high | `CHAR-E1`, `CHAR-E2` | Known-IP flow performs explicit research/context grounding before scaffold generation. | - |
| CHAR-07 | Character / start / loadout / handoff | `plan 2026-03-05` | `implemented_but_partial` | medium | `CHAR-E1`, `CHAR-E2`, `CHAR-E3` | Research context is passed into the full scaffold pipeline, but sufficiency/regeneration paths still re-evaluate and the stronger "all downstream prompts are fully grounded" claim remains somewhat inferential. | - |
| CHAR-08 | Character / start / loadout / handoff | `concept::World DNA [OPTIONAL]` | `implemented_but_partial` | high | `CHAR-E1`, `CHAR-E7` | Backend generation can operate without mandatory DNA semantics, but the routed frontend currently blocks creation until DNA is prepared. | UX-gap |
| CHAR-09 | Character / start / loadout / handoff | `concept::World DNA constraints` | `implemented_but_partial` | medium | `CHAR-E2`, `CHAR-E3` | Enabled DNA seeds constrain generation, but not every downstream stage receives them as an explicit first-class hard-constraint surface. | - |
| CHAR-10 | Character / start / loadout / handoff | `concept::Scaffold Generation` | `implemented_and_wired` | high | `CHAR-E2`, `CHAR-E3` | Scaffold generation produces and persists a refined premise/world anchor. | - |
| CHAR-11 | Character / start / loadout / handoff | `concept::Scaffold Generation` | `outdated_or_contradicted` | high | `CHAR-E3` | The live generator produces 5-8 locations with exactly one starting node and 1-3 graph connections each, not a starting node plus only 3-5 connected nodes. | docs-drift |
| CHAR-12 | Character / start / loadout / handoff | `concept::Scaffold Generation` | `implemented_but_partial` | high | `CHAR-E2`; `backend/src/worldgen/lore-extractor.ts:19-224` | Lore cards are generated and stored, but the live category-based extractor does not promise the fixed `30-50` count from older docs. | - |
| CHAR-13 | Character / start / loadout / handoff | `concept::Scaffold Generation` | `outdated_or_contradicted` | high | `CHAR-E3` | The live generator produces `6-10 key` plus `3-5 supporting` NPCs, not exactly `5` key characters. | docs-drift |
| CHAR-14 | Character / start / loadout / handoff | `concept::Scaffold Generation` | `outdated_or_contradicted` | high | `CHAR-E3` | The live generator produces `3-6` factions, not `2-3`. | docs-drift |
| CHAR-15 | Character / start / loadout / handoff | `concept::Player Character`; `plan 2026-03-06` | `implemented_and_wired` | high | `CHAR-E4` | Character parsing turns concept text into a structured/tagged player draft. | - |
| CHAR-16 | Character / start / loadout / handoff | `concept::Player Character`; `plan 2026-03-06` | `implemented_and_wired` | high | `CHAR-E4`; `STATE-E4` | Character generation/parsing includes HP. | - |
| CHAR-17 | Character / start / loadout / handoff | `concept::Player Character`; `plan 2026-03-06` | `implemented_and_wired` | high | `CHAR-E4`, `CHAR-E6` | Character flow produces starting items/equipped loadout and persists them into runtime state. | - |
| CHAR-18 | Character / start / loadout / handoff | `concept::Player Character` | `implemented_and_wired` | high | `CHAR-E4`, `CHAR-E5` | Saving the player resolves and persists the starting location into the campaign graph before gameplay. | - |
| CHAR-19 | Character / start / loadout / handoff | `plan 2026-03-06` | `implemented_and_wired` | high | `CHAR-E4`; `frontend/app/(non-game)/campaign/[id]/character/page.tsx` | Character creation supports both parse and AI-generate paths before save. | - |
| CHAR-20 | Character / start / loadout / handoff | `plan 2026-03-06` | `implemented_and_wired` | high | `frontend/components/character-creation/character-card.tsx`; `frontend/app/(non-game)/campaign/[id]/character/page.tsx` | The character editor presents an editable form before `Begin Adventure`. | - |
| CHAR-21 | Character / start / loadout / handoff | `plan 2026-03-06`; `memory::Player State` | `implemented_and_wired` | high | `STATE-E4`, `CHAR-E4` | Saved player state includes name, tags, HP, equipped items, and starting location. | - |
| CHAR-22 | Character / start / loadout / handoff | `concept::What If Sandbox`; `PROJECT::What This Is`; `plan 2026-03-06` | `implemented_and_wired` | high | `frontend/app/game/page.tsx`; `CHAR-E4` | The runtime is a single-player single-protagonist flow. | - |
| CHAR-23 | Character / start / loadout / handoff | `concept::What If Sandbox` | `implemented_but_partial` | medium | `CHAR-E5`; `frontend/components/character-creation/character-card.tsx` | Companions can be represented in start conditions and narrative context, but there is no party-management/tactical squad layer. | - |
| CHAR-24 | Character / start / loadout / handoff | `concept::World Chronicle` | `implemented_and_wired` | medium | `WORLD-E3`; `CHAR-E2` | Campaigns begin with an empty chronicle that fills over time. | - |

## Appendix: Undocumented But Implemented

These behaviors were found in live runtime but are not clearly claimed in the in-scope docs set.

| Behavior | Evidence | Why it matters |
| --- | --- | --- |
| Deterministic fallback quick actions | `backend/src/engine/turn-processor.ts` synthesizes fallback quick actions when the storyteller omits them. | The live UX is more resilient than the docs imply. |
| Low-HP auto-checkpoint guardrails | `backend/src/routes/chat.ts:413-434` creates defensive checkpoints around dangerous turns. | Death-recovery safety is stronger than the baseline save/load docs describe. |
| Structured start-condition authoring | `backend/src/worldgen/starting-location.ts` resolves arrival mode, visibility, companions, immediate situation, and narrative entry state. | Character handoff is richer than the old docs' simple "place protagonist in starting node" wording. |
| Canonical loadout derivation from start conditions | `backend/src/character/loadout-deriver.ts` derives travel kit and context-sensitive starting gear. | Loadout logic is materially more systemic than the docs suggest. |
| Reusable processed worldbook library | `backend/src/worldbook-library/*`; `frontend` creation/library flows | World source reuse is now a distinct subsystem, not just a one-off import path. |

## Backlog Seed Summary

The next gameplay milestone should treat these as the highest-value reconciliation targets:

1. Make reflection actually trigger by introducing a reliable `unprocessedImportance` accumulation path.
2. Unify gameplay transport on `campaignId` / lazy reload instead of `getActiveCampaign()` session coupling.
3. Decide authoritative inventory/equipment ownership and remove multi-source drift.
4. Make rollback/checkpoint fidelity include post-turn world simulation and `config.json`.
5. Decide whether outdated doc counts/layout claims should be deprecated or restored.
