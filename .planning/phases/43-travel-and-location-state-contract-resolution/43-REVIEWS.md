---
phase: 43
reviewers: [gemini, claude]
reviewed_at: 2026-04-11T18:15:02.3414545+03:00
plans_reviewed: [43-01-PLAN.md, 43-02-PLAN.md, 43-03-PLAN.md, 43-04-PLAN.md, 43-05-PLAN.md]
---

# Cross-AI Plan Review — Phase 43

## Gemini Review

This review covers the 5 implementation plans for **Phase 43: Travel & Location-State Contract Resolution**.

### Summary
The plans provide a comprehensive and architecturally sound roadmap for transforming the current "teleport-based" movement into a defensible graph-based traversal system with persistent local history. By shifting from a flat JSON adjacency list to a normalized edge table and explicit location classes (Macro, Sublocation, Ephemeral), the implementation ensures that travel time and revisit history are mechanically "true" rather than just prose. The strategy of using a write-through SQLite projection for local events—linked to episodic memory—is particularly strong as it guarantees consistency with the project's strict rollback/undo/checkpoint requirements.

### Strengths
*   **Normalized Schema Design**: Moving from `connectedTo` JSON strings to a `location_edges` table with explicit `travelCost` is the correct engineering choice. it enables clean pathfinding and weight-based travel without ad-hoc string parsing.
*   **Unified Traversal Contract**: Plan 02 correctly forces both the Player turn loop and NPC agents through the same `location-graph.ts` authority, preventing semantic drift where NPCs might "teleport" while the player is forced to spend time.
*   **Ephemeral Scene Archiving**: The "anchor" logic (Plan 01/03) for scene-born locations (like a temporary alley encounter) ensures that world consequences are not lost when the temporary node is cleaned up, solving a major continuity risk.
*   **Restoration Fidelity**: Explicitly including `location_recent_events` in the checkpoint and rollback logic (Plan 03) maintains the "mechanical truth" core value, ensuring that local history doesn't become "hallucinated" after a reload.
*   **Proactive TDD**: The inclusion of Wave 1 failing regressions for path-bound travel and local history (Plan 01) ensures that implementation cannot "cheat" by falling back to simpler instant movement.

### Concerns
*   **Tick-Jump Side Effects (MEDIUM)**: Plan 02 Task 1 advances the global campaign tick by the `totalCost` of travel. While honest, this may trigger "one-off" events in NPC/Faction simulation that were meant to happen during the intermediate ticks. The plans assume simulation runs once at the boundary; if there are threshold-critical events (e.g., "bomb explodes at T=10") and travel jumps from T=8 to T=12, the system must ensure these boundaries are still evaluated.
*   **Migration Complexity (LOW)**: The backfill in Plan 01 for existing campaigns must handle cases where the old `connectedTo` JSON might be malformed or missing. The additive approach is safe, but the backfill script needs to be robust.
*   **Pathfinding Edge Cases (LOW)**: If the graph has cycles or unintended shortcuts, the `resolveTravelPath` helper needs a bounded search (e.g., BFS/Dijkstra) to avoid infinite loops or confusing path selections. The plan assumes a "believable" path but doesn't specify the algorithm.

### Suggestions
*   **Tick-Advancement Policy**: In Plan 02, clarify whether intermediate simulation "ticks" should be simulated individually if travel time is large (e.g., a 10-turn journey) or if a single "summed" simulation tick is acceptable. For v1.1 fidelity, a single boundary simulation is likely sufficient, but it should be explicitly noted in the `onPostTurn` handling.
*   **Path Summary UI**: In Plan 05, when showing connected paths, consider a "Via..." summary if the path spans multiple nodes (e.g., "To: Castle [3 turns] via Market Square") to make the graph-traversal visible to the player.
*   **Default Travel Formula**: Standardize the default edge cost (e.g., 1 turn for sublocations, 2-3 for macro locations) during the worldgen backfill to ensure a consistent experience across all campaign types.

