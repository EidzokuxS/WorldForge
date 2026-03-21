# WorldForge: Memory & Data Architecture

## Overview

The game has two storage systems and a prompt assembly layer:

```
┌─────────────────────────────────────────┐
│           PROMPT ASSEMBLY               │
│  (context compilation + formatting)     │
├──────────────┬──────────────────────────┤
│   SQLite     │     Vector DB            │
│              │     (LanceDB)           │
│              │                          │
│ • Player     │ • Episodic events        │
│ • NPCs       │ • Lore cards (Lexicon)   │
│ • Locations   │                         │
│ • Items      │ Retrieval:               │
│ • Factions   │ sim×0.4+rec×0.3+imp×0.3  │
│ • Chronicle  │                          │
│ • Relation   │                          │
│ •   tags     │                          │
│ • NPC goals  │                          │
│ • NPC beliefs│                          │
└──────────────┴──────────────────────────┘
```

SQLite is the **source of truth** — structured, queryable, file-based. The LLM cannot contradict it.

Vector DB is the **semantic memory** — episodic events and lore, retrieved by meaning.

## Factual State (SQLite)

### Player State
- HP (1–5 scale: 5 = healthy, 0 = GM decides consequences)
- Tags (dynamic array: traits, skills, flaws, status effects, wealth tier)
- Equipped items
- Current location node

### Inventory
A strict table of items. Each item has a name, tags, and belongs to either a character or a location node (dropped on the floor). If the Storyteller references an item not in the inventory, the backend rejects it.

### NPCs
- Persona & Appearance (text, read-only after creation — used by Storyteller and image gen)
- Tags (dynamic, same categories as player)
- Current location node
- Tier (temporary / persistent / key)
- Goals (short-term, long-term)
- Beliefs (synthesized by Reflection Agent)
- Location history (recent ticks, for information flow)

### Locations
- Name and description
- Structural tags (`[Ruins, Ash, Dangerous]` or `[Warm, Crowded, Well-Lit]`)
- Connected nodes (edges in the location graph)
- Entities present (characters, items)
- Local event log (recent events at this location)

### Factions
- Name, tags, goals, assets (owned location nodes)
- Chronicle entries specific to this faction

### Relationships
A table of relationship tags between any two entities. Tags describe the nature of the relationship: `[Trusted Ally]`, `[Suspicious]`, `[Sworn Enemy]`, `[Owes a Debt]`, `[Fears]`, `[Respects]`. No numeric scores — the Reflection Agent sets and updates relationship tags based on events.

### World Chronicle
An ordered list of major events. Each entry has a timestamp (in-game tick) and text. The Chronicle grows over the campaign and provides global context to all LLM agents.

## Episodic Memory (Vector DB)

Every significant action, conversation, and event is summarized into a short factual sentence and stored as a vector embedding.

### Entry Structure
```json
{
  "text": "Player threw sand in the guard's eyes. Guard is temporarily blinded.",
  "metadata": {
    "tick": 42,
    "location": "East Gate",
    "participants": ["player", "guard_7"],
    "importance": 4,
    "type": "action"
  }
}
```

### Importance Scoring
When an event is logged, a fast LLM rates it 1–10:
- 1 — trivial (buying bread, small talk)
- 5 — notable (winning a fight, making an ally)
- 10 — world-changing (killing a king, destroying a city)

### Retrieval Strategy
When building context for any LLM agent, the backend retrieves the most relevant episodic memories using a **composite score**:

```
Score = (Vector Similarity × 0.4) + (Recency × 0.3) + (Importance × 0.3)
```

This ensures:
- Relevant memories surface even if they're old.
- Recent events are prioritized for immediate context.
- High-importance events persist in recall regardless of time.

The backend fetches the **top 3–5** entries for standard prompts, more for reflection phases.

## World Lexicon (Lore RAG)

A separate collection in the Vector DB dedicated to **world knowledge** — the rules of the universe.

### The Global Premise
A 2–3 sentence anchor injected into **every** prompt. It never changes after world generation.

