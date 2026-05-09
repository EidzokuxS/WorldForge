# Phase 81 RESEARCH - Architecture Decision Synthesis

## Inputs

- `docs/gm-turn-architecture-review-2026-05-03.md`
- Phase 78 GM-first orchestration artifacts.
- Phase 79 model-facing scene/tool grounding artifacts.
- Phase 80 forecast/BeatPlan artifacts.
- Live recovery evidence from 2026-05-03 playtests.

## Findings

### Current split is too fragmented

`world-brain`, `gm-turn-decision`, and `scene-planner` each reason over the same turn. The split protects backend authority, but it also forces overlapping model calls and makes it hard to answer why any one action exists.

### BeatPlan was the wrong center

BeatPlan's useful pieces were pacing/reveal/agency. Its harmful piece was acting like another mandatory structured gate while duplicating tool posture from GM decision. It is not the requested GM turn plan.

### Full sequential loop is not always justified

External review disagreed on whether every mutating turn should be an agentic tool loop. The synthesis is conditional: direct/continue/clarification skip action planning; mutating/combat turns use checklist plus small validated tool steps.

### Backend authority remains correct

The existing SceneFrame, model-facing packet, tool grounding, validator, executor, rollback, and narrator packet concepts are valuable. Phase 81 should reorganize responsibilities, not discard backend safety.

## Recommended Architecture

Use a compact GM Read as the central interpretive stage. Remove concrete tool payloads from this stage. Use a checklist only when consequences need execution. Execute each needed tool as a small validated step so failures can be revised/skipped without requiring a giant repair of the whole turn.

## Open Risks

- LLM latency can grow if the step loop is overused.
- Schema churn can break many tests unless migration is phased.
- Existing dirty worktree contains Phase 79/80 changes; plan execution must keep ownership tight.
- Provider tool-calling capabilities vary, so the first implementation should work through existing `safeGenerateObject` contracts before provider-native tool use is required.