### Risk Assessment: LOW
The risks are low because the plans strictly adhere to the stack (Drizzle/SQLite) and build upon the already-verified checkpoint/restore seams from Phase 41. The phased approach—contract first, logic second, read surfaces last—prevents "broken middle" states. The primary risk is purely gameplay balance (how "fast" travel feels), which is easily tunable via the normalized edge weights once the system is live.

**Verdict: Approved. The plans are ready for execution.**

---

## Claude Review

# Phase 43 Plan Review: Travel & Location-State Contract Resolution

## Overall Phase Assessment

Phase 43 is a well-structured location-system repair split across 5 plans in dependency order: contract definition → travel graph → local history writes → backend reads → frontend rendering. The wave structure is sound and the dependency chain is honest. The plans are thorough, perhaps overly so for what is fundamentally a schema extension + movement rewrite + event projection + two read surfaces.

---

## Plan 43-01: Shared Contract, Schema, Migration, Regressions

### Summary
Defines the shared type vocabulary, extends SQLite schema with typed locations/edges/events, adds migration backfill for existing campaigns, updates worldgen, and writes failing tests for later plans. This is the foundation plan — everything else depends on it.

### Strengths
- Correctly front-loads the contract definition before implementation starts
- Explicit backfill path for pre-Phase-43 campaigns prevents data loss
- TDD approach for Task 2 locks behavior before implementation
- `must_haves` section is concrete and grep-verifiable
- Keeps `connectedTo` as bounded compatibility projection rather than ripping it out

### Concerns
- **MEDIUM**: Task 1 touches 5 files including schema, migration, worldgen saver, and shared types in one "auto" task. That's a lot of surface for a single atomic commit. If the migration backfill has a bug, it contaminates the entire task.
- **MEDIUM**: The plan says Task 2 tests should "fail only because the Phase 43 implementation is not wired yet" — but this is fragile. Tests that import non-existent modules (`location-graph.ts`) will fail at import time, not at assertion time. The plan should clarify whether these tests mock the not-yet-created modules or use a different strategy.
- **LOW**: No explicit guidance on how `connectedTo` stays in sync with `location_edges` during the transition period. Plans 02-04 will read from edges, but other code (worldgen review, world-review UI) may still read `connectedTo`. A stale projection could cause UI/backend drift.
- **LOW**: The migration backfill populating `location_edges` from `connectedTo` JSON — does it handle malformed JSON in existing campaigns? The current `connectedTo` is a plain string column with no validation beyond "it should be JSON."

### Suggestions
- Split Task 1 into two: (a) shared types + schema extension, (b) migration/backfill + worldgen saver. The schema is the contract; the migration is the compatibility story. Conflating them risks a messy revert if backfill logic is wrong.
- For Task 2, explicitly state whether tests will mock the not-yet-created `location-graph.ts` module or test against the schema/types only. "Fails because implementation isn't wired" needs a concrete strategy.
- Add a brief note about `connectedTo` sync strategy: will `scaffold-saver` write both `connectedTo` AND `location_edges`, or only edges with a derived projection?

### Risk Assessment: **LOW-MEDIUM**
The plan is solid but Task 1 scope is wide for a single commit. The TDD regression locking in Task 2 is the right call but needs clearer import/mock strategy for not-yet-created modules.

---

## Plan 43-02: Authoritative Graph Traversal & Travel-Time Cost

### Summary
Creates `location-graph.ts` as the shared path resolver, rewires player/NPC/tool movement to use it, and makes travel consume explicit tick cost. This is the GSEM-03 implementation plan.

### Strengths
- Clean separation: Task 1 builds the resolver, Task 2 wires all consumers
- Explicit treatment of the "multi-tick advance" question: travel advances tick by `totalCost` once, post-turn simulation runs at the resulting boundary — no synthetic intermediate turns
- NPC movement shares the same resolver for reachability but doesn't independently advance the global tick — correct asymmetry
- Both player movement entry points (inline detection in turn-processor, storyteller `move_to` in tool-executor) are explicitly unified through one destination resolver
- `reveal_location` is updated to write normalized edges, not just adjacency JSON

