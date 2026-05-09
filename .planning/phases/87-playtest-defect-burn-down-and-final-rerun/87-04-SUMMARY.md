# Phase 87-04 Summary: SceneFrame Recovery and Recent-Context Referents

Status: code-fixed/rerun-pending
Date: 2026-05-07

## What Changed

- `P86-CAL-001` was classified as invalid fixture data, not a recoverable SceneFrame drift. Direct DB inspection found the two failed calibration campaigns have `players=0`; the usable Naruto x JJK baseline has a player row.
- SceneFrame missing-player errors now say `invalid-campaign missing player row` and tell the caller to create or select a player character before entering `/game`.
- GM Read now receives bounded recent conversation before path selection in `processTurnScenePlan`, so obvious recent references can be resolved before the GM chooses clarification.
- The GM Read prompt contract now tells the model to resolve recent-context references like "that connection", "the slower route", "the deal", and "the nearby vendor" against recent conversation plus legal movement/visible actor/legal target refs. Clarification is reserved for no grounded candidate or competing grounded candidates.

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts`
- `npm --prefix backend exec vitest run src/engine/__tests__/scene-frame.test.ts`
- `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts`
- `npm --prefix backend run typecheck`

All commands passed locally.

## Rerun Required

- `P86-F004` still needs focused Phase 87 rerun evidence on `exploration-location-graph`, `social-pressure`, and `false-claim-boundary`.
- `P86-CAL-001` closeout should use either campaigns with player rows or explicit invalid-fixture classification evidence; the two no-player fixtures should not count as playable legacy coverage.
