# WorldForge: Game Mechanics

## Tag-Based System

The game uses **descriptive tags** instead of traditional numerical stats (Str, Dex, Int). Tags are the universal language — everything in the game world is described by them: characters, factions, locations, items.

### Tag Categories

- **Traits:** `[Uchiha Clan Member]`, `[Cyborg Implant]`, `[One-Eyed]`
- **Skills:** `[Master Swordsman]`, `[Novice Alchemist]`, `[Skilled Pyromancer]`
- **Flaws:** `[Wanted by the Law]`, `[Phobia of Spiders]`, `[Exhausted]`
- **Status:** `[Blinded, 2 turns]`, `[Poisoned]`, `[Inspired]`
- **Structural (locations):** `[Ruins]`, `[Heavy Rain]`, `[Anti-Magic Zone]`
- **Faction:** `[Militaristic]`, `[Hidden]`, `[Food Scarce]`

### Minimal Numerics

Only one value is tracked as a number:
- **HP (1–5)** — a simple health scale. 5 = healthy, 1 = near death, 0 = the GM decides consequences (see Death section).

Everything else is tags, including:
- **Wealth** — tag tiers: `[Destitute]`, `[Poor]`, `[Comfortable]`, `[Wealthy]`, `[Obscenely Rich]`. Trading is a narrative action resolved by the Oracle ("Can this character afford this?"), not a balance sheet.
- **Skills** — descriptive tiers: `[Novice Pyromancer]` → `[Skilled Pyromancer]` → `[Master Pyromancer]`. Progression happens through the Reflection Agent, not XP counters.
- **Relationships** — qualitative tags: `[Trusted Ally]`, `[Suspicious]`, `[Sworn Enemy]`, `[Owes a Debt]`. No numeric scores.

## The Probability Oracle

When a player attempts any non-trivial action, the **Oracle** — a fast, cheap LLM — evaluates the probability of success.

### The Oracle Flow

1. Player states their action: *"I use [Skilled Aeromancer] to create a vacuum around the torch-wielding guard."*
2. Backend assembles the **Oracle Payload**:
   - **Intent & Method:** What and how.
   - **Actor tags:** Positive capabilities + negative debuffs.
   - **Target tags:** Defenses, resistances, strengths.
   - **Environment tags:** Local node conditions.
3. Oracle LLM returns: `{ "chance": 65, "reasoning": "A Skilled Aeromancer can manipulate air in a confined space, but the guard's torch provides heat that resists vacuum formation." }`
4. Backend rolls D100 and determines a **3-tier outcome**:
   - **Strong Hit** (roll ≤ chance × 0.5) — full success, possible bonus effect.
   - **Weak Hit** (roll ≤ chance) — success with a complication, cost, or partial result.
   - **Miss** (roll > chance) — failure with consequences.
5. Storyteller LLM receives the tier and narrates accordingly.

### Why Oracle, Not Fixed Math

A hardcoded dictionary of weight interactions (`[Fire] vs [Ice] = +20%`) cannot scale in an open-ended sandbox. The Oracle natively understands creative combinations: mixing `[Pocket Sand]` with `[Wind Magic]`, using `[Cooking Skill]` to improvise a poison. It evaluates context, not just keywords.

### Oracle Configuration

The Oracle is configured separately from the Storyteller in the UI settings:
- **Provider/Model:** A fast, cheap model (e.g., GPT-4o-mini, Claude Haiku, Llama 3 8B).
- **Temperature:** Defaults to `0.0` for consistent, logical rulings.

## Soft-Fail System

Nothing is hard-blocked. A peasant trying to cast a fireball? The Oracle assigns a near-zero chance. The backend rolls. If (miracle) it succeeds — the world just got interesting. If it fails — the GM narrates the humiliating consequence.

This keeps the sandbox open while maintaining consequences. Players can always try anything; the world always reacts logically.

## Death & Defeat

**HP reaching 0 does not automatically mean death.** When a character's HP drops to zero, the Storyteller GM determines the narrative outcome based on context:

- A bar brawl → unconsciousness, waking up in an alley.
- A duel with a rival → captured, held prisoner.
- A fight against a dragon → death, unless the situation offers an escape.
- An assassination → almost certainly lethal.

The GM considers the attacker's intent, the situation, and the drama. Death is meaningful because it's earned, not mechanical.

Saves and checkpoints (see `memory.md`) allow the player to reload if they disagree with the outcome.

## Character System (3 Tiers)

### Temporary (Extras)
Background characters spawned for immediate context — a random merchant, a bandit, a tavern patron. They have a name and basic tags, but are not simulated once the player leaves the scene. If they become important, they can be promoted.

### Persistent (NPCs)
Named characters with permanent existence. They have full tag sets, relationship tags with other entities, and memory. The world's state and the player's actions permanently affect them. They do not vanish.

### Key Characters ("AI Players")
Fully autonomous agents operating by the same rules as the player. They have goals, plans, beliefs, and relationships that evolve over time.

**Simulation:**
- Key Characters **in the player's location** get individual LLM calls each tick — the NPC Agent decides their actions, generates interactions, and creates narrative hooks.
- Key Characters **off-screen** are simulated via a single batch LLM call every N ticks: "Given these NPCs' goals, locations, and world state, what has each been doing?" The LLM returns structured updates (new location, action summary, goal progress). No mechanical pathfinding or dice-roll engine needed.

