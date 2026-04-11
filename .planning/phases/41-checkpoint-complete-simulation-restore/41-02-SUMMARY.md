---
phase: 41-checkpoint-complete-simulation-restore
plan: 02
subsystem: backend
tags: [backend, checkpoints, restore, runtime-state, vitest]
requires:
  - phase: 41-01
    provides: shared restore bundle contract for checkpoints and turn-boundary restore
provides:
  - campaign-scoped runtime-state ownership for live-turn snapshots and active-turn guards
  - restore-time invalidation of same-turn committed evidence queues
  - checkpoint load aligned with the same restored simulation boundary used by gameplay rollback flows
affects: [phase-41, gameplay-runtime, checkpoint-restore]
requirements-completed: [RINT-03, SIMF-03]
completed: 2026-04-11
---

# Phase 41 Plan 02 Summary

Implemented discarded-timeline runtime invalidation so checkpoint restore no longer reopens a campaign with stale turn snapshots, active-turn guards, or same-turn reflection evidence from the abandoned branch.

## What changed

- Added `backend/src/campaign/runtime-state.ts` for campaign-scoped:
  - active-turn guards
  - last-turn snapshot ownership
  - restore-time runtime invalidation
- Updated `backend/src/routes/chat.ts` to use the shared runtime-state seam instead of route-local maps.
- Added `clearPendingCommittedEvents(campaignId)` to `backend/src/vectors/episodic-events.ts` as a distinct tick-agnostic restore helper.
- Updated `backend/src/campaign/checkpoints.ts` so checkpoint load clears runtime state and committed-event queues before reopening the restored campaign.
- Added regression coverage in:
  - `backend/src/campaign/__tests__/checkpoints.test.ts`
  - `backend/src/routes/__tests__/chat.test.ts`
  - `backend/src/vectors/__tests__/episodic-events.test.ts`

## Verification

- `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/routes/__tests__/chat.test.ts src/vectors/__tests__/episodic-events.test.ts`
  - passed (`56/56`)
- `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts src/routes/__tests__/chat.test.ts src/vectors/__tests__/episodic-events.test.ts`
  - passed (`59/59`)
- `npx tsc --noEmit -p backend/tsconfig.json`
  - still fails on pre-existing unrelated issues in:
    - `backend/src/ai/__tests__/provider-registry.test.ts`
    - `backend/src/engine/__tests__/turn-processor.test.ts`
    - `backend/src/routes/worldgen.ts`

## Boundary note

Phase 41 now clears the known campaign-scoped restore leaks. Long-lived auxiliary async completions remain a bounded follow-up risk, not hidden scope expansion inside this phase.
