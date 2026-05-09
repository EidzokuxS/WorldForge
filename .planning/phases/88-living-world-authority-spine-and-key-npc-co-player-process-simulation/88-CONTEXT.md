# Phase 88 Context: Living-World Authority Spine and Key NPC Co-Player Process Simulation

## Intent

Phase 88 exists to turn WorldForge's "living world" promise into a real runtime architecture, not a prompt vibe and not a backend shortcut. The target is the architecture described in `R:/Projects/WorldForge/docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`: key NPCs and command actors behave like co-player processes with private POV, goals, plans, wakeups, memory, interrupts, validated tools, and causal agency over world time.

This is not an MVP phase. If implementation size becomes too large for one honest execution pass, the work must be split into follow-up phases without narrowing the target architecture or acceptance gates.

Implementation should be sectional: build a foundation, prove its invariants, then attach the next layer. The execution wave order is captured in `88-EXECUTION-WAVES.md`.

## Product Target

The player should feel that the world keeps living whether they chase the plot, wander as a tourist, lie to a guard, ignore a faction crisis, train for hours, or follow a key NPC. The backend remains the rules of the world. LLM actors decide intent from their own knowledge, then mutate the world only through backend-validated tools and authoritative commits.

The key mental model:

```text
backend kernel
  + event log / state / world clock / rollback
LLM player-facing GM
  + interprets player action and current scene
key NPC actors
  + private ActorFrame, goals, plans, memory, tools
command nodes
  + faction POV, reports, resources, standing orders
world threads
  + durable clocks, stages, surface routes, consequences
narrator
  + renders committed visible truth only
```

## Non-Negotiable Decisions

- Backend authority owns truth, state deltas, clocks, versions, rollback, legality, resources, and tool results.
- LLMs may decide intent, beliefs, plans, reports, and prose. They do not directly create truth.
- `done` must be truthful. No detached post-`done` job may mutate state readable by the next GM Read unless it later commits through a versioned authoritative boundary.
- Key NPCs are not polled after every player turn. They wake by world time, direct observation, reports, rumors, interrupts, deadlines, exposed-scope catch-up, and agency debt.
- Actor prompts receive private POV frames, not global world state.
- Factions are not ghost minds. Faction action comes from command nodes, leaders, units, standing orders, reports, resources, and communication latency.
- Narration receives player-facing committed truth only. Hidden truth, private rationale, unresolved proposals, and offscreen facts without a knowledge route must not reach the narrator.
- Latency must be managed through parallel groups, deterministic continuation, context budget, scheduling, and observability. Do not solve latency by skipping mechanics, truncating output, fake success, or arbitrary wall-clock aborts.
- Tests must prove invariants before live route vibes. Long playtests are acceptance evidence, not the only gate.

## Current Baseline

Strong seams already exist:

- GM Read, GM tool loop, Oracle on demand, final visible narrator, and `NarratorPacket` guardrails live in `backend/src/engine/turn-processor.ts` and `backend/src/engine/narrator-packet.ts`.
- Backend tool execution and grounding validation exist in `backend/src/engine/tool-executor.ts`.
- Scene presence and known/visible participation were improved in earlier phases.
- Phase 87 fixed several GM contract defects around empty output, state-bearing pressure, recent context, combat pressure, and language routing.

But the living-world spine is incomplete:

- `backend/src/routes/chat.ts` still has detached post-turn auxiliary work capable of state mutation.
- There is no durable `WorldVersion`, separate `world_time`, simulation job/proposal ledger, or write-scope commit/rebase layer.
- Present key NPC behavior is not a full co-player process loop.
- Offscreen NPC simulation is interval/batch-shaped, not scheduler/process-shaped.
- Factions still have an abstract macro tick path.
- Memory and beliefs are not yet a provenance-rich truth/belief/report/rumor hierarchy.

## Primary References

- `R:/Projects/WorldForge/docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`
- `R:/Projects/WorldForge/docs/mechanics.md`
- `R:/Projects/WorldForge/docs/memory.md`
- `R:/Projects/WorldForge/.planning/phases/86-exhaustive-live-playtest-matrix-and-findings-ledger/86-FINDINGS.md`
- `R:/Projects/WorldForge/.planning/phases/87-playtest-defect-burn-down-and-final-rerun/87-ACCEPTED-FINDINGS.md`

External design/research references consulted for planning:

- Generative Agents: believable agent memory/reflection/planning loop.
- MemGPT: memory hierarchy and context management.
- ReAct-style agent loops: reasoning plus tool action pattern.
- Long-context retrieval risks: "Lost in the Middle" style context degradation.
- Simulation-game precedent: persistent offscreen events should become inspectable state, not just narration.

## Phase Exit Bar

Phase 88 is complete only when deterministic tests, integration tests, trace artifacts, and live Playwright routes all agree that:

- key NPCs can act offscreen and later explain/reflect from committed events;
- tourist play still advances world threads and faction/NPC plans without forcing protagonist drama;
- false claims create claims/beliefs/proof pressure, not free truth;
- factions respond only through report/command/resource paths;
- rollback/retry/checkpoint cannot leave future jobs, memories, proposals, or events alive;
- player-facing prose stays grounded in visible committed truth;
- latency/context budgets are measured and not hidden by skipped mechanics.

Each wave must produce its own proof before later waves rely on it. A final deep matrix cannot compensate for an earlier unproven authority, POV, rollback, or scheduler invariant.
