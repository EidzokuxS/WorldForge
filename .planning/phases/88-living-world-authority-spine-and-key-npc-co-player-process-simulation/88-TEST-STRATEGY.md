# Phase 88 Test Strategy: Living-World Authority Spine and Key NPC Co-Player Processes

## Purpose

Phase 88 is accepted only when WorldForge can prove, with deterministic tests, integration traces, and long live routes, that the world simulation has a truthful authority spine:

- Backend state, event log, world time, tool results, and rollback are authoritative.
- Player-facing narration renders committed visible truth only.
- Key NPCs act as co-player processes with private POV, goals, plans, wakeups, validated actor tools, memory, interrupts, and world-time agency.
- Factions act through command nodes, reports, resources, units, and communication latency, not through omniscient abstract faction turns.
- Offscreen/world work uses versioned jobs or proposals and cannot secretly mutate state after `done`.
- Latency and memory budgets are measured as product SLOs, not hidden by skipped mechanics, fake no-ops, or arbitrary truncation.

This strategy is not smoke-only and not MVP. It is the full verification plan for the architecture described in `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`, while preserving the Phase 86/87 findings and the normative baselines in `docs/mechanics.md` and `docs/memory.md`.

## Sources Read

- `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`
- `.planning/phases/86-exhaustive-live-playtest-matrix-and-findings-ledger/86-FINDINGS.md`
- `.planning/phases/87-playtest-defect-burn-down-and-final-rerun/87-ACCEPTED-FINDINGS.md`
- `e2e/86-exhaustive-playtest.ts`
- `docs/mechanics.md`
- `docs/memory.md`
- `.planning/ROADMAP.md` Phase 88 entry
- `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/88-PLAN-SLICES-DRAFT.md`
- `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/88-RISK-REVIEW.md`
- `C:/Users/robra/.codex/get-shit-done/references/ai-evals.md`

## Evaluation Type

System type: Hybrid autonomous multi-agent conversational simulation.

Dominant eval dimensions:

- Task completion: living-world agency and causal continuity.
- Tool use correctness: every mutation routes through backend validators.
- Safety: user-facing output cannot leak hidden truth or backend/system internals.
- Multi-agent handoff: player, key NPCs, command nodes, world threads, and memory systems hand off through state and events.
- Loop detection: key NPCs and world jobs must not poll forever, serially explode, or replan without bounded triggers.
- Context faithfulness and hallucination control: narration and actor decisions must be grounded in their packet/frame.
- Schema and trace validity: structured packets, tool results, latency traces, and context budget traces must be machine-checkable.

## Critical Failure Modes

| ID | Failure mode | Priority | Primary gate |
| --- | --- | --- | --- |
| FM-01 | Player-facing narration mentions hidden truth, secret plans, unobserved offscreen causes, or future scheduled events absent from `PlayerFacingPacket`. | Critical | Code + live hidden-truth routes |
| FM-02 | ActorFrame contains facts the actor cannot know, or key NPC reacts to hidden truth not in direct observations, reports, rumors, beliefs, or retrieved memories. | Critical | Code + LLM judge sampling |
| FM-03 | Player false claim creates backend truth, inventory, permission, room access, faction authority, or valid permit instead of claim/belief/proof pressure. | Critical | Code + live false-claim route |
| FM-04 | A mutation-heavy turn creates concrete future-relevant actors, routes, hazards, obligations, aftermath, or combat consequences in prose without state/event/tool evidence. | Critical | Code + Playwright state hash and log diff |
| FM-05 | A completed action stream is accepted with empty assistant text, blank UI, or missing terminal `done` semantics. | Critical | Backend/frontend deterministic tests + live route |
| FM-06 | `done(version=N)` returns while rollback-critical present NPC, combat, travel, exposed timer, memory/report, or current-scene work can still mutate version `<= N`. | Critical | Integration + rollback tests |
| FM-07 | Async proposal commits against stale `base_version`, conflicting write scope, reverted checkpoint, or failed preconditions. | Critical | Simulation queue integration tests |
| FM-08 | Rollback/checkpoint restore leaves future events, memories, scheduled jobs, actor plans, narrator cache, or proposals alive on the restored branch. | Critical | Checkpoint integration tests + live rollback route |
| FM-09 | Faction response happens before any observation/report/message route reaches a command node, or spends resources not owned by that command network. | High | Faction command integration tests + route |
| FM-10 | Key NPC agency is implemented as polling every key NPC after every player turn rather than `next_decision_at`, wake signals, agency debt, plans, and world-time catchup. | High | Scheduler tests + latency traces |
| FM-11 | Parallel actor/world jobs race on shared actors, locations, items, faction resources, or threads without serialization, reservation, or rebase. | High | Write-scope tests |
| FM-12 | Combat/power scenes stay in vague pressure with no tracked threat, position, cost, injury/resource, witnesses, or aftermath when engagement actually occurs. | High | Combat integration + live combat route |
| FM-13 | Context grows by dumping full campaign history, unfiltered memories, or hidden world state into GM, actor, command, reflection, or narrator calls. | High | ContextBudgetTrace tests |
| FM-14 | Relevant old commitments, lies, reports, relationships, or actor goals are not retrieved after long play, or summaries overwrite source-truth provenance. | High | Memory stress integration + live route |
| FM-15 | Latency target is met by disabling mechanics, skipping required reactions, truncating outputs, or returning fake successful no-ops. | High | Trace review + anti-false-positive triage |
| FM-16 | Recent-context referents, session language, visible UI overflow, or hidden prompt/backend implementation details regress from Phase 86/87 fixes. | High | Regression suite + live matrix carryover |

