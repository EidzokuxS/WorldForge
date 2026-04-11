---
phase: 43
reviewers: [gemini, claude]
reviewed_at: 2026-04-11T17:37:45.1651951+03:00
plans_reviewed: [43-01-PLAN.md, 43-02-PLAN.md, 43-03-PLAN.md, 43-04-PLAN.md, 43-05-PLAN.md]
---

# Cross-AI Plan Review — Phase 43

## Gemini Review

# Phase 43 Plan Review: Travel & Location-State Contract Resolution

## Summary
The implementation plans for Phase 43 are exceptionally well-structured and directly address the core fidelity gaps identified in Phase 36. By treating this as a systemic repair of the location model rather than isolated feature patches, the plans ensure that travel cost and local history become authoritative, rollback-safe runtime mechanics. The transition from a flat `connectedTo` JSON field to a normalized `location_edges` table is the correct architectural move to support believable traversal and multi-tick time advancement.

## Strengths
- **Architectural Integrity**: Moving the graph authority to a normalized `location_edges` table allows for first-class `travelCost` and path resolution, satisfying `GSEM-03` without over-engineering.
- **Authoritative History**: The use of a SQLite-backed `location_recent_events` projection (Plan 03) ensures that revisit-facing history survives checkpoint restores and rollback, fulfilling the "mechanical truth" mandate.
- **Ephemeral Node Lifecycle**: The plans explicitly address the transition of ephemeral scene nodes (D-13), ensuring their consequences survive anchoring to persistent macro locations even after the node itself expires.
- **TDD Focus**: Plan 01 Task 2 focuses on locking regressions before implementation, which is critical for ensuring that the new graph logic doesn't regress into the old teleportation behavior.
- **Shared Contracts**: Consistent use of `@worldforge/shared` types ensures the backend and frontend stay aligned on the new three-class location taxonomy (macro, sublocation, scene).

## Concerns
- **Archive Trigger Mechanism (Severity: LOW)**: Plan 03 mentions "archiving a scene node," but it is not explicitly clear where the *trigger* for expiration/archiving lives. While the resolver handles "expired" nodes by tick comparison, a cleanup hook or explicit "close scene" tool might be needed to finalize state mutations before archiving.
- **Pathfinding Complexity (Severity: LOW)**: While the sandbox is currently a graph of reasonable size, the plan should explicitly favor a simple BFS/Dijkstra implementation for `resolveTravelPath` to avoid "transit simulator" scope creep (D-10).
- **NPC Movement Cost (Severity: LOW)**: Plan 02 Task 2 notes that NPCs use the same resolver but "may not separately advance global tick." Ensure that if an NPC "beats" a player to a location via a shorter path, the simulation handles that chronological delta correctly.

## Suggestions
- **Explicit Bidirectional Tooling**: In Plan 02 Task 2, ensure the `reveal_location` update explicitly handles the creation of the bidirectional edge in the `location_edges` table to match existing worldgen assumptions.
- **Recent Happenings Depth**: In Plan 04 Task 2, specify a default "recency window" (e.g., last 5 events or last 50 ticks) for the `Recent happenings here` prompt section to prevent context window bloat in high-activity locations.
- **UI "Travel Time" Visual**: In Plan 05 Task 2, consider adding a brief "Time passing..." or "Traveling..." state/indicator if a move action results in a large tick jump (cost > 1), providing the "observable cost" required by Success Criteria 1.

## Risk Assessment: LOW
The plans are highly grounded in the existing technical stack and follow established project patterns (Drizzle, Hono, Vitest). The scope is tightly guarded against over-engineering a full geographic simulation while ensuring the documented promises become mechanically real. The primary risk is simple logical errors in graph traversal, which is well-mitigated by the comprehensive validation strategy.

---

## Claude Review

# Phase 43 Plan Review: Travel & Location-State Contract Resolution

## Overall Phase Assessment

