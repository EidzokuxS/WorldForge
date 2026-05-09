# Phase 88 Plan Slices Draft

Source inputs read:

- `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-offscreen.ts`
- `backend/src/engine/world-engine.ts`
- `backend/src/engine/reflection-agent.ts`
- `backend/src/engine/npc-tools.ts`

## Non-Negotiable Guardrails

- Backend authority: LLMs propose decisions, intents, and packets. Backend validators own world truth, state deltas, event commits, clocks, versioning, rollback, and legality.
- No fake fallback: provider/schema/tool failures fail closed or create non-mutating failed proposals. They must not synthesize success, substitute vague prose, or silently skip required state.
- No arbitrary duration timeout: runtime measures latency and controls serialized LLM groups, parallelism, prompt budget, and scheduling pressure. It must not abort valid long turns through a magic wall-clock cap.
- No output truncation as fix: oversize or invalid model output is rejected, repaired only when meaning is preserved, or rerun through a stricter prompt/schema. Final visible text and structured packets must not be cut to make tests pass.
- Actor private POV: key NPC and command-node prompts receive ActorFrame/CommandNodeFrame from beliefs, observations, reports, rumors, memories, local affordances, and legal tools only.
- Narrator redaction: player-facing Narrator receives committed visible truth through PlayerFacingPacket/NarratorPacket only. Hidden truth, private actor rationale, offscreen facts, and forbidden terms stay out of the prompt.

## Current Runtime Seams

| Seam | Current Shape | Phase 88 Direction |
| --- | --- | --- |
| `backend/src/routes/chat.ts` | `queueAuxiliaryPostTurnWork` runs offscreen NPCs, reflections, factions, embeddings, and images after SSE completion. | Move state-bearing work into versioned queue/proposal flow. Only non-state work may remain detached, and it must carry base-version diagnostics. |
| `backend/src/engine/turn-processor.ts` | Central GM Read, tool loop, NarratorPacket, forecast, snapshot, and final `done` boundary already exist. | Make this the authoritative boundary for required exposed simulation, world-time advancement, player-facing packet construction, and commit/rebase. |
| `backend/src/engine/npc-agent.ts` | Present key NPCs get sequential one-action LLM ticks scoped by scene presence. | Replace with ActorFrame plus ActorDecisionPacket loop, interrupt handling, write-scope validation, and parallel groups where independent. |
| `backend/src/engine/npc-offscreen.ts` | Every N ticks, a batch prompt directly applies offscreen key NPC summary updates. | Replace tick polling with KeyActorProcess, next_decision_at, active_plan, deterministic plan executor, wake signals, and versioned commits. |
| `backend/src/engine/world-engine.ts` | Each faction gets an abstract macro LLM tick and faction tools. | Replace abstract faction cognition with command nodes, reports, units/resources, standing orders, and operation ledgers. |
| `backend/src/engine/reflection-agent.ts` | Reflection uses importance budget and episodic retrieval, then mutates NPC structured state. | Fold reflection into actor memory/knowledge policy with provenance, required-before-use reflection, stale-belief handling, and context budget traces. |
| `backend/src/engine/npc-tools.ts` | Actor tools cover act/speak/move/update goal with direct writes or event logs. | Expand into backend-validated actor tools returning ToolResult with base_version, elapsed time, events, witnesses, resources, knowledge outputs, and failure reasons. |

## Dependency Map