## Rubrics and Measurement

| Dimension | Priority | PASS | FAIL | Measurement |
| --- | --- | --- | --- | --- |
| Authority and state grounding | Critical | Every future-relevant consequence in final narration has `ToolResult.events_created`, `state_deltas`, local history, memory, or world-thread evidence with IDs. Sensory color may remain non-durable only when it creates no later obligation. | Narration invents actors, doors, hazards, deals, wounds, witnesses, changed routes, or aftermath without committed evidence. | Code + Playwright artifact diff + human triage for edge cases |
| Hidden truth isolation | Critical | `PlayerFacingPacket` excludes secrets; narrator can surface only visible facts, sensory effects, player-known facts, rumors as rumors, and committed tool outcomes. | Narrator reveals cause, culprit, private goal, future event, hidden location, or offscreen battle the player has no route to know. | Code + LLM judge calibrated on seeded hidden-truth cases |
| Actor POV faithfulness | Critical | Actor decisions use only ActorFrame facts: self-state, known beliefs, direct observations, inbox, retrieved memories, relationships as believed, goals, local affordances, and legal tools. | NPC acts on global truth, player-only info, secret faction plans, or events not observed/reported/rumored/inferred. | Code + LLM judge + human sampling |
| Tool use correctness | Critical | Player, actor, command node, and thread actions produce bounded tool calls; backend validates resources, time, location, write scope, and preconditions before commit. | LLM directly mutates state, tool success is a fake no-op, invalid target succeeds, or failed validation still affects world truth. | Code |
| Task completion: living-world agency | High | Tourist play leaves the world advancing through committed key NPC plans, faction reports, world threads, rumors, and inspectable aftermath without forcing protagonist drama. | World freezes when player ignores hooks, or offscreen changes appear only as prose with no queryable artifacts. | Integration + Playwright routes + human gameplay review |
| Scheduler and loop control | High | Key NPCs wake on world-time due points, events, interrupts, agency debt, and exposed-scope catchup; deterministic plan steps run without repeated LLM calls. | Key NPCs are polled per player turn, skipped indefinitely, or enter unbounded replan/retry loops. | Code + latency trace |
| Multi-agent handoff | High | Player action, present NPC reaction, offscreen actor job, command node, world thread, report propagation, reflection, and narration hand off through event IDs and versioned state. | Subsystem reads another subsystem's proposal/reasoning as truth, or handoff loses provenance/source IDs. | Integration + trace inspection |
| Faction command realism | High | Factions respond through command actors/nodes with reports, authority, resources, units, standing orders, and communication latency. | Abstract faction "knows" player action instantly or changes policy/security/resources without report path and resource ledger. | Code + live faction route |
| Combat and contested resources | High | Engagements track threat, range/position, readiness, initiative/predeclared plans, costs, HP/status/resource effects, witnesses, bystanders, and aftermath. Contested objects have one owner. | Combat remains vague, both actors get same item, no one pays costs, or aftermath disappears after narration. | Integration + live combat route |
| False-claim epistemics | Critical | Player claim creates claim event, possible listener belief, proof demand, investigation, or legal path. It does not create truth. | Unsupported key/permit/pass/authority/room/item becomes real or accepted without evidence. | Code + live route |
| Memory relevance and provenance | High | Memories are written only for consequential observations, reports, promises, threats, orders, relationship/goal changes, tool results, hidden reveals, false claims heard, and relevant location/item/faction changes. Retrieved memories include source IDs and confidence. | Every flavor sentence becomes memory, or important promises/lies/reports are absent, source-free, duplicated, stale, or summarized into false certainty. | Code + LLM judge + human sample |
| Context budget discipline | High | GM Read, ActorFrame, command, world-thread, reflection, and narrator prompts emit `ContextBudgetTrace`; hidden facts excluded count is tracked; warning/hard budgets fire as designed. | Full history enters prompt, retrieved memories lack reasons, ActorFrame/Narrator exceeds hard budget without override, or hidden truth appears in context. | Code |
| Latency SLO | High | Normal interactive turns have p50 <= 5 min, p90 <= 8 min; heavy interactive p95 <= 10 min; normal serial LLM groups <= 4 and heavy <= 5; optional scope reduction never drops required truth. | Latency met through hidden skips/truncation/fake success, or serial actor/world calls push turns past SLO. | Code traces + Playwright summary |
| Rollback and branch integrity | Critical | Checkpoint restore reverts state, event log, chat history, queue, proposals, actor process state, and rollback-critical memories; vector exclusions follow `docs/memory.md` restore-scope rules. | Future branch artifacts survive restore or async jobs mutate restored branch from obsolete versions. | Code + live rollback route |
| Safety and output privacy | Critical | User-visible output contains no system prompt sections, internal backend names, schemas, tool traces, private reasoning, hidden eval data, or unrelated locale drift. | Prompt sections, GM Read internals, implementation details, private reasoning, or unintended language leak into player text. | Code + Playwright + LLM judge |

