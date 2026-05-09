# Phase 88 Cross-AI Plan Review

## Verdict: **FLAG**

## Summary

The Phase 88 planning is architecturally sound and represents one of the most thorough phase plans in this project. The authority-first wave ordering, explicit POV/redaction contracts, versioned proposal semantics, and sectional execution gates are all correct responses to the v3 report's warnings. However, there are several medium-to-high concerns that should be addressed before execution begins, primarily around scope density, missing integration hooks with existing Phase 78-87 GM architecture, and under-specified combat/contested-resource behavior within the actor tool layer.

---

## High Concerns

### H1: Scope density makes single-phase execution unrealistic
**Files:** `88-EXECUTION-WAVES.md`, `88-CONSIL-SYNTHESIS.md:50-56`

The consil synthesis itself acknowledges that Phase 88 may need to split into 88/89/90, but the plans are still numbered 88-01 through 88-11 as if they belong to one execution pass. Eleven plans covering: authority spine, POV contracts, turn boundary refactor, key actor scheduler, actor decision/tools, offscreen plan executor, memory/knowledge propagation, faction command networks, world threads, latency/parallelism observability, and full verification matrix — this is 3-4 milestones of work compressed into one phase. The plans do not define a "minimum viable Phase 88" that could ship independently if execution stalls at wave 4 or 5.

**Recommendation:** Explicitly define a Phase 88 minimum scope (waves 1-5) and move waves 6-7 into Phase 89/90 with their own requirements IDs. The consil mentions this as a "scheduling tool only" but the plans themselves don't reflect it.

### H2: Actor tool set includes combat but delegates to Phase 66/67 envelope without clear integration
**Files:** `88-05-PLAN.md:19`, `88-05-PLAN.md:117`

Plan 88-05 lists `combat-envelope.ts` in `files_modified` and mentions "combat/contested-resource validation for actor actions" in scope, but the actual combat envelope from Phases 66/67 is player-turn-focused (Oracle-driven, GM Read, NarrativeOutcomeBounds). Actor tools need their own combat decision path: when does an offscreen actor enter combat, how does it resolve without the player's GM/Oracle loop, and how does it produce state that later intersects with player combat? The plan says "Include combat/contested-resource validation" but doesn't define the actor-side combat resolution contract.

**Recommendation:** Add a task in 88-05 that explicitly defines the actor-combat resolution path: either actors use the same CombatEnvelope + Oracle seam (requiring Oracle to be callable from actor brain context), or actors use a simplified deterministic combat resolver that produces compatible ToolResult/state artifacts. This is a critical gap because offscreen NPC combat is one of the primary "living world" promises.

### H3: Turn boundary refactor (88-03) touches `chat.ts` and `turn-processor.ts` — the most critical paths — without a migration compatibility strategy
**Files:** `88-03-PLAN.md:111-127`, `88-RESEARCH.md:90-91`

The research correctly identifies that `runRollbackCriticalPostTurn` is empty and `queueAuxiliaryPostTurnWork` runs detached mutation. Plan 88-03 says "convert state-bearing offscreen/reflection/faction detached work to proposal-only or disabled direct-write path until later waves reintroduce it through authority." But there's no explicit compatibility adapter defined. If the detached path is simply disabled, existing campaigns will lose offscreen NPC simulation, reflection, and faction ticks entirely until waves 4-8 are complete. That's a functional regression during a potentially multi-week implementation window.

**Recommendation:** Add a Task 2.5 in 88-03 that defines a temporary proposal-adapter wrapping the existing `simulateOffscreenNpcs`, `checkAndTriggerReflections`, and `tickFactions` calls so they continue producing proposals (not direct writes) during the migration window. This keeps the world "alive" during implementation without violating the new authority invariant.

---

## Medium Concerns

### M1: 88-07 memory/knowledge plan adds `knowledge-model.ts` but doesn't specify storage layer
**Files:** `88-07-PLAN.md:92-98`

The plan adds belief/report/rumor semantics but doesn't state whether these become new SQLite tables (like 88-01's authority tables), LanceDB entries, or in-memory structures with periodic persistence. The v3 report defines `Belief` and `MemoryRecord` as structured DB entities, but 88-07's `files_modified` list doesn't include `schema.ts` or a migration file.

**Recommendation:** Either add schema/migration tasks to 88-07, or explicitly state that the knowledge model reuses the authority tables from 88-01 with a type layer on top. The current plan is ambiguous about persistence.

### M2: World thread surfacing (88-09) reuses `world-forecast.ts` but the boundary between advisory forecast and committed thread state is thin
**Files:** `88-09-PLAN.md:16-18`, `88-RESEARCH.md:140-141`

The research notes that `worldTrajectoryForecast` "should remain advisory unless converted into versioned proposals." Plan 88-09 modifies `world-forecast.ts` and `world-forecast-builder.ts` alongside new world thread models. The risk is that forecast and thread state blur during implementation, creating a path where advisory forecasts accidentally become executable truth.

**Recommendation:** Add an explicit invariant test in 88-09 Task 4 that seeds a forecast entry and proves it cannot become a committed world-thread state change without an explicit actor/faction tool call.

