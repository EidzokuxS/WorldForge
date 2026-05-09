# Phase 80 Implementation Patterns

## Pattern 1: Forecast Is Advisory GM Memory

Forecasts describe likely pressure and trajectory. They are not facts, not actions, and not permissions.

Allowed:

- likely pressure;
- involved subject refs;
- horizon and confidence;
- preconditions;
- player-facing eligibility;
- invalidation refs.

Forbidden:

- direct HP/location/inventory/stat changes;
- runtime tool payloads;
- durable event text;
- private omniscient facts in player-facing fields.

## Pattern 2: BeatPlan Is The Human GM's Current Beat Note

BeatPlan answers:

- what is this beat trying to do;
- why now;
- what is locally in focus;
- what may be revealed, withheld, or hinted;
- whether the turn is pure narration, roll, tool plan, clarification, or combat transition;
- which tool posture is justified.

It does not execute anything. ScenePlan remains the executable proposal and backend validation/execution remain the authority.

## Pattern 3: Scope Before Prompt

A broad forecast artifact may contain remote/offscreen pressures. A local prompt may not.

Use this order:

1. Build authoritative local `SceneFrame`.
2. Build model-facing scene packet.
3. Scope forecast entries to local/player-known refs.
4. Apply model-facing prompt safety as defense in depth.
5. Format only the scoped excerpt for GM/BeatPlan/ScenePlanner.

Never dump the whole forecast into a prompt and rely on the model to ignore private facts.

## Pattern 4: Stage Forecast Writes Until Commit Is Safe

Forecast refresh can happen during the turn, but persistence must be rollback-safe.

Use one of these safe shapes:

- forecast updates are written inside storage already covered by the route snapshot; or
- forecast updates are staged in memory and committed only after state-changing turn work succeeds.

Failed turns must not leave behind a forecast that assumes a failed future happened.

## Pattern 5: Narration Receives Settled Player-Facing Beat Notes

The storyteller should receive local scene truth and a player-facing beat packet. It should not receive private forecast entries or GM private rationale.

The packet may include:

- current beat intent in player-visible terms;
- reveal guidance;
- local pressure summary;
- consequences already validated/applied by backend.

It must exclude:

- private forecast text;
- offscreen facts not surfaced locally;
- backend diagnostics;
- tool validation internals.
