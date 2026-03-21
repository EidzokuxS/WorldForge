# Phase 9: Persistence - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds checkpoint save/load for death recovery and "what if" branching. Players can create named snapshots, load any checkpoint to restore full state, and the game auto-checkpoints before lethal encounters. UI shows checkpoint list with management.

</domain>

<decisions>
## Implementation Decisions

### Checkpoint System
- Checkpoint = timestamped copy of state.db + vectors/ directory + chat_history.json
- Stored in `campaigns/{id}/checkpoints/{timestamp}-{name}/`
- `better-sqlite3` `.backup()` API for safe SQLite snapshot
- `fs.cp()` for LanceDB vectors directory copy
- Chat history copied as-is

### Save/Load API
- `POST /api/campaigns/:id/checkpoints` — create checkpoint with optional name/description
- `GET /api/campaigns/:id/checkpoints` — list all checkpoints
- `POST /api/campaigns/:id/checkpoints/:checkpointId/load` — restore from checkpoint
- `DELETE /api/campaigns/:id/checkpoints/:checkpointId` — delete checkpoint
- Loading a checkpoint: disconnect current DB, swap files, reconnect

### Auto-checkpoint
- Before each turn, if player HP ≤ 2, auto-create a checkpoint named "auto-{tick}"
- Limit auto-checkpoints to last 3 (delete oldest when exceeding)
- Auto-checkpoints marked with `auto: true` flag

### Frontend UI
- Checkpoint list in game page (accessible via button/menu)
- Each checkpoint shows: name, timestamp, description, auto flag
- Load/Delete buttons per checkpoint
- "Save Checkpoint" button in game controls

### Claude's Discretion
- Checkpoint storage format details
- UI placement of checkpoint controls
- How to handle concurrent checkpoint operations
- Whether to show checkpoint size

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/campaign/manager.ts` — campaign lifecycle, DB connect/disconnect
- `backend/src/campaign/paths.ts` — path resolution, assertSafeId()
- `backend/src/db/index.ts` — DB connection singleton
- `backend/src/vectors/connection.ts` — LanceDB connection management

### Integration Points
- New checkpoint module in `backend/src/campaign/checkpoints.ts`
- New API endpoints in campaigns routes
- Frontend checkpoint UI component
- Auto-checkpoint logic in chat route (before turn processing)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