The 5-plan decomposition is well-structured and follows a sound dependency chain: contract definition (01) → graph implementation (02) → event projection (03) → backend read surfaces (04) → frontend rendering (05). The wave-based ordering respects real data dependencies. The phase correctly treats this as a unified location-system repair rather than two disconnected patches.

---

## Plan 43-01: Shared Contract & Backend Regressions

### Summary
Defines the authoritative location taxonomy in shared types and Drizzle schema, then writes failing tests that pin the Phase 43 behavioral contract before implementation begins. This is the foundational plan that all others depend on.

### Strengths
- Writing the contract and failing tests before implementation is the right order — prevents scope drift during later plans
- Shared types in `@worldforge/shared` prevent backend/frontend vocabulary divergence
- Keeping `connectedTo` as a compatibility column during migration is pragmatic
- The `must_haves` section has concrete grep-verifiable acceptance criteria

### Concerns
- **MEDIUM**: The plan adds new columns to `locations` and two new tables (`location_edges`, `location_recent_events`) but does not mention migration strategy. The project uses `runMigrations()` in `backend/src/db/migrate.ts`. Existing campaigns have SQLite databases with the old schema. If `runMigrations` relies on Drizzle's push or custom SQL, the executor needs to know whether to write a migration script or rely on Drizzle's column-add behavior. Existing `locations` rows will have `NULL` for `kind`, `persistence`, etc. unless defaults are specified or a backfill runs.
- **MEDIUM**: Task 2's acceptance criterion says tests should "fail only because the Phase 43 implementation is not wired yet." This is a fragile expectation for TDD — tests that import non-existent modules (`location-graph.ts`) will fail at import time, not at assertion time, which may confuse the executor about whether the failure is "expected." The plan should clarify whether stub modules should be created or whether tests should mock the not-yet-existing seams.
- **LOW**: The plan says `anchorLocationId` goes on the `locations` table, but the research suggested it for the archive/cleanup path. Having both `parentLocationId` and `anchorLocationId` on the locations table needs clearer semantics — `parent` is hierarchical (macro → sublocation), `anchor` is for consequence spillover. The executor could conflate them.

### Suggestions
- Add a note about migration handling: either explicit `ALTER TABLE` in `migrate.ts` with safe defaults, or confirmation that Drizzle push handles column additions with defaults on existing databases
- Specify that Task 2 should create minimal stub files (empty exports) for `location-graph.ts` so tests fail at assertion level, not at import resolution
- Clarify the `parentLocationId` vs `anchorLocationId` distinction in the task action text — one sentence is enough

### Risk Assessment: **LOW-MEDIUM**
The contract definition itself is sound. The migration gap is the main operational risk — if the executor doesn't handle it, existing campaigns will break on next load.

---

## Plan 43-02: Graph Traversal & Travel-Time Implementation

### Summary
Implements the authoritative graph resolver, wires player and NPC movement through it, and replaces adjacency-only instant movement with path-bound cost-bearing travel.

### Strengths
- Clean separation: Task 1 builds the resolver + tick-advance primitive, Task 2 wires all movement consumers
- Explicitly requires NPC movement to share the same resolver — prevents the common pitfall of diverging player/NPC movement rules
- `reveal_location` is updated to create normalized edge rows, not just mutate `connectedTo` JSON
- The plan correctly scopes out UI work — backend only

### Concerns
- **HIGH**: The current `turn-processor.ts` movement flow (lines 357-424) uses LLM-based `detectMovement()` to identify travel intent, then does direct DB queries against `connectedTo`. The plan says to replace this with `resolveTravelPath`, but `detectMovement` returns a destination name string, not a location ID. The resolver needs a name→ID resolution step that the plan doesn't explicitly mention. If the executor doesn't handle this, movement detection will break.
- **HIGH**: Travel consuming multiple ticks per turn is a significant gameplay change. Currently, each turn increments tick by exactly 1, and post-turn simulation (reflection, off-screen NPCs, faction ticks) keys off tick intervals. If a player travels 3 edges (cost=3), does the tick advance by 3? If so, this could trigger multiple off-screen simulation rounds in a single player turn, which may produce unexpected NPC behavior cascades. The plan mentions `advanceCampaignTick` but doesn't address the simulation interaction.
- **MEDIUM**: The `tool-executor.ts` `handleMoveTo` function (line 751) and the `turn-processor.ts` inline movement (line 358) are two separate movement paths for the player. The plan should explicitly state whether both paths are being consolidated or whether `handleMoveTo` (tool call) and inline movement detection remain separate entry points that both route through the graph resolver.
- **LOW**: The plan doesn't mention what happens when no path exists between two locations (disconnected graph components). The resolver returns null, but the player-facing error message should be meaningful ("You can't reach X from here" vs. "Destination not reachable").

