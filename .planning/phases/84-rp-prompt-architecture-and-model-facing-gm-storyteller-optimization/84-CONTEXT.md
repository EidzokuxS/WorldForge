# Phase 84 Context: RP Prompt Architecture and Model-Facing GM/Storyteller Optimization

## User Request

After the dynamic location/support-NPC work, add a dedicated phase to fix WorldForge's prompts as a roleplaying game system, not merely as JSON/schema instructions.

The user explicitly called out the risk that current prompts are poor for RP because they may overconstrain models, fail to explain the actual GM task, mix backend responsibilities into model-facing prose, and rely on huge prompt blocks instead of clear staged jobs. The target is a playable LLM GM inside WorldForge's deterministic rulebook, not a Marinara clone and not another backend-owned semantic layer.

## Scope

- Research current WorldForge gameplay prompt surfaces before editing them.
- Parse local SillyTavern-style preset JSON from `X:\Models\templates`.
- Inspect only active prompt blocks, resolving activity via `prompt_order[].order[].enabled`.
- Exclude Megumin variants from the sampled corpus per user instruction.
- Ignore regex/script-only files unless they are directly relevant to prompt assembly mechanics.
- Study Marinara/RP/VN prompt and presentation references for design function, not copy-paste.
- Consult available AI/CLI reviewers before implementation: AIT/Claude Code, Gemini, OpenCode, CloudCode-compatible references, Cursor Agent, and internal subagents where useful.
- Preserve WorldForge's boundary: LLM is GM/storyteller; backend is rulebook, validator, persistence, rollback, and world truth.

## Initial Local Corpus Candidates

Preflight on 2026-05-05 found these recent non-Megumin candidates worth sampling:

- `Stabs-GLM5.1-Directives-v2.63.json`
- `Freaky Frankenstein 4 MAX.json`
- `FreaKy FranKIMstein - SwanSong.json`
- `[🐱][🐾²] Purrfect Logic.json`
- `Marinara's Spaghetti Recipe (1).json`
- `NemoEngine Lite - Grand Update R3 - Claude.json`
- `Lucid Loom v3.3.json`
- `Poppet 1.9.2.json`
- `RE (´｡• ᵕ •｡`) Celia V5.4.json`
- `🪞✧˖°. The H.T. Files - Paramnesia V.3 .°˖✧🪞.json`

This list is a starting point, not the final corpus. The Phase 84 research plan should deduplicate by preset family/version and may substitute a named user candidate if it is more relevant than a merely recent file.

## Initial External Reference Lanes

- SillyTavern prompt and prompt-manager docs for prompt ordering, system/main prompt roles, and enabled prompt assembly.
- Marinara Engine and Marinara LLM Hub for RP engine/preset inspiration.
- Ren'Py dialogue documentation and VN writing references for dialogue pacing, visible speaker flow, and digestible scene beats.
- Current Reddit/SillyTavern RP prompt discussions for lived model-specific tuning patterns, treated as anecdotal evidence and cross-checked before implementation.

## Non-Goals

- Do not copy Marinara architecture wholesale.
- Do not turn the GM into one giant all-in-one prompt or schema.
- Do not treat disabled preset prompts as evidence.
- Do not make prompt quality fixes by only tightening Zod schemas.
- Do not let the LLM write authoritative state directly; executable changes still go through backend tools.
- Do not add turn-duration caps as a substitute for prompt/runtime clarity.

## Requirements Draft

- P84-R1: Current WorldForge prompt inventory identifies all GM/storyteller/player-turn prompt surfaces and their runtime owners.
- P84-R2: Local preset corpus extractor reads active prompt blocks only and records source/order/role metadata without leaking secrets.
- P84-R3: Research synthesis separates useful prompt functions from style cargo cult, with evidence from local presets and external references.
- P84-R4: Cross-AI review critiques the target prompt architecture before implementation.
- P84-R5: Prompt architecture assigns one clear job per model call: GM read, optional forecast/pressure, action checklist, tool step, narrator packet, final narration, repair, or worldgen/character specialty.
- P84-R6: Final prompts are compact, concrete, and role-specific; they explain what the model should do in RP terms while keeping backend-owned facts/tools explicit.
- P84-R7: Executable state changes remain backend-validated tool calls with refs and observations; narration remains settled-truth rendering.
- P84-R8: Verification includes prompt snapshot tests, malformed/disabled prompt regression tests, model/provider smoke where possible, and Playwright live-play evidence.
- P84-R9: Subjective play-quality acceptance uses a rubric for scene continuity, character voice, dialogue pacing, player agency, concrete consequences, and absence of generic AI prose.
- P84-R10: Closeout includes multi-branch exploratory playtests, not one linear happy path: at least three fresh campaigns or materially different saved branches, different player styles, divergent choices, refusal/probe/side-route actions, dynamic-location/support-NPC opportunities, and an explicit "would I keep playing?" player-feel assessment.

## Playtest Closeout Contract

After implementation and deterministic verification, Phase 84 cannot close on a single scripted line. The closeout must run Playwright-driven live playtests as if the tester were a real player:

- Start or fork multiple campaigns with different premises/settings, not just the latest known-good seed.
- For each campaign or branch, play enough turns to observe continuity, pacing, NPC behavior, tool use, and consequences.
- Use different player postures: cooperative goal pursuit, social probing, cautious observation, side-route exploration, bad assumptions, and direct pressure on NPC/location consistency.
- Intentionally branch from at least one checkpoint or retry point to see whether the GM adapts instead of replaying the same rail.
- Record screenshots/logs plus subjective notes: what felt alive, what felt fake, where the model drifted, whether NPCs had agency, and whether the next action felt inviting.
- Treat "the code worked" as insufficient. The gate is passed only if the game feels coherent and interesting enough that a player would plausibly want another turn.

## Planning Note

Phase 83 already exists for the full visual migration. Phase 84 is queued as a separate integer phase so existing roadmap numbering is not silently rewritten. If prompt quality becomes the next blocking concern before visual migration, this phase can be pulled forward explicitly during GSD planning.
