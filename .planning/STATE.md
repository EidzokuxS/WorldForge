---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 11-02-PLAN.md
last_updated: "2026-03-19T04:32:13.496Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 23
  completed_plans: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The LLM is the narrator, never the engine. All mechanical outcomes are resolved by backend code.
**Current focus:** Phase 11 — content-import

## Current Position

Phase: 11 (content-import) — COMPLETE
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: 5.8min
- Total execution time: 0.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-engine-foundation | 2/2 | 13min | 6.5min |
| 02-turn-cycle | 2/2 | 18min | 9min |
| 03-world-state-mechanics | 3/3 | 17min | 5.7min |
| 04-story-control | 2/2 | 6min | 3min |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P02 | 7min | 3 tasks | 10 files |
| Phase 02 P01 | 15min | 2 tasks | 8 files |
| Phase 02 P02 | 3min | 2 tasks | 4 files |
| Phase 03 P01 | 8min | 2 tasks | 5 files |

| Phase 03 P02 | 6min | 2 tasks | 5 files |
| Phase 03 P03 | 3min | 2 tasks | 5 files |
| Phase 04 P01 | 4min | 2 tasks | 6 files |
| Phase 04 P02 | 2min | 2 tasks | 3 files |
| Phase 05 P01 | 4min | 2 tasks | 3 files |
| Phase 05 P02 | 5min | 1 tasks | 5 files |
| Phase 06 P01 | 8min | 2 tasks | 5 files |
| Phase 06 P02 | 5min | 2 tasks | 6 files |
| Phase 07 P01 | 4min | 2 tasks | 5 files |
| Phase 07 P02 | 5min | 2 tasks | 5 files |
| Phase 08 P01 | 5min | 2 tasks | 5 files |
| Phase 08 P02 | 4min | 2 tasks | 5 files |
| Phase 09 P01 | 3min | 2 tasks | 6 files |
| Phase 09 P02 | 4min | 3 tasks | 5 files |
| Phase 10 P01 | 4min | 2 tasks | 8 files |
| Phase 10 P02 | 3min | 2 tasks | 5 files |
| Phase 11 P01 | 5min | 2 tasks | 7 files |
| Phase 11 P02 | 5min | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 11 phases derived from dependency analysis -- Foundation -> Turn -> Mechanics -> Control -> Memory -> NPC -> Reflection -> World -> Persistence -> Images -> Import
- [Roadmap]: Prompt Assembler builds token budgets from day one (prevents retrofit pain identified in research)
- [Roadmap]: Tool Executor validates every LLM tool call before DB write (trust boundary pattern)
- [01-01]: 4-char-per-token heuristic avoids tokenizer dependency while providing reasonable estimates
- [01-01]: Priority-based truncation (0=system rules through 7=conversation) with canTruncate flag
- [01-01]: Lore retrieval is best-effort -- embedder failure skips lore section gracefully
- [01-02]: Oracle uses temperature 0 override for deterministic rulings regardless of Judge settings
- [01-02]: Oracle result via X-Oracle-Result header to avoid mixing metadata into text stream
- [01-02]: Fallback to 50% chance on Oracle LLM failure -- game never blocks
- [Phase 02]: AI SDK v6 uses inputSchema (not parameters) for tool(), .text (not .textDelta), .input/.output (not .args/.result)
- [Phase 02]: Tool executor never throws -- returns ToolResult with success/error for LLM retry
- [Phase 02]: Episodic events stored with empty vector (embedding deferred to post-turn)
- [02-02]: Oracle result delivered via SSE event instead of X-Oracle-Result header
- [02-02]: submitAction extracted as reusable core for input form and quick action clicks
- [Phase 03]: NPCs do not have HP -- set_condition returns error guiding to add_tag/remove_tag for NPC conditions
- [Phase 03]: spawn_npc creates temporary tier NPCs (Storyteller-spawned are ephemeral by default)
- [Phase 03]: Inventory always shown in prompt even when empty -- explicit (empty) prevents LLM hallucination
- [03-03]: Re-fetch full world data on turn completion (onDone) rather than per-tool granular updates -- one GET keeps all panels in sync
- [03-03]: Props-driven panels -- sidebar panels receive data from game page, no internal data loading
- [04-01]: In-memory snapshot only (not persisted) -- single-step undo, per CONTEXT.md decision
- [04-01]: Spawned entity tracking via tool result inspection during SSE iteration
- [04-01]: Retry re-uses playerAction as intent (original intent/method not stored)
- [Phase 04]: Hover-reveal retry/undo buttons keep narrative UI clean while controls are discoverable
- [Phase 04]: Click-to-edit with textarea replacement and Ctrl+Enter save for inline assistant message editing
- [05-01]: Composite score formula: similarity*0.4 + recency*0.3 + importance*0.3 for balanced retrieval
- [05-01]: Delete-and-re-add pattern for LanceDB updates (no native UPDATE support)
- [05-01]: buildOnPostTurn helper extracts shared callback logic for /action and /retry
- [Phase 05]: 60% of conversation budget for recent msgs, 40% for first+important middle
- [Phase 05]: Relationship graph enrichment folded into NPC states section for richer per-NPC context
- [06-01]: NPC act() routes through Oracle same as player actions -- no auto-success for NPCs
- [06-01]: NPC ticks run sequentially to avoid conflicting DB state changes
- [06-01]: NPC tick failures logged but never block gameplay (fire-and-forget)
- [Phase 06]: Single batch generateObject call for all off-screen NPCs (not per-NPC) to minimize LLM calls
- [Phase 06]: Off-screen updates stored as episodic events with type npc_offscreen for future retrieval
- [07-01]: Reflection threshold set at 15 unprocessedImportance for meaningful accumulation
- [07-01]: Reflection fetches 10 episodic events (vs 3 for NPC tick) for richer synthesis
- [07-01]: Reflection runs as post-turn step 4 after NPC ticks and off-screen simulation
- [07-02]: One-step-up validation for wealth/skill tier progression prevents unrealistic jumps
- [07-02]: Wealth tier displayed as separate labeled line in Oracle prompt for explicit affordability evaluation
- [07-02]: No-wealth entities start at Destitute/Poor only; no-skill entities start at Novice only
- [08-01]: Faction territory detected via "Controlled by {name}" tag pattern on locations (case-insensitive)
- [08-01]: All factions loaded as neighbors (no graph traversal needed for small worlds)
- [08-01]: faction_action auto-creates chronicle entry alongside explicit add_chronicle_entry tool
- [Phase 08]: Event tags follow pattern Type-affected on locations (Plague-affected etc)
- [Phase 08]: No explicit event propagation -- LLM infers NPC awareness from WORLD STATE + NPC tags + SCENE context
- [Phase 08]: WORLD STATE section at priority 3 between SCENE and PLAYER STATE, canTruncate true
- [09-01]: Checkpoint ID format {timestamp}-{sanitized-name} for natural sort order and human readability
- [09-01]: better-sqlite3 .backup() API for safe SQLite snapshots instead of raw file copy
- [09-01]: Checkpoint load disconnects/reconnects both SQLite and LanceDB connections
- [Phase 09]: Auto-checkpoint triggers at HP <= 2 with non-blocking try/catch
- [Phase 09]: CheckpointPanel uses Dialog component, load triggers full page reload
- [Phase 10]: Plain fetch to OpenAI-compatible endpoint for maximum image provider compatibility
- [Phase 10]: All image generation is fire-and-forget with void async IIFE -- never blocks gameplay
- [11-01]: Single LLM call for batch WorldBook entry classification (not per-entry)
- [11-01]: Bestiary entries stored as lore cards with category "npc", lore_general as "concept"
- [Phase 11-02]: withMcpClient kept as deprecated wrapper; withSearchMcp is preferred API for configurable search providers
- [Phase 11-02]: SEARCH_MCP_CONFIGS record maps SearchProvider to MCP server command/args for easy provider addition

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-19T04:26:48.784Z
Stopped at: Completed 11-02-PLAN.md
Resume file: None
