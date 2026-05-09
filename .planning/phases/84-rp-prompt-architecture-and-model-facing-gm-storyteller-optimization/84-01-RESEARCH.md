# Phase 84-01 Research - RP Prompt Surface and Agentic Tool Calls

Status: Complete
Date: 2026-05-05

## Verdict

The current critical turn path is directionally correct:

`Forecast Builder -> GM Read -> optional Oracle -> native AI SDK GM Tool Loop -> backend NarratorPacket -> Final Narrator`

The fix is not another monolithic GM schema. The fix is clearer role boundaries, compact RP rules, native observed tool loops, and deterministic tests that prevent drift.

## Current Prompt Surface Inventory

Active runtime surfaces:

- `backend/src/engine/world-forecast-builder.ts`: advisory pressure only. No narration, no tool payloads, no state deltas.
- `backend/src/engine/gm-turn-read.ts` plus `prompt-contracts.ts`: GM interprets player action, chooses path, identifies the beat. No tool payloads.
- `backend/src/engine/oracle.ts`: resolves one uncertainty. It must not create inventory, authority, access, or missing world facts.
- `backend/src/engine/gm-tool-loop.ts`: native AI SDK runtime tools, filtered to `SceneFrame.allowedTools`, observed step by step.
- `backend/src/engine/narrator-packet.ts`: backend-built committed packet for visible truth.
- `backend/src/engine/prompt-assembler.ts` and `storyteller-contract.ts`: final visible prose from settled packet/scene facts.

Legacy or non-critical surfaces still present:

- `gm-turn-decision.ts`, `scene-planner.ts`, `gm-beat-plan.ts`, `gm-action-checklist.ts`, `gm-tool-step.ts`.
- These are useful historical/reference surfaces, but normal Phase 82+ player turns must not quietly route through them unless explicitly chosen. The current tests already assert the main order uses GM Read, optional Oracle, GM Tool Loop, NarratorPacket, and final narration.

## Active RP Preset Corpus

Read source: `X:\Models\templates`.

Parsing rule: use `prompt_order[].order[].enabled` as the active source of truth. Do not read every top-level prompt block as active instruction.

Selected active corpus:

| Preset | Active prompts | Useful patterns |
|---|---:|---|
| Stabs GLM 5.1 Directives | 58/88 | role clarity, perspective, continuity, dialogue, state discipline |
| Freaky Frankenstein 4 MAX | 26/42 | dynamic simulation, challenge, NPC genesis, dialogue drive |
| Purrfect Logic | 22/32 | grounded realism, life-not-plot, character psychology |
| Marinara Spaghetti | 63/79 | modular prompt switches and compact role/lore/task blocks |
| NemoEngine Lite R3 Claude | 64/105 | prose modules, context ordering, anti-repeat |
| Lucid Loom 3.3 | 114/316 | many RP modules, useful as caution for bloat |
| Poppet 1.9.2 | 42/56 | player agency, material reality, flowing dialogue |
| Celia 5.4 | 64/153 | immersion, natural tone, anti-modelisms |

Adopted patterns:

- Player agency: never speak, decide, feel, consent, or succeed for the player unless settled truth confirms it.
- NPC knowledge bounds: NPCs act from what they perceive or reasonably know, not global metadata.
- World not waiting: passive/probing player actions still allow local pressure and NPC motives to move.
- One playable beat: respond with a concrete scene change and return control.
- No recap: do not spend the opening on paraphrasing the player.
- Concrete NPC performance: speech, gesture, hesitation, refusal, interruption, body language.
- Modular assembly: short role-specific sections beat one giant preset stack.

Rejected patterns:

- Kitchen-sink 50k-220k character prompt piles.
- Visible or hidden chain-of-thought forcing.
- SillyTavern macro/toggle cargo cult.
- Huge banned-phrase walls.
- Visible ledgers/HTML trackers in narrative output.
- Persona mysticism, threats, jailbreak framing, or NSFW bypass material.
- Unvalidated offscreen randomness.

## External References

- AI SDK tool calling docs: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK `stepCountIs`: https://ai-sdk.dev/docs/reference/ai-sdk-core/step-count-is
- SillyTavern Prompt Manager docs: https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Prompts/prompt-manager.md
- Ren'Py dialogue and narration docs: https://www.renpy.org/doc/html/dialogue.html
- PocketFlow core abstraction: https://the-pocket.github.io/PocketFlow/
- Hermes Agent reference: https://github.com/NousResearch/hermes-agent
- User-supplied Claude Code archaeology links were treated as non-authoritative architecture examples, not as implementation targets.

Source implications:

- AI SDK supports multi-step tool execution with tool results feeding the next generation through `stopWhen`/`stepCountIs`. WorldForge should use that native loop instead of forcing a duplicate JSON checklist in the hot path.
- PocketFlow reinforces the model of small nodes and labeled transitions. WorldForge maps that to role-specific calls, not one large call.
- Hermes reinforces persistent tools, skills, and observations, but not model-owned backend truth.
- Ren'Py reminds the final visible layer that dialogue/narration are presentation beats, not backend state mutation.

## Cross-AI Review

Internal agents:

- Prompt surface inventory: active runtime split is mostly good; risk is mixed `GM/Judge/backend planner` language across surfaces.
- RP preset corpus: use agency, knowledge bounds, one-beat pacing, NPC autonomy; reject prompt piles and macros.
- Architecture review: do not add checklist + beat plan + native tools all active on one turn.

External CLI review:

- Gemini returned useful critique despite later capacity noise. Recommendation: abolish duplicate JSON checklist in normal path, enforce one playable beat, lock agency and NPC knowledge, make world pressure active, prefer concrete dialogue.
- Cursor Agent returned read-only review. Recommendation: one shared beat anchor, forecast as perceptual pressure, NPC concrete response, knowledge bounds for direct/continue, first sentence no recap.
- Claude CLI returned read-only plan-mode critique. Recommendation: protect against dual-brain leakage, keep forecast constraints not scripts, give tool loop a close-out discipline, avoid omniscient NPC context, structurally enforce one playable beat.
- OpenCode CLI started but timed out without usable output. Command syntax was corrected; timeout remains recorded as unavailable evidence, not a design blocker.

## Accepted Architecture

Keep:

- Forecast as advisory pressure.
- GM Read as scene interpretation and path choice.
- Oracle as one bounded uncertainty.
- Native tool loop as observed backend mutation executor.
- NarratorPacket as backend truth.
- Final Narrator as prose only.

Do not add:

- A new always-on Action Checklist before native tools.
- A single prompt that plans, mutates, and narrates.
- RP preset cargo cult or huge static instruction stacks.
