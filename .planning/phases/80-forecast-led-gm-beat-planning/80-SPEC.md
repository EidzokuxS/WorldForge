# Phase 80 Spec

## Requirements

### P80-R1 Forecast Contract

Define a bounded `WorldTrajectoryForecast` contract that stores GM advisory expectations without mutating world state. It must include horizon, base tick/time, scoped subjects, pressure summaries, preconditions, invalidation refs, confidence, and player-facing eligibility.

Acceptance:

- forecast schema validates caps and refs;
- forecast fields cannot carry executable state deltas;
- forecast can be serialized/restored through campaign state or an equivalent local campaign artifact.

### P80-R2 Forecast Builder And Invalidation

Add a forecast builder/refresher that derives from durable facts: current scene, actor/faction goals, relationships, durable chronicle/location events, and recent successful tool effects. It must not treat scene-local transient text as durable pressure.

Acceptance:

- durable events invalidate or refresh affected forecast entries;
- scene-local `log_event` does not create or invalidate long-horizon forecast pressure;
- failed turns do not persist forecast refreshes.

### P80-R3 Scoped Forecast Excerpt

Expose only a prompt-safe forecast excerpt to local GM planning. Remote/private/offscreen entries are omitted, anonymized, or summarized only when player-known/local relevance allows it.

Acceptance:

- a remote Forest Outpost-style forecast cannot leak into a Shibuya beat prompt;
- player-known hints can appear only as hints, not as omniscient private facts;
- final narration never receives private forecast internals.

### P80-R4 Per-Turn Beat Plan

Add `runGmBeatPlanner` between GM turn decision and ScenePlanner/final narration. The BeatPlan must explain the current beat intent, reveal budget, local focus, pacing/tension posture, forecast influence refs, and justified tool posture.

Acceptance:

- every normal `/action` turn creates a BeatPlan before tools or final narration;
- BeatPlan is advisory and cannot contain DB mutations;
- direct/no-roll turns still receive a non-mutating beat plan for narration guidance.

### P80-R5 ScenePlan Integration

ScenePlanner may use the BeatPlan as intent/context, but backend validation and execution remain authoritative. Forecast refs do not become legal runtime refs unless they are grounded by Phase 79 context.

Acceptance:

- ScenePlanner cannot execute forecast-only actor/location/item refs;
- runtime tools still prevalidate against the tool execution context;
- illegal plans fail atomically before mutation.

### P80-R6 Narrator Packet Integration

Final narration receives a settled, player-facing beat packet describing what the player should experience now. It must not receive private forecast notes, hidden offscreen plans, or backend-only diagnostics.

Acceptance:

- final prompt includes beat intent/reveal guidance only in player-facing terms;
- final prompt excludes private forecast internals;
- focused prompt tests prove no remote forecast leakage.

## Non-Requirements

- No new UI is required in Phase 80.
- No full autonomous NPC simulation rewrite is required.
- No direct LLM write access to DB or campaign files.
- No live provider conformance gate beyond existing backend tests unless a plan explicitly adds an opt-in smoke.

## Verification Strategy

- Unit tests for forecast/beat schemas and advisory-only constraints.
- Prompt tests for scoped forecast excerpts and final narration packet boundaries.
- Turn-processor tests for ordering: GM decision -> BeatPlan -> ScenePlan/tool execution -> NarratorPacket.
- Rollback tests proving failed turns do not persist forecast refreshes.
- Focused backend typecheck and Phase 80 touched engine suite.
