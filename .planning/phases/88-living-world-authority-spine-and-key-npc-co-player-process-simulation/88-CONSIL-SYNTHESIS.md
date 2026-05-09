# Phase 88 Consil Synthesis

## Agents

- Research agent: wrote `88-RESEARCH.md`.
- Planning agent: wrote `88-PLAN-SLICES-DRAFT.md`.
- Evaluation agent: wrote `88-TEST-STRATEGY.md`.
- Risk-review agent: wrote `88-RISK-REVIEW.md`.

## Consensus

All agents converge on the same first principle: Phase 88 must start with the authority spine. Adding more NPC/faction autonomy on top of the current detached post-turn mutation shape would reproduce the exact failure class the report warns about.

The safe order is:

1. World version, world time, event/proposal/job/process persistence, write scopes, rollback invalidation.
2. ActorFrame and PlayerFacingPacket contracts with provenance and hidden-truth leak tests.
3. Turn-boundary refactor so required exposed simulation resolves before `done`, while optional async work becomes proposal-only.
4. KeyActorProcess scheduler and wakeups.
5. Actor decisions and validated actor tools.
6. Deterministic plan execution and offscreen catch-up.
7. Memory, beliefs, reports, rumors, and context-budget traces.
8. Faction command networks.
9. World threads and diegetic surfacing.
10. Latency/context observability and parallel execution proof.
11. Rollback/checkpoint/live-playtest verification gate.

## Biggest P0 Risks

- Hidden state mutation after `done`.
- Stale async jobs mutating a restored or superseded branch.
- Abstract faction ghost-mind ticks masquerading as living-world agency.
- Actor omniscience through overbroad frames.
- Serial LLM group explosion.
- Memory overgrowth and source-free beliefs.
- Reopening Phase 78-87 GM/narrator/tool boundaries by rushing NPC behavior first.

## Accepted Guardrails

- No new autonomous mutation without `WorldVersion`, base version, write scope, and commit/rebase semantics.
- No direct detached authoritative writes after `done`.
- No per-turn polling of all key NPCs as the primary scheduler.
- No faction macro mind as the final faction implementation.
- No actor prompt without an ActorFrame leak test.
- No broad memory writes without provenance, compaction, rollback version, and context budget traces.
- No live-only acceptance. Deterministic invariant tests come first.

## Planning Implication

Phase 88 should be executed as gated waves. If execution reveals that all 11 plans cannot be completed cleanly in one phase, the split should preserve the same target, for example:

- Phase 88: authority spine, boundary, ActorFrame, actor scheduler/tools.
- Phase 89: memory/beliefs, factions, world threads.
- Phase 90: full live matrix, tuning, final proof.

That split is a scheduling tool only. It is not permission to ship half a living world.

## Sectional Execution Update

The accepted planning stance is progressive implementation:

- build authority spine, test it;
- build visibility/POV contracts, test them;
- build truthful turn boundary, test it;
- build key NPC process/tool core, test it;
- build offscreen continuity/memory, test it;
- build factions/world threads, test them;
- run latency/final proof only after those layers are green.

This is captured in `88-EXECUTION-WAVES.md` and should guide `$gsd-execute-phase` or any follow-up phase split.
