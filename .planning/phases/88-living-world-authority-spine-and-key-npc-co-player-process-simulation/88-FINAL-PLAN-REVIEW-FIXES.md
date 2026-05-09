# Phase 88 Final Plan Review Fixes

## Source Review

`88-FINAL-PLAN-REVIEW.md` returned `BLOCK` because the initial plan files were high-level briefs rather than executable GSD plans.

## Fixes Applied

- Added executable frontmatter to `88-01-PLAN.md` through `88-11-PLAN.md`:
  - `requirements`
  - `depends_on`
  - `files_modified`
  - `must_haves.truths`
  - `must_haves.artifacts`
  - `must_haves.key_links`
- Added task blocks to every plan with:
  - `files`
  - `action`
  - `verify`
  - `done`
- Resolved all `88-RESEARCH.md` open questions:
  - `world_time_minutes` is the scheduling authority.
  - Simulation jobs/proposals/process state live in SQLite.
  - `simulateOffscreenNpcs` cannot remain an authoritative direct writer.
  - Key actors are key-tier NPCs plus explicitly promoted persistent NPC processes.
  - Latency budgets are diagnostics/SLOs, not duration kill-switches.
- Folded early rollback/snapshot invalidation into `88-01-PLAN.md`.
- Reframed `88-11-PLAN.md` as final integration/live verification rather than the first place rollback safety is implemented.
- Added per-wave evidence requirements to `88-EXECUTION-WAVES.md`.
- Added GitNexus preflight and detect-changes tasks across all implementation plans.

## Static Plan Scan

All 11 plan files now satisfy the minimum executable-plan shape:

- frontmatter present;
- requirements present;
- dependencies present;
- file targets present;
- must-haves present;
- at least four task blocks each;
- task blocks include files/action/verify/done sections;
- artifact paths are named by wave.

## Remaining Rule

Runtime implementation is still paused. Phase 88 is ready for review/approval only; execution starts later only when the user explicitly gives the go-ahead.

## External Review Fixes Applied

Cursor, Codex, and OpenCode returned `FLAG` rather than `PASS`. Their actionable concerns were folded into the plan set before execution:

- Moved minimal serialized LLM group/context budget/stage trace contracts into `88-03-PLAN.md` instead of waiting for final observability.
- Added proposal-only compatibility adapters for old detached offscreen/reflection/faction writers so migration does not silently make the world inert.
- Added early write-scope reservation and conflict routing to `88-04-PLAN.md`; `88-10-PLAN.md` now extends throughput rather than defining correctness late.
- Added existing key-tier NPC backfill/promotion rules to `88-04-PLAN.md`.
- Made `88-05-PLAN.md` depend on `88-03-PLAN.md` and specified the combat/contested-action contract through CombatEnvelope/Oracle or a compatible deterministic ToolResult resolver.
- Clarified `88-06-PLAN.md` around generic due-world-work, plan failure events, replan triggers, notification routes, and location graph/travel verification.
- Added SQLite-backed knowledge persistence and hybrid structured + lexical/BM25 + optional vector retrieval to `88-07-PLAN.md`.
- Added forecast-vs-WorldThread invariant tests and due-world-work attachment to `88-09-PLAN.md`.
- Added docs reconciliation for `docs/memory.md` and `docs/mechanics.md`.
- Added LLM/human judge calibration to `88-11-PLAN.md`; soft findings cannot be reduced to code keyword heuristics.
- Added fail-fast wave gates and a note that administrative splitting is allowed only without reducing full P88 scope.

## Final Plan Review 3 Fixes Applied

`88-FINAL-PLAN-REVIEW-3.md` returned `BLOCK` on verification wiring rather than architecture. Fixes applied:

- Aligned task-level `<automated>` commands with each plan's declared test artifacts:
  - `88-03-PLAN.md`: `chat.scene-plan.test.ts`, `simulation-queue.test.ts`, `turn-boundary-authority.test.ts`.
  - `88-05-PLAN.md`: `actor-decision-packet.test.ts`, `actor-tools.test.ts`.
  - `88-07-PLAN.md`: `knowledge-model.test.ts`, `memory-policy.test.ts`, `reflection-agent.test.ts`.
  - `88-09-PLAN.md`: `world-thread.test.ts`, `world-thread-surfacing.test.ts`.
  - `88-10-PLAN.md`: `turn-latency-trace.test.ts`, `context-budget-trace.test.ts`, `parallel-simulation-runner.test.ts`.
  - `88-11-PLAN.md`: `phase-88-integration.test.ts`, `chat.scene-plan.test.ts`.
- Made `88-11-PLAN.md` task automation enforce deterministic and live Playwright proof:
  - Task 3 runs `PHASE88_MODE=deterministic node --import tsx/esm e2e/88-living-world-playtest.ts` and judge calibration dry-run.
  - Task 4 runs `PHASE88_MODE=live node --import tsx/esm e2e/88-living-world-playtest.ts`.
  - Final proof addendum runs deterministic + live Playwright, judge calibration, and checks for `output/playwright/phase-88-living-world/summary.json`.