## Tooling

Existing detected tooling:

- Unit/integration: Vitest.
- Live browser: Playwright via scripts under `e2e/`, especially `e2e/86-exhaustive-playtest.ts`.
- Observability: existing pino per-turn logs, role usage traces, prompt dump toggles, and turn-context logger tests.
- No dedicated eval platform dependency was detected in package manifests for Langfuse, LangSmith, Arize Phoenix, Braintrust, Promptfoo, or RAGAS.

Recommended Phase 88 defaults:

- Keep Vitest as the deterministic and integration gate.
- Extend the existing Playwright route-runner pattern from Phase 86/87 for live evaluation artifacts.
- Add Arize Phoenix only as optional local trace visualization if OpenTelemetry instrumentation is introduced. It is useful for multi-agent trace inspection, but Phase 88 gates must still be passable from JSONL logs in CI.
- Add Promptfoo only for prompt-regression datasets once stable prompt inputs/expected packet outputs exist. It should not replace code-based packet/schema guards.
- Do not use RAGAS as the primary gate. WorldForge memory retrieval is not generic RAG Q&A; use custom provenance, recall, pollution, and source-ID metrics. RAGAS can be optional for lore/context relevance experiments.

Suggested future install commands:

```bash
npm install -D promptfoo
python -m pip install arize-phoenix opentelemetry-sdk
```

Suggested Phoenix setup if tracing is added:

```python
import phoenix as px
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

px.launch_app()  # http://localhost:6006
provider = TracerProvider()
trace.set_tracer_provider(provider)
```

## Reference Dataset

Minimum dataset for Phase 88 planning and execution:

- 60 deterministic fixture cases:
  - 10 hidden truth and redaction cases.
  - 8 actor POV and false-belief cases.
  - 8 false-claim and unsupported authority cases.
  - 8 scheduler, wake signal, agency debt, and loop-control cases.
  - 8 versioned proposal, write-scope, and rollback cases.
  - 6 faction command/report/resource cases.
  - 6 combat/contested-resource cases.
  - 6 memory/context-budget cases.
- 30 integration scenarios:
  - 5 authority spine.
  - 5 key NPC process.
  - 4 faction network.
  - 4 rollback/branching.
  - 4 memory stress.
  - 4 latency/parallelism.
  - 4 Phase 86/87 regression carryovers.
- 10 live route suites minimum:
  - tourist, key NPC offscreen, follow/shadow, faction report latency, false claim, combat/power mismatch, rollback, memory stress, hidden truth leakage, latency stress.

Labeling:

- Code labels define hard invariants: packet fields, schemas, state diffs, event IDs, version IDs, traces, budgets, and route artifact presence.
- LLM judges evaluate subtle hidden-truth foreshadowing, actor POV reasoning, and gameplay coherence. Judges require calibration against at least 20 human-reviewed examples before their pass/fail output can gate release.
- Human review samples all Critical failures, all LLM judge disagreements, and at least 10 percent of green live turns from the full live route matrix.

Dataset creation starts during implementation. Do not wait until the end of Phase 88; each plan slice should add its fixture cases with the code it validates.

## Deterministic Test Plan

### 1. Authority Spine

Required tests:

- `WorldVersion` increments on every authoritative commit and is included in turn completion.
- `WorldTime` advances by action/travel/plan duration, not by player-turn count.
- Event log stores actor, location, world time, source tool result, visibility, witnesses, and provenance.
- `ToolResult` cannot report success when no required event/state/observation exists.
- No state-bearing mutation can bypass a backend validator.
- Player-facing packet is derived from committed visible state, not from hidden global world state or LLM reasoning.
- Narrator grounding check rejects references to durable entities, consequences, or causes missing from `PlayerFacingPacket`.
- State-bearing direct/no-tool GM paths fail closed if they introduce future-relevant pressure.

Gate:

```bash
npm --prefix backend exec vitest run \
  src/engine/__tests__/turn-processor.test.ts \
  src/engine/__tests__/turn-processor.empty-narration.test.ts \
  src/engine/__tests__/visible-narration-output-guard.test.ts \
  src/engine/__tests__/narrator-packet.test.ts \
  src/engine/__tests__/tool-executor.test.ts \
  src/engine/__tests__/state-snapshot.test.ts
```

Phase 88 should add or extend focused authority tests rather than relying only on these existing suites.

### 2. ActorFrame and PlayerFacingPacket Redaction

Required tests:

