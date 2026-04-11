# WorldForge: Game Mechanics

## Authority Model

`docs/mechanics.md` is the normative gameplay baseline for live mechanics. Backend code remains authoritative when prose and implementation diverge.

The player and NPC state model is now **canonical-record-first**. A structured record (`CharacterRecord`) is the source of truth for character identity, motivations, capabilities, state, loadout, and start conditions. Derived tags still matter, but they are **compatibility output** for prompts, Oracle context, and older runtime surfaces rather than the authored ontology.

### Canonical Character State

Characters no longer operate as flat tag bags. The authoritative layer is a structured record, and the runtime projects compact shorthand from it when needed.

- **Authoritative:** canonical identity, profile, social context, motivations, capabilities, state, loadout, and `startConditions`
- **Derived:** runtime tag lists assembled from the structured record for prompt compactness and compatibility
- **Still tag-native:** items, locations, factions, and some scene/world surfaces continue to expose tags directly

This is the active replacement for the old “tag-based system” claim. Tags are still useful, but they are no longer the whole ontology for characters.

### Minimal Numerics

Only a small number of mechanics remain numeric in the live contract:

- **HP (1-5)** is still the primary explicit character meter. `5` is healthy, `1` is near collapse, and `0` hands the outcome to the narration-plus-mechanics boundary described in the defeat rules.

Everything else is mostly qualitative or record-backed:

- **Wealth** uses descriptive tiers such as `[Poor]`, `[Comfortable]`, or `[Wealthy]`.
- **Skills** remain descriptive tiers such as `[Novice Pyromancer]`, `[Skilled Pyromancer]`, or `[Master Pyromancer]`.
- **Relationships** remain qualitative states such as `[Trusted Ally]` or `[Sworn Enemy]`.
- **Status** can appear as derived tags, but the live runtime also stores structured `conditions` and `statusFlags`.

### Derived Tags and Compatibility Views

Derived tags are intentionally lossy shorthand. The runtime composes them from the canonical structured record and uses them where compactness is useful:

- prompt assembly
- Oracle actor context
- compatibility projections for older tables and payloads

They should be read as a snapshot, not as the authored source of truth. Future planning should prefer the structured record over any flat tag projection.

### Bounded Pending Seam: Inventory Authority

Inventory and equipment behavior is more coherent than the pre-v1.1 baseline, but it is not documented as fully closed authority yet. Live gameplay currently uses the `items` table plus canonical records together, and Phase 38 remains the explicit pending seam for final inventory authority. Do not treat tag projections or old equipped-item strings as the final gameplay contract.

## The Probability Oracle

When a player attempts a non-trivial action, the **Oracle** evaluates chance and returns a bounded mechanical ruling that the backend resolves before narration.

### The Oracle Flow

1. The player states an action.
2. The backend assembles the Oracle payload from live runtime state:
   - **Intent and method:** what the player is trying to do and how.
   - **Actor context:** capabilities, conditions, and other relevant shorthand projected from the canonical record.
   - **Target context:** live target-aware support for **character, item, and location/object** targets when a concrete supported target resolves.
   - **Environment and scene context:** current location state plus any prompt-visible opening constraints.
3. The Oracle returns structured output such as `{ "chance": 65, "reasoning": "..." }`.
4. The backend rolls D100 and resolves a three-tier outcome:
   - **Strong Hit**: roll <= chance x 0.5
   - **Weak Hit**: roll <= chance
   - **Miss**: roll > chance
5. The Storyteller narrates from that tier and from the already-resolved backend state.

### Target-Aware Boundaries

The live target-aware contract is intentionally bounded.

- Supported target-aware rulings are implemented for **character, item, and location/object** targets.
- Target-aware support depends on resolving a concrete supported entity from parsed intent/method text, movement context, or a bounded classifier fallback.
- If the action does not resolve a supported target, the Oracle falls back honestly to non-targeted evaluation with empty target tags.
- The document does **not** claim a generic faction-targeting vertical or universal target-tag coverage for every noun the player can mention.

This replaces the older wording that implied target tags always existed implicitly.

### Why Oracle Instead of Fixed Interaction Math

The live product still prefers context-sensitive evaluation over a hardcoded interaction grid. The Oracle sees structured state plus compatibility shorthand and can weigh unusual combinations without requiring a giant hand-authored modifier table.

### Oracle Configuration

The Oracle remains a separate Judge-role configuration in the UI:

- **Provider/model:** usually a fast, cheap model
- **Temperature:** typically `0.0` for stable rulings