### Suggestions
- Add explicit guidance about the name→ID resolution step in the movement flow, since `detectMovement` returns a name string
- Address the tick-advance × simulation interaction: either cap travel-time advancement to not trigger intermediate simulation rounds, or explicitly document that multi-tick travel may trigger off-screen simulation and that this is intended
- Clarify whether `handleMoveTo` (tool-executor) and inline movement (turn-processor) are being merged into one path or kept as two entry points sharing the resolver
- Consider whether travel cost should be surfaced in the `state_update` SSE event so the frontend can show "Traveled 3 ticks" before the turn continues

### Risk Assessment: **MEDIUM-HIGH**
The graph resolver itself is straightforward, but the gameplay interaction between multi-tick travel and the existing simulation loop is under-specified and could produce surprising runtime behavior.

---

## Plan 43-03: Location Recent-Events Projection

### Summary
Creates the write-through location-local history projection and integrates all authoritative event writers (player log_event, NPC dialogue, off-screen simulation, faction events) with the new seam.

### Strengths
- Correct approach: SQLite projection from authoritative events, not vector-search-only
- `sourceEventId` traceability preserves the link to episodic events without duplicating the full event
- Ephemeral scene anchor semantics are explicitly addressed
- Two-task split (create seam → integrate all writers) is a clean separation

### Concerns
- **MEDIUM**: The plan modifies 6 source files in Task 1 alone, plus creates a new module. The TDD cycle for this many files in a single task may be unwieldy. The executor might end up with a single massive commit covering `location-events.ts` creation + modifications to `tool-executor.ts`, `npc-tools.ts`, `npc-offscreen.ts`, `faction-tools.ts`, and `episodic-events.ts`. Task 2 then modifies the same files again. The boundary between Task 1 and Task 2 is unclear — what does Task 1 wire and what does Task 2 finish?
- **MEDIUM**: The `storeEpisodicEvent` callers currently pass `location: ""` in many places (see `npc-tools.ts` line 125, `tool-executor.ts` line 548). The plan says to make location metadata "concrete whenever runtime state knows it," but some callers genuinely don't have a location context (e.g., off-screen NPC events where the NPC's location is resolved inside the function). The plan should clarify what happens when location context is unavailable — does the projection skip, use a sentinel, or resolve from actor state?
- **LOW**: The plan doesn't mention the `chronicle` table entries. Faction tools write chronicle entries with location context (`targetLocation`). Should chronicle entries also project into location-recent-events, or is that deferred?

### Suggestions
- Sharpen the Task 1 / Task 2 boundary: Task 1 creates the seam + integrates `tool-executor` (player-facing) writers. Task 2 integrates NPC/faction/off-screen writers. This would make each task independently testable.
- Add explicit handling for unknown/empty location context: either skip projection or resolve from actor's `currentLocationId`
- State whether chronicle entries with `targetLocation` should also feed the projection

### Risk Assessment: **MEDIUM**
The design is sound but the task boundaries are soft. The executor might either duplicate work across tasks or leave gaps.

---

## Plan 43-04: Backend Read Surfaces

### Summary
Exposes the location-history projection and normalized path data through the world API and prompt assembly, completing the backend half of GSEM-04.

### Strengths
- Both API and prompt assembly consume the same seam — no divergence
- The prompt section is bounded ("short meaningful window") instead of dumping full history
- Test behaviors explicitly cover the empty-state case
- Clean dependency on Plans 02 and 03

