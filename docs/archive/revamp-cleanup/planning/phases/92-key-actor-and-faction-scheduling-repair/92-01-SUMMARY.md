# 92-01 Summary: Critical-Path Actor Wake Index

Status: complete
Date: 2026-05-10

## Implemented

- Added durable `actor_wake_signals` schema and migration with pending/consumed/expired lifecycle, due-time/priority indexes, actor/source indexes, and helper API.
- Added `actor-wake-signals.ts` helpers for enqueue, critical candidate listing, actor-scoped pending listing, consume, expire, and conversion into existing `WakeSignal` objects.
- Extended `collectWakeSignals` with external signals so durable rows still flow through the existing wake classifier/sort/dedupe path.
- Added exact actor process loaders for due actor IDs, scope actor IDs, and selected actor IDs.
- Rewired `scheduleKeyActorProcessesForTurn` to build a critical-path candidate set from due process rows, current/broad exposure scope, explicit/report actors, and durable wake rows, then return only non-sleeping decisions.

## Proof

- `npm --prefix backend run test -- src/engine/__tests__/actor-wake-signals.test.ts src/engine/__tests__/actor-scheduler.test.ts`
  - 2 files, 10 tests passed.
- `npm --prefix backend run test -- src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/simulation-queue.test.ts`
  - 3 files, 15 tests passed.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check`
  - Passed with only LF-to-CRLF working-copy warnings.

## Requirement Mapping

- P92-R1: Scheduler decisions now include due/present/signaled candidates only; sleeper actors are absent from decision output.
- P92-R2: Durable event/report/authority wake rows can be queried before loading actor process rows and are classified by the existing wake-signal policy.

## GitNexus Impact

Pre-edit impact was LOW for `scheduleKeyActorProcessesForTurn`, `listKeyActorProcessesForCampaign`, and `collectWakeSignals`.

Direct callers/blast radius:

- `queuePostTurnSimulationProposals`
- `resolveDueWorldWorkForScope`
- `runRequiredActorDecisionPass`

The affected GitNexus flow is the required actor decision pass. Focused caller tests passed after implementation.