| Slice | Depends On | Enables |
| --- | --- | --- |
| 01. Authority spine data model | None | 02, 03, 05, 11 |
| 02. POV and redaction contracts | 01 | 04, 05, 07, 09, 11 |
| 03. Versioned queue, proposals, and turn boundary | 01 | 04, 06, 08, 09, 11 |
| 04. KeyActorProcess scheduler and wakeups | 02, 03 | 05, 06, 07 |
| 05. ActorDecisionPacket and actor tools | 01, 02, 04 | 06, 07, 10, 11 |
| 06. World-time plan executor and offscreen catch-up | 03, 04, 05 | 08, 09, 10, 11 |
| 07. Memory, beliefs, and knowledge propagation | 02, 04, 05 | 08, 09, 11 |
| 08. Faction command networks | 03, 06, 07 | 09, 11 |
| 09. World threads and diegetic surfacing | 02, 03, 06, 08 | 10, 11 |
| 10. Latency, context-budget, and parallel execution observability | 05, 06, 09 | 11 |
| 11. Rollback, checkpoint, and living-world verification gate | 01-10 | Phase closeout |

Recommended execution waves:

- Wave 1: Slices 01 and 02.
- Wave 2: Slice 03.
- Wave 3: Slices 04 and 07.
- Wave 4: Slices 05 and 08.
- Wave 5: Slices 06 and 09.
- Wave 6: Slice 10.
- Wave 7: Slice 11.

## Slice 01: Authority Spine Data Model

Purpose: create the authoritative persistence and type contracts that every later slice uses for world version, world time, event log provenance, ToolResult, simulation jobs, actor process state, and rollback checkpoints.

Likely touched files:

- `backend/src/db/schema.ts`
- `backend/drizzle/0009_*.sql`
- `backend/src/engine/living-world-authority.ts`
- `backend/src/engine/tool-result.ts`
- `backend/src/engine/state-snapshot.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/engine/__tests__/living-world-authority.test.ts`
- `backend/src/engine/__tests__/tool-result-authority.test.ts`

Success criteria:

- Every state-bearing mutation can be tied to campaign id, base version, resulting version, world time/tick, event ids, actor/source, and ToolResult.
- ToolResult has success/partial/failure status, elapsed world time, state delta refs, event refs, witnesses, knowledge outputs, visibility outputs, resources spent, and failure reason.
- Snapshot/restore captures authority metadata, actor process rows, simulation queue/proposals, world-thread state, and version counters with no dangling jobs from reverted versions.
- Invalid or unknown version writes fail closed before state mutation.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/living-world-authority.test.ts src/engine/__tests__/tool-result-authority.test.ts`
- `npm --prefix backend run typecheck`
- Negative cases prove stale base_version writes reject and produce no event/state rows.

## Slice 02: POV and Redaction Contracts

Purpose: define exact prompt/input packets for ActorFrame, CommandNodeFrame, PlayerFacingPacket, ContextBudgetTrace, and narrator redaction so private actor/world truth cannot leak into final narration.

Likely touched files:

- `backend/src/engine/actor-frame.ts`
- `backend/src/engine/player-facing-packet.ts`
- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/scene-frame.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/prompt-contracts.ts`
- `backend/src/engine/__tests__/actor-frame.test.ts`
- `backend/src/engine/__tests__/player-facing-packet.test.ts`
- `backend/src/engine/__tests__/narrator-redaction.test.ts`

Success criteria:

- ActorFrame includes only self state, believed facts, direct observations, inbox reports/rumors, retrieved memories with source ids, relationships-as-believed, goals, active plan, local affordances, legal tools, and constraints.
- PlayerFacingPacket/NarratorPacket includes only visible committed truth, clear visible actors, hint signals, public scoped pressure, and explicit forbidden terms/markers.
- Narrator packet formatting throws if hidden actor names, private forecast terms, private actor rationale, or offscreen truth would enter prompt text.
- ContextBudgetTrace records tokens, retrieval counts, dropped candidates, source coverage, hidden truth exclusion count, and fail/warning status without cutting outputs.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/narrator-redaction.test.ts`
- `npm --prefix backend run typecheck`
- Leak fixtures prove hidden NPC location, hidden faction plan, private report contents, and actor rationale are absent from narrator prompts but present in internal authority traces.

## Slice 03: Versioned Queue, Proposals, and Turn Boundary

Purpose: replace detached state-bearing post-turn work with an explicit simulation queue, job/proposal lifecycle, required-before-done settlement rules, and versioned commit/rebase semantics.

Likely touched files:

- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/simulation-queue.ts`
- `backend/src/engine/simulation-proposal.ts`
- `backend/src/campaign/runtime-state.ts`
- `backend/src/engine/state-snapshot.ts`
- `backend/src/routes/__tests__/chat.scene-plan.test.ts`
- `backend/src/engine/__tests__/simulation-queue.test.ts`
- `backend/src/engine/__tests__/turn-boundary-authority.test.ts`

