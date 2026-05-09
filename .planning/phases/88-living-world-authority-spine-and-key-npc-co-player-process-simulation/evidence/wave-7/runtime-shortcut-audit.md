# Phase 88 Wave 7 Runtime Shortcut Audit

Date: 2026-05-08

## Scope

Searched `backend/src/engine`, `backend/src/routes`, and `backend/src/lib` for:

- wall-clock aborts and duration caps
- output clipping/truncation
- fake/no-op success paths
- hidden mechanic skips
- stuck-settling shortcuts

## Findings

No new wall-clock cap was added for valid LLM turns. Long turns remain allowed; latency tracing is diagnostic only.

No final visible model output clipping was added. The new `ContextBudgetTrace` explicitly rejects `didClipModelOutput`, and `TurnLatencyTrace` can report an `output_clip_attempt` diagnostic if such a strategy is attempted.

Existing truncation-like hits are classified as:

- **Log-only truncation**: `backend/src/lib/logger-serializers.ts`, logger IDs/previews.
- **Prompt/context budgeting**: `token-budget.ts`, `prompt-assembler.ts`, `gm-beat-plan.ts`, `gm-turn-decision.ts`, `grounded-lookup.ts`, `world-forecast*.ts`. These shape bounded prompt inputs, not final player-visible output.
- **Prompt preview / summarization helpers**: combat envelope and narrator packet short previews.
- **Post-turn scheduling shim**: `backend/src/routes/chat.ts` uses `setTimeout(runDetached, 0)` to enqueue detached auxiliary work; it is not a turn-duration timeout and does not replace failed GM output.
- **Settling 409 guards**: route-level protection against concurrent turns while a turn is still active; not a forced 90s/timeout strategy.

## Wave 7 Changes

- Added `TurnLatencyTrace` serialized/parallel group accounting, retries, token usage, output char counts, actor/narrator wait totals, proposal/cache effects, and diagnostics.
- Added `ContextBudgetTrace` source coverage, retrieval counts, hidden-private-term detection, full-history/source-free/summary-as-truth/output-clipping fail-closed guards.
- Added `parallel-simulation-runner` for non-conflicting actor preparation. It returns failed job results instead of manufacturing successful no-op output.
- Updated required actor pass to parallelize actor frame/knowledge/decision preparation only. Authoritative writes still execute sequentially against fresh world versions.
