# Phase 82 Patterns - Existing Code To Reuse

## Reuse

- `backend/src/db/schema.ts`: location kind, parent/anchor/lifecycle fields, player/NPC broad/current-scene fields.
- `backend/src/engine/tool-schemas.ts`: runtime tool input schemas and model-facing descriptions.
- `backend/src/engine/tool-execution-context.ts`: local grounding and player-turn tool validation.
- `backend/src/engine/tool-executor.ts`: `handleRevealLocation`, `handleSpawnNpc`, `handleLogEvent`, and shared execution result path.
- `backend/src/engine/gm-action-checklist.ts`: bounded checklist contract.
- `backend/src/engine/gm-tool-step.ts`: sequential tool-step execution and revision/skipped statuses.
- `backend/src/engine/scene-presence.ts`: current-scene presence truth.
- `backend/src/engine/location-graph.ts`: traversal exclusion for expired/archived ephemeral scenes.
- `backend/src/engine/location-events.ts`: anchored local event projection/spillover.
- `backend/src/routes/chat.ts` and `backend/src/engine/turn-processor.ts`: turn boundary, rollback, SSE progress.
- `frontend/app/game/page.tsx` and play-surface components: stage-aware loader/progress text.

## Do Not Reuse As Authority

- Free-text `locationName` as preferred player-turn spawn target.
- Broad-only same-location presence fallback for dense/current-scene worlds.
- Final narration as proof that a tool succeeded.
- Advisory BeatPlan fields as executable truth.

## New Helper Candidates

- `resolveSceneSpawnLocation(...)`: returns broad location, exact scene location, parent/anchor metadata, and legality reason.
- `buildTransientLifecyclePolicy(...)`: derives default expiry/retirement from tool input and current tick.
- `cleanupTransientSceneObjects(...)`: archives expired ephemeral scenes and retires support NPCs after turn boundaries.
- `formatToolObservationForGm(...)`: compact model-facing result from backend execution result.
- `detectRepeatedToolIntent(...)`: semantic guard against repeated equivalent dynamic spawns in one turn.
- `promoteSupportNpc(...)`: explicit transition from temporary/support actor to durable NPC with provenance and enrichment scheduling.