Success criteria:

- `done` is emitted only after player mutation, present-scene required reactions, exposed timers, required world threads, required actor reflections, and PlayerFacingPacket/NarratorPacket construction are committed against the current version.
- Detached jobs cannot mutate state directly. They may create proposals tied to base_version; proposals commit only after validation/rebase at an authoritative boundary.
- Async embeddings/images remain non-state work. If they fail, gameplay truth is unchanged.
- Stale proposals, stale queued jobs, aborted turns, and route failures restore/reject cleanly without partial hidden mutations.

Verification:

- `npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/turn-boundary-authority.test.ts`
- `npm --prefix backend run typecheck`
- Tests prove `simulateOffscreenNpcs`, `checkAndTriggerReflections`, and `tickFactions` are no longer called from detached post-turn mutation flow.

## Slice 04: KeyActorProcess Scheduler and Wakeups

Purpose: model key NPCs as durable co-player processes driven by world time, goals, active plans, next decision points, interrupts, inbox, and agency debt instead of turn-count polling.

Likely touched files:

- `backend/src/engine/key-actor-process.ts`
- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/wake-signals.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-offscreen.ts`
- `backend/src/engine/scene-presence.ts`
- `backend/src/engine/__tests__/key-actor-process.test.ts`
- `backend/src/engine/__tests__/actor-scheduler.test.ts`

Success criteria:

- KeyActorProcess stores actor id, resolved_through_time, active goal stack, active_plan, next_decision_at, next_decision_reason, pending interrupts, inbox, private belief cursor, write scope reservations, and agency debt.
- Scheduler wakes actors by due world-time, direct observation, reports/rumors, urgent interrupts, exposed-scope catch-up, deadlines, and agency debt.
- Player short turns do not over-tick actors, and long player time skips advance eligible actor processes through comparable world time.
- Same-scene key NPCs that can affect current narration are required before `done`; distant actors become queued/proposal work unless exposed or due.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/key-actor-process.test.ts src/engine/__tests__/actor-scheduler.test.ts`
- `npm --prefix backend run typecheck`
- Deterministic tests cover: player says one sentence, player waits 30 minutes, player travels 35 minutes, urgent report wakes actor, distant actor sleeps until due.

## Slice 05: ActorDecisionPacket and Actor Tool Validation

Purpose: replace prose-driven NPC ticking with bounded structured actor decisions and backend-validated actor tools that mutate only through ToolResult and authority commits.

Likely touched files:

- `backend/src/engine/actor-decision-packet.ts`
- `backend/src/engine/actor-brain.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-tools.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/tool-schemas.ts`
- `backend/src/engine/combat-envelope.ts`
- `backend/src/engine/__tests__/actor-decision-packet.test.ts`
- `backend/src/engine/__tests__/actor-tools.test.ts`

Success criteria:

- Actor brain returns actor_id, decision summary, known facts used, selected goal, intent, tool calls, belief updates, plan updates, next decision trigger, and no-action reason.
- Actor tools include observe, move_to, speak, send_message, attempt_action, attack/defend/flee, hide, train, search, use/give item, request_help, update_own_goal, schedule_plan_step, and record_belief where current backend state supports validation.
- Tool validation enforces location, scene scope, resources, authority, ownership, target visibility, travel paths, combat bounds, and world time costs.
- Failed tools produce explicit ToolResult failure/partial status and do not create fake successful no-ops.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/actor-decision-packet.test.ts src/engine/__tests__/actor-tools.test.ts`
- `npm --prefix backend run typecheck`
- Negative tests prove invalid target, hidden target, unreachable destination, nonexistent item, insufficient authority, and stale base_version do not mutate state.

## Slice 06: World-Time Plan Executor and Offscreen Catch-Up

Purpose: implement deterministic plan-step execution for long-running actor work, replacing batch offscreen summaries with queryable committed artifacts and just-in-time catch-up.

Likely touched files:

- `backend/src/engine/actor-plan-executor.ts`
- `backend/src/engine/npc-offscreen.ts`
- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/location-graph.ts`
- `backend/src/engine/location-events.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/__tests__/actor-plan-executor.test.ts`
- `backend/src/engine/__tests__/offscreen-catchup.test.ts`

Success criteria:

- Active plans execute deterministic steps until target world time, decision point, interruption, failure, or resource/location precondition break.
- Long tasks such as training, travel, search, repair, guard duty, and operation prep create events, progress, resources spent, memory/knowledge outputs, and next decision points.
- Just-in-time catch-up resolves actors/threads touching current or soon-exposed scope before SceneFrame and NarratorPacket are built.
- Offscreen consequences are durable and inspectable: location damage, witnesses, rumors, actor memories, changed inventory/status/location, and event provenance exist before the player observes them.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/actor-plan-executor.test.ts src/engine/__tests__/offscreen-catchup.test.ts`
- `npm --prefix backend run typecheck`
- Scenario tests cover: key NPC trains for three hours, travels during player tourist turn, fails a precondition and replans, and later explains events from committed memory.

## Slice 07: Memory, Beliefs, and Knowledge Propagation

Purpose: make memory an external hierarchy with provenance, actor-specific beliefs, observation/report/rumor propagation, required reflection before actor use, and no full-history prompts.

Likely touched files:

- `backend/src/engine/knowledge-model.ts`
- `backend/src/engine/memory-policy.ts`
- `backend/src/engine/reflection-agent.ts`
- `backend/src/engine/reflection-tools.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/engine/context-compression.ts`
- `backend/src/engine/actor-frame.ts`
- `backend/src/engine/__tests__/knowledge-model.test.ts`
- `backend/src/engine/__tests__/memory-policy.test.ts`
- `backend/src/engine/__tests__/reflection-agent.test.ts`

Success criteria:

- False player claims create claim events and listener beliefs, not backend truth.
- Direct observation, reports/messages, rumors, and inference have source ids, latency, reliability/confidence, recipients, and belief-vs-truth separation.
- Memory writes happen for consequential observations, reports, promises, threats, orders, relationship changes, goal changes, tool outcomes, hidden-info revelations, and relevant state changes.
- ContextBudgetTrace proves ActorFrame retrieval is small, source-backed, and actor-known. Summaries/indexes never replace the authoritative event log.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/knowledge-model.test.ts src/engine/__tests__/memory-policy.test.ts src/engine/__tests__/reflection-agent.test.ts`
- `npm --prefix backend run typecheck`
- Tests cover false permit claim, guard report latency, rumor distortion, stale belief contradiction, source provenance, and no full campaign history in ActorFrame.

## Slice 08: Faction Command Networks

Purpose: replace omniscient faction macro-ticks with faction state plus explicit command actors/nodes, units, standing orders, reports, resource validation, and operation ledgers.

Likely touched files:

- `backend/src/engine/faction-command-network.ts`
- `backend/src/engine/command-node-agent.ts`
- `backend/src/engine/faction-tools.ts`
- `backend/src/engine/world-engine.ts`
- `backend/src/engine/simulation-queue.ts`
- `backend/src/db/schema.ts`
- `backend/drizzle/0010_*.sql`
- `backend/src/engine/__tests__/faction-command-network.test.ts`
- `backend/src/engine/__tests__/command-node-agent.test.ts`

