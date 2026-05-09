# WorldForge Design Agent Brief

## Mission

Design the next WorldForge UX direction as a playable solo RPG/VN product, not as a document viewer, SaaS dashboard, or debug cockpit.

The goal is a weekend-playable vertical slice where the user wants to take 10-20 turns because the scene surface feels alive, readable, and game-like.

## Inputs To Read First

1. `.planning/research/worldforge-screen-flow-contract.md`
2. `.planning/research/worldforge-visual-target-contract.md`
3. `.planning/research/marinara-gm-flow-reference.md`
4. `frontend/app/game/page.tsx`
5. `frontend/components/game/narrative-log.tsx`

The first Open Design prototype may be inspected only as a rejected negative reference. Its warm newspaper/editorial-reader direction is not the target.

## Core Correction

Do not optimize the current UI as a prettier page.

WorldForge needs a product language:

- Live play is a scene-first VN/RPG surface.
- Setup/review is a game-prep workspace.
- Settings/debug are secondary technical surfaces.
- Character cards are dossiers and scene-aware sheets, not raw record dumps.

## Marinara Reference Rule

Use Marinara as a flow reference, not a skin.

Keep only elements that answer a WorldForge player question or support a WorldForge mechanic:

- full-scene background: "where am I?"
- bottom narration box: "what just happened?"
- Next/Auto/Log: "how do I read at a playable pace?"
- party portraits/chips: "who is with me?"
- map/inventory/journal widgets: "what game objects can I inspect?"
- GM/party/action address modes: "who am I speaking to or acting through?"
- choices/QTE/dice beats: "when is the world asking for a decision under pressure?"
- text/screen effects: "what changed emotionally or fictionally?"

Do not copy Marinara's exact chrome, spacing, or widget set. Improve it.

## Required Product Surfaces

Cover the whole product map, not only `/game`:

- Campaign Library
- Campaign Seed
- World DNA
- Worldgen Progress
- World Review
- Character Add/Import
- Pre-play Character Card
- Live Play
- In-play Character Card
- Inventory
- Log
- Journal/Records
- Map/World Drawer
- Settings
- Debug/Inspect

For each surface, name:

- player question answered
- primary UI elements
- entry points
- exit paths
- state that must persist
- what must stay hidden by default

## Live Play Target

The `/game` prototype must pass these checks:

1. It looks like a game/VN within five seconds.
2. The current place is visually legible before reading the paragraph.
3. Visible/interactable actors are distinct from same-area or off-screen actors.
4. The latest text is staged as beats, not a scrollback wall.
5. The input feels attached to the current scene.
6. Raw debug, Oracle math, JSON, and full lore are hidden by default.
7. Log, inventory, journal, map, and character cards open as overlays/drawers without losing the input draft.
8. At least one presentation event exists: speaker callout, dice beat, QTE/choice, text effect, fade, flash, or weather/time transition.

## Output Expected

Produce an implementation-ready design package:

1. Screen map and navigation topology.
2. Visual language direction for live play and setup/review.
3. Component inventory for the live play surface.
4. Component inventory for setup, review, character, and settings surfaces.
5. Presentation-event model: beat segmentation, Next/Auto/Log, effects, dice/QTE/choice display.
6. Acceptance gates for Phase 77 implementation.
7. Risks and explicit non-goals.

If making HTML, include at least:

- live play default scene
- live play with choice/dice beat
- log/inventory/journal drawer state
- campaign library or setup screen
- character card state

## Non-Goals

- Do not implement backend changes.
- Do not redesign model/provider settings in detail unless needed for navigation.
- Do not expose debug panels by default.
- Do not solve every future feature. Design the playable vertical slice and its supporting surfaces.