## Opening-State Runtime Effects

Structured start conditions are now bounded live mechanics, not flavor-only setup text. The canonical player record can carry:

- `arrivalMode`
- `startingVisibility`
- `entryPressure`
- `companions`
- `immediateSituation`

The runtime derives opening-state effects from those fields into status flags, prompt lines, and scene constraints.

### What the Runtime Guarantees

- `arrivalMode` affects how the opening scene is framed and which constraints are immediately visible.
- `startingVisibility` determines whether the player begins noticed, expected, hidden, or otherwise socially exposed.
- `entryPressure` adds concrete early-scene pressure such as surveillance, urgency, or hostile scrutiny.
- `companions` are carried through as prompt-visible presence/context, not as a full party-management system.
- `immediateSituation` is normalized into a small bounded opening-effect set rather than reinterpreted freely every turn.

The live contract is status-flag-backed and prompt-visible. It is **not** a free-form rules engine and it does not claim generic long-horizon scenario simulation from arbitrary setup prose.

### Expiry Rules

Opening effects are temporary by design. They expire deterministically on the first matching condition:

- location change away from the canonical opening location
- explicit resolution through the player action that addresses the opening constraint
- the **three-tick** ceiling

This is the replacement for older narration-only start-condition wording. Opening-state pressure is real, but intentionally bounded.

## Soft-Fail System

Nothing in the action layer is hard-blocked purely because a move is unlikely. The Oracle can assign a near-zero chance, the backend still resolves the roll, and the resulting failure or miracle success becomes world state plus narration.

This keeps the sandbox open without pretending every action is equally plausible.

## Death & Defeat

**HP reaching 0 does not automatically mean death.** The live runtime still treats defeat as context-dependent.

- A bar brawl can end in unconsciousness.
- A duel can end in capture.
- A lethal encounter can still end in death if the situation supports it.

Narration decides the fictional outcome, but it does so on top of backend-owned mechanics and persistent world state. Saves and checkpoints in `docs/memory.md` remain the player recovery path when the outcome is unacceptable.

## Character System (3 Tiers)

### Temporary (Extras)
Temporary characters are lightweight scene participants such as bystanders, merchants, or minor hostiles. They can exist with thinner state than major actors, and the runtime does not promise long-horizon autonomous simulation for every extra after the scene moves on.

### Persistent (NPCs)
Persistent NPCs have durable world existence. Their canonical records, memories, location state, and relationships survive scene changes, and later prompts read that structured state back into play.

### Key Characters ("AI Players")
Key characters are the most simulation-heavy NPC tier. They are the main consumers of reflection and world-state carry-through, and their **belief**, **goal**, and **relationship** state is expected to evolve over time through committed events.

**Simulation:**
- Key characters **present with the player** can act through individual runtime seams during the active turn boundary.
- Key characters **off-screen** can still receive batched simulation updates, but the resulting committed state must flow back through backend-owned memory, location, and relationship seams rather than existing only as prose.

### Promotion & Import

- Extras can be promoted to Persistent if they become narratively important.
- Characters can be imported via **SillyTavern V2 Character Cards**, but the import path now feeds canonical draft/record structures rather than treating flat tags as the entire character model.
- The player character can also be initialized from a V2 card, then projected into compatibility tags at runtime.

## Factions

Factions remain world actors described through qualitative state such as tags, goals, assets, and chronicle entries. They are still closer to narrative/political entities than to hard-stat spreadsheets, but the docs no longer treat “same tag system as everything else” as a universal ontology claim for characters.

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

## World and Location Model

The live world graph can contain three different location lifetimes at once:

- **macro location** nodes for major places such as towns, districts, or regions
- **persistent sublocation** nodes for durable interior or nested spaces
- **ephemeral** scene nodes for temporary revealed spaces, encounter pockets, or short-lived local contexts

These all live in one authoritative location graph. The read contract exposed to gameplay is built around `connectedPaths`, not around legacy `connectedTo` strings.

### Travel and Connectivity

- `connectedPaths` is the authoritative gameplay-facing adjacency projection.
- Each path carries **travel cost** in ticks.
- Movement resolves against the location graph, not against an adjacency-only teleport shortcut.
- Current-location travel is treated as a deterministic **no-op** instead of a fake arrival.
- For player and tool-driven movement, the runtime can resolve multi-edge travel and return total travel cost plus the traversed path.

### Local History

- Locations surface bounded **recent happenings** as a live read model.
- Prompt assembly and world payloads read those recent happenings from the same backend seam.
- The local-history contract is player-visible and planning-significant; it is not just an internal prompt convenience.