- ActorFrame for each actor includes only direct observations, reports/messages/rumors, beliefs, relevant memories, relationships as believed, active goals, active plan, legal affordances, and legal tools.
- ActorFrame excludes global truth, player-only knowledge, other NPC private thoughts, future scheduled events, hidden world thread branches, and unresolved proposals.
- PlayerFacingPacket excludes private beliefs, secret plans, offscreen battle causes, future scheduled events, hidden locations, full world map, and unresolved proposals.
- Hidden fact seeded into global state cannot appear in narrator prompt or player text unless a valid surface route exists.
- Player-visible stage text for long turns may say "Resolving consequences outside your immediate view" but cannot name hidden actors/events.

Measurement:

- Code scan over packet JSON.
- Prompt-dump fixture assertions when observability dump is enabled.
- LLM judge only for subtle player-facing foreshadowing once calibrated.

### 3. KeyActorProcess and Scheduler

Required tests:

- `next_decision_at` prevents per-turn polling when a key NPC has an active deterministic plan.
- Due world-time wakes run when player spends enough time, travels, rests, or timeskips.
- Event-triggered wakes require direct observation, sensory range, report/message, rumor, inferred belief, global clock, or exposed-scope catchup.
- Agency debt increases with world-time elapsed and actor activity level, but does not force drama near the player.
- Present key NPC reactions run before `done` when their reaction can affect current narration or next SceneFrame.
- Offscreen key NPCs can pursue plans, move, train, fail, replan, remember, and later explain from committed events.
- Interruptions break active plans only when preconditions or urgency justify it.
- Loop guard rejects repeated actor LLM calls with unchanged frame, unchanged plan, and no new interrupt.

Anti-shortcut:

- A test must fail if implementation wakes every key NPC after every player turn.
- A test must fail if implementation skips all offscreen work while claiming SLO success.

### 4. Simulation Queue, Proposals, and Write Scopes

Required tests:

- Each proposal includes `base_version`, `read_set`, `write_scope`, `preconditions`, `due_world_time`, `entity_id`, `provenance`, and `expiration`.
- Proposal commits only if base version is still valid and preconditions hold.
- Stale proposal is discarded or explicitly rebased, never silently committed.
- Conflicting write scopes serialize or rebase:
  - two actors target same item;
  - faction spends same resource pool twice;
  - NPC and player affect same door/route/item;
  - two actors enter same contested scene;
  - hidden job tries to mutate while player turn reads state.
- Async work after `done` may create proposals, embeddings, compaction, review artifacts, or retrieval cache, but cannot mutate authoritative state for version `<= done.version`.

### 5. Faction Command Networks

Required tests:

- Faction state is resources, territory, doctrine/laws, reputation, members/units, command nodes, standing orders, active operations, reports/inbox, and communication latency.
- Decision comes from explicit command actor/node with POV, reports, authority, resources, and latency.
- Guard witnessing player trouble creates an observation/report path; faction knows only after report arrives or checks occur.
- Standing orders execute deterministically until conflict/exception requires command decision.
- Command node cannot allocate unavailable resources or issue orders outside authority.
- Unit/operation results create event log, resource deltas, reports, witnesses, and local history.

### 6. Truth vs Belief and False Claims

Required tests:

- Player says "I have a royal permit" creates `claim_made`, not `player.has_permit`.
- Listener may gain belief with confidence/source event.
- Faction/guard may investigate or demand proof after valid report path.
- Search pockets for proof returns actual inventory/state, not claimed item.
- Legal access path can be revealed without granting unsupported access.
- Later memory route remembers the lie as a lie, with source IDs.

Preservation gate:

- `P86-OK-001` stays protected. Fixes for authority, memory, or factions must not grant unsupported keys, passes, permits, rooms, or authority.

### 7. Combat, Contests, and Aftermath

Required tests:

- Engagement actions distinguish assessment from actual combat.
- Combat state tracks threat, range/position, readiness, power gap, costs, HP/status/resource changes, bystanders/witnesses, and aftermath.
- Simultaneous grabs/attacks use timestamps, initiative/readiness/distance, predeclared plans, oracle only if needed, and backend preconditions.
- Only one state can own a contested item.
- Retreat, defend, call for help, use environment, protect someone, and negotiation mid-conflict all produce coherent state/tool outcomes.
- Aftermath persists into local history, witness memories, actor beliefs, and future prompts.

### 8. Rollback and Restore

Required tests:

- Checkpoint includes `world_version`, `world_time`, authoritative state, chat history, and simulation queue state.
- Restore reverts state, events, actor process state, thread clocks, reports, memory writes, proposal cache, and narrator cache as appropriate.
- Later events are marked superseded or absent from restored branch.
- Async proposals based on reverted versions cannot commit.
- Same-turn committed evidence respects `docs/memory.md`: reflection can read committed evidence before embeddings, while auxiliary vector embedding is not rollback-critical unless checkpoint vector restore includes it.
- Checkpoint restore clears active-turn guards, last-turn snapshots, and pending same-turn committed evidence.

