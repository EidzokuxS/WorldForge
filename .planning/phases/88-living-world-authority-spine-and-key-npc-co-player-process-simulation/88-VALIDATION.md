# Phase 88 Validation Matrix

## Gate Order

1. Deterministic authority tests.
2. Integration tests with state diffs, packet dumps, job/proposal ledgers, and rollback branches.
3. Focused live Playwright routes.
4. Deep live Playwright matrix.
5. Human/LLM gameplay read-through for prose, agency, causality, and playfeel.

No live route can waive a deterministic invariant failure.

## Critical Failure Gates

| Gate | Must Prove |
| --- | --- |
| Authority | Every future-relevant consequence has state/event/tool evidence. |
| `done` boundary | No state-bearing hidden work mutates visible future state after `done` without versioned commit. |
| Actor POV | Actor decisions use only ActorFrame facts. |
| Hidden truth | Player-facing narration does not leak private/offscreen/unobserved truth. |
| False claims | Unsupported claims become claims/beliefs/proof pressure, not truth. |
| Factions | Faction action requires report/command/resource path. |
| Memory | Memory has provenance, rollback version, privacy, and source ids. |
| Scheduler | Key NPCs wake by world time/events/reports/interrupts/agency debt, not per-turn polling. |
| Rollback | Retry/undo/checkpoint cancels or supersedes jobs/proposals/memories/events/caches from reverted versions. |
| Latency/context | Trace proves serialized group limits, context budgets, and no output truncation/fake success. |

## Deterministic Fixtures

- 10 hidden truth and redaction cases.
- 8 actor POV and false-belief cases.
- 8 false-claim and unsupported authority cases.
- 8 scheduler, wake signal, agency debt, and loop-control cases.
- 8 proposal, write-scope, stale-version, and rollback cases.
- 6 faction command/report/resource cases.
- 6 combat and contested-resource cases.
- 6 memory/context-budget cases.

## Live Playwright Profiles

- `phase88-smoke`: server/harness/progress proof; one short route.
- `phase88-focused`: one route per critical subsystem.
- `phase88-deep`: multi-setting living-world playtest.
- `phase88-memory-stress`: long-running promise/report/lie/relationship recall.
- `phase88-latency-stress`: heavy actor/faction/thread route with trace review.

## Required Live Routes

- Tourist route: player spends time on low-stakes activity while world threads and NPC plans move.
- Key NPC route: a key NPC acts offscreen from private goals and later exposes consequences.
- Follow/shadow route: player tracks or interrupts a key NPC and sees consistent plan state.
- Faction report route: observation travels to command node before faction action.
- False-claim route: player asserts access/item/authority and system rejects free truth.
- Combat/power route: unequal power levels produce concrete tracked consequences.
- Rollback route: checkpoint/retry/undo proves branch integrity.
- Memory stress route: old commitments, lies, reports, and goals remain retrievable with provenance.
- Hidden-truth route: seeded secrets do not leak into narration.
- Latency route: trace shows parallel groups and no fake skips.

## Artifact Requirements

Each accepted run must preserve:

- turn logs;
- packet dumps or redaction audits;
- world version/time sequence;
- job/proposal ledger;
- actor frame audit;
- tool result ledger;
- state diff summary;
- latency/context traces;
- screenshots for UI/progress paths when frontend is involved;
- human/LLM notes for prose/playfeel only after hard gates pass.

