# P337 Marinara Live Reference Findings

Date: 2026-06-25

Reference runtime:
- API: `http://127.0.0.1:7860`
- Source campaign inspected: `Chainsaw Man`
- Safe branch used for live turn: `lGm2QyDXxfHWTd2K0INeN`
- Captured artifacts:
  - `output/marinara-reference-20260625/turn-request.json`
  - `output/marinara-reference-20260625/turn-response.sse.txt`

## What Marinara Actually Does

Marinara separates game state, adjudication, scene direction, prose rendering, and UI updates.

- The map owns locations, discovery state, travel affordances, and unknown nodes.
- Undiscovered map nodes are shown as unknown/question-mark locations instead of being narrated as known destinations.
- The player character's knowledge is separate from backend/campaign truth.
- Justice handles action adjudication. In the live branch, silently eating ramen and watching a curtain returned `auto_success` because it was trivial and non-risky.
- Emperor produces a directed scenario for the turn: what changes, what pressure enters, which NPC behavior matters, which choices open.
- Tower renders player-facing prose from the scenario. It does not dump map labels, backend routes, or full state receipts.
- Chariot/UI state updates widgets and HUD separately from prose.

## Observed Gameplay Loop

1. Player acts.
2. Justice decides whether the action needs a roll, succeeds, or fails.
3. Emperor writes the authoritative scenario beat.
4. Tower writes the visible scene.
5. State/HUD/map update around the prose.
6. Player receives choices or writes a free action.

The live branch turn used this action:

```text
I stay quiet, finish the ramen, and keep watching the noren curtain without taking my eyes off it.
```

Observed result:
- Justice: `auto_success`.
- Emperor scenario: Eiji finishes ramen; Nishimura notices; the noren lifts without wind; normal sound returns; Nishimura offers tea; new choices appear.
- Tower final prose: sensory, immediate, NPC-focused, and anchored to what Eiji can perceive.
- UI/state delta: `Composure` changed from 74 to 68, `Sachiko` bond changed from 3 to 4, `activeState` remained dialogue.
- Map discovery remained stable: undiscovered nodes such as Asakusa and Golden Gai stayed hidden/unknown.

## Why It Feels Playable

- The opening has a reason for the character to be there.
- Outsider knowledge is respected. The character learns the world through mundane friction, NPC reactions, and local oddities.
- The prose starts with an immediate situation rather than a database summary.
- Choices come from scene pressure and NPC behavior, not route enumeration.
- Unknown places stay unknown until discovery or adjacent exploration makes them relevant.
- State changes are visible in UI/HUD, while prose keeps scene rhythm.
- The final narrator is a renderer over a directed scene, not a parser of raw backend facts.

## WorldForge Difference

WorldForge has stronger generated-world structure than Marinara: canonical worldgen, route graph, hard receipts, item custody, world facts, autonomous background state, and separate clean-runtime owners.

That strength becomes a prose problem when Stage 6 receives backend receipt sentences as the writing task. The narrator obeys those receipts and prints state instead of staging a scene.

WorldForge does not need a second Emperor/GM layer. Its intended GM-owned path already corresponds to Marinara's Emperor role: GM Read, Stage4, Settlement, and the clean narrator view should hand Stage 6 a posed turn.

The failure is that the opening path currently bypasses that shape. It builds a synthetic settled packet from `buildOpeningNarrationEvidence`, and that function manufactures sentence-ready receipt facts such as `You are at X, inside Y` and `From X, the clearest ways out point toward...`. Stage 6 then acts on those receipt facts instead of on a GM-posed scene.

For normal turns, the risk is similar but narrower: if the settled packet/narrator view collapses the GM result into changelog/evidence rows without a strong writer-facing page task, Stage 6 can still sound like a receipt printer. The fix is to preserve the existing GM/Settlement ownership and make the handoff carry a playable page shape.

## P337 Contract Adjustment

P337 should not add another decision maker. It should make the existing GM/opening handoff produce a player-facing beat plan instead of sentence-ready backend receipt prose.

It also needs an initial staging pass before the first opening text. The first turn must not inherit a flat cast dump from broad location placement. World generation already has an `npc-placement-expansion.v1` step that can create persistent sublocations and assign NPCs to concrete scenes; P337 should tighten the use of that capability around the player start.

Initial staging must answer:
- where the player begins at a concrete scene level;
- why the player begins there;
- which NPCs are visible in the first scene;
- which NPCs are nearby but not visible;
- which NPCs are elsewhere pursuing their own starts;
- which macro locations need new child scenes before play begins;
- which canon/backend locations are known to the player, unknown, or UI-only;
- how each key NPC enters play later: visible at start, heard about, encountered through route, pursuing offscreen goal, or currently irrelevant to the first scene.

The staging pass is not prose. It mutates or verifies setup state: location rows, NPC scene placement, player start scene, discovery/unknown state, and opening visibility. Stage 6 only receives the resulting player-facing scene handoff.

Required opening handoff fields:
- `start_reason`: why this player character is here now.
- `pov_knowledge`: what the character knows, suspects, and does not know.
- `arrival_mode`: how the scene begins physically.
- `immediate_locus`: the concrete place the character can perceive.
- `visible_pressure`: what is happening now.
- `visible_actors`: only actors the character can perceive or has a direct cue for.
- `soft_surface_budget`: harmless sensory texture the narrator may invent.
- `action_hooks`: 2-4 playable options based on perception, not backend route labels.
- `ui_owned`: route labels, exact location names, stats, inventory, and hidden/world-only names that prose should not explain.

For the Tiamat/Shibuya failure:
- UI may show `Shibuya` and route controls.
- Prose should not say `inside Shibuya`.
- Prose should not list `Tokyo Jujutsu High` unless Tiamat knows it or a visible character/sign exposes it.
- Prose should tie Tiamat to the world through arrival, immediate friction, a visible anomaly, NPC pressure, or a concrete sensory hook.
- Gojo, Geto, Kafka, Esdeath, students, civilians, and other cast members need explicit start placement: visible in Tiamat's concrete scene, elsewhere in Shibuya child scenes, or outside Shibuya. Being in the same macro ward must not create first-screen co-presence.

## Proof Gate

A valid P337 proof needs:
- Fresh JJK/Tiamat opening screenshot or captured HTML.
- No route dump in prose.
- No backend membership receipt such as `inside Shibuya`.
- No canon institution presented as character knowledge without evidence.
- NPCs distributed into concrete start scenes before opening; no broad-location cast pile in first-scene UI/prose.
- UI still shows routes/status where appropriate.
- First custom action resolves through normal runtime.
- Sustained play lane at 10/30/60 turns checks prose readability, map discovery, UI deltas, and world reaction.
