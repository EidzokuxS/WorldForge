# Wave 4A Impact Preflight

## Scope

Wave 4A implements the first durable key-actor process scheduler foundation:

- `key-actor-process.ts`
- `wake-signals.ts`
- `simulation-write-scope.ts`
- `actor-scheduler.ts`
- scheduler integration into proposal queuing

This slice intentionally does not re-enable old fire-and-forget NPC ticks. It creates the contract that decides which key actors should wake, why, and whether they are required before the visible turn boundary or proposal-after-done work.

## GitNexus Impact

- `upsertActorProcessState` — LOW risk, 0 direct indexed callers.
- `tickNpcAgent` — LOW risk, 1 direct indexed caller: `tickPresentNpcs`.
- `tickPresentNpcs` — LOW risk, 0 direct indexed callers.
- `simulateOffscreenNpcs` — LOW risk, 0 direct indexed callers after Wave 3 routing removed direct detached use.
- `buildActorFrame` — LOW risk, 0 direct indexed callers; participates in ActorFrame process traces.
- `queuePostTurnSimulationProposals` — LOW risk, 1 direct indexed caller: `runRollbackCriticalPostTurn`.
- `runRollbackCriticalPostTurn` — LOW risk, 1 direct indexed caller: `buildOnPostTurn`.

## Eligibility Rules

- `tier === "key"` NPCs are backfilled into `actor_process_states`.
- `tier === "persistent"` NPCs become actor processes only through explicit promotion/process rows.
- `tier === "temporary"` NPCs are never implicitly upgraded to heavy simulation.
- Disabled process rows stay asleep.

## Scheduler Contract

- Present same-scene key actors route to `required_before_done`.
- Distant due actors route to `proposal_after_done`.
- Same broad-location but hidden scene-scope actors route through exposed-scope catch-up proposals.
- Deterministic active plans can continue through the deterministic route without requiring an LLM decision.
- Every non-sleeping actor job reserves write scopes before execution/proposal routing.

## Risk Notes

The implementation touches central simulation contracts but avoids changing the live turn processor in this slice. The next Wave 4B slice must consume this scheduler through ActorDecisionPacket/actor tools rather than reviving the old prose-driven NPC tick as authoritative gameplay.

## Final Detect

`gitnexus.detect_changes(scope="all")` before staging reported LOW risk for tracked changes, with touched symbols in `simulation-queue.ts`, `chat.ts`, `docs/mechanics.md`, and `docs/memory.md`, and no affected indexed execution processes. New Wave 4A modules and tests are untracked at that point, so a staged detect is run before commit as the authoritative pre-commit scope check.

`gitnexus.detect_changes(scope="staged")` reported LOW risk across 16 staged files, no affected indexed execution processes, and touched indexed symbols only in the intended route/queue/docs surface.