### Promotion & Import

- Extras can be promoted to Persistent if they become narratively important.
- Characters can be imported via **SillyTavern V2 Character Cards**, parsed into the tag system.
- The Player Character can also be initialized from a V2 card.

## Factions

Factions are "meta-characters" — they use the same tag system as everything else. No numerical stats like `military_power: 42`.

```
{
  name: "Northern Empire",
  tags: ["Militaristic", "Food Scarce", "Civil Unrest", "Controls Capital"],
  goals: ["Secure the Iron Mines", "Quell the Rebellion"],
  assets: ["Capital City", "Imperial Army", "The Imperial Seal"],
  chronicle: ["Lost the border war 2 months ago", "New emperor, weak legitimacy"]
}
```

Factions evolve through narrative decisions, not stat calculations.

## World Engine (Macro-Simulation)

The world changes independently of the player. Factions act, events happen, the global situation shifts.

### Macro Ticks

Every N in-game days (or after a major story arc), the World Engine runs a single LLM call per faction:

Given the faction's tags, goals, World Chronicle, and neighboring factions — the LLM decides what the faction does this cycle and returns structured JSON (action, outcome, state changes). The prompt includes: "Occasionally introduce unexpected world events (plagues, natural disasters, magical anomalies) when narratively appropriate."

**State Update:**
- Location ownership changes (faction gains/loses territory).
- Faction tags update (`[Controls Iron Mines]` added, or `[Weakened]`).
- World Chronicle entry added.
- Nearby location nodes gain contextual tags (`[War Zone]`, `[Martial Law]`).

### Information Flow

NPCs learn about world events through the World Chronicle and episodic memory retrieval. When assembling an NPC's prompt, the backend includes their location history — the LLM infers what the NPC would realistically know based on proximity, faction affiliation, and time elapsed. No explicit event propagation system needed.

## AI Agent Tool System

The LLM never modifies game state directly. All AI calls use structured **tool calling** (function calls) that the backend validates and executes. This ensures the LLM can only affect the world through controlled channels.

### Two LLM Roles

All LLM calls fall into two categories, each configurable separately in the UI:

| Role | Purpose | Recommended | Temperature |
|------|---------|-------------|-------------|
| **Judge** | Structured JSON output — probability evaluation, NPC decisions, reflections, faction actions, world gen scaffolding | Fast/cheap model (GPT-4o-mini, Claude Haiku) | Per-call (0.0 for Oracle, 0.3 for reflection, 0.5 for NPC) |
| **Storyteller** | Creative prose — narration, dialogue, world gen flavor text | Flagship model (GPT-4o, Claude Sonnet) | 0.7–1.0 |

Temperature is a per-call parameter, not a per-role configuration. This eliminates the need for 6 separate provider configs.

### Tool Sets by Context

**Oracle context** (Judge role) — evaluates action probability. No tools, returns structured JSON:
- **Input:** Action intent, actor tags, target tags, environment tags.
- **Output:** `{ "chance": 0–100, "reasoning": "..." }`

**Storyteller context** — narrates outcomes, drives emergent story:

| Tool | Purpose |
|------|---------|
| `spawn_npc(name, tags, location)` | Introduce a new character into the scene |
| `spawn_item(name, tags, location_or_owner)` | Introduce a new item |
| `reveal_location(name, tags, connected_to)` | Create/reveal a new location node |
| `add_tag(entity, tag)` | Add a tag to any entity |
| `remove_tag(entity, tag)` | Remove a tag from any entity |
| `set_relationship(a, b, tag, reason)` | Set relationship tag between two entities |
| `set_condition(target, condition)` | Set HP condition (damage/heal via 5-point scale) |
| `add_chronicle_entry(text)` | Add to the World Chronicle |
| `log_event(text, importance, participants)` | Log a significant event to episodic memory |
| `offer_quick_actions(actions[])` | Generate context-sensitive action buttons for the player |

The backend deterministically handles: inventory transfers (loot/trade), entity movement between nodes, time/tick advancement.

**NPC context** (Judge role) — decides what an NPC does during their tick:

| Tool | Purpose |
|------|---------|
| `act(action_text)` | Declare the NPC's action (processed through Oracle like player actions) |
| `speak(dialogue)` | Say something in the current scene |
| `move_to(target_node)` | Travel to an adjacent location |
| `update_own_goal(old, new)` | Change own short-term or long-term goal |

**Reflection context** (Judge role) — triggered when an NPC's cumulative unprocessed event importance exceeds a threshold (sum ≥ 15). Reads recent episodic memories and synthesizes higher-level understanding:

| Tool | Purpose |
|------|---------|
| `set_belief(text, evidence[])` | Record a new belief (e.g., "The player is dangerous") |
| `set_goal(text, priority)` | Add or update a goal |
| `drop_goal(text)` | Abandon a goal |
| `set_relationship(target, tag, reason)` | Set relationship tag based on reflection |

**World Engine context** (Judge role) — faction actions during macro ticks:

| Tool | Purpose |
|------|---------|
| `faction_action(action_text, outcome)` | Declare and resolve the faction's strategic action |
| `update_faction_goal(old, new)` | Shift faction priorities |
| `add_chronicle_entry(text)` | Record the outcome in the World Chronicle |
