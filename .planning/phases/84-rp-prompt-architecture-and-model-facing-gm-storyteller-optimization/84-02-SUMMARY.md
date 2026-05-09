# Phase 84-02 Summary - Compact Role-Specific Prompt Contracts

Status: Implemented
Date: 2026-05-05

## Goal

Make the model-facing jobs clearer without turning the GM into a backend form filler.

## Implemented Changes

### GM Read

File: `backend/src/engine/prompt-contracts.ts`

- Added a single beat anchor rule: `sceneQuestion` is the immediate playable pressure for the turn.
- Clarified that direct/continue NPC guidance must obey NPC knowledge bounds.
- Added "world is not waiting" pressure for passive/probing/delaying actions.
- Clarified forecast use: advisory pressure may become local observable signals, but it never expands legal refs or scripts outcomes.
- Kept GM Read free of tool payloads and state deltas.

### GM Action Checklist

File: `backend/src/engine/prompt-contracts.ts`

- Explicitly marked it as not a second GM and not the normal native tool-loop path.
- Required it to preserve the same GM Read beat anchor if an orchestrator explicitly asks for a checklist.
- Kept the fewer-steps-better rule.

### GM Tool Loop

File: `backend/src/engine/gm-tool-loop.ts`

- Renamed the model-facing job in prompt text from generic action agent toward runtime executor.
- Added a rule that the loop executes only concrete backend work for the GM Read beat anchor.
- Added stop discipline: once backend observations are enough for final narration, do not keep probing tools for prose.
- Added forecast discipline: scoped forecast is advisory only and cannot expand refs or script outcomes.
- Added runtime enforcement: if one assistant step contains multiple runtime tool calls, the turn fails visibly with a clear error. This protects the one-tool-result-observe-next-tool loop.

### Final Narrator

Files:

- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/prompt-assembler.ts`

Changes:

- First sentence must add new pressure, a visible reaction, or a fresh scene fact, not recap the player.
- Present NPCs that matter to the beat should get one concrete line, gesture, decision, or refusal when packet/current-scene facts support it.
- Final narration remains prose only and cannot invent material events, access, items, consent, or location changes.

### Forecast Builder

File: `backend/src/engine/world-forecast-builder.ts`

- Forecast is now described as a constraint, not a script.
- Prompt asks what pressure likely presses on the current scene if nobody changes course.
- `advisorySignals` are explicitly perceptual hooks, not hidden truth leaks.

## Tests Added or Updated

- `gm-turn-read.test.ts`: GM Read contract includes beat anchor, knowledge bounds, no tool payloads.
- `gm-action-checklist.test.ts`: checklist is explicit compact consequence plan, not second GM.
- `gm-tool-loop.test.ts`: prompt includes beat-anchor/stop/forecast discipline and rejects multiple tool calls in one assistant step.
- `storyteller-contract.test.ts`: final visible RP rules include no-recap first sentence and concrete NPC beat.
- `prompt-assembler.test.ts`: final prompt includes the same RP beat directive.
- `world-forecast-builder.test.ts`: forecast prompt forbids scripts and asks for perceptual signals.

## Non-Goals

- Did not wire `runGmActionChecklist` into normal player turns.
- Did not add a new monolithic prompt.
- Did not change backend schemas or persistence shape.
- Did not disable any GM tools.