### 9. Memory and Context Budget

Required tests:

- Memory write policy writes consequential events only: direct observations, messages/reports/rumors, promises, threats, orders, relationship/goal changes, consequential tool result, hidden info revealed to actor, relevant location/item/faction change, false claim heard.
- Memory write policy rejects atmospheric sentences, generic greetings, unchanged room descriptions, narrator flavor not tied to state, internal reasoning, and uncommitted proposals.
- Retrieved memories include source IDs, confidence, owner/privacy, and reason for inclusion.
- Hybrid retrieval covers exact names, promises, dates, items, permits, oaths, and source events, not vector-only similarity.
- Summaries remain indexes with provenance; they cannot overwrite authoritative event truth.
- `ContextBudgetTrace` records call ID, call type, total tokens, static prefix tokens, dynamic tokens, retrieved count, dropped count, retrieval reasons, hidden truth excluded count, and budget status.
- Hard fail if narrator receives hidden truth, ActorFrame includes unknowable facts, full history enters prompt without retrieval reason, retrieved memories lack source IDs, or summaries overwrite source truth.

Budget gates:

| Call type | Target | Warning | Hard fail |
| --- | ---: | ---: | ---: |
| GM Read dynamic tokens | <= 15k | > 30k | no override or full-history dump |
| Key NPC ActorFrame dynamic tokens | 10k-22k | > 35k | hidden facts or no retrieval reasons |
| Narrator dynamic tokens | 5k-12k | > 25k | hidden facts in prompt |
| Command node dynamic tokens | 10k-30k | > 45k | global omniscience/context dump |
| Reflection dynamic tokens | 10k-35k | > 60k | source-free summary or truth overwrite |

### 10. Latency Trace and SLO

Required trace shape:

```text
TurnLatencyTrace {
  turn_id
  turn_class
  wall_clock_total
  backend_time
  llm_call_count
  serialized_llm_group_count
  parallel_group_count
  max_parallel_group_time
  retry_count
  prompt_tokens_by_call
  output_tokens_by_call
  cache_hit_estimate
  blocked_on_reflection_time
  blocked_on_actor_time
  blocked_on_narrator_time
}
```

Gate:

- Normal turns: p50 <= 5 min, p90 <= 8 min.
- Heavy interactive turns: p95 <= 10 min.
- Normal serialized LLM decision groups <= 4.
- Heavy serialized LLM decision groups <= 5.
- No arbitrary output truncation.
- No duration cap treated as gameplay fix.
- Optional simulation scope may be reduced; required truth may not be reduced.
- Latency failures must include trace evidence, not just wall-clock result.

## Integration Test Plan

Integration tests should use seeded campaigns, mock/fixture LLM outputs, deterministic clocks, deterministic random rolls, and direct inspection of SQLite/log artifacts.

### INT-01: Tourist Turn With Offscreen World Progress

Setup:

- Player at cafe.
- Key NPC A training offscreen with active plan.
- Key NPC B raiding adjacent district through validated actor tools.
- NPC C sends report with latency.
- Player eats/rests for 30 minutes.

Pass:

- World time advances 30 minutes.
- Player event and local witnesses commit.
- Offscreen plan step commits if due.
- Distant sensory event can surface only if range supports it.
- Player text does not name hidden cause unless known.
- Later travel reveals queryable aftermath, witnesses, memories, and reports.

Fail:

- World freezes, or narration invents offscreen aftermath absent from state.

### INT-02: Key NPC Ignored For Days

Setup:

- Key NPC has goal, active plan, next decision trigger, resources, and memory cursor.
- Player ignores NPC through multiple time skips.

Pass:

- NPC resolved-through-time advances by plan steps and bounded decisions.
- NPC can move, train, spend resources, fail, replan, remember, and later explain from committed events.
- Actor decisions are not run every player turn.

### INT-03: Player Shadows Key NPC

Setup:

- NPC already has active plan before player arrives.
- Player follows at public-access distance.

Pass:

- NPC behavior reflects preexisting plan.
- Player presence creates observation/interrupt only when detected or relevant.
- Replan has event/source reason.
- Narration shows visible behavior, not private plan text.

### INT-04: Faction Report Latency

Setup:

- Player causes trouble in front of guard.
- Guard belongs to faction with command node and report channel.

Pass:

- Guard observes event.
- Report enters channel with latency/reliability.
- Command node acts only after report or check.
- Resources are allocated through ledger.
- Player-visible response arrives through patrol/order/notice, not omniscient faction tick.

### INT-05: False Claim Boundary

Setup:

- Player claims key/permit/pass/authority.
- No matching inventory, permission, relationship, or record exists.

Pass:

- Claim event commits.
- Listener belief/proof demand may commit.
- No item/authority/truth is created.
- Later NPC/faction can remember or investigate the claim as claim.

### INT-06: Combat and Contested Item

Setup:

- Player and key NPC both try to grab same artifact during a conflict window.

Pass:

- Backend uses timestamps, readiness, distance, preconditions, and oracle only if needed.
- One owner wins; other receives failed/partial result.
- Witnesses, HP/status/costs, and aftermath persist.

### INT-07: Rollback After Async Proposals

Setup:

- Turn creates offscreen proposal and same-turn memory evidence.
- Player creates checkpoint, proceeds, then restores.

Pass:

- Restored branch does not contain future events, memories, actor plans, proposals, or narrator cache.
- Obsolete async proposal cannot commit after restore.

### INT-08: Memory Stress Over 100 Turns

Setup:

- Repeated contacts with same key NPC, false claims, promises, reports, combat aftermath, and location revisits.

Pass:

- Context remains under budgets.
- Relevant old promises/lies/reports are retrieved with source IDs.
- Irrelevant memory pollution stays below threshold.
- Contradictions are detected as contradictions, not overwritten certainty.

Thresholds:

- Relevant memory recall >= 80 percent on labeled prompts.
- Irrelevant memory pollution <= 20 percent of retrieved memories.
- Source provenance coverage = 100 percent for retrieved memories used in decisions.
- Duplicate memory rate <= 10 percent.

### INT-09: Hidden Truth Leak Matrix

Setup:

- Seed hidden truth facts: secret culprit, offscreen battle cause, private NPC goal, hidden route, future scheduled event, faction order not delivered.

Pass:

- Narrator and player-facing stages do not mention hidden truth.
- Actor decisions mention hidden truth only if route exists in ActorFrame.
- Rumor is marked as rumor with source/confidence, not truth.

### INT-10: Latency Stress With Three Key NPCs and One World Thread

Setup:

- Player enters scene with 3 present key NPCs and one due world thread.

Pass:

- Independent actor calls run as parallel group where write scopes allow.
- Conflicts serialize or rebase.
- Required reactions are not skipped.
- Heavy turn stays within p95 <= 10 min target.

## Live Playwright Routes

Phase 88 should create a dedicated route runner based on `e2e/86-exhaustive-playtest.ts`, not replace that file in this strategy step. The runner must preserve Phase 86/87 artifact discipline: manifest, per-turn JSONL, screenshots, fresh backend logs, world before/after hash, run errors, route summaries, and root summary.

### Runner Profiles

| Profile | Scope | Use |
| --- | --- | --- |
| `phase88-smoke` | 2 campaigns x 5 routes x 2 turns | Fast sanity after each slice |
| `phase88-focused` | 3 campaigns x 10 routes x 5 turns | Owner-plan verification |
| `phase88-deep` | 4 campaigns x 10 routes x 20 turns | Full phase acceptance |
| `phase88-memory-stress` | 1-2 campaigns x memory route x 100+ turns | Long memory/context proof |
| `phase88-latency-stress` | 2 campaigns x heavy actor/faction routes x 5 turns | SLO proof |

### Required Routes

#### Route 1: Tourist World Keeps Moving

Purpose: Player avoids hooks while world time advances.

Actions:

- Buy food, rest, watch workers, ask rumors, refuse obvious crisis, take safe route, sleep, revisit first place.

Required evidence:

- `world_time` advances by action duration.
- Offscreen actor/thread/faction work commits when due.
- Visible effects surface only through sensory range, rumors, reports, witnesses, or location history.
- No forced protagonist drama.

#### Route 2: Key NPC Offscreen Co-Player

Purpose: Key NPC acts with equal causal agency over world time.

Actions:

- Ignore key NPC for hours/days.
- Ask locals what changed.
- Later meet NPC and ask what they did, why, what they remember, and what went wrong.

Required evidence:

- NPC has committed events, plan steps, memory writes, status/resource changes, location changes, and explanation grounded in source IDs.

#### Route 3: Follow/Shadow Key NPC

Purpose: Player observes a key NPC process mid-plan.

Actions:

- Follow from distance, interrupt politely, block route, ask what they are doing, wait, then revisit.

Required evidence:

- NPC had active plan before player contact.
- Replan happens only on observed/interruption basis.
- Player sees behavior, not hidden private plan.

#### Route 4: Faction Report Latency

Purpose: Faction knowledge and response require communication.

Actions:

- Cause trouble near low-level witness.
- Leave before report reaches command.
- Ask whether faction knows.
- Wait/travel long enough for report.
- Observe response.

Required evidence:

- Observation event, report/message event, delivery latency, command decision, resource allocation, and unit/order result.

#### Route 5: False Claim and Authority Boundary

Purpose: Preserve Phase 86/87 unsupported-claim invariant under the new authority spine.

Actions:

- Claim key/permit/pass/authorization, double down, search pockets, ask witness, try legal path, later check memory of lie.

Required evidence:

- No unsupported truth mutation.
- Claim and beliefs are stored as claim/belief with confidence/source.
- Possible consequences are proof demand, suspicion, investigation, or legal route.

#### Route 6: Combat and Power Mismatch

Purpose: Engagements produce tracked conflict state and aftermath.

Actions:

- Identify danger, defend, test exits, provoke, retreat, use environment, protect bystander, negotiate mid-conflict, ask aftermath.