### Concerns
- **HIGH**: The plan says player travel advances campaign tick by `totalCost`. But `turn-processor.ts` currently calls `incrementTick(campaignId)` at the end of the turn (line 644). If travel also advances tick by cost, and then the normal turn-end increment fires, the player loses an extra tick. The plan must explicitly address how travel-tick-advance interacts with the existing end-of-turn `incrementTick`. Does travel replace it? Does it add to it? Does the turn-end increment become `+0` for travel turns?
- **HIGH**: The `detectMovement` function (turn-processor.ts:127) uses an LLM call to determine if a player action is movement. If the LLM says "yes, destination is X" but X is 3 hops away with cost 5, the Oracle still evaluates the action as if it were a normal turn. But the player hasn't "done" anything mechanically — they just traveled. Does the Oracle call still fire? Does it evaluate "walking to X" and produce a strong_hit/miss? The plan doesn't address how travel interacts with the existing Oracle → Storyteller pipeline. This is a significant gameplay question.
- **MEDIUM**: Path resolution for "multi-edge" travel — what algorithm? BFS? Dijkstra? The plan says "believable graph path" but a simple BFS finding shortest hop count ignores `travelCost` weighting. If edges have different costs, you need cost-weighted shortest path. The research recommends "start with explicit per-edge integer cost" but the resolver algorithm isn't specified.
- **MEDIUM**: What happens if the player tries to move somewhere that requires traversing an ephemeral scene node that has been archived? The plan says "archived ephemeral scene nodes are not treated as normal traversal targets" — but if they were the only path between two persistent locations, archiving them severs the graph. Is this intended?
- **LOW**: `advanceCampaignTick` is added to `manager.ts` and exported from `campaign/index.ts`. The existing `incrementTick` already does `currentTick + 1`. Adding a second tick-mutation path creates a subtle race risk if both are called in the same turn.

### Suggestions
- **Critical**: Add explicit guidance on how travel-tick-advance composes with the existing end-of-turn `incrementTick`. Recommended: travel replaces the normal increment for that turn, so `incrementTick` at turn-end checks if travel already advanced and skips/adjusts accordingly.
- **Critical**: Address the Oracle/Storyteller interaction for travel turns. Options: (a) movement bypasses Oracle entirely and just narrates the journey, (b) Oracle evaluates the travel action like any other but outcome only affects flavor, (c) the plan explicitly defers this to "current behavior" and documents the limitation. Any of these is fine, but silence is a bug.
- Specify the path algorithm: cost-weighted BFS (Dijkstra) or simple hop-count BFS. For a text RPG with integer costs, Dijkstra on a small graph is trivial and correct.
- Clarify graph connectivity after scene archival: do archived scene edges get cleaned up, or do they remain as "discovered but inactive" paths?

### Risk Assessment: **MEDIUM-HIGH**
The travel-tick and Oracle interaction gaps are real gameplay bugs waiting to happen. The graph resolver itself is straightforward, but the integration with the existing turn pipeline needs explicit seam documentation.

---

## Plan 43-03: Write-Through Location Recent Happenings

### Summary
Creates `location-events.ts` as the projection seam, wires all runtime writers (player events, NPC dialogue/actions, off-screen simulation, faction tools) to write location-local history rows, and adds checkpoint restore coverage. This is the GSEM-04 write side.

### Strengths
- Correct architectural choice: SQLite projection from authoritative events, not vector-only
- Explicit traceability via `sourceEventId` linking back to episodic events
- Ephemeral scene consequence retention through anchor semantics is well-specified
- Checkpoint restore coverage is included in the same plan, not deferred
- Two-task split (seam + core writers first, then remaining writers + restore coverage) is sensible

