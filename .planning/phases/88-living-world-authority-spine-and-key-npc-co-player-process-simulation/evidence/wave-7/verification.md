# Wave 7 Verification

Date: 2026-05-08

Scope: Phase 88 / 88-10 latency, context-budget, and safe parallelism observability foundation.

## What changed

- `TurnLatencyTrace` now records stage timings, serialized LLM groups, parallel prep groups, retry/attempt counts, token usage, output character counts, actor/narrator wait totals, proposal/cache accounting, and diagnostic flags.
- `ContextBudgetTrace` now fail-closes on hidden truth leaks, full-history dumps, source-free memory/fact assertions, summary-as-truth input, and model-output clipping attempts.
- `parallel-simulation-runner` parallelizes only jobs with non-conflicting write scopes. Conflicting jobs are serialized into later groups and retain explicit fallback metadata.
- Required actor decisions now prepare frames/knowledge/decision packets through the safe parallel runner, then execute authoritative actor tools sequentially against fresh world version.
- `processTurnScenePlan` now emits `turn.latency.trace` without adding duration caps, output truncation, fallback prose, or disabled mechanics.

## Commands

```powershell
npm --prefix backend run test -- src/engine/__tests__/turn-latency-trace.test.ts src/engine/__tests__/context-budget-trace.test.ts src/engine/__tests__/parallel-simulation-runner.test.ts src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/actor-knowledge-retrieval.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/prompt-assembler.personality.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/engine/__tests__/prompt-assembler.character-identity.test.ts src/engine/__tests__/faction-command-network.test.ts src/engine/__tests__/actor-scheduler.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/world-thread.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.scene-plan.test.ts
```

Result: passed 23 files / 231 tests.

```powershell
npm --prefix backend run typecheck
```

Result: passed.

```powershell
git diff --check
```

Result: passed. Git reported only LF-to-CRLF working-copy warnings.

```powershell
npm --prefix backend run test
```

Result: passed 179 files / 2139 tests with 30 todo.

## Guardrails verified

- No model output clipping path was added. `didClipModelOutput` remains explicit and false unless a caller attempts clipping, which now throws through `ContextBudgetViolationError`.
- No turn wall-clock timeout or duration cap was added. Long valid turns are diagnosed, not killed.
- No fake successful no-op path was added. Parallel job failures return failed job records; actor tools still execute through existing authority validation.
- Hidden/private context stays excluded from player-facing and actor-facing budget traces unless source-backed and routed by the relevant frame builder.

## Pending

- GitNexus `detect_changes(scope=all)` passed as a pre-commit scope review, with expected HIGH risk because central `buildContextBudgetTrace`, `runRequiredActorDecisionPass`, and `buildActorFrame` seams were touched. Context review confirmed the affected flows match the tested Wave 7 scope: player-facing packets, actor knowledge/frame building, command-node frames, actor scheduler/brain/tools, and required actor decision pass.
- 88-11 still needs the final e2e/Playwright gameplay verification gate after this foundation is committed.