Required evidence:

- Assessment turns are not falsely required to mutate.
- Engagement turns track threat, position, costs, HP/status/resources, witnesses, and aftermath.

#### Route 7: Rollback and Branch Integrity

Purpose: Checkpoint restore clears future branch artifacts.

Actions:

- Create checkpoint.
- Trigger offscreen proposal, report, memory, and location change.
- Restore checkpoint.
- Ask what changed, revisit affected location, wait for old proposal window.

Required evidence:

- Restored branch excludes reverted events/memories/jobs/proposals.
- No obsolete async job commits.

#### Route 8: Memory Stress

Purpose: Long play remains coherent without full-history prompts.

Actions:

- 100+ turns across repeated NPC contacts, promises, lies, reports, small combats, travel, rest, and revisits.

Required evidence:

- ContextBudgetTrace for every LLM call.
- Relevant old facts retrieved with source IDs.
- Irrelevant memory pollution and duplicate rate stay under thresholds.
- Actor beliefs can be wrong and later corrected with contradiction provenance.

#### Route 9: Hidden Truth Leakage

Purpose: Redaction holds under tempting offscreen events.

Actions:

- Player stays distant while hidden actors act.
- Ask leading questions.
- Follow rumors.
- Inspect sensory aftermath.
- Talk to actors with partial/conflicting knowledge.

Required evidence:

- Narration never names hidden cause early.
- Actors reveal only what they observed, heard, believe, infer, or intentionally lie about.

#### Route 10: Latency and Parallelism Stress

Purpose: Heavy turn with multiple key NPCs, command node, and world thread stays within budget.

Actions:

- Enter scene where 3 key NPCs have motives, faction report is due, and world thread touches the location.
- Trigger conflict or social decision requiring reactions.

Required evidence:

- Parallel actor group appears in trace.
- Serialized group count within gate.
- Required reactions complete before `done`.
- No fake no-op success.

## Production Monitoring Plan

Even before full production, Phase 88 artifacts should define the production monitor shape.

### Online Guardrails

Run on every request or turn boundary, with low latency.

| Guardrail | Trigger | Action |
| --- | --- | --- |
| Hidden truth redaction | Narrator prompt or PlayerFacingPacket contains hidden/private/unobserved truth. | Block narration, fail closed, write Critical finding. |
| ActorFrame knowledge boundary | ActorFrame contains facts not licensed by observation/report/rumor/belief/memory/inference route. | Block actor decision and log frame violation. |
| ToolResult validity | Tool success lacks required state/event/observation, or invalid target/resource/location passes. | Reject tool result before commit. |
| Version/proposal safety | Proposal base version stale, write scope conflict unresolved, checkpoint branch mismatch. | Discard/rebase proposal; never commit silently. |
| Empty visible completion | Accepted action reaches ready UI or `done` without assistant text. | Fail closed; no successful turn commit. |
| False-claim truth mutation | Unsupported claim creates item/permit/pass/authority/access truth. | Reject mutation and record claim/belief only. |
| Context hard budget | Narrator receives hidden truth, ActorFrame includes unknowable facts, or full history enters prompt. | Block call or fail trace before response. |

### Offline Flywheel

Run sampled batch after route runs and in production.

| Signal | Metric | Review cadence |
| --- | --- | --- |
| Living-world coherence | Route gameplay score, state-backed consequence rate, later-query consistency. | Every full route run |
| Hidden leak subtlety | LLM judge + human sample for foreshadowing, private intent leakage, unsupported certainty. | Every focused/deep run |
| Memory quality | Relevant recall, irrelevant pollution, duplicate rate, stale belief rate, contradiction handling. | Weekly or after memory changes |
| Latency drift | p50/p90/p95 by turn class, serialized groups, retry count, blocked time by phase. | Every run and production daily |
| Faction realism | Report latency violations, resource ledger violations, omniscient command detections. | Every faction route |
| Combat quality | Engagement-state completeness, aftermath persistence, bystander/witness continuity. | Every combat route |
| Regression carryover | Phase 86/87 invariants: empty text, language drift, recent context, overflow, false claims, state-backed pressure. | Every smoke/focused run |

## Acceptance Gates

### Gate A: Deterministic

All targeted Vitest suites for authority spine, ActorFrame/PlayerFacingPacket, scheduler, proposal queue, faction command nodes, false claims, combat, rollback, memory, context budget, and trace schemas pass.

Also required:

```bash
npm --prefix backend run typecheck
npm run typecheck
```

No skipped Critical tests. No test that passes by hiding tools, disabling mechanics, weakening assertions, or replacing gameplay with fake fallbacks.

### Gate B: Integration

All Phase 88 seeded integration scenarios pass:

- INT-01 tourist offscreen progress.
- INT-02 key NPC ignored for days.
- INT-03 follow/shadow key NPC.
- INT-04 faction report latency.
- INT-05 false claim.
- INT-06 combat contested item.
- INT-07 rollback after async proposals.
- INT-08 memory stress.
- INT-09 hidden truth leak matrix.
- INT-10 latency stress.