### Concerns
- **MEDIUM**: Task 1 says to update `storeEpisodicEvent` callers so location metadata is concrete. But `storeEpisodicEvent` currently takes `location: string` (a free-text field, often empty string — see episodic-events.ts:201). Converting this to concrete `locationId` requires every caller to resolve location context. The plan says "when a caller lacks an explicit location... skip projection rather than writing fake sentinel locations." This is correct, but the sheer number of callers (tool-executor `log_event`, npc-tools `speak`, npc-offscreen, faction-tools) means Task 1 scope creep is likely if the executor tries to handle all of them.
- **MEDIUM**: The plan modifies `storeEpisodicEvent` itself to project into `location_recent_events`. But `storeEpisodicEvent` writes to LanceDB (vector store), while `location_recent_events` is in SQLite (campaign state.db). These are different databases. The projection write needs the campaign's SQLite db handle, which `storeEpisodicEvent` currently doesn't receive — it only gets `campaignId` and uses `getVectorDb()`. Adding a SQLite write inside a LanceDB write function creates a coupling concern.
- **LOW**: Two tasks both modify the same files (`tool-executor.ts`, `episodic-events.ts`). If Task 1's commit changes the module interface and Task 2 depends on it, the TDD red-green cycle for Task 2 may conflict with Task 1's green state.

### Suggestions
- Consider having `recordLocationRecentEvent` as a separate call alongside `storeEpisodicEvent` rather than inside it, to keep the LanceDB writer and SQLite writer independent. Callers that know location context call both; callers that don't skip the projection.
- Explicitly state whether the projection write uses `getDb()` (campaign SQLite) or needs a db handle passed in. This matters for testability.
- Clarify Task 1 vs Task 2 boundary: Task 1 should create the seam + wire the player-facing `log_event` path only. Task 2 should wire NPC/faction/offscreen writers and add restore coverage. The current plan says roughly this, but the acceptance criteria overlap.

### Risk Assessment: **MEDIUM**
The core design is sound. The cross-database projection (LanceDB event → SQLite projection) needs explicit coupling guidance. Task scope overlap risk is minor.

---

## Plan 43-04: Backend Read Surfaces (API + Prompt Assembly)

### Summary
Updates the world API to expose `connectedPaths` and `recentHappenings` per location, and extends prompt assembly to surface current-location recent history. This is the GSEM-04 read side.

### Strengths
- Clean read-side-only plan — no write-side changes
- Both API and prompt assembly read the same seam, preventing drift
- Explicit batch-loading guidance to avoid N+1 queries per location
- Prompt section is bounded (5 events, truncation-safe) to avoid crowding higher-priority context
- Archived scene spillover is explicitly included in both read surfaces

### Concerns
- **MEDIUM**: The world API currently returns `locations: worldLocations` as raw DB rows (campaigns.ts:86-88). Adding `connectedPaths` and `recentHappenings` per location means either: (a) enriching each location object inline (N+1 risk if not batched), or (b) adding separate top-level arrays. The plan says "batch-load" but doesn't specify the payload shape. If it's `locations[].connectedPaths` (inline enrichment), the frontend must handle the new shape. If it's a separate `locationPaths` map, the frontend wiring is different. This should be explicit.
- **LOW**: The prompt assembly `Recent happenings here` section competes for token budget with existing SCENE, NPC STATES, and WORLD STATE sections. The plan says "truncation-safe" but doesn't specify the priority number. Given that SCENE is priority 2 (non-truncatable) and WORLD STATE is priority 3, where does local happenings sit? If it's inside SCENE (extending `buildSceneSection`), it inherits non-truncatable status. If it's a separate section, it needs its own priority.
- **LOW**: No explicit treatment of what happens when a location has 100+ recent events. The plan says "cap to 5 most recent" but should also mention the DB query uses `ORDER BY tick DESC LIMIT 5` or similar to avoid scanning the full table.

### Suggestions
- Specify the API payload shape: recommend inline `locations[].connectedPaths` and `locations[].recentHappenings` with batch loading via two campaign-wide queries (all edges, recent events grouped by location), then map-join in the route handler.
- State the prompt section priority explicitly. Recommend: a separate `LOCATION HISTORY` section at priority 5-6 (truncatable), rather than embedding it in the non-truncatable SCENE section.
- Add `LIMIT` + `ORDER BY` guidance for the recent-events query.

### Risk Assessment: **LOW**
This is the simplest plan in the phase. The main risk is payload shape ambiguity, which is easily resolved during implementation.

---

## Plan 43-05: Frontend Parsing & Gameplay Rendering

