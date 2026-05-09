# Phase 88 Risk Review

## Verdict

The report direction is sound, but Phase 88 is high-risk unless planning starts with the authority spine and versioned simulation boundary. Current WorldForge already has GM Read, grounded tool execution, NarratorPacket visibility guardrails, rollback snapshots, present-NPC ticks, offscreen NPC batches, reflection, faction macro ticks, and forecasts. The dangerous part is not adding NPC agency; it is adding agency while current post-turn simulation can still mutate campaign state outside the player-visible `done` boundary.

Phase 88 should be treated as an architecture migration, not a feature pile. Execution should block on deterministic invariants for versioned jobs, actor-visible knowledge, rollback cleanup, memory caps, and serialized LLM group accounting before expanding key NPC/faction autonomy.

## Evidence Base

- Report: `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`
- Roadmap/state: Phase 88 is not planned yet, depends on Phase 87, and promises the full report scope.
- Mechanics/memory docs: backend is authoritative; current docs still describe macro faction ticks and bounded, not complete, knowledge modeling.
- Current route: `backend/src/routes/chat.ts` queues offscreen NPC, reflection, faction, embedding, and image work from detached post-turn work.
- Current engine: `backend/src/engine/turn-processor.ts` owns GM Read, tool loop, NarratorPacket, final narration, tick advance, forecast commit, cleanup, and `done`.
- Current NPC/faction systems: `npc-agent.ts`, `npc-offscreen.ts`, and `world-engine.ts` are tick/batch/faction-mind shaped, not actor-process/report-network shaped.

## Blocking Risks

### P0: Hidden state mutation after `done`

Current `chat.ts` says rollback-critical work must finish before done, but `runRollbackCriticalPostTurn` is empty and `queueAuxiliaryPostTurnWork` uses `setTimeout(runDetached, 0)`. That detached body calls `simulateOffscreenNpcs`, `checkAndTriggerReflections`, and `tickFactions`, all of which can write campaign state. This directly conflicts with the report invariant: after `done`, no detached job may mutate state readable by the next GM Read without versioned commit/rebase.

Required plan guardrail:
- Add `WorldVersion` and `SimulationJob/Proposal` before any expanded NPC loop.
- Every async job carries `baseVersion`, `targetWorldTime`, `writeScope`, `jobId`, and `supersededBy`.
- Next GM Read must either wait for required jobs, apply valid proposals through a commit boundary, or ignore stale jobs.
- Detached work after `done` may only write non-authoritative artifacts unless it revalidates against current version and commits as a new visible boundary.

### P0: Stale async jobs and rollback branch contamination

Retry/undo restore snapshots currently restore the turn bundle and drain pending committed events for the current tick on error paths, but detached post-turn work is not represented as a cancelable job ledger. `captureSnapshot` and `restoreSnapshot` exclude vectors by design. Phase 88 adds exactly the artifacts most likely to outlive a branch: actor memories, reports, queued wakeups, world threads, faction operations, proposals, and embeddings.

Required plan guardrail:
- Store simulation queue state in the authoritative rollback bundle.
- On retry/undo/checkpoint load, cancel or supersede jobs created after the restored version.
- Mark later events, memories, reports, proposals, embeddings, and cached narrator packets as superseded or rebuildable.
- Add tests where an async NPC/faction/reflection job completes after retry/undo and proves it cannot mutate restored state.

### P0: Current faction system is still a ghost mind

The report says factions are institutional substrate; decisions must come from leaders, command nodes, units, standing orders, reports, resources, and communication latency. Current `world-engine.ts` prompts a "world simulation engine evaluating faction" with all other factions and recent chronicle, then lets the faction choose one macro action. That is the exact ghost-mind pattern Phase 88 is meant to replace.

Required plan guardrail:
- Do not extend `tickFactions` as the Phase 88 faction core.
- Introduce `FactionState` as state only, plus `CommandNodeActor`, `UnitActor`, standing orders, report inboxes, resource pools, and communication latency.
- Faction responses must require an arrived report or standing-order trigger.
- Tests must fail if a faction reacts to a player crime before a witness/report path exists.

### P0: Actor omniscience risk in NPC frames