Each integration scenario must produce state/event/log evidence. Prose-only success does not count.

### Gate C: Live Playwright

Run with stable backend, not watch mode:

```bash
npm run dev:playtest
```

Suggested live gate command shape after Phase 88 runner exists:

```bash
PHASE88_PROFILE=phase88-deep PHASE88_ASSERT_FIXED=1 ARTIFACT_DIR=output/playwright/phase-88-deep npm exec tsx e2e/88-living-world-playtest.ts
```

Acceptance:

- Full deep route matrix completes with root `summary.json`, `findings.json`, per-route `turns.jsonl`, screenshots, manifest, and fresh backend log paths.
- Zero P0/P1 findings.
- P2 findings fixed or explicitly deferred with rationale and no authority/safety impact.
- All Critical hidden truth, false claim, rollback, and empty visible completion gates have zero violations.
- At least one memory-stress route reaches 100+ turns with budget traces and recall/pollution metrics.
- At least one latency-stress route includes 3 present key NPCs plus one due world thread and stays within heavy-turn SLO.

### Gate D: Latency and Memory

Acceptance:

- Normal interactive p50 <= 5 min and p90 <= 8 min.
- Heavy interactive p95 <= 10 min.
- Normal serialized LLM decision groups <= 4.
- Heavy serialized LLM decision groups <= 5.
- ActorFrame dynamic target <= 22k for normal actor decisions; warnings triaged if > 35k.
- Narrator dynamic target <= 12k; hard fail if hidden facts appear or > 25k without explicit test-only override.
- Memory source provenance coverage = 100 percent for retrieved memories used in actor decisions, reflection, command nodes, or narration.
- No full-history prompt dumps.

### Gate E: Anti-Regression From Phase 86/87

Must preserve:

- `P86-F001`: mutation-heavy future-relevant pressure must have state/tool evidence.
- `P86-F002`: no accepted empty assistant text.
- `P86-F003`: `/game` UI route output remains readable; overflow findings do not get hidden by detector changes.
- `P86-F004`: obvious recent referents resolve from recent scene/conversation context.
- `P86-F005`: combat engagement has concrete combat state language and persisted consequences.
- `P86-F006`: session response language is deterministic and not driven by operator locale.
- `P86-OK-001`: unsupported claims stay claims, not truth.

## Anti-False-Positive Guidance

These rules prevent the evaluator from rewarding fake coverage or flagging valid behavior as a defect.

- Observation-only actions do not require world mutation. Asking "what changed" can answer from existing state without changing world hash.
- Low-stakes sensory color does not require durable state unless it creates a future-relevant actor, object, route, hazard, obligation, relationship, injury, resource, witness, or aftermath.
- A false claim route may mutate world state by writing a claim event, listener belief, suspicion, report, or proof demand. It fails only if unsupported truth, item, permission, room, or authority appears.
- Combat assessment turns do not require HP/injury state. Engagement turns do.
- A distant explosion can be narrated if a committed event exists and player sensory range supports it. The hidden cause cannot be named until a valid knowledge route exists.
- Faction silence can be correct before reports arrive. Do not fail a route because no faction response happened yet if latency explains it.
- NPC inaction can be correct if the actor has no knowledge, no resources, no relevant goal, no due decision, or an active plan that continues deterministically.
- Long latency is not automatically a gameplay failure if the turn class is heavy and trace shows required work. It fails if SLO is breached, serial groups are excessive, or latency was hidden by skips/fake no-ops.
- World hash alone is not enough. Inspect event log, SQLite rows, local history, memory writes, queue state, and turn logs before classifying no-state defects.
- LLM judge output is advisory until calibrated against human review. Critical gates must have code/log evidence whenever possible.
- Infrastructure failures are separate from gameplay failures. `ECONNRESET`, `ECONNREFUSED`, missing backend, stale campaign fixture, and watch-mode restart should create infrastructure findings, not prose/gameplay findings.
- Proper nouns and source-language terms may remain as written. Language drift means unintended narration language switch, not a single canon term.
- Do not pass a route because prose sounds good. Check queryable, rollbackable artifacts.
- Do not pass a route because hidden truth did not appear in final text if hidden truth was present in narrator prompt. Prompt-level leak is already a fail.

## Final Phase 88 Definition of Done

Phase 88 is done when:

- Critical failure modes FM-01 through FM-16 have deterministic or integration coverage.
- All required live routes run under the Phase 88 deep profile with complete artifacts.
- Hidden truth leakage, false claim truth mutation, rollback branch leakage, empty visible completion, stale proposal commit, and fake no-op tool success are zero.
- Key NPCs demonstrate world-time agency through committed plans, actions, memories, failures, interrupts, and later explanations.
- Factions demonstrate report-latency command behavior through explicit command nodes/resources.
- Tourist play proves the player is not the center of all world motion.
- Latency and context budgets are measured per turn and meet the gates without disabling required mechanics.
- Phase 86/87 protected invariants remain green.