### Ephemeral Consequences Persist

An ephemeral location can expire or archive as a node, but its consequences do not vanish. Committed events can spill into anchored local history, memory, relationships, or world state so downstream readers do not need the temporary node to survive forever.

## World Engine (Macro-Simulation)

The world still changes independently of the player. Factions act, events happen, and the global situation shifts between turns and across longer horizons.

### Macro Ticks

Every N in-game days (or after a major story arc), the World Engine runs a single LLM call per faction:

Given the faction's tags, goals, World Chronicle, and neighboring factions — the LLM decides what the faction does this cycle and returns structured JSON (action, outcome, state changes). The prompt includes: "Occasionally introduce unexpected world events (plagues, natural disasters, magical anomalies) when narratively appropriate."

**State Update:**
- Location ownership changes (faction gains/loses territory).
- Faction tags update (`[Controls Iron Mines]` added, or `[Weakened]`).
- World Chronicle entry added.
- Nearby location nodes gain contextual tags (`[War Zone]`, `[Martial Law]`).

### World-information-flow

The live world-information-flow contract is intentionally bounded.

- Prompts receive **proximity** and current-location context.
- Prompts receive active **faction** and world-state context.
- Prompts can receive local **recent happenings** and episodic evidence.
- Prompts receive **elapsed time** cues through ticks, chronicle ordering, and bounded recency windows.

This supports believable inference, but it **does not guarantee** a fully simulated per-actor **knowledge model**, explicit event propagation network, or perfect **omniscience** boundaries. The runtime supplies bounded context; the LLM still infers within that context.

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
- **Input:** action intent/method, actor shorthand derived from canonical state, bounded target-aware context, and prompt-visible environment state.
- **Output:** `{ "chance": 0–100, "reasoning": "..." }`

**Storyteller context** — narrates outcomes, drives emergent story:

| Tool | Purpose |
|------|---------|
| `spawn_npc(name, tags, location)` | Introduce a new character into the scene |
| `spawn_item(name, tags, location_or_owner)` | Introduce a new item |
| `reveal_location(name, tags, connected_to)` | Create or reveal an **ephemeral** scene location anchored to a known location and add bidirectional graph edges |
| `add_tag(entity, tag)` | Add a tag to any entity |
| `remove_tag(entity, tag)` | Remove a tag from any entity |
| `set_relationship(a, b, tag, reason)` | Set relationship tag between two entities |
| `set_condition(target, condition)` | Set HP condition (damage/heal via 5-point scale) |
| `add_chronicle_entry(text)` | Add to the World Chronicle |
| `log_event(text, importance, participants)` | Log a significant event with **caller-supplied importance** and participant names for episodic memory and reflection budget updates |
| `offer_quick_actions(actions[])` | Generate context-sensitive action buttons for the player |

The backend deterministically handles inventory transfers, time advancement, canonical state writes, and graph-backed location behavior.

**NPC context** (Judge role) — decides what an NPC does during their tick:

| Tool | Purpose |
|------|---------|
| `act(action_text)` | Declare the NPC's action (processed through Oracle like player actions) |
| `speak(dialogue)` | Say something in the current scene |
| `move_to(target_node)` | Travel through the authoritative location graph, using resolved pathing and **travel cost**, with already-there movement treated as a zero-cost **no-op** |
| `update_own_goal(old, new)` | Change own short-term or long-term goal |

**Reflection context** (Judge role) — triggered when an NPC's cumulative unprocessed event importance reaches the live threshold **sum >= 10**. Reflection reads same-turn committed evidence first, then merges semantic memory when available. Its default job is structured-state maintenance, not flashy progression:

| Tool | Purpose |
|------|---------|
| `set_belief(text, evidence[])` | Record or revise a durable **belief** from evidence |
| `set_goal(text, priority)` | Add or update a durable **goal** |
| `drop_goal(text)` | Abandon a goal |
| `set_relationship(target, tag, reason)` | Update a durable **relationship** based on reflection |

Ordinary play should usually produce belief, goal, or relationship drift before it produces wealth or skill upgrades. The old reflection-threshold-15 wording is deprecated.

**World Engine context** (Judge role) — faction actions during macro ticks:

| Tool | Purpose |
|------|---------|
| `faction_action(action_text, outcome)` | Declare and resolve the faction's strategic action |
| `update_faction_goal(old, new)` | Shift faction priorities |
| `add_chronicle_entry(text)` | Record the outcome in the World Chronicle |