Current present NPC prompts use encounter-scope filtering, which is good, but they still assemble context ad hoc from location, nearby entities, relationship graph, and memories. Offscreen simulation batches multiple NPCs under a world-simulation prompt and returns only `newLocation`, `actionSummary`, and `goalProgress`. That is not the report's `ActorFrame` with source-tagged observations, reports, rumors, beliefs, inbox, legal tools, and known-facts provenance.

Required plan guardrail:
- Build a single ActorFrame assembler before adding actor tools.
- Every fact in ActorFrame must carry source route: observed, report, rumor, inferred, memory, public record, or self-state.
- Add hard-fail leak tests: hidden truth excluded from ActorFrame, ActorDecisionPacket `known_facts_used` IDs must exist in frame, false player claims create claims/beliefs rather than truth.
- Offscreen NPCs must not receive global WorldState or shared batch context unless it is explicitly a report/observation available to each actor.

### P0: Serial LLM hop explosion

The report caps normal turns at 4 serialized LLM decision groups and heavy turns at 5. Current live turn already spends groups on GM Read, optional Oracle/combat, GM tool loop, final narration, and sometimes forecast refresh. Current present NPC ticks run sequentially. Naively adding key NPC actor turns, command nodes, world threads, reflections, memory compaction, and grounding checks to the critical path will blow the budget.

Required plan guardrail:
- Add `TurnLatencyTrace` and serialized group counter before expanded runtime.
- Present actor reactions must be one parallel group where write scopes do not conflict.
- Actor plans should schedule deterministic continuation via `next_decision_at` instead of re-calling LLM on every player turn.
- Forecast/proposal/reflection/compaction must not enter the visible critical path unless marked required for current SceneFrame.
- Live playtests are not enough; deterministic tests must assert group counts by turn class.

### P0: Memory overgrowth and rollback-hostile memory

Current memory writes include same-turn committed evidence and offscreen summaries; retrieval is top-N and not a full per-actor memory hierarchy. Phase 88 multiplies writers: actor turns, command nodes, reports, rumors, thread digests, reflections, and proposals. Without a memory write policy and provenance schema first, the system will duplicate summaries, pollute actor prompts, create stale beliefs, and leave rollback residue.

Required plan guardrail:
- Add `MemoryRecord` with owner, privacy, source event IDs, confidence, salience, supersession, expiry/compaction state, and rollback version.
- Treat summaries as indexes, never truth replacement.
- Do not write memory for narration flavor, unchanged scene descriptions, uncommitted proposals, or internal model reasoning.
- Add `ContextBudgetTrace` and `MemoryQualityTrace` gates before broad long-form tests.
- Add stress tests for 100+ turns proving relevant old memory recall, duplicate control, stale belief handling, and token budget compliance.

### P0: Migration sequence can break current GM-first architecture

The roadmap says Phase 88 must implement the full architecture, but the report's own order starts with authority spine, then key NPC loop, latency, memory, factions, world threads, evaluation. Current architecture has hard-won boundaries from Phases 78-85: GM-first interpretation, grounded refs, backend tool authority, settled narrator packet, no hidden truth in final narration. If Phase 88 starts by expanding NPC behavior first, it risks reopening Phase 79-82 bugs.

Required plan guardrail:
- Plan Phase 88 as gated waves, not eight equal feature plans.
- Wave 1: authority/version/job/proposal/rollback invariants.
- Wave 2: ActorFrame and PlayerFacingPacket split with leak tests.
- Wave 3: key actor process loop with deterministic plan executor.
- Wave 4: latency and memory instrumentation.
- Wave 5: faction command network.
- Wave 6: world threads and surfacing.
- Wave 7: deterministic plus long-form live evaluation.

## Major Warnings

### P1: Tick model is not world-time model

Current systems mostly key off `currentTick`, player turn completion, travel cost, or `tick % interval`. The report explicitly rejects player-turn scheduling and requires world-time, action duration, due points, interrupts, and agency debt. Reusing `tick % interval` under new names will preserve the broken behavior: too many decisions on short dialog turns and too few decisions across large time skips.

Plan expectation:
- Introduce `WorldTime` and duration semantics before `next_decision_at`.
- Travel, waiting, training, project steps, and sleep must advance world-time consistently.
- Catch-up must resolve due exposed scope before SceneFrame assembly.

### P1: Tool authority surface is underspecified

