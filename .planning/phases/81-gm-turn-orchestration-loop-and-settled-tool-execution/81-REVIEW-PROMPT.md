# Cross-AI Plan Review Request - Phase 81

You are reviewing implementation plans for WorldForge, a solo RPG where the LLM should behave as GM and the backend should behave as rulebook, validator, rollback, and persistence authority.

## Current Problem

The previous implementation fragmented GM behavior across `world-brain`, `gm-turn-decision`, `scene-planner`, executor, narrator, and a removed `gm-beat-plan`. The user explicitly does not want one giant all-in-one GM JSON. They also do not want backend semantic pre-interpretation of raw player prose. The goal is playable GM behavior, not just passing schemas.

## Proposed Phase 81 Architecture

```text
SceneFrame + scoped forecast
-> compact GM Read
-> optional Oracle
-> conditional GM Action Checklist for mutating/combat turns
-> small backend-validated tool steps
-> settled narrator packet
-> narration from settled truth
```

Direct, continue, and clarification turns should skip action planning and cannot mutate world state. Mutating/combat turns should use an auditable checklist, but checklist items cannot contain executable tool payloads. Tool execution should be small-step, backend-validated, and marked done/skipped/revised.

## Files To Review

- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-CONTEXT.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-SPEC.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-RESEARCH.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-PATTERNS.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-VALIDATION.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-01-PLAN.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-02-PLAN.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-03-PLAN.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-04-PLAN.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-05-PLAN.md`
- `.planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution/81-06-PLAN.md`
- `docs/gm-turn-architecture-review-2026-05-03.md`

## Review Instructions

Provide structured feedback:

1. Summary verdict: PASS / FLAG / BLOCK.
2. Strengths.
3. Concerns with severity HIGH/MEDIUM/LOW.
4. Specific amendments needed before execution.
5. Whether the architecture avoids both failure modes:
   - one giant all-in-one GM schema;
   - a backend pipeline that steals the GM role from the LLM.
6. Whether verification is strong enough to prove playability.

Be critical. If a stage exists, ask whether it has a unique responsibility. If it duplicates another stage, say so. If a plan is too vague to execute safely, mark it.
