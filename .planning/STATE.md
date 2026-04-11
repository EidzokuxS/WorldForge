---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Gameplay Fidelity
status: planning
stopped_at: Phase 41 context gathered
last_updated: "2026-04-11T10:20:58.2548057Z"
last_activity: 2026-04-11 -- Captured Phase 41 context
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** The LLM is the narrator, never the engine. Mechanical truth stays in backend code so outcomes remain consistent, inspectable, and recoverable.
**Current focus:** Phase 41 — checkpoint-complete-simulation-restore

## Current Position

Phase: 41 (checkpoint-complete-simulation-restore) — PLANNING
Plan: 0 of TBD
Status: Context gathered — ready for planning
Last activity: 2026-04-11 -- Captured Phase 41 context

Progress: [██████████] 100%

## Performance Metrics

**Current Snapshot:**

- Active roadmap phases: 8
- Completed phases: 36
- Planned or in-progress phases: 8
- Total plans tracked: 110
- Completed plans: 110
- Pending plans: TBD until phase planning

**Recent Execution:**

- Phase `40` Plan `03` — duration `4 min`, tasks `2`, files `6`
- Phase `40` Plan `02` — duration `4 min`, tasks `2`, files `4`
- Phase `40` Plan `01` — duration `6 min`, tasks `2`, files `9`
- Phase `39` Plan `03` — duration `10 min`, tasks `2`, files `2`
- Phase `39` Plan `02` — duration `6 min`, tasks `2`, files `6`
- Phase `39` Plan `01` — duration `5 min`, tasks `2`, files `7`

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.1 is reconciliation-driven from Phase 36 and does not reopen archived v1.0 scope.
- Integrity repair stays ahead of new mechanics or generic polish.
- Session-decoupled transport, authoritative inventory, honest turn boundaries, live reflection, and checkpoint-complete restore are the v1.1 critical path.
- Travel-time and per-location recent-happenings claims must end as real runtime behavior or explicit deprecations.
- Gameplay docs must become the trusted planning baseline again after runtime repair.
- [Phase 37]: GET /api/chat/history now requires ?campaignId=<id> and targeted gameplay POST routes require campaignId in JSON.
- [Phase 37]: Targeted gameplay routes resolve campaigns through requireLoadedCampaign() instead of relying on an already-active singleton session.
- [Phase 37]: Last-turn retry and undo snapshots are keyed by campaignId to prevent cross-campaign rollback leakage.
- [Phase 37]: Frontend gameplay helpers now require campaignId, including shared chatHistory/chatAction wrappers in frontend/lib/api.ts.
- [Phase 37]: The canonical /game page preserves active-first bootstrap with remembered fallback, but all targeted gameplay requests now send activeCampaign.id explicitly.
- [Phase 39]: A turn is only complete after rollback-critical post-turn world mutations finish; embeddings and image generation remain auxiliary.
- [Phase 39]: Retry and undo stay single-step in this phase, but must restore the same authoritative pre-turn boundary the player experienced.
- [Phase 39]: Rollback-critical post-turn failure must prevent a turn from being presented as successfully complete.
- [Phase 39]: The backend now emits finalizing_turn after narration and only emits done after rollback-critical post-turn simulation completes.
- [Phase 39]: Last-turn retry and undo now restore a single SQLite-safe bundle of state.db, config.json, and chat_history.json while explicitly excluding campaigns/{id}/vectors/.
- [Phase 39]: Failed retry restores the visible pre-turn boundary immediately from committed message history, then refreshes history and world data from the backend. — The UI needs a deterministic honest fallback even if optimistic retry state or refresh timing would otherwise leave stale completion affordances on screen.
- [Phase 39]: Quick actions stay buffered until authoritative done, which keeps retry/undo and follow-up actions aligned with the backend rollback boundary. — Showing or enabling quick actions before done would present narration completion as turn completion and let the UI get ahead of the rollback-safe boundary.
- [Phase 39]: The frontend now models gameplay readiness as idle, streaming, or finalizing so narration completion no longer implies turn completion. — This keeps retry/undo and input readiness aligned with the backend finalization contract instead of guessing from a single streaming flag.
- [Phase 39]: Retry SSE onError is captured and rethrown after parseTurnSSE resolves so /game can keep one rollback cleanup path.
- [Phase 39]: Retry failure cleanup clears buffered quick actions and stale optimistic retry UI before the page returns to idle.
- [Phase 40]: Reflection budget now accumulates directly on committed episodic-event writes through one campaign-scoped NPC-only seam.
- [Phase 40]: Present-NPC act still piggybacks through log_event, while speak and off-screen updates call the shared accumulator directly to avoid double-counting.
- [Phase 40]: Reflection prompts now explicitly treat beliefs, goals, and relationships as the default durable outcomes of ordinary play.
- [Phase 40]: Wealth and skill upgrades remain available, but only behind materially stronger evidence thresholds than ordinary interaction arcs.
- [Phase 40]: Reflection reads same-turn committed evidence directly instead of making embeddings rollback-critical.
- [Phase 40]: Every writer that already calls storeEpisodicEvent now joins one queued handoff that post-turn auxiliary embedding drains after reflection.

### Pending Todos

None yet.

### Blockers/Concerns

- Some archived v1.0 phases still lack phase-level verification artifacts, but that does not block v1.1 planning.
- Repo-root Vitest still emits a non-blocking `environmentMatchGlobs` deprecation warning during frontend verification.

## Session Continuity

Last session: 2026-04-11T10:20:36.782Z
Stopped at: Phase 41 context gathered
Resume file: .planning/phases/41-checkpoint-complete-simulation-restore/41-CONTEXT.md