### Summary
Updates frontend types/parsing to consume the richer backend payload, adds travel cost display and recent happenings to the location panel, and wires `/game` to show travel feedback.

### Strengths
- Backward-compatible: richer fields are optional/nullable so older payloads still work
- Explicit compatibility story for world-review surfaces that still need name-only `connectedTo`
- Two-task split: (1) parsing/helpers, (2) rendering — clean separation
- Location panel gets honest empty state for happenings instead of silence
- Travel feedback on `/game` (transient status line for multi-tick moves) is included

### Concerns
- **MEDIUM**: The current `connectedLocations` derivation in `page.tsx:185-191` maps `connectedTo` IDs to location objects. Plan 43-05 replaces this with `connectedPaths` which presumably has `{ destinationId, destinationName, travelCost }` shape. But `onMove` (line 467) dispatches `go to ${targetLocationName}` as a player action — this feeds back into the LLM movement detection pipeline. If travel cost is 3 ticks, the player says "go to X", the backend resolves the path and advances 3 ticks, but the LLM still processes the action through Oracle. The frontend rendering of "travel feedback" must account for the fact that the actual movement resolution happens server-side during the turn pipeline, not at button-click time. The plan should clarify the timing.
- **LOW**: The plan says `location-panel.tsx` renders `Recent Happenings` — but the current panel is a narrow 250px sidebar (`lg:w-[250px]`). Adding another section with event summaries could make it very long. No UX guidance on scroll behavior or section collapsibility.
- **LOW**: The `WorldData` interface in `api-types.ts` has `connectedTo: string[]` as a required field. Making `connectedPaths` optional alongside it is fine for backward compat, but the plan should specify whether `connectedTo` is still populated or becomes empty when `connectedPaths` is present.

### Suggestions
- Clarify travel feedback timing: the frontend shows a transient "Traveling to X (3 ticks)" message from the `state_update` SSE event, not from button click. This is already how `location_change` works, so the plan just needs to confirm the pattern.
- Recommend keeping `connectedTo` populated as a compatibility field until all frontend consumers are migrated, then deprecate it.
- Consider max-height or collapsible section for Recent Happenings in the narrow sidebar.

### Risk Assessment: **LOW**
Standard frontend wiring work. The travel feedback timing is the only subtlety and it follows existing patterns.

---

## Cross-Plan Concerns

### 1. Travel Turn Pipeline Integration (HIGH)
**Across Plans 02 and 05**: The biggest gap in the entire phase is how travel interacts with the existing Oracle → Storyteller → post-turn-simulation pipeline. Currently:
1. Player says "go to X"
2. `detectMovement` (LLM call) identifies destination
3. If adjacent and connected, player location updates immediately
4. Oracle evaluates the action
5. Storyteller narrates
6. Post-turn simulation runs
7. Tick increments by 1

Phase 43 changes step 3 to "resolve path, advance tick by cost." But steps 4-7 still fire. Does the Oracle evaluate "traveling 3 ticks to the Market"? Does the Storyteller narrate a journey? Does post-turn simulation see the jumped tick and potentially fire multiple reflection/faction cycles?

**Recommendation**: Plan 02 should include explicit guidance: "Travel turns still fire the full pipeline once. Oracle evaluates the travel action. Storyteller narrates arrival. Post-turn simulation runs once at the resulting tick. No intermediate per-edge subturns."

### 2. Drizzle Migration Strategy (MEDIUM)
**Plan 01**: The plan says `migrate.ts` handles additive schema changes. But Drizzle uses file-based migrations in `backend/drizzle/`. The current `runMigrations()` runs all migration files. Adding new columns to `locations` and new tables requires generating a new migration file via `npm run db:generate`. The plan doesn't mention this — it says to modify `migrate.ts` directly. If the executor adds columns via raw SQL in `migrate.ts` instead of a proper Drizzle migration, it will conflict with the Drizzle migration system.

**Recommendation**: Clarify whether Phase 43 schema changes go through Drizzle migration files (preferred) or through a manual `migrate.ts` hook. The existing `migrate.ts` just calls `migrate(getDb(), { migrationsFolder })`, suggesting Drizzle migrations are the intended path.