### Concerns
- **MEDIUM**: The `interfaces` block references `assembleScenePrompt(...)` but the actual function in `prompt-assembler.ts` is `assemblePrompt()`, and the scene section is built by `buildSceneSection()` (line 371). The executor should know to extend `buildSceneSection` rather than looking for a non-existent `assembleScenePrompt`.
- **LOW**: The world API currently returns locations as a flat array (line 84-88 of `campaigns.ts`). Adding `connectedPaths` and `recentHappenings` per location means the route handler needs to query the graph and events tables for each location. For campaigns with many locations, this could be N+1 queries. The plan should suggest batch loading.
- **LOW**: The prompt assembly token budget system (`allocateBudgets`, `truncateToFit`) already manages section priorities. Adding a "Recent happenings here" section needs a priority assignment. The plan doesn't specify where it falls in the priority hierarchy.

### Suggestions
- Fix the interface reference from `assembleScenePrompt` to `buildSceneSection` or `assemblePrompt`
- Suggest batch loading: query all edges and recent events for the campaign once, then distribute per-location, rather than N+1
- Specify that the recent-happenings prompt section should have priority 2-3 (alongside SCENE) and `canTruncate: true`

### Risk Assessment: **LOW**
This is the most straightforward plan. The concerns are operational, not architectural.

---

## Plan 43-05: Frontend Rendering

### Summary
Updates frontend types, parsing, and the location panel to render travel cost and recent happenings on `/game`.

### Strengths
- Correctly handles backward compatibility: world-review helpers still derive legacy name-only views from the new structure
- Reuses shared types from `@worldforge/shared` instead of duplicating
- Keeps the move interaction simple (`go to {name}`) — no over-engineering
- Tests cover both the parsing layer and the rendering layer

### Concerns
- **MEDIUM**: The current `LocationPanel` receives `connectedLocations: Array<{ id: string; name: string }>` and the `page.tsx` derives this from `currentLocation.connectedTo.map(id => ...)`. The plan changes this to `connectedPaths` which includes `travelCost`. But the `onMove` callback still sends `go to {locationName}` as a chat action (line 468 of `page.tsx`). This means the player sees travel cost in the UI but can't influence it — they just click and the backend handles it. That's fine, but the plan should confirm this is intentional and not just an oversight. If travel takes 3 ticks, does the player see "Traveling... (3 ticks)" before the turn resolves?
- **MEDIUM**: The `WorldData` type in `api-types.ts` is used by world-review pages (campaign creation flow), not just `/game`. Adding `connectedPaths` and `recentHappenings` to the type means the world-review scaffold editor needs to handle these fields too, or they'll be undefined during creation (before any gameplay happens). The plan mentions compatibility but should explicitly state that these fields are optional/nullable in the type.
- **LOW**: The plan doesn't mention the `state_update` SSE event for `location_change`. Currently this event carries `locationId` and `locationName` (line 398-405 of `turn-processor.ts`). Should it also carry `travelCost` so the UI can show travel feedback during the turn?

### Suggestions
- Make `connectedPaths` and `recentHappenings` optional in the `WorldData` location type so world-review pages don't break
- Clarify whether multi-tick travel produces any intermediate UI feedback (loading state, travel narrative) or if it's invisible to the player
- Consider adding `travelCost` to the `location_change` state_update event

### Risk Assessment: **LOW-MEDIUM**
The frontend work is well-scoped but the multi-tick travel UX is under-specified. The player might not understand why a turn took 3 ticks instead of 1.

---

## Cross-Plan Concerns

### 1. Migration Strategy (HIGH)
None of the 5 plans address how existing campaigns migrate to the new schema. The `locations` table gets new columns, and two new tables are added. Existing `state.db` files need `ALTER TABLE` or Drizzle push handling. **This should be explicitly addressed in Plan 01.**

