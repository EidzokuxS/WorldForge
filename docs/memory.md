# WorldForge: Memory, Retrieval, and Restore Contract

`docs/memory.md` is the normative runtime baseline for storage, retrieval, prompt assembly, and restore behavior. When prose and implementation diverge, backend code wins.

## Runtime Overview

WorldForge has three cooperating runtime layers:

- **SQLite** for authoritative structured state
- **LanceDB** for semantic retrieval
- **Prompt assembly** for the bounded context passed into Oracle-adjacent narration

SQLite remains the source of truth for player, NPC, location, faction, relationship, chronicle, and item state. LanceDB augments that state with retrievable lore cards and episodic events; it does not replace authoritative records.

## Authoritative Structured State

### Player State

The live player baseline is assembled from the canonical player record plus SQLite-backed runtime state:

- HP on a 1-5 scale
- current location
- canonical start-condition data and derived opening effects
- equipped and signature item references from the canonical loadout
- inventory rows from the `items` table
- derived runtime tags as compatibility shorthand

If live item rows exist, prompt assembly prefers those rows. If the player has no persisted owned items yet, prompt assembly can fall back to the canonical inventory seed as a compatibility snapshot.

### Inventory and Equipment

Live gameplay uses the `items` table plus canonical records together. Tool-mediated transfers and spawns write explicit item ownership or location rows in SQLite, and prompt assembly reads those rows back into player and scene state.

**Bounded pending note:** Phase 38 still tracks the remaining `inventory authority` seam. The current contract is honest but not final: gameplay has coherent item ownership rows and canonical loadout data, yet the docs do not claim one fully closed authority model beyond that bounded partial truth.

The backend does **not** act as a blanket narration filter for every hypothetical nonexistent object mentioned in prose. The narrower truthful guarantee is:

- specific **tool call** handlers resolve named entities, items, and locations against SQLite
- invalid references return structured **error results**
- storyteller instructions tell the narrator not to mention player items that are not present in `[PLAYER STATE]`

That means backend validation is strong where tool execution resolves concrete names, but it is not a universal free-text rejection layer for every imagined object mention.

### NPCs, Locations, Factions, and Relationships

SQLite also owns:

- NPC records, including canonical beliefs, goals, relationships, location, and derived tags
- location records plus graph connectivity, present items, and location-local recent happenings
- faction tags, goals, and chronicle-facing state
- qualitative relationship rows between entities
- recent world chronicle entries

Prompt assembly reads this state directly when building `[NPC STATES]`, `[SCENE]`, `[WORLD STATE]`, and relationship context.

## Episodic Memory

Episodic memory stores summarized events in LanceDB plus supporting metadata:

- `tick`
- `location`
- `participants`
- `importance`
- `type`

### Importance and Writes

Event importance is **caller-supplied importance**, not LLM-scored importance at write time. Writers such as `log_event` pass the value directly when storing the event, and that same importance contributes to reflection-budget accumulation.

### Same-Turn Evidence

Committed episodic writes can matter before embeddings exist. The live contract is:

- event text is committed first
- same-turn committed evidence is queued in memory by campaign and tick
- reflection can read that committed evidence immediately
- auxiliary embedding can drain the same queue later without becoming rollback-critical

This preserves an honest turn boundary: reflection can see the turn's evidence even if vector embedding has not happened yet.

### Retrieval

When a query vector is available, episodic retrieval uses composite scoring:

`similarity * 0.4 + recency * 0.3 + importance * 0.3`

Prompt assembly retrieves the **top 5** episodic events for the current action query and surfaces them in `[EPISODIC MEMORY]`.

## Lore Retrieval

Lore cards live in a separate LanceDB collection from episodic events.

The live lore contract is intentionally narrow:

- lore search is **vector-only**
- prompt assembly retrieves the **top 3** lore cards
- retrieved cards are formatted into `[LORE CONTEXT]`

This document does not claim keyword-assisted lore retrieval, wiki URL ingest, or unlimited lore dumps as part of the runtime baseline.

## Reflection Contract

Reflection is a SQLite-backed structured-state maintenance pass, not a free-floating flavor generator.

- NPCs accumulate `unprocessedImportance`
- reflection triggers at threshold `10`
- reflection reads same-turn committed evidence first and semantic episodic retrieval second
- ordinary outcomes should primarily update beliefs, goals, and relationships
- wealth or skill upgrades require materially stronger evidence than ordinary interaction arcs

The outputs of reflection are written back into canonical NPC state, which later prompt assembly exposes through `[NPC STATES]`.

## Prompt Assembly Contract

Prompt assembly compiles live runtime state into named sections. The active section names are:

- `[SYSTEM RULES]`
- `[WORLD PREMISE]`
- `[SCENE]`
- `[WORLD STATE]`
- `[PLAYER STATE]`
- `[NPC STATES]`
- `[RELATIONSHIPS]`
- `[ACTION RESULT]`
- `[LORE CONTEXT]`
- `[EPISODIC MEMORY]`
- `[RECENT CONVERSATION]`

Two drift corrections matter here:

- the live block is `[EPISODIC MEMORY]`, not the legacy retrieved-memories name
- the live NPC block is `[NPC STATES]`, matching the actual prompt assembler

### Section Semantics

- `[PLAYER STATE]` includes canonical-record-derived tags, opening-state effects, equipped items, signature items, and the current inventory view.
- `[SCENE]` includes the current location, scene items, connected paths, and location-local recent happenings.
- `[NPC STATES]` describes NPCs actually present at the player's location, including persona, beliefs, goals, wealth shorthand, and relationship context.
- `[LORE CONTEXT]` injects the top 3 vector-only lore cards.
- `[EPISODIC MEMORY]` injects the top 5 composite-ranked episodic memories.
- `[ACTION RESULT]` contains the already-resolved Oracle chance, roll, outcome, and reasoning for narration.

## Turn Finalization Boundary

The player-visible turn boundary is stricter than "the storyteller finished speaking."

- narration streams first
- the backend can emit `finalizing_turn`
- rollback-critical post-turn work runs before authoritative completion
- `done` is the safe boundary for the next interaction

Rollback-critical finalization includes present-NPC updates, off-screen NPC simulation, reflection, and faction ticks. Auxiliary embedding and optional image generation happen later and do not redefine turn completion.

## Save, Load, Checkpoints, and Restore

A campaign is stored as a local directory with bounded authoritative files:

```text
campaigns/{campaignId}/
  state.db
  config.json
  chat_history.json
  vectors/
```

### File Roles

- `state.db` stores authoritative SQLite runtime state
- `config.json` stores campaign-level runtime configuration such as current tick and premise-bearing metadata
- `chat_history.json` stores persisted recent conversation
- `vectors/` stores LanceDB data for lore cards and episodic events

### Authoritative Bundle Contract

The shared restore-bundle seam captures and restores:

- `state.db`
- `config.json`
- `chat_history.json`
- `vectors/` only where the specific restore flow includes vectors

This matters because not every restore flow has the same scope:

- **checkpoint create/load** includes vectors
- **turn-boundary retry/undo restore** uses the same bundle contract for `state.db`, `config.json`, and `chat_history.json`, but intentionally excludes vectors

Checkpoint restore also clears campaign-scoped runtime state such as active-turn guards, last-turn snapshots, and pending same-turn committed evidence before reopening the restored branch.

## Operating Rule

Future planning should treat this file as the truthful baseline for storage, retrieval, prompt sections, and restore semantics. If a later phase changes retrieval counts, prompt block names, or restore scope, update this document explicitly rather than letting older wording linger.
