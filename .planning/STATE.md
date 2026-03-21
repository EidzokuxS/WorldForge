---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 17-04-PLAN.md
last_updated: "2026-03-21T19:58:18.990Z"
progress:
  total_phases: 18
  completed_phases: 18
  total_plans: 47
  completed_plans: 47
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The LLM is the narrator, never the engine. All mechanical outcomes are resolved by backend code.
**Current focus:** Phase 17 — unit-test-coverage

## Current Position

Phase: 17 (unit-test-coverage) — EXECUTING
Plan: 5 of 5

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
| Phase 12 P01 | 1min | 2 tasks | 2 files |
| Phase 12 P02 | 4min | 2 tasks | 7 files |
| Phase 12 P03 | 14min | 2 tasks | 0 files |
| Phase 12 P04 | 7min | 2 tasks | 0 files |
| Phase 12 P06 | 7min | 2 tasks | 0 files |
| Phase 12 P05 | 14min | 2 tasks | 2 files |
| Phase 12 P02 | 5min | 2 tasks | 9 files |
| Phase 12 P03 | 8min | 2 tasks | 14 files |
| Phase 12 P04 | 15min | 2 tasks | 12 files |
| Phase 13 P01 | 17min | 2 tasks | 5 files |
| Phase 13 P02 | 27min | 2 tasks | 6 files |
| Phase 13 P03 | 15min | 2 tasks | 4 files |
| Phase 14 P02 | 2min | 2 tasks | 2 files |
| Phase 14 P01 | 3min | 3 tasks | 3 files |
| Phase 14 P03 | 3min | 2 tasks | 0 files |
| Phase 15 P01 | 4min | 2 tasks | 4 files |
| Phase 15 P02 | 3min | 2 tasks | 2 files |
| Phase 16 P01 | 10min | 2 tasks | 2 files |
| Phase 16 P02 | 12min | 2 tasks | 2 files |
| Phase 17 P03 | 3min | 2 tasks | 2 files |
| Phase 17 P02 | 4min | 2 tasks | 2 files |
| Phase 17 P01 | 4min | 2 tasks | 2 files |
| Phase 17 P05 | 3min | 2 tasks | 2 files |
| Phase 17 P04 | 4min | 2 tasks | 3 files |

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
- [Phase 12]: Added createLogger mock inline rather than importOriginal spread -- explicit test isolation
- [Phase 12]: No bugs found in infrastructure or settings -- all E2E tests passed clean
- [Phase 12]: OpenRouter+Gemini Flash used for QA testing (GLM had insufficient balance)
- [Phase 12]: Lore extraction failure is transient provider error, gracefully handled by try/catch fallback
- [Phase 12]: No bugs found in character creation -- all 3 modes (parse, generate, import V2) work correctly
- [Phase 12]: No bugs found in WorldBook import or checkpoint system -- both work correctly via API testing
- [Phase 12]: Use provider.chat() instead of provider() for Chat Completions API compatibility with third-party providers
- [Phase 12]: Retry pops both user+assistant messages since processTurn re-appends user message
- [Phase 12]: No visual bugs found -- all pages scored >= 3/5 on 6-aspect rubric
- [Phase 12]: LoreSection onRefresh was missing -- wired async re-fetch callback after WorldBook import
- [Phase 12]: No bugs found in checkpoint system -- save/load/delete all work correctly via browser
- [Phase 12]: No bugs found in campaign creation flow -- entire pipeline works end-to-end through browser
- [Phase 12]: Post-turn callback must be fire-and-forget (void IIFE) so SSE stream closes promptly after done event
- [Phase 13]: Oracle calibration bands: 5-15% (no tags), 60-75% (relevant tag), 80-90% (master) prevent over-generous probabilities
- [Phase 13]: CRITICAL OUTPUT RULES block at top of SYSTEM_RULES prevents Gemini Flash from echoing section headers into narrative
- [Phase 13]: NPC agent temperature 0 -> 0.3 for varied autonomous behavior; action bias strengthened
- [Phase 13]: IP terminology guidance references [WORLD PREMISE] and [LORE CONTEXT] for world-specific terms
- [Phase 13]: readCampaignConfig must include currentTick in return object (was silently dropped, causing tick to stick at 1)
- [Phase 13]: Faction tick interval lowered to 5 (from 10) for more frequent world simulation events
- [Phase 13]: NPC reflection threshold lowered to 10 (from 15) for more responsive belief updates
- [Phase 13]: Storyteller stepCountIs(3) to allow narrative + state tools + quick_actions in one turn
- [Phase 13]: Miss narration requires concrete examples per action type to prevent LLM from narrating positive outcomes
- [Phase 13]: COMBAT HP TRACKING rules mandate set_condition call on every damage/heal event in combat
- [Phase 13]: set_condition damage scale: light=-1, solid=-1/-2, devastating=-2/-3 guides LLM on delta sizing
- [Phase 13]: Oracle receives HP context via scene string; wounded state reduces probability by 10-20%
- [Phase 13]: Non-lethal vs lethal HP=0 narration split in SYSTEM_RULES based on fight context
- [14-02]: onStateUpdate triggers refreshWorldData immediately -- no debounce needed for 1-3 events per turn
- [14-02]: Lore extraction 3-attempt strategy: 2x full-size (min 20), 1x reduced (min 10) with 2s delay between retries
- [Phase 14]: Remove vector field entirely from initial episodic event row -- matches lore-cards pattern
- [Phase 14]: Use npx.cmd on Windows instead of shell:true for MCP spawn
- [Phase 14]: Fallback quick actions are deterministic (not AI) for zero latency and guaranteed availability
- [Phase 14]: All 5 bug fixes verified working via API testing: episodic vectors, MCP spawn, quick actions fallback, sidebar refresh, lore retry
- [15-01]: outcomeTier passed as optional param through executeToolCall -- backward compatible with NPC tools
- [15-01]: move_to tool validates connection graph and returns available paths on failure for LLM self-correction
- [15-01]: NPC engagement rules are prompt-level (not code enforcement) -- LLM compliance expected from explicit MUST instructions
- [15-02]: Catch-all regex for unknown function-call patterns prevents future tool leaks without manual enumeration
- [15-02]: auto_checkpoint event emitted from turn-processor, handled in chat.ts -- separation of concerns
- [15-02]: HP=0 awareness added to outcome instructions (miss + weak_hit) rather than post-hoc injection
- [Phase 16]: GLM 4.7 Flash structured output limitation is a provider issue, not a code bug
- [Phase 16]: Scaffold-saver beliefs field stores {} instead of [] -- minor inconsistency, non-blocking
- [Phase 16]: Faction cross-references maintained via relationships table (Member tags), not in NPC persona text
- [Phase 16]: save-edits FK constraint on active campaigns is correct behavior -- scaffold rewrite destroys locations referenced by player FK
- [Phase 16]: GLM 4.7 Flash fails generateObject structured output -- provider compatibility issue, not code defect
- [Phase 17]: No mocks needed for frontend pure logic tests -- fixture data only
- [Phase 17]: Mock paths resolved relative to test file location, not source module
- [Phase 17]: Inline vi.mock factories to avoid hoisting issues with external variable references
- [Phase 17]: Mock all worldgen service functions inline rather than importing from external factory
- [Phase 17]: Let parseBody execute with real Zod schemas rather than mocking for actual validation testing

### Roadmap Evolution

- Phase 12 added: E2E QA & Bug Fixing — full browser-based verification + iterative bug fixing
- [Phase 10]: Plain fetch to OpenAI-compatible endpoint for maximum image provider compatibility
- [Phase 10]: All image generation is fire-and-forget with void async IIFE -- never blocks gameplay
- [11-01]: Single LLM call for batch WorldBook entry classification (not per-entry)
- [11-01]: Bestiary entries stored as lore cards with category "npc", lore_general as "concept"
- [Phase 11-02]: withMcpClient kept as deprecated wrapper; withSearchMcp is preferred API for configurable search providers
- [Phase 11-02]: SEARCH_MCP_CONFIGS record maps SearchProvider to MCP server command/args for easy provider addition
- Phase 14 added: Final Systems Verification & Bug Fixing — fix remaining bugs + verify all systems per docs/
- Phase 16 added: NPC System QA — Three NPC Tiers + World Gen Integration
- Phase 17 added: Unit Test Coverage — real tests for untested backend and frontend modules, desloppify strict 95+

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-21T19:58:18.987Z
Stopped at: Completed 17-04-PLAN.md
Resume file: None