### 2. Multi-Tick Travel × Simulation Interaction (HIGH)
If travel costs 3 ticks, and off-screen NPC simulation fires every 5 ticks, a player who was at tick 4 and travels 3 ticks now lands at tick 7 — triggering the tick-5 simulation batch. The plans don't address whether this is intentional. **Plan 02 needs to decide: does travel advance the global tick counter, or does it apply cost as a separate "travel time" concept?**

### 3. Worldgen Integration (MEDIUM)
The scaffold generator (`scaffold-generator.ts`) creates locations without `kind`, `parentLocationId`, or edges in `location_edges`. After Phase 43, newly generated worlds need to populate these fields. None of the plans address worldgen compatibility. This might be acceptable if Plan 01's defaults handle it (all generated locations default to `macro` with edges auto-derived from `connectedTo`), but it should be stated explicitly.

### 4. Checkpoint/Restore Coverage (MEDIUM)
The plans mention that location-recent-events must survive restore (D-14), but no plan explicitly adds test coverage for checkpoint save → load → verify location-recent-events survive. Plan 03 or 04 should include this regression.

### 5. `connectedTo` Deprecation Timeline (LOW)
Plan 01 keeps `connectedTo` as compatibility. Plans 02-05 build on normalized edges. But no plan removes or fully deprecates `connectedTo`. This is fine for Phase 43, but the tech debt should be tracked.

---

## Final Risk Summary

| Plan | Risk | Key Concern |
|------|------|-------------|
| 43-01 | LOW-MEDIUM | Migration strategy for existing campaigns |
| 43-02 | MEDIUM-HIGH | Multi-tick travel × simulation interaction |
| 43-03 | MEDIUM | Task boundary clarity |
| 43-04 | LOW | Minor interface reference error |
| 43-05 | LOW-MEDIUM | Multi-tick travel UX gap |
| **Phase overall** | **MEDIUM** | Migration + multi-tick simulation are the two systemic risks |

**Recommendation**: Address migration strategy in Plan 01 and the tick-advance × simulation interaction in Plan 02 before execution begins. The rest of the concerns are manageable during implementation.

---

## Codex Review

Skipped for independence because the current runtime is Codex.

---

## Consensus Summary

Both external reviewers agree the phase is structurally sound and correctly scoped as a unified location-system repair rather than two isolated patches. The 5-plan split is seen as coherent, dependency-correct, and appropriately bounded against over-engineering.

### Agreed Strengths
- The phase decomposition is strong: contract first, then traversal, then persistence, then read surfaces, then frontend.
- Normalizing the graph away from flat `connectedTo` adjacency is the right architectural direction for honest travel-time mechanics.
- A SQLite-backed per-location recent-happenings projection is the correct authority for revisit-safe, rollback-safe local history.
- The phase stays bounded: it does not drift into full map rendering, route planning, or full rumor simulation.

### Agreed Concerns
- Travel UX and semantics around multi-tick movement still need sharper explicitness:
  - what exactly the player sees when travel costs more than 1 tick
  - how travel cost interacts with the existing simulation cadence
- Some execution details should be made more explicit before implementation:
  - migration/backfill handling for existing campaigns
  - exact movement entry-point consolidation or sharing
  - bounded recent-happenings read windows so prompts/UI do not bloat

### Divergent Views
- `Gemini` rates the overall phase risk as `LOW`, treating the remaining issues as manageable implementation detail.
- `Claude` rates the phase `MEDIUM`, mainly because migration and multi-tick-travel × simulation interaction are not yet explicit enough.
- `Claude` raised additional operational concerns not echoed by `Gemini`:
  - worldgen compatibility with new location metadata
  - restore-specific regression coverage for location recent events
  - optionality/backward compatibility for richer frontend world payloads

### Highest-Priority Follow-Up For `--reviews`
If this feedback is incorporated into replanning, the most important additions are:
- make migration/default/backfill handling explicit in `43-01`
- decide and state the authoritative contract for multi-tick travel versus global simulation cadence in `43-02`
- tighten/clarify travel feedback and compatibility behavior in `43-05`
