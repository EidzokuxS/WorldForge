# Phase 79 Spec: GM Epistemic Context And Tool Grounding

## Non-Negotiable Behavior

Phase 79 is successful only if a player-turn GM cannot see, choose, execute, or narrate remote/offscreen truth as if it were local scene truth.

The backend remains full world truth. The GM receives a scoped model-facing view.

## P79-R1: Model-Facing View Is Not Raw Backend Truth

GM, ScenePlanner, repair, and final-visible narration prompts must not receive raw `SceneFrame` dumps, raw hidden/background rosters, raw forbidden actor labels/ids, or unfiltered recent event/conversation text.

Acceptance:

- model-facing view contains current local location/scope and visible actors;
- background/private actors are represented only as counts or opaque categories;
- forbidden/background names and ids are absent, not merely marked forbidden;
- prompt tests fail if `roster.background`, `forbiddenActorLabels`, or a known offscreen location such as `Forest Outpost` appears in a local Shibuya prompt.

## P79-R2: Tool Arguments Are Grounded Before Execution

Runtime tools that resolve ids or names must be validated against a turn execution context before any DB mutation.

Acceptance:

- player-turn tools can reference only current scene/current location/exposed candidates;
- actor-turn tools are grounded to that actor's local context;
- background tools require explicit `background` scope;
- no player-turn caller silently falls back to campaign-wide name resolution.

## P79-R3: `spawn_npc` Uses Local Refs, Not Global Location Prose

`spawn_npc` may use:

```ts
locationRef?: "current_scene" | "current_location";
locationId?: string;
locationName?: string; // legacy compatibility only
```

Rules:

- `locationRef` is preferred in prompts.
- `locationId` is accepted only if exposed in the current model-facing legal refs.
- `locationName` is rejected for player turns unless it resolves to the current scene/current location.
- `handleSpawnNpc` returns authoritative `{ id, name, locationId, locationName }`.

Acceptance:

- a Shibuya player turn cannot spawn `Outpost Cook` into `Okutama Safe Zone - Forest Outpost`;
- wrong-location spawn fails before DB mutation;
- downstream narration uses result `locationId`, not model input text.

## P79-R4: ScenePlan Prevalidation Is Atomic

ScenePlan execution must prevalidate the whole runtime tool plan before the first mutation.

Acceptance:

- if any runtime tool has illegal grounding, no earlier valid tool from that plan remains committed;
- ScenePlanner gets one repair chance for grounding failures;
- if repair still fails, turn failure drains pending committed events for the current tick before snapshot restore/abort;
- tests prove partial plans cannot leave DB residue.

## P79-R5: Durable Events Are Intentional

`log_event` is not a scratchpad for every direct beat.

Contract:

```ts
durability?: "durable" | "scene_local";
importance?: number;
```

Rules:

- default is `scene_local` for player-turn GM tool plans unless explicitly durable;
- only `durable` events enter episodic search, location recent events, pending committed facts, and reflection inputs;
- low-importance scene service beats such as asking a price, paying, or sitting down stay in conversation/current beat context unless promoted by the GM with a future-relevant reason.

Acceptance:

- `paid for coffee` can appear in current narration/log text without becoming long-term searchable truth;
- `promised to return`, `made an enemy`, `found a hidden door`, or `changed faction standing` can be durable.

## P79-R6: Final Narration Uses Local Settled Truth

Final-visible storytelling must not re-import remote/background terms through broad prompt assembly, semantic memory, chronicle, raw recent conversation, or pending committed event text.

Acceptance:

- final narration prompt for Shibuya does not include `Forest Outpost` even if global episodic/semantic memory contains it;
- local visible actors and local recent facts still appear;
- remote/background content can only surface through an explicit backend-approved local hint or revealed event.

## P79-R7: Observability Is Diagnostic, Not Another Leak

Logs should explain why a tool was rejected without dumping hidden names or full prompts.

Acceptance:

- logs include visible actor count, hidden/background count, local recent count, allowed tool count, rejected tool name, and rejection code;
- logs do not include raw API keys, full prompts, hidden actor lists, or forbidden proper nouns.
