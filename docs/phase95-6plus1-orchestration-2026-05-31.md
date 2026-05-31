# Phase 95 6+1 Orchestration Canvas

Date: 2026-05-31
Branch: develop
Baseline HEAD: 7971dab544c5de212c8f1f3fa3a80bb2d7e2ba56

## Product Goal

WorldForge Phase 95 target is a long-lived, high-quality LLM-driven RPG gameplay loop, not a pile of scripted green runs. The game must remain coherent and playable on turn 1, turn 60, and turn 600+ because authority, state ownership, refs, time, receipts, narration, projection, recovery, clone/replay/rollback, vector state, and observability have explicit owners and executable contracts.

60-turn runs are smoke evidence. They are not the success ceiling.

## Current Gate

R4 Oracle verdict: conditional architecture GO, long-play acceptance NO-GO.

Known R4 P1s closed in commit `7971dab5`:
- Default `/world` NPC projection no longer exposes semantic `persona/goals/beliefs`.
- Review/editor projection explicitly opts into `projection=review`.
- Public projection contract has separate `world_review` surface.
- Production `executeToolCall` caller graph is contract-tested against authority guards.

Still not acceptance:
- Browser/human-style gameplay quality needs fresh validation.
- Long-play 60/600+ coherence needs evidence.
- Agent/tool loop, narrator quality, world runtime, clone/replay/vector, and observability need final architecture sweep against live code and product goal.

## Dirty Tail Policy

The branch is owned by this Phase 95 Codex work. Do not call repo artifacts "someone else's".

Current out-of-scope working tail may include:
- `.planning/phases/92-key-actor-and-faction-scheduling-repair/evidence/*.jsonl`
- root `phase95-*.md/png` Browser snapshots

Agents must not revert or stage these unless explicitly assigned.

## Shared Rules

- Model proposes; backend owns validation, authority, mutation, receipts, time, persistence, clone/replay/rollback, and public projection.
- Every state class must have one write owner.
- Model/player-facing refs must use issued aliases or backend-owned capabilities, never raw DB ids.
- UI labels and quick-action prose are presentation; backend-owned handles carry authority.
- Final narration must be grounded in accepted backend-visible facts while staying fun to play.
- Primary gameplay contracts must be typed and runtime-validated.
- Regex/text normalization is allowed only behind named safe boundaries.
- Evidence claims must be labeled: executed, inspected, assumed.
- Agents return compact findings. Main orchestrator integrates and commits.

## Agent Slots

### A1 UI Intake And Projection
Agent: Mendel (`019e7ccd-5ad1-7021-b54c-43f4ccaf6288`)
Status: running
Scope: UI action intake, quick actions, capabilities, SSE/API public projection, frontend parsing, Browser workability.
Output: P0/P1/P2 findings, exact files/functions, tests to add/run, player-quality notes.

### A2 GM Tool Loop And Executor
Agent: Schrodinger (`019e7ccd-709b-71f2-bc40-1ded714e2600`)
Status: running
Scope: GM Read, GM Tool Loop, `executeToolCall`, tool schemas, runtime validation, receipts, authority denials, all tool ownership.
Output: caller map risks, missing authority guards, receipt gaps, tests.

### A3 Actor/World Runtime And Time
Agent: Poincare (`019e7ccd-8a3a-7bb0-a956-4d928d7e4cca`)
Status: running
Scope: actor runtime, NPC/background agents, due-world runtime, scheduling, time ledger, state write owners, recovery of pending work.
Output: owner parity matrix gaps, runtime ordering risks, long-turn coherence risks.

### A4 Narrator And Gameplay Quality
Agent: Einstein (`019e7ccd-a47c-79c2-822f-95952b0d3fc6`)
Status: running
Scope: narrator packet, final narration, grounded fact refs, resume/fail-closed paths, player-facing prose quality.
Output: defects that make game feel mechanical/incoherent, grounding holes, tests and Browser probes.

### A5 Persistence Clone Replay Rollback Vector
Agent: Goodall (`019e7ccd-b899-7720-9be6-dca69deb6d66`)
Status: running
Scope: persistence, restore journal, clone modes, replay policy, rollback, vector rebuild/reconcile, checkpoint APIs.
Output: deterministic recovery risks, replay divergences, vector/state mismatch tests.

### A6 Observability Long-Play Acceptance
Agent: Leibniz (`019e7ccd-ce2b-7df3-9514-41ebf1e7e2ac`)
Status: running
Scope: observability, evals, 60/600+ playtest plan, human-style evidence, clone-world campaigns, regression gates.
Output: acceptance matrix, minimal non-harness-heavy validation path, telemetry gaps.

## Agent Output Format

Each agent returns:

```markdown
## Verdict
GO / CONDITIONAL / NO-GO for this cluster, with one sentence why.

## P0/P1 Findings
- Severity, file/function, evidence, concrete fix/test.

## P2/Debt
- Only real acceptance risks, not cosmetic debt.

## References Used
- Local files/docs/code/tests inspected.
- External/live docs if used.

## Unverified Assumptions
- Anything not executed or not inspectable.

## Recommended Next Patch
- Disjoint write scope if implementation is needed.
```

## Orchestrator Duties

- Keep exactly six useful agents alive while cluster sweep is active.
- Poll patiently; timeout is not failure.
- Close agents only after final result intake or supersession.
- Integrate findings into this canvas or follow-up architecture docs.
- Use GitNexus impact before symbol edits and detect_changes before commits.
- Commit/push coherent verified slices.