### M3: No explicit frontend work is planned for Stage 88, but the v3 report defines UI stage progress for long turns
**Files:** `88-EXECUTION-WAVES.md`, `v3 report:801-820`

The v3 report specifies honest UI stages ("Resolving your action...", "Checking local reactions...", "Advancing world time...") that don't leak hidden truth. None of the 11 plans include frontend modifications. Phase 88's latency increases will make the current spinner UX noticeably worse.

**Recommendation:** This is acceptable to defer to a follow-up phase IF the backend emits the required SSE stage events. Add a must-have truth to 88-03 or 88-10: "turn processor emits named SSE stage events for each boundary phase." This unblocks frontend work without requiring it in Phase 88.

### M4: Parallel simulation runner (88-10) is planned last but is needed by waves 4-6
**Files:** `88-10-PLAN.md`, `88-EXECUTION-WAVES.md:117-134`

Wave 4 requires present actor reactions to run "in parallel where independent." Wave 6 requires faction command nodes to run independently. But the parallel runner with write-scope conflict handling is in wave 7 (88-10). This means waves 4-6 will either run actors sequentially (violating the latency budget) or implement ad-hoc parallelism that 88-10 must later refactor.

**Recommendation:** Move the parallel runner foundation (write-scope conflict detection + parallel execution) into wave 4 (88-04) as a Task 3.5, and keep the observability/trace parts in 88-10.

### M5: 88-06 plan executor doesn't define what happens when a deterministic plan step fails mid-execution
**Files:** `88-06-PLAN.md:91-92`

The plan says "Execute travel, training, search, guard, repair, rest, and operation-prep steps through world time until due time, decision point, interruption, failure, or broken precondition." But it doesn't define the failure semantics: does the actor replan immediately? Does it log a failure event? Does it notify affected parties? The v3 report says "failure/partial tool results, replanning" but the executor plan doesn't wire this.

**Recommendation:** Add a failure handling subtask to 88-06 Task 2 that defines: failure event creation, actor replan trigger, and notification of affected actors/factions through the knowledge model (88-07).

---

## Low Concerns

### L1: 88-11 verification plan is comprehensive but depends on all prior waves being green
**Files:** `88-11-PLAN.md:83-89`

The preflight task checks that wave evidence folders exist, which is good. But there's no explicit "if wave N failed, skip waves N+1" gate defined in the plan tasks.

### L2: No explicit migration script for existing NPC rows to KeyActorProcess format
**Files:** `88-04-PLAN.md`

Existing key-tier NPCs have `goals`, `beliefs`, and `unprocessedImportance` fields in the current schema. The plan adds `KeyActorProcess` records but doesn't define a backfill or migration to populate `resolved_through_time`, `active_plan`, `next_decision_at`, etc. for existing NPCs.

### L3: Location graph integration is mentioned in 88-06 but `location-graph.ts` is listed without context
**Files:** `88-06-PLAN.md:16-17`

The plan imports `location-graph.ts` for travel cost computation but doesn't verify that the current location graph supports the travel semantics the v3 report requires (route + travel cost + interruptions).

---

## Residual Risks Acceptable Until Wave Proof Gates

| Risk | Wave Gate | Rationale |
|------|-----------|-----------|
| Actor-combat resolution undefined | Wave 4 proof | Can be defined during 88-05 implementation; the authority spine must exist first |
| Memory storage layer ambiguous | Wave 5 proof | 88-01 authority tables can serve as the backing store; type layer can be added in 88-07 |
| Parallel runner timing | Wave 4 proof | Sequential actor execution is acceptable for wave 4 unit tests; parallelism must be proven by wave 7 |
| UI stage events | Wave 3 proof | Backend can emit SSE stages without frontend work; frontend is a follow-up concern |
| Existing NPC backfill | Wave 4 proof | New NPCs get processes on creation; backfill can be a post-wave-4 script |

---

## Suggestions Before Execution

1. **Define Phase 88 minimum scope explicitly** — waves 1-5 as shippable, waves 6-7 as Phase 89.
2. **Add actor-combat resolution contract** to 88-05 with a clear decision: Oracle-callable vs. deterministic resolver.
3. **Add temporary proposal adapter** to 88-03 so existing offscreen simulation continues producing proposals during migration.
4. **Clarify knowledge model persistence** in 88-07 — either new tables or reuse 88-01 authority tables.
5. **Move parallel runner foundation** to wave 4 (88-04) so actor reactions can actually be parallel during implementation.
6. **Add SSE stage event emission** as a must-have truth in 88-03 or 88-10.
7. **Add failure handling semantics** to 88-06 plan executor.

---

## Final Readiness Statement

Phase 88 planning is architecturally excellent — the wave ordering, authority-first approach, POV contracts, and verification gates are all correct. The FLAG verdict is driven by scope density (11 plans in one phase), a few under-specified integration points (actor combat, parallel runner timing, migration compatibility), and one ambiguous persistence decision (knowledge model storage). These are all addressable before execution and do not invalidate the overall plan direction. With the suggested fixes, this phase would be ready for PASS.