The report distinguishes player GM tools, actor tools, command-node tools, unit tools, and thread tools. Current NPC tools are narrow (`act`, `speak`, `move_to`, `update_own_goal`), while offscreen updates bypass granular validated actor actions with summary writes. A plan that only adds more tool names without shared `ToolResult` semantics will not prove causal agency.

Plan expectation:
- Define actor/command/thread tool schemas with `baseVersion`, elapsed time, state deltas, events, witnesses, knowledge outputs, visibility outputs, and failure reasons.
- Require no fake successful no-ops.
- Preserve backend validation as final authority.

### P1: PlayerFacingPacket split exists but is not enough

`turn-processor.ts` builds a NarratorPacket and uses a visibility guard, which is aligned with the report. Phase 88 still needs a stricter split between World Auditor/Simulation Authority and player-facing Narrator. Actor/private/offscreen facts can leak through forecasts, recent conversation, scene assembly, support responses, report summaries, or cached proposals if the packet contract is not expanded to world-time simulation artifacts.

Plan expectation:
- Extend packet validation to world threads, actor proposals, faction reports, rumors, and command-node decisions.
- Narrator must only see committed visible facts plus player-known uncertainty.

### P1: Testability can collapse into live-play vibes

The report asks for long-form live playtests, but Phase 88 correctness is mostly invariant-driven. Hidden mutation, actor ignorance, stale jobs, report latency, rollback, write-scope conflicts, and memory budgets need deterministic fixtures. Live tests should prove feel after invariant gates pass, not substitute for them.

Plan expectation:
- Deterministic tests first for all P0 invariants.
- Live routes after: tourist, key NPC ignored, shadow key NPC, false claim, faction report latency, rollback/retry, memory stress, latency stress, combat with key actors.
- Each live route must emit trace artifacts: TurnLatencyTrace, ContextBudgetTrace, job/proposal ledger, actor frame audit, packet visibility audit.

### P1: Existing docs conflict with code boundary

`docs/memory.md` says rollback-critical finalization includes present-NPC updates, offscreen simulation, reflection, and faction ticks before `done`. Current `chat.ts` has moved offscreen simulation, reflection, and faction ticks into detached auxiliary work. Phase 88 planning must reconcile this explicitly or implementation will inherit a false baseline.

Plan expectation:
- Update mechanics/memory docs as part of authority-spine completion.
- Define which work is required-before-done, versioned-after-done, and purely auxiliary.

## Minimum Acceptance Gates For Phase 88 Plans

1. No plan may add new autonomous mutation without `WorldVersion`/job/proposal/rebase semantics.
2. No plan may keep offscreen NPC/faction/reflection as detached authoritative writes after `done`.
3. No plan may extend faction macro ticks as faction cognition; command/report/resource network must replace it.
4. No plan may call a key NPC brain without an ActorFrame leak test and source-provenance audit.
5. No plan may rely on player-turn polling as the primary scheduler.
6. No plan may claim rollback safety without superseding jobs, events, memories, reports, proposals, and caches.
7. No plan may add broad memory writes without MemoryRecord provenance, write policy, compaction, and context budget traces.
8. No plan may add actor/faction/world-thread LLM calls without serialized group accounting and deterministic latency assertions.
9. No plan may rely on live playtests before deterministic invariant tests exist.
10. No plan may implement "full Phase 88" as a single runtime rewrite; gated migration is required.

## Suggested Planning Cut

Recommended internal order:

1. Authority spine: version, event log, world time, job/proposal ledger, rollback cancellation, packet/actor-frame audit hooks.
2. ActorFrame and PlayerFacingPacket hardening: source provenance, hidden-truth exclusion, false-claim semantics.
3. KeyActorProcess: durable goals, active plan, next decision, interrupts, actor tools, deterministic continuation.
4. Latency and memory control: traces, group counters, write scopes, memory schema, retrieval/compaction policy.
5. Factions: command nodes, reports, resources, standing orders, communication latency.
6. World threads: durable clocks/stages/surface routes and tourist-route surfacing.
7. Evaluation harness: deterministic invariants plus long-form live proof.

## Bottom Line

Direction should proceed, but only if Phase 88 plans treat the current detached post-turn simulation as the first bug to eliminate. The report's architecture is specifically designed to prevent stale hidden mutation, ghost faction cognition, omniscient actors, memory bloat, and serial LLM chains. If the plan layers co-player NPCs on top of the current tick/batch/detached-job seams, it will reproduce the failures the report warns about.
