# Phase 81 SPEC - GM Turn Orchestration Loop

## Product Promise

Each player turn should feel like a GM understood the world, chose a coherent response, applied legal consequences, and narrated what actually happened. The player should not experience a backend pipeline pretending to be a GM.

## Runtime Contract

The target turn flow is:

```text
SceneFrame + scoped forecast
-> GM Read
-> optional Oracle
-> optional GM Action Checklist
-> validated tool-step execution
-> settled narrator packet
-> final narration
```

## Stage Boundaries

- Frame/forecast: backend-owned context envelope.
- GM Read: LLM-owned interpretation and path choice, no concrete tools.
- Oracle: binding uncertainty only when requested.
- Action Checklist: LLM-owned consequence checklist for mutating/combat turns; may include bounded candidate tool requests for happy-path execution.
- Tool Step Execution: backend validates each candidate request sequentially; failed requests get one step-level revision attempt, then skip/abort that step.
- Settled Packet: backend-owned player-visible truth boundary.
- Narration: LLM-owned prose, no new consequences.

## Non-Negotiables

- No monolithic "do everything" GM JSON.
- No `gm-beat-plan` as a hard live gate.
- No backend semantic pre-pass over raw player prose.
- No model-owned persistence or direct state mutation.
- No narration from planned-but-failed effects.
- No duration caps as gameplay correctness.

## Bounds

- GM Read target: compact object, no more than 12 top-level fields.
- Action Checklist max: 6 items.
- Total candidate tool requests per turn: 8.
- Per-step revision attempts after validation failure: 1.
- Tool-step loop uses existing `safeGenerateObject` structured contracts in Phase 81; provider-native tool calling is deferred.

## SSE Stage Taxonomy

- `gm-read`: GM reads the scene and chooses path.
- `oracle`: backend resolves requested uncertainty.
- `gm-action-checklist`: GM drafts mutating/combat checklist.
- `tool-step`: backend validates/applies one checklist step.
- `settled-packet`: backend builds narrator-safe settled truth.
- `final-narration`: narrator writes visible prose.

Direct, continue, and clarification paths must not emit `gm-action-checklist` or `tool-step`.

## Rollback And Settlement

Successful tool steps are settled for the turn. If a later checklist step fails validation after its revision budget, that step is skipped or the remaining branch is aborted; earlier successful steps are not described as provisional. Catastrophic route/runtime failures still use the existing route-level snapshot rollback.

## Completion Definition

Phase 81 is complete only when deterministic tests and a fresh-campaign live playtest both prove the new loop. The live playtest must cover direct, clarification, oracle, single-tool mutation, multi-step mutation, and rejected/revised/skipped tool behavior.