### 3. Test Mock Complexity (MEDIUM)
**Plans 01-04**: The existing test files use extensive manual mock databases (e.g., `campaigns.test.ts` has 5 levels of chained mock calls). Adding `connectedPaths`, `recentHappenings`, and `location_edges` to these mocks will make them significantly more complex. The Phase 43 regression tests will be brittle if they depend on mock call ordering.

**Recommendation**: Consider introducing a lightweight test helper that creates an in-memory SQLite database with the Phase 43 schema, rather than extending the existing chain-mock pattern. This would make tests more realistic and less fragile.

### 4. `connectedTo` Deprecation Timeline (LOW)
**Across all plans**: `connectedTo` is kept as a "compatibility projection" but no plan specifies when it stops being written or read. Without an explicit deprecation timeline, it will persist indefinitely as a second source of truth.

**Recommendation**: Add a note in Plan 01 or 05 that `connectedTo` should be removed or made read-only in Phase 44 (docs alignment phase).

---

## Final Verdict

| Plan | Risk | Ready to Execute? |
|------|------|-------------------|
| 43-01 | LOW-MEDIUM | Yes, with Task 1 scope clarification |
| 43-02 | **MEDIUM-HIGH** | Needs tick-advance + Oracle interaction guidance first |
| 43-03 | MEDIUM | Yes, with cross-db coupling clarification |
| 43-04 | LOW | Yes |
| 43-05 | LOW | Yes |

**Phase-level risk: MEDIUM.** The plans are well-structured and the dependency chain is correct. The critical gap is Plan 43-02's silence on how multi-tick travel composes with the existing turn pipeline (Oracle evaluation, tick increment, post-turn simulation). Fixing that gap before execution would prevent a gameplay-visible bug that's harder to repair retroactively.

---

## Codex Review

Skipped for independence because the current runtime is Codex.

---

## Consensus Summary

The post-`--reviews` plan set is still judged structurally strong: both external reviewers agree the phase remains a coherent, bounded location-system repair with the right dependency chain and the correct architectural move toward normalized edges plus authoritative location-local history.

### Agreed Strengths
- The 5-plan decomposition remains sound and dependency-correct.
- Normalized edge-based travel plus SQLite-backed local history is still the right authority model.
- Ephemeral-scene consequence retention and rollback/checkpoint alignment remain strong parts of the design.
- The phase still stays bounded and does not drift into map-rendering or transit-sim scope.

### Agreed Concerns
- Multi-tick travel semantics are better than before but still need one last explicit seam:
  - how travel composes with the existing turn pipeline
  - whether the normal end-of-turn tick increment is replaced or adjusted on travel turns
  - whether Oracle/Storyteller still process travel turns as ordinary turns
- Migration/backfill details remain important:
  - malformed legacy `connectedTo` JSON
  - exact migration path through the existing Drizzle migration system
- A few compatibility details should still be stated crisply:
  - `connectedTo` sync/deprecation timeline
  - optional payload behavior on frontend/world-review surfaces
  - query/prompt bounding for large location histories

### Divergent Views
- `Gemini` now rates the phase `LOW` risk and effectively approves execution, seeing the remaining issues as tuning/documentation detail.
- `Claude` still rates the phase `MEDIUM`, mainly because travel-turn composition with the current Oracle → Storyteller → post-turn pipeline is not explicit enough.
- `Claude` also raises secondary concerns not emphasized by `Gemini`:
  - Drizzle migration-file vs ad-hoc migration-path clarity
  - test fragility from expanding existing deep mock patterns
  - explicit `connectedTo` deprecation tracking

### Highest-Priority Follow-Up For `--reviews`
If this second review pass is incorporated into replanning, the most important additions are:
- make the travel-turn pipeline contract explicit in `43-02`
- clarify whether schema changes go through generated Drizzle migrations versus custom migration hooks in `43-01`
- tighten the compatibility/deprecation note for `connectedTo` so it does not become a permanent dual authority