> `[UNIVERSE: Naruto. Shinobi villages govern the world through Chakra — spiritual/physical energy. Technology is 1990s analog. Guns do not exist. Tone: high-action anime with life-or-death stakes.]`

### Lore Cards
Structured knowledge entries. Each card defines a concept, location, faction, ability, or rule.

```json
{
  "term": "Sharingan",
  "definition": "A visual jutsu of the Uchiha clan. Grants heightened perception and the ability to copy techniques. Manifests as red eyes with tomoe patterns.",
  "category": "ability"
}
```

### Lore Retrieval
When the player or NPC mentions a term, the backend searches the Lore collection by keyword + vector similarity. Matching cards are injected into a `[LORE CONTEXT]` block in the prompt. Only the 2–3 most relevant cards per turn — no wiki dumps.

### Lore Ingestion
Three methods (see `concept.md` World Generation for details):
1. **Auto-extraction** — LLM generates 30–50 lore cards from the world premise during setup.
2. **WorldBook import** — SillyTavern worldbooks loaded directly.
3. **Wiki scraper** — user pastes a Fandom URL, backend scrapes and chunks into lore cards.

## NPC Reflections

Triggered when an NPC's cumulative unprocessed event importance exceeds a threshold (sum ≥ 15). This means reflection runs more often during dramatic events and less during quiet periods — no fixed timer. Results are stored **back in SQLite** as structured data — not in a separate graph database.

### How It Works
1. Backend tracks each NPC's unprocessed importance sum. When it exceeds the threshold, retrieves the recent episodic entries involving this NPC.
2. Reflection Agent reads them and uses its tools:
   - `set_belief("The player is reckless and dangerous", evidence: ["Memory #12", "Memory #18"])`
   - `set_goal("Avoid traveling alone with the player", priority: "short-term")`
   - `set_relationship("player", "Distrusts", "Witnessed player's cruelty to prisoners")`
3. Backend writes these to the NPC's SQLite record.

Next time this NPC is in a scene, the backend includes their beliefs and goals in the prompt. The Storyteller uses this to inform the NPC's behavior — no need to re-read thousands of raw memories.

## Prompt Assembly

When the Storyteller generates a response, the backend constructs a structured prompt from multiple sources:

```
[SYSTEM RULES]
You are a ruthless Game Master. Acknowledge mechanical outcomes
and factual state above all else.

[WORLD PREMISE]
{global_premise}

[SCENE]
Location: {current_node.name} ({current_node.tags})
Present: {entities_in_node}

[PLAYER STATE]
HP: {hp}/5 | Tags: {tags} | Equipped: {items}

[NPC STATE (if in scene)]
{npc.name}: {npc.tags}, Believes: {npc.beliefs}, Goal: {npc.current_goal}
Relationship to Player: {relationship.tags}

[LORE CONTEXT]
{relevant_lore_cards}

[RETRIEVED MEMORIES]
{top_episodic_memories}

[RECENT CONVERSATION]
{last_5_turns}

[ACTION RESULT]
Player action: "{action_text}"
Oracle ruling: {chance}% → {outcome} (Strong Hit/Weak Hit/Miss)

[TASK]
Narrate the outcome. Use your tools to update world state as needed.
```

The system prompt instructs the Storyteller to translate tags and state into vivid sensory description. No separate translation layer needed — the LLM natively understands `[Ruins, Ash]` as desolation and `HP: 1/5` as critically wounded.

## Save / Load System

A campaign is a directory. Both SQLite and LanceDB are file-based — saving is automatic (data is already on disk).

```
campaigns/
  my-naruto-world/
    state.db           ← SQLite: all structured data
    vectors/            ← LanceDB persist directory
    config.json         ← AI provider settings, world premise
    chat_history.json   ← last N conversation turns
```

### Operations
- **New Campaign** — creates directory, runs World Generation pipeline, initializes empty DBs.
- **Load Campaign** — opens the directory, connects to existing DBs.
- **Checkpoint** — snapshot of `state.db` + `memories/` into a timestamped subdirectory. Used for death recovery or "what if" branching.
- **Delete Campaign** — removes the directory.

No cloud saves, no accounts. Everything is local files.
