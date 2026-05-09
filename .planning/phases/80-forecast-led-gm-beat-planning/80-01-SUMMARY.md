# Plan 80-01 Summary: Forecast Contract And Advisory Storage

## Status

Complete.

## What Changed

- Added the bounded world forecast contract in `backend/src/engine/world-forecast.ts`.
- Forecast entries are advisory pressure only: they cannot carry executable tool payloads, planned actions, state deltas, or narrator facts.
- Added staged forecast helpers so a generated forecast can be held during turn processing and committed only after the turn succeeds.
- Added scoped excerpt helpers so downstream prompts receive only local/public forecast pressure plus explicit private-term guardrails.

## Verification

- `backend/src/engine/__tests__/world-forecast.test.ts`
- `npm --prefix backend run typecheck`
