# WorldForge: Concept & Vision

## Core Idea

A text-based RPG sandbox governed by an AI Game Master. The game combines LLM-generated narrative with a deterministic rule engine that ensures consistency, consequences, and fairness.

The AI is the **narrator**, never the engine. All mechanical outcomes (probability, inventory, movement) are resolved by backend code. The LLM only translates results into prose.

## The "What If" Sandbox

There is no main quest. The player defines a universe and a scenario — then lives inside it.

- "Naruto, but Sasuke trained with Jiraiya instead of Orochimaru."
- "Cyberpunk 2077, but you're a corpo fixer with a conscience."
- "An original dark-fantasy world on the back of a space-whale."

The world evolves independently. Key Characters pursue their own goals, factions clash, events ripple outward. The player reacts to a living world, not a scripted story.

**Singleplayer only.** One player, one protagonist. NPCs may accompany the player, but there is no party management or tactical squad control.

## Anatomy of a Turn

When the player submits an action, the system processes it in strict layers:

1. **Player Input** — free text or a context-sensitive quick-action button (e.g., `[Talk to Jackie]`, `[Loot Body]`).
2. **Context Assembly** — backend gathers: player tags/status, current location state, top relevant memories from Vector DB, applicable lore cards.
3. **Sanity Check (Soft-Fail)** — the Oracle evaluates the action. Nothing is hard-blocked. A peasant trying to cast a fireball gets a near-zero chance, and the GM narrates the humiliating failure.
4. **Mechanical Resolution** — Oracle assesses probability (0–100) based on tag interactions and context. Backend rolls D100.
5. **Narration** — the Storyteller LLM receives the outcome and generates the narrative.
6. **State Update** — backend updates HP/inventory/tags, moves entities, logs the event to episodic memory.

## World Generation

A new campaign starts with an **agentic World Generation Pipeline**. The system doesn't just ask the LLM to "make a world" — it runs a structured, multi-step process that researches, randomizes, and builds.

### World Sources (Input)

The pipeline accepts one or more sources:

- **Free-text prompt** — "Dark fantasy world where the sun never rises."
- **Known IP prompt** — "Naruto, Shippuden era." The agent **searches the web** for canon information (locations, characters, factions, lore) and uses it as grounding material.
- **SillyTavern WorldBook** — a JSON file containing structured lore entries, character profiles, and world rules. Loaded directly into the Lore DB and used as source material for generation.
- **Wiki URL** — paste a Fandom/wiki category URL. The backend scrapes, chunks, and ingests lore cards automatically.

Sources are combinable: a WorldBook + a "What If" divergence prompt, or a known IP + custom modifications.

### The Generation Pipeline

**Step 1 — Research & Grounding:**
For known IPs, an agent searches the web and compiles reference material: key locations, characters, factions, power systems, technology level. For original worlds, this step is skipped.

**Step 2 — World DNA (Uniqueness Engine) [OPTIONAL]:**
Before the LLM generates the world, the user may enable **World DNA** — a set of constraint seeds across 6 categories:
- Geographic archetype (archipelago, megacity, vast plains, underground caverns, …)
- Political structure (empire, city-states, tribal, theocracy, anarchy, …)
- Central conflict (civil war, invasion, plague, succession crisis, resource scarcity, …)
- Cultural flavor (2–3 cultural inspirations to blend)
- Environmental condition (eternal winter, volcanic activity, magical corruption, …)
- Wildcard element (something unexpected: a sentient moon, time loops, a dead god's corpse as terrain, …)

**How it works:**
- World DNA is **optional**. For known IPs (e.g., "Danganronpa") the user writes a detailed premise and skips DNA entirely — the premise alone is enough to constrain the world.
- When enabled, the **Generator LLM** reads the user's premise and proposes fitting values for each category (not hardcoded random pools). For "Dark fantasy on a space-whale" it might suggest "Organic terrain on a living creature" for geography, not "Dense jungle".
- Each category is **toggleable** — the user can enable/disable individual categories. Disabled categories are not sent as constraints to scaffold generation.
- Each field is **editable** — the user can accept the AI suggestion, re-roll it (🎲 asks the AI for another variant), or type their own value.
- Requires a configured Generator model with API key. If not configured, the user is prompted to set one up in Settings first.

Enabled seeds are injected as **hard constraints** into the scaffold generation prompt. This ensures that two "Dark Fantasy" generations produce fundamentally different worlds — different geography, politics, conflicts, and flavor.

**Step 3 — Scaffold Generation:**
The LLM, grounded by research (Step 1) and constrained by seeds (Step 2), generates:
- **World Premise** — 2–3 sentences anchoring the universe rules (always injected into every prompt).
- **Starting location node** + 3–5 connected nodes with structural tags.
- **30–50 Lore Cards** auto-extracted from the generated world (embedded into Vector DB).
- **5 Key Characters** — with personas, tags, goals, relationships, starting locations.
- **2–3 Factions** — with tags, goals, and territorial claims on location nodes.

**Step 4 — Player Character:**
The LLM parses the player's character concept into tags, HP, starting inventory, and places them in the starting node.

**Step 5 — World Chronicle** — starts empty. Fills as events occur.

## World Structure

The world is a **Location Graph** — nodes connected by edges. Not a 2D coordinate grid.

```
[Tavern] ──── [City Square] ──── [Market]
                   │
              [Dark Forest]
                   │
            [Abandoned Mine]
```

Each node holds:
- **Structural tags** — `[Warm, Crowded, Well-Lit]` or `[Ruins, Ash, Dangerous]`.
- **Entities** — characters and items currently present.
- **Local events** — recent happenings at this location (for the gossip system).

Travel between nodes takes abstract "turns" based on edge distance. New nodes are generated on-the-fly as the player explores beyond the initial scaffold.

## UI: "Solid Slate" Layout

A three-column CRPG layout optimized for long play sessions:

- **Left Sidebar** — current location, list of NPCs/items in the same node, world context.
- **Center** — the narrative log (Visual Novel style text).
- **Right Sidebar** — player sheet: HP, tags, equipped items, wealth.
- **Bottom** — text input + context-sensitive quick-action buttons generated by the backend.

**Aesthetics:** Deep slate and bone color palette. Solid matte panels, clean typography. Blood-orange accent used sparingly for danger or critical moments. No heavy glassmorphism.

## Character Import

Characters can be created from scratch, AI-generated, or imported via **SillyTavern V2 Character Cards**. Imported cards are parsed for persona, appearance, and relevant RPG data, then extended with the game's tag system.

The Player Character can also be initialized from a V2 card.
