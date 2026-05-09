# Phase 81 Context - GM Turn Orchestration Loop and Settled Tool Execution

## Why This Phase Exists

Phase 80 attempted to make GM turns planful through forecasts and a per-turn BeatPlan. The forecast layer is useful, but the BeatPlan became the wrong center of gravity: it was advisory beat guidance with duplicated tool posture, not the requested GM turn plan. The live recovery removed BeatPlan from the critical path to keep turns playable.

The product goal remains: the LLM should act like a GM, while the backend remains rulebook, validator, and persistence. The runtime must be explainable at any random step: why the step exists, what responsibility it owns, what it must not do, and how failure is handled.

## Source Review

Primary design synthesis:

- `docs/gm-turn-architecture-review-2026-05-03.md`

External review summary:

- Gemini favored merging decision/planner into an agentic tool loop.
- Claude favored merging world-brain/decision, removing concrete tools from decision, and keeping action planning conditional.
- OpenCode favored preserving deterministic safety boundaries while removing duplicated/dead surfaces.

Accepted synthesis after cross-AI review: not one giant GM schema, and not a full sequential LLM loop for every tool on the happy path. Use a hybrid model: compact GM Read, conditional Action Checklist for mutating/combat turns, bounded candidate tool requests inside checklist items when useful, backend-validated sequential step execution, per-step revision only when validation fails, and narration from settled truth.

## Phase Goal

Replace the fragmented player-turn GM runtime with an inspectable orchestration loop:

1. Build deterministic frame and scoped forecast envelope.
2. Run one compact GM Read for player-turn scene interpretation and path choice.
3. Run Oracle only when GM Read asks for uncertainty.
4. Skip action planning for direct, continue, and clarification paths.
5. For mutating/combat paths, create a bounded GM Action Checklist with evidence, purpose, dependency, and optional candidate tool request per step.
6. Execute each candidate mutation sequentially through backend validation with feedback and explicit done/skipped/revised/aborted status. If a candidate tool request fails validation, revise only that step once; do not repair the whole checklist.
7. Build narrator input only from settled post-execution truth plus compact GM Read guardrails.
8. Prove playability through real live turns, not only schema tests.

## Requirements

- P81-R1: Player-turn `world-brain` and `gm-turn-decision` responsibilities are merged or otherwise consolidated into one GM Read stage with no concrete tool payloads.
- P81-R2: `GM Read` explains the turn's situation, focal actors, scene question, player action interpretation, path, rationale, and evidence refs.
- P81-R3: Direct, continue, and clarification turns skip ScenePlanner/action planning and cannot produce planned world mutations.
- P81-R4: Mutating/combat turns produce an auditable Action Checklist before tool execution; checklist items include purpose/evidence/dependency/status and may include bounded candidate tool requests, but backend treats them as untrusted until per-step validation succeeds.
- P81-R5: Tool mutations execute through small validated steps with backend authority over refs, inputs, persistence, rollback, and final truth; per-step revision is allowed only after validation failure.
- P81-R6: Failed or skipped tool steps do not appear in final narration as completed effects.
- P81-R7: Narration consumes settled post-execution truth and compact GM guardrails, never planned-but-unexecuted intent or private forecast terms.
- P81-R8: Fresh-campaign live playtest proves opening plus at least 10 turns, including direct, clarification, oracle, single-tool mutation, multi-step mutation, and rejected/revised/skipped tool behavior.

## Anti-Goals

- Do not restore `gm-beat-plan` as a hard live gate.
- Do not create one giant all-in-one GM JSON that plans, mutates, and narrates everything at once.
- Do not let backend pre-interpret raw player prose semantically.
- Do not let LLM mutate world state outside backend tools.
- Do not add turn-duration caps as a gameplay fix.
- Do not count tests as sufficient if the game remains unplayable.

## Verification Standard

This phase is complete only when code verification and live play verification both pass. The live gate must use a fresh non-reused campaign and record the campaign id, actions, turn stages, tool outcomes, and any rejected/skipped tool steps.
