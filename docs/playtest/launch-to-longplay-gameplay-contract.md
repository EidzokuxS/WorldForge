# Launch-to-Longplay Gameplay Contract

Date: 2026-06-20

Status: draft product acceptance contract. This document is the player-facing
baseline for proving WorldForge is playable from launch, not only that isolated
runtime slices pass tests.

## Source

This contract comes from the user-described baseline flow:

- Generate a world from a premise. The premise may be original, canonical,
  crossover, or transformed canon.
- Optional research/search may happen before or during generation.
- The game creates world DNA, then locations, factions, characters, links,
  world-specific hooks, and final cross-pass cohesion.
- The player creates a character.
- The player either writes an opening scenario or chooses a spawn/start point.
- Pressing continue enters the generated world.
- The first game message introduces the player into the world from that exact
  start point.
- From that point onward, the game should feel like an RPG session, with
  cinematic presentation, readable narration, player choice, custom actions,
  adjudication, world reaction, and autonomous world motion over time.

## Product Promise

WorldForge must feel like a playable single-player text RPG sandbox.

The backend owns hard truth: world state, movement, custody, injury/condition,
time, resources, routes, relationship changes, durable events, hidden facts, and
important affordances.

The narrator owns player-facing fiction: scene pressure, sensory texture,
rhythm, dramatic framing, and readable continuity. Soft prose can add harmless
low-stakes surface detail. Later player use of that detail is adjudicated as a
new action against world logic.

The living world owns background motion. NPCs, factions, conflicts, territory,
relationships, and disasters may change while the player acts elsewhere. Those
changes reach the player through visible consequences, rumors, routes, scene
state, NPC behavior, or later discovery.

## Launch Flow

1. The player enters or selects a premise.
2. Generation produces a coherent playable world:
   - world DNA;
   - locations and route graph;
   - factions and goals;
   - major and support characters;
   - character placement and starting tensions;
   - world hooks and local pressures;
   - public review data that matches the authored records.
3. The player creates or imports a character.
4. Character creation exposes usable identity, capabilities, limits, state,
   loadout, motivations, and start conditions.
5. The player chooses a start point or supplies a scenario.
6. Continue enters the play surface without requiring manual environment
   variables or developer-only setup.

## First Screen Contract

The opening screen is gameplay. It is not a smoke test, lore dump, roster dump,
or debug projection.

It should give the player:

- where they are now;
- what their immediate situation feels like;
- what pressure or opportunity is active now;
- what is directly visible or clearly sensed;
- what obvious routes, actions, or handles they can try;
- enough tone and texture to want to act.

It should not show:

- broad-location NPC names merely because those NPCs exist somewhere nearby;
- "nearby but not visible" counters as player-facing gameplay information;
- hidden actor identities;
- backend refs, internal IDs, draft/provenance labels, or debug state;
- one-line world trivia as the whole opening;
- a giant lore lecture before the player has a scene to act in.

The opening message should be staged as a readable first beat, preferably split
into presentation chunks/beats so the UI can use fades, shake, pacing, log
entries, and other scene effects consistently.

## Turn Feel

After the opening, the player may:

- choose a suggested option;
- type a custom action;
- look around;
- move;
- ask questions;
- talk to visible or reachable characters;
- inspect items, surfaces, routes, or threats;
- use ordinary scene props;
- attempt risky or impossible actions;
- wait, hide, eat, rest, flee, fight, negotiate, or ignore the crisis.

The game responds through adjudication and narration:

- trivial or local actions should resolve quickly;
- hard actions use the judge/oracle/runtime owners;
- impossible actions fail because of world logic;
- ordinary props can exist as turn-scoped affordances without durable DB rows;
- hidden/mechanical/special affordances require hard evidence;
- mutations produce durable world state only when typed owners accept them.

## Living World Contract

The world should keep moving across 30, 60, and 300 turns.

Examples of acceptable long-play outcomes:

- Somewhere else, factions fight, negotiate, gain ground, or lose ground.
- An explosion, barrier, disaster, hunt, search, or political move changes
  local options.
- The player may be ignored if they are irrelevant to the current crisis.
- The player may become central if they intervene.
- Characters pursue goals, meet, clash, flee, recover, or change plans.
- New locations open, close, degrade, rebuild, or become dangerous.
- If the player destroys part of a city on turn 100 and returns on turn 300,
  the world should show plausible recovery, occupation, ruins, rebuilding, or
  downstream consequences.
- If the player spends 300 turns eating ice cream in Shibuya while nothing
  reaches that exact spot, the local scene may stay mundane while the wider
  world changes elsewhere.

## Acceptance Tiers

### Tier 0: Launch Smoke

- App starts with normal user launch path.
- Existing campaign can be loaded.
- Fresh campaign generation can reach review.
- Continue enters play.
- No public-boundary, private-ref, missing-session, or pending-narration crash.

### Tier 1: Opening Gameplay Gate

- Fresh generated world plus player can enter the game.
- First screen has a real playable scene.
- Opening narration is multi-fact, readable, and grounded.
- UI shows immediate actionable information.
- UI does not show hidden/broad roster/debug data as scene truth.
- The first custom player action resolves through the normal runtime.

### Tier 2: First 10 Turns

Must cover:

- look/direct scene;
- custom action;
- suggested option or continue;
- movement or route inquiry;
- dialogue;
- ordinary local prop or surface action;
- hidden/mechanical follow-up bounded by evidence;
- inventory/status check if the character has carried/equipped items.

### Tier 3: First 30 Turns

Must cover:

- movement across several locations;
- route options and route status;
- visible actor interaction;
- support actor materialization or no-match handling;
- item custody or explicit transfer;
- ordinary soft detail later targeted and adjudicated;
- at least one background-world signal reaching the player;
- no deterministic narrator replacement for normal turns;
- no restore/replay/fallback presented as a normal player turn.

### Tier 4: Fresh 60-Turn Run

Must prove the game is readable and stable over distance:

- no player-facing failed turns;
- no hidden/private leaks;
- no invalid world-state mutation;
- no repeated restore loop;
- no runtime crash;
- prose remains readable by human review;
- soft prose remains non-authoritative until targeted by the player;
- world state changes are visible through normal player-facing channels.

### Tier 5: Multi-World and Long Horizon

Required before claiming broad playability:

- at least two fresh zero-turn worlds reaching 60 manually chosen turns;
- at least one clone/provenance run;
- longer 300+ or 600+ soak/replay evidence;
- manifest tying run id, commit, dirty status, campaign id, transcript,
  per-turn artifacts, state changes, world clock/version, and human notes.

## Current Gap

Existing docs and artifacts cover mechanics and several prose/runtime slices.
They do not yet form one launch-to-longplay product acceptance contract. Any
claim that WorldForge is playable must cite this contract or a successor.

Current partial opening/UI edits in the worktree are not accepted until they
pass the Opening Gameplay Gate and a real launch path proof.
