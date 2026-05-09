# Wave 1 Impact Preflight

Date: 2026-05-07
Baseline commit: `53d6f98`

## GitNexus

- Repository index refreshed after checkpoint: 3402 nodes, 9424 edges, 278 flows.
- Staged checkpoint scope before commit was `CRITICAL`, expected because it captured the prior multi-phase baseline.

## Symbols And Files

| Target | Result | Notes |
|---|---:|---|
| `backend/src/db/schema.ts` | LOW | File-level graph has no indexed upstream edges; migration risk is still high by nature, so tests must prove compatibility. |
| `backend/src/engine/state-snapshot.ts` | LOW | File-level graph has no indexed upstream edges; runtime callers are indirect via turn rollback. |
| `backend/src/campaign/restore-bundle.ts` | LOW | File-level graph has no indexed upstream edges; restore behavior is safety-critical despite sparse graph edges. |
| `runRollbackCriticalPostTurn` | LOW | Direct caller: `buildOnPostTurn`. Used as the current rollback-critical post-turn seam. |
| `executeToolCall` | CRITICAL | Direct callers: `executeRuntimeTool`, `executeScenePlan`, `createReflectionTools`, `createNpcAgentTools`, `executeAdjudicationPlan`, `executeSingleStep`. Affected flows include GM tool loop, reflection, NPC tools, hidden adjudication, old scene-plan executor, and GM tool steps. |

## Current Boundary Inventory

- `currentTick` is stored in campaign `config.json`, not SQLite. Existing runtime reads it from `readCampaignConfig` and advances through `advanceCampaignTick` / `incrementTick`.
- SQLite contains event-like `chronicle.tick`, `location_recent_events.tick`, ephemeral location expiry/archival ticks, and entity state, but no campaign-level version authority row.
- Snapshot rollback copies `state.db`, `config.json`, and `chat_history.json` from `.turn-boundaries/last-turn-boundary`; vectors are excluded for turn rollback.
- Restore currently replaces the DB/config/history, closes DB/vector handles, and reloads the campaign. There is no explicit simulation job/proposal invalidation because those tables do not exist yet.
- Existing `ToolResult` is `{ success, result?, error? }`. Mutation refs are currently inferred by scanning `result` keys that look like ids/names/refs.

## Implementation Constraint

Wave 1 must add authority metadata without breaking existing callers. `executeToolCall` keeps its public signature. New authority metadata is added to result objects and helpers, while stale-version enforcement starts in the new authority service and opt-in authority contexts/tests.
