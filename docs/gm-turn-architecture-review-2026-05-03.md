# GM Turn Architecture Review - 2026-05-03

## Problem

The target is not "more structured output". The target is a playable solo RPG loop where the LLM behaves as GM and the backend behaves as rulebook, validator, and persistence.

Current runtime pieces are useful but fragmented:

- `world-forecast-builder`: advisory no-intervention pressure.
- `world-brain`: scene direction/focal actors.
- `gm-turn-decision`: path router and sometimes tool proposal.
- `scene-planner`: concrete planned actions/responses/hooks.
- `scene-plan-executor`: validated mutation.
- narrator: prose from settled truth.
- `gm-beat-plan`: removed from live critical path; it was beat guidance, not the requested GM turn plan.

The core gap: there is no auditable GM turn center that can answer "why is this action here?" without pointing to several overlapping schemas.

## External Review Synthesis

Gemini recommended merging `gm-turn-decision` and `scene-planner` into an agentic tool loop, because static two-stage planning makes the model decide tools twice.

Claude recommended merging `world-brain` and `gm-turn-decision`, removing `plannedTools` from the decision stage, skipping `scene-planner` for direct/continue/clarification, and not adopting a full sequential tool loop until a concrete need justifies the extra latency.

OpenCode agreed the current pipeline has useful safety boundaries, but called out dead/duplicated surfaces: `gm-beat-plan`, repeated model-facing packet construction, scattered forbidden-term handling, and `toolPosture` duplication.

Resolution: do not create one giant GM schema, and do not run a full tool loop for every trivial turn. Build a hybrid GM orchestration model: one compact GM read, conditional action checklist, then small validated tool steps only when mutation is needed.

## Target Architecture

### Stage 0: Frame And Forecast Envelope

Responsibility: deterministic `SceneFrame`, allowed refs/tools, current scene, recent local facts, and scoped forecast excerpt.

Why it exists: this is the backend truth boundary. The GM cannot legally act outside this envelope.

Must not do: interpret player prose, choose consequences, or mutate world.

Failure behavior: hard route error for missing campaign/player state; empty forecast if forecast generation fails.

Verification: snapshot tests for scene frame refs, allowed tools, private/offscreen forecast scoping.

### Stage 1: GM Read

Responsibility: one compact LLM read of the turn: situation, focal actors, live scene question, player action interpretation, decision path, evidence refs, and turn intent.

Replaces/merges: player-turn `world-brain` plus `gm-turn-decision` path routing.

Why it exists: the GM needs one place to say what this turn is about before any tool planning.

Must not do: emit concrete tool payloads, planned mutations, prose narration, or backend-owned deltas.

Failure behavior: repair once; if still invalid, safe clarification/continue with no mutation.

Verification: fixture tests for path choice, focal actor grounding, forbidden ref rejection, and zero concrete tools in GM Read.

### Stage 2: Oracle

Responsibility: resolve uncertainty only when GM Read selects `roll_oracle`.

Why it exists: random/uncertain outcomes need a binding result before consequences are planned.

Must not do: run on direct/tool/combat/clarification turns or request a second outcome for the same uncertainty.

Failure behavior: conservative miss/uncertain result with no hidden mutation.

Verification: path-not-oracle means zero oracle call; oracle outcome appears in later action/narration packet.

### Stage 3: GM Action Checklist

Responsibility: for mutating/combat turns only, create a short checklist of intended consequences.

Shape: step id, purpose, evidence refs, expected visible effect, dependency, and whether the step needs a backend tool/oracle/skip.

Why it exists: this is the auditable answer to "why is this action here?"

Must not do: include executable tool input payloads or write narration.

Failure behavior: if checklist fails, downgrade to no-mutation narration or clarification; do not roll back already settled truth.

Verification: direct/continue/clarification skip this stage; mutating turns produce bounded checklist with evidence refs and no tool payloads.

### Stage 4: Tool Step Execution Loop

Responsibility: execute checklist items as small validated steps. For each tool-needed item, the GM produces one concrete backend tool request; backend validates/applies; result is fed back; item becomes done/skipped/revised.

Why it exists: avoids one giant all-tools JSON and makes every mutation inspectable.

Must not do: let the model mutate state directly or continue after repeated illegal tool requests without marking the step failed/skipped.

Failure behavior: per-step validation error is returned to GM once for revision; repeated failure skips that step or aborts the mutating branch. Use max step/attempt count, not turn-duration caps.

Verification: tests where first tool request is rejected and GM revises/skips; executed checklist matches DB changes; failed steps are not narrated as happened.

### Stage 5: Settled Turn Packet

Responsibility: collect successful tool results, skipped/failed step reasons, visible facts, and private guards into a narrator packet.

Why it exists: narrator must see settled truth, not planned-but-failed intent.

Must not do: invent prose, mutate state, or expose private forecast terms.

Failure behavior: minimal safe packet from player action and visible current scene.

Verification: failed tool fixture proves narrator packet excludes failed effect.

### Stage 6: Narration

Responsibility: produce player-facing prose from settled packet plus GM Read intent/guardrails.

Why it exists: creative presentation is separate from state authority.

Must not do: call tools, decide new consequences, reveal hidden/private facts, or contradict tool results.

Failure behavior: stream error/fallback summary from settled packet.

Verification: live playtest and guard tests: no private terms, no unexecuted effects, visible consequences included.

## What To Remove Or Merge

- Remove `gm-beat-plan` from live critical path permanently unless it returns as optional telemetry.
- Remove `plannedTools` from `GM Turn Decision`; tool payloads belong to tool-step execution, not the read/path stage.
- Merge player-turn `world-brain` and `gm-turn-decision` into `GM Read`.
- Skip ScenePlanner/action planning for direct, continue, and clarification turns.
- Replace current always-on ScenePlanner with conditional checklist + tool-step loop for mutating/combat turns.
- Centralize model-facing packet, recent conversation filtering, and forbidden/private term handling.

## GSD Execution Plan

1. Spec the `GM Read` contract and prove it covers current `world-brain` plus path decision without tool payloads.
2. Refactor turn flow to skip action planning on direct/continue/clarification.
3. Add `GM Action Checklist` for mutating/combat turns.
4. Add one-step backend tool request/validation/result feedback loop.
5. Build settled turn packet from executed results, not planned intent.
6. Update narrator prompt to consume settled packet plus compact GM Read.
7. Verify with deterministic tests and fresh-campaign live playtest.

## Playability Gate

The phase is not complete until a fresh campaign can run opening plus at least 10 live turns, including:

- direct narration turn,
- clarification turn,
- oracle turn,
- single-tool mutation,
- multi-step mutation,
- rejected/revised tool step,
- failed/skipped step not appearing in narration,
- no offscreen/private refs leaking into visible play.
