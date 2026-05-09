# WorldForge Design Lab Results

Date: 2026-05-01

## Inputs

- `worldforge-screen-flow-contract.md`
- `worldforge-visual-target-contract.md`
- `worldforge-design-agent-brief.md`
- Marinara GM/RPG flow reference
- Open Design Sonnet prototype
- Open Design Claude Opus prototype
- Codex 5.5 xhigh design review

## Artifacts

| Artifact | Path | Status |
|---|---|---|
| Sonnet prototype | `R:\Projects\open-design\.od\projects\worldforge-play-surface-1777655079953\index.html` | Rejected as visual direction; useful only as a negative reference |
| Opus screen-flow prototype | `R:\Projects\open-design\.od\projects\worldforge-screen-flow-opus-1777656631094\worldforge-screen-flow-v2.html` | Useful for topology/state coverage; visual palette is not final |
| Design agent brief | `.planning/research/worldforge-design-agent-brief.md` | Accepted as compact mission brief for future agents |

## Consensus

WorldForge should not become a prettier text document. The target product language is:

- live play as a scene-first solo RPG/VN surface,
- setup/review as game preparation workspaces,
- settings/debug as secondary technical surfaces,
- character cards as dossiers and scene-aware sheets,
- raw mechanics and JSON hidden behind inspect/debug affordances.

## What To Take From Opus

The Opus prototype is useful because it demonstrates:

- full product topology rather than a single `/game` screen,
- route/state navigator for review,
- setup flow coverage: library, seed, DNA, worldgen, review, character, play,
- explicit persistence annotations,
- review surface distinguishing macro/persistent/scene locations,
- live play grouping for visible, sensed-nearby, and off-screen actors,
- inspect and world drawers as overlays rather than permanent columns,
- settings overlay with return-to-game semantics,
- draft persistence demo in the input dock.

## What Not To Take From Opus

The Opus prototype still leans toward the rejected editorial/paper direction:

- default palette begins with `--bg:#f4f1ec`, `--paper:#faf9f6`, and `--surface:#fffefb`,
- typography and surface language still risk reading as literary admin rather than cinematic game UI,
- live play has better structure, but the first visual read is still not strong enough as a physical scene,
- it does not yet deliver the full Marinara-like staged text cadence as the default experience.

Use Opus as an IA/prototype-state artifact, not as the final visual style.

## Codex 5.5 Design Review Consensus

The next implementation slice should focus on `/game` presentation topology:

1. Replace the default `/game` three-column layout with `GameSceneShell`.
2. Add a `DisplayBeat` adapter over existing messages/SSE events.
3. Implement local `Next`, `Auto`, and `Log` cadence without creating backend turns.
4. Convert current permanent panels into drawers/widgets: Log, World/Map, Character, Lore/Journal, Inventory, Inspect, Saves.
5. Add per-campaign input draft persistence.
6. Add first-class `Continue` as a backend turn action.
7. Add simple address modes: Act, Speak, Observe, Ask GM.
8. Present at least one fiction-facing dice/mechanic summary and one ambient/state event.

Defer generated background pipeline, sound, real QTE engine, full product-wide visual overhaul, detailed settings redesign, and backend presentation-event schema.

## Required Phase 77 Acceptance Gates

Screenshot gates:

- default `/game` reads as a game/VN within five seconds,
- current place is visually legible before prose,
- bottom narration/input dock is dominant,
- visible/interactable actors are distinct from same-area/off-screen actors,
- dice/choice appears as a game beat, not raw debug,
- drawers preserve input draft,
- mobile has no permanent admin sidebars.

Playtest gates:

- run a 10-turn session using Continue, freeform action, actor interaction, movement, at least one drawer, and one dice/choice beat,
- the player can answer: where am I, who is visible, what changed, what can I do next,
- `Next`, `Auto`, and `Log` never create backend turns,
- `Send` and `Continue` do create backend turns,
- player never needs raw Oracle/debug to understand the consequence.

## Phase Direction

Phase 77 should not attempt to solve every UI surface at once. It should create the playable vertical-slice shell for `/game`, backed by enough setup/review/character surface contracts that future UI work remains coherent.

Phase 78 or later can handle full setup/review visual overhaul, generated location imagery, advanced inventory/journal polish, and richer presentation events.