Success criteria:

- FactionState stores resources, territory, doctrine/laws, reputation, members/units, command nodes, standing orders, active operations, reports/inbox, and communication latency.
- Decisions come from leaders, councils, officers, unit actors, or standing order executors with their own frame, authority, reports, resources, and latency.
- Faction response to player actions requires observation/report path. No abstract faction can know a local crime, hidden player lie, or distant attack without propagation.
- Faction tools validate resources, unit availability, legal authority, communication delays, target scope, and operation preconditions before committing state.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/faction-command-network.test.ts src/engine/__tests__/command-node-agent.test.ts`
- `npm --prefix backend run typecheck`
- Scenario tests prove guard report -> command node -> unit order; missing report means no faction knowledge; insufficient resources prevent operation launch.

## Slice 09: World Threads and Diegetic Surfacing

Purpose: model long-running world changes as durable WorldThreads with clocks, stages, involved actors/factions, due points, source events, surface routes, consequences, rumors, and thread digests.

Likely touched files:

- `backend/src/engine/world-thread.ts`
- `backend/src/engine/world-thread-runner.ts`
- `backend/src/engine/world-forecast.ts`
- `backend/src/engine/world-forecast-builder.ts`
- `backend/src/engine/location-events.ts`
- `backend/src/engine/scene-assembly.ts`
- `backend/src/engine/player-facing-packet.ts`
- `backend/src/db/schema.ts`
- `backend/drizzle/0011_*.sql`
- `backend/src/engine/__tests__/world-thread.test.ts`
- `backend/src/engine/__tests__/world-thread-surfacing.test.ts`

Success criteria:

- WorldThread records thread id, name, stage, clocks, involved actors/factions, source events, next_due_at, possible branches, surface routes, resolved state changes, and digest provenance.
- Tourist play advances threads without forcing protagonist drama; effects surface through sensory range, witnesses, reports, rumors, changed locations, or later NPC testimony.
- Player-facing narration may show only committed visible signals. It cannot name hidden actors/causes until the player has a valid knowledge route.
- Forecast remains advisory pressure. WorldThread runner, actors, and backend tools own committed state.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/world-thread.test.ts src/engine/__tests__/world-thread-surfacing.test.ts`
- `npm --prefix backend run typecheck`
- Dragon Ball style fixture: player eats for 30 minutes, distant destruction commits, cafe only perceives tremor/rumor, later travel reveals ruins/witness memories with source events.

## Slice 10: Latency, Context Budget, and Parallel Execution Observability

Purpose: prove Phase 88 controls latency and memory by instrumentation, serialized group caps, write-scope parallelism, context budget traces, and proposal caching discipline without runtime duration caps or output truncation.

Likely touched files:

- `backend/src/engine/turn-latency-trace.ts`
- `backend/src/engine/context-budget-trace.ts`
- `backend/src/engine/parallel-simulation-runner.ts`
- `backend/src/engine/simulation-proposal.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/lib/logger-setup.ts`
- `backend/src/engine/__tests__/turn-latency-trace.test.ts`
- `backend/src/engine/__tests__/context-budget-trace.test.ts`
- `backend/src/engine/__tests__/parallel-simulation-runner.test.ts`

Success criteria:

- TurnLatencyTrace records turn class, wall clock, backend time, LLM call count, serialized LLM group count, parallel group count, max parallel group time, retry count, prompt/output tokens by call, cache hit estimate, and actor/reflection/narrator waits.
- Normal interactive turns target 4 or fewer serialized LLM groups; heavy turns target 5 or fewer. Violations are diagnostics and optimization triggers, not magic aborts.
- Independent actor/command/thread jobs run in parallel only when write scopes do not conflict. Conflicts serialize or rebase through authority.
- ContextBudgetTrace hard-fails hidden truth in narrator, ActorFrame facts actor cannot know, full-history prompts without retrieval reason, retrieved memories without source ids, and summary-as-truth usage.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/turn-latency-trace.test.ts src/engine/__tests__/context-budget-trace.test.ts src/engine/__tests__/parallel-simulation-runner.test.ts`
- `npm --prefix backend run typecheck`
- Guard review includes targeted scans for new runtime wall-clock aborts and final-narration slicing fixes; any hit must be justified as non-state infrastructure or removed.

## Slice 11: Rollback, Checkpoint, and Living-World Verification Gate

Purpose: close the phase with deterministic regression coverage plus live playtest evidence across tourist, key-NPC, follow, false-claim, faction, combat, rollback, and memory-stress routes.

Likely touched files:

- `backend/src/engine/state-snapshot.ts`
- `backend/src/campaign/checkpoints.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/routes/chat.ts`
- `backend/src/engine/__tests__/phase-88-integration.test.ts`
- `backend/src/routes/__tests__/chat.scene-plan.test.ts`
- `e2e/88-living-world-playtest.ts`
- `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/88-VERIFICATION-MATRIX.md`

Success criteria:

- Retry, undo, and checkpoint restore revert world version, world time, simulation queue, proposals, actor processes, world threads, faction operations, memories/beliefs created after the checkpoint, and narrator cache.
- Stale async proposals cannot commit after restore/retry/undo. Superseded events/jobs are marked or removed according to the authority contract.
- Deterministic tests cover all hard fail cases from the report: hidden narrator truth, actor omniscience, false-claim truth mutation, stale async commit, missing ToolResult state, rollback residue, faction report gaps, context budget failures, and required reaction skipping.
- Live playtest artifact corpus proves living-world behavior without fake fallback, arbitrary duration timeout, or output truncation.

Verification:

- `npm --prefix backend run test -- src/engine/__tests__/phase-88-integration.test.ts src/routes/__tests__/chat.scene-plan.test.ts`
- `npm --prefix backend run typecheck`
- `PHASE88_MODE=deterministic node --import tsx/esm e2e/88-living-world-playtest.ts`
- `PHASE88_MODE=live node --import tsx/esm e2e/88-living-world-playtest.ts`
- Verification matrix must include artifact paths for traces, packets, screenshots/logs where applicable, state diffs, and per-route pass/fail rows.

## Source Coverage Audit

| Source Requirement | Covered By |
| --- | --- |
| Backend authority and validated tools | 01, 03, 05, 06, 08, 09, 11 |
| No fake fallback | 01, 03, 05, 07, 10, 11 |
| No arbitrary duration timeout | 10, 11 |
| No output truncation as fix | 02, 10, 11 |
| Actor private POV | 02, 04, 05, 07 |
| Narrator redaction | 02, 09, 11 |
| Key NPCs as co-player processes | 04, 05, 06, 07 |
| World-time agency instead of player-turn polling | 03, 04, 06, 09 |
| Versioned simulation jobs/proposals | 01, 03, 06, 10, 11 |
| Memory/context budget hierarchy | 02, 07, 10 |
| Factions as command/report/resource networks | 08 |
| World threads and tourist route surfacing | 09 |
| Rollback/checkpoint truth | 01, 03, 11 |
| Deterministic and live proof gates | 10, 11 |

## Final Slicing Notes

- Slices are construction order for full Phase 88 quality, not reduced product scope. Each source requirement has an owning slice and verification path.
- Existing forecast infrastructure should be reused only as advisory pressure. Forecast entries must not become executable world truth.
- Existing `narrator-packet.ts` safety should be extended, not bypassed.
- Existing NPC/offscreen/faction files can be adapted or split, but direct post-turn detached mutation and interval polling cannot remain as the primary living-world mechanism.
- Test fixtures should include a high-power tourist setting, a key NPC training/travel setting, a guard/faction report setting, and a false authority claim setting.
