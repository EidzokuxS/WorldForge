# Phase 79 Research: GM Epistemic Context And Tool Grounding

**Researched:** 2026-05-03
**Domain:** WorldForge GM-first turn orchestration, scene-frame prompt surfaces, runtime tool grounding, local vs offscreen memory.

## Current Flow Evidence

`runGmTurnDecision` already exists and chooses `direct`, `roll_oracle`, `tool_plan`, `combat_transition`, `clarification`, or `continue`. The prompt, however, serializes the full `SceneFrame` as `NEUTRAL SCENE FRAME EVIDENCE`. That frame contains `roster.background`, forbidden actor labels, all current target candidates, movement candidates, recent events, and allowed tools.

`runScenePlanner` has the same problem. It serializes the full `SceneFrame`, then separately prints `ALLOWED ACTORS` with active, support, and background actors. Even though later semantic mapping rejects forbidden/background actor refs, the model already saw the names and can use them in free-text tool inputs or narration guidance.

`spawn_npc` is not grounded. The schema is:

```ts
{ name: string; tags: string[]; locationName: string }
```

`handleSpawnNpc` resolves `locationName` against any campaign location by name. It does not know whether the location is current, visible, reachable, player-known, or local to this turn.

`log_event` is broad:

```text
Use for any noteworthy occurrence that should be searchable later.
```

This invites durable memory writes for direct beats like asking a price, paying, sitting down, or cafe service flavor. Those may belong in the current turn context, but not necessarily in searchable long-term memory.

`scene-assembly.summarizeToolCall` assumes a successful `spawn_npc` means the NPC becomes visibly present in the current scene. It uses the current scene location for the summary, not the tool result location. That masks wrong-location tool execution and can contaminate final narration.

`collectRecentEvents` fetches location-recent events for the current local location/scope, but if an earlier bad `log_event` stored wrong-place text against the current location, the summary itself can still leak remote location prose into local context.

## Root Cause

The backend currently gives the GM too much raw truth and too little local affordance structure. The validator protects some IDs, but not semantic free-text inside tool inputs. A modern model can produce JSON, but it cannot reliably infer which fields are legal if the prompt simultaneously shows:

- "these actors/locations are forbidden";
- full forbidden/background names;
- broad free-text tools that accept any location name;
- recent context summaries that may contain stale or remote place names.

This is why treating it as "just Zod" or "just DeepSeek/Mimo weirdness" misses the root. The model is being asked to act like a GM while being handed a mixed GM notebook, backstage spreadsheet, and persistence API.

## Required Architecture Change

Create an explicit model-facing scene view. The full `SceneFrame` remains backend truth, but prompts consume a filtered, purpose-built packet:

- `localScene`: current location/scope names and ids;
- `visibleActors`: active + clear support only;
- `hintedPresence`: non-clear support as anonymized/hinted signals only;
- `legalTargets`: backend-approved target candidates;
- `legalMovement`: backend-approved movement candidates;
- `localRecentEvents`: player-perceivable local events only;
- `backgroundPrivate`: counts and opaque categories only, no names/locations;
- `toolGrounding`: allowed tools with legal input refs/scopes.

This packet should be used by GM turn decision and ScenePlanner. Final narration can keep using `NarratorPacket`, but it must be checked so it does not inherit raw background/offscreen state from earlier stages.

## Tool Grounding Direction

`spawn_npc` should become local-first for GM turns:

- preferred model input: `locationRef`, not arbitrary `locationName`;
- legal refs include `current_scene`, `current_location`, and specific backend-approved nearby location ids if intentionally exposed;
- free-text `locationName` remains compatibility-only and must resolve to the current scene/current location unless the caller is explicitly a background/offscreen system.

`log_event` should be split conceptually:

- durable event: future-relevant, searchable, changes what the world should remember;
- scene-local beat: useful for final narration/current conversation, not necessarily persisted to episodic memory.

The phase can implement the first step by tightening prompt language and validation now, and by adding a follow-up gap if a full scene-local memory primitive is larger than Phase 79.

## Verification Strategy

Phase 79 should prove four things:

1. Prompt contracts do not expose offscreen/background names or remote locations as local evidence.
2. Free-text `spawn_npc` cannot target arbitrary campaign locations in player-turn contexts.
3. Tool plans with remote location mutations fail before DB writes and trigger rollback.
4. Scene assembly does not turn failed or remote tool results into "visible in current scene" consequences.
