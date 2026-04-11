# WorldForge: Product Contract

## Core Idea

WorldForge is a singleplayer text RPG sandbox with an AI Game Master. The LLM narrates fiction and interprets tone, while backend code owns mechanical truth: probability, movement, HP, location state, persistence, and recovery.

The product promise is not "the AI can do anything." The promise is that the player can explore a living world while deterministic systems keep the world state coherent, inspectable, and recoverable.

> **Docs authority**
> This file is the high-level product and system contract. Detailed gameplay and runtime truth now lives in [docs/mechanics.md](./mechanics.md) and [docs/memory.md](./memory.md). If this file stays broader than those documents, treat `mechanics.md` and `memory.md` as the normative baseline.

## The "What If" Sandbox

There is no main quest. The player defines a universe and a scenario, then plays inside the resulting world state.

- "Naruto, but Sasuke trained with Jiraiya instead of Orochimaru."
- "Cyberpunk 2077, but you're a corpo fixer with a conscience."
- "An original dark-fantasy world on the back of a space-whale."

The world is expected to keep moving even when the player is not the only actor in the scene. Key NPCs pursue goals, factions apply pressure, travel changes location state, and local history accumulates.

**Singleplayer only.** One player, one protagonist. NPC companions may exist in the fiction and start-state contract, but there is still no party-management or tactical squad-control layer.

## Anatomy of a Turn

At a high level, a player turn still follows six layers:

1. **Player input** — free text or a context-sensitive quick action from `/game`.
2. **Context assembly** — backend gathers player state, scene state, relevant lore, and episodic memory before the ruling.
3. **Oracle evaluation** — the Oracle judges the attempted action with backend-owned context instead of letting the narrator decide success alone.
4. **Mechanical resolution** — backend resolves the ruling and prepares the authoritative action result.
5. **Narration** — the storyteller LLM turns that result into prose.
6. **State update and finalization** — backend commits the resulting world changes, streams the turn through the live transport contract, and only then exposes the next safe interaction boundary.

**Replaced wording:** older top-level docs blurred transport, narration, and final world authority together. That is no longer the intended reading. The detailed turn contract, target-aware Oracle boundaries, and restore-safe runtime semantics are defined downstream in `docs/mechanics.md` and `docs/memory.md`.

## World Generation

A new campaign starts with a structured world-generation pipeline. The system does not rely on one freeform prompt; it builds a bounded world scaffold, lore corpus, and starting handoff that gameplay can actually consume.

### World Sources

The active setup contract supports these source types:

- **Free-text prompt** — an original-world premise written by the user.
- **Known-IP prompt with research grounding** — a franchise prompt plus research-backed canon context before scaffold generation.
- **WorldBook import** — structured lore import used as real source material for generation and retrieval.

Sources can still be combined in bounded ways, especially premise plus WorldBook reuse, but the routed setup flow centers on generating a coherent world scaffold and then handing that state into gameplay.

**Deprecated:** older docs described **Wiki URL** or Fandom category ingest as an active player-facing world-source contract. That is no longer part of the live setup baseline and should be treated as historical scope, not current product truth.

### Research And Constraints

For known IPs, the generator first gathers canon context and then applies the user's divergence premise. For original worlds, research may be skipped, but the setup flow still aims to produce a structured world anchor instead of a loose one-off prompt.

The setup UI still uses World DNA and related constraint scaffolding, but the practical contract is narrower than older prose implied: the routed flow expects a prepared scaffold input before campaign creation continues.

### Scaffold Generation

The bounded scaffold contract is:

- **Refined premise** — the world anchor used across setup and runtime surfaces.
- **5-8 locations** — with exactly one starting location and graph-style adjacency.
- **6-10 key NPCs plus 3-5 supporting NPCs** — enough to establish a playable social layer.
- **3-6 factions** — enough to establish pressure, rivalry, and territory.
- **Lore extraction and storage** — generated world information is turned into retrievable lore artifacts instead of remaining only in prose.

**Superseded:** older top-level docs claimed a starting node plus only `3-5` connected nodes, exactly `5` key characters, and only `2-3` factions. Those counts are stale and should not be used as the active baseline.

### Player Character Handoff

The player handoff is now a structured setup contract, not just "drop a protagonist into the first node."

- The player can be authored from free text, AI generation, researched archetype-assisted generation, or SillyTavern **V2/V3** card import.
- Save-time handoff resolves a starting location and structured start-state data before gameplay begins.
- Starting gear and opening state are derived from the authored character and start conditions, but this should not be read as Phase 38 inventory authority being fully solved.

**Bounded truth:** the runtime already carries canonical character and start-state records into live play. Inventory and equipment wording must still remain honest about the remaining authority seam tracked separately in Phase 38.

## World Structure

The world is a **location graph**, not a coordinate map. Movement is defined by edges between locations and their travel cost, not by freeform distance math on a 2D plane.

At a high level, the world model includes:

- **Macro locations** — major places in the travel graph.
- **Persistent sublocations** — places that remain meaningful within a broader area.
- **Ephemeral scene locations** — temporary revealed nodes or scene spaces that may not persist forever as first-class travel destinations.

Ephemeral locations may expire as nodes, but their consequences are still expected to persist in world state and memory.

Each location can expose:

- structural tags and descriptive state
- present entities
- connected travel paths
- **recent happenings** tied to that location's local history

Travel remains part of the live product contract. Moving between locations consumes travel cost, and revisiting places can surface recent happenings that reflect what occurred there.

**Replaced wording:** earlier docs described "local events" and "abstract turns by edge distance" too loosely to serve as planning truth. The repaired runtime keeps graph travel, travel cost, and location-local recent history as live features, but the mechanics-level details now belong in `docs/mechanics.md`.

## Gameplay Shell

The live gameplay surface is the `/game` shell, not the old "Solid Slate" mock as a normative contract.

Today that shell includes:

- location and travel context
- narrative log and Oracle feedback
- player-state surfaces
- lore and checkpoint utilities
- action input and quick actions

**Historical note:** the older **Solid Slate** three-column concept is useful as design history, but it is superseded as an authoritative product description. Do not plan future gameplay work as if the old label or exact layout is still the shipped truth.

## Character Import And Authoring

Player characters can be created from scratch, AI-generated, generated with research-assisted archetype grounding, or imported from SillyTavern character cards. Imported cards are parsed into the game's structured character model rather than treated as final runtime truth by themselves.

**Superseded interpretation:** older setup docs implied a flatter tag-only handoff. The current baseline is structured-character-first, with compatibility tags and projections layered on top.
