# Phase 88 Wave 5 - Offscreen Catch-Up + Actor Knowledge Preflight

Date: 2026-05-07

## Scope

Wave 5 closes two plan slices:

- `88-06`: deterministic offscreen key-actor plan execution and just-in-time catch-up before player-facing scene/narration packets.
- `88-07`: actor-scoped knowledge and memory provenance, including false-claim handling and rollback invalidation.

## GitNexus Impact

- `runRequiredActorDecisionPass`: LOW. No indexed upstream dependents.
- `buildActorFrame`: LOW. Direct dependent: `runRequiredActorDecisionPass`.
- `invalidateAuthorityAfterRestore`: LOW. Direct dependent: `restoreSnapshot`; transitive route touchpoint: `chat.ts`.
- `createReflectionTools`: LOW. Direct dependent: `runReflectionInternal`; transitive reflection queue callers.
- New symbols `resolveDueWorldWorkForScope` and `recordActorKnowledge` are not yet indexed by GitNexus; they are covered by focused tests and will be visible after re-index.

No HIGH or CRITICAL warnings were returned from individual pre-change impact checks.

Pre-commit `gitnexus_detect_changes(scope: all)` marked the aggregate change set as HIGH because it touches central engine paths: `runRequiredActorDecisionPass`, `buildActorFrame`, `createReflectionTools`, and `invalidateAuthorityAfterRestore`. That is expected for this wave and was answered with focused coverage for actor decisions, reflection, rollback invalidation, snapshots, simulation queue, turn boundary, scene-plan, and empty narration regressions.

## Implementation Summary

- Added `actor-plan-executor.ts` for deterministic `travel`, `wait`, and `record_event` actor plan continuations with stale-version rejection, authority traces, and replan proposals on failure.
- Added `due-world-work.ts` to resolve due world work at live turn boundaries. Deterministic same-scope work can settle before the next frame; non-deterministic work is queued as versioned proposals instead of hidden backend mutation.
- Integrated due-work catch-up into `turn-processor.ts` before `SceneFrame` and before `NarratorPacket`; narrator frame is rebuilt after deterministic catch-up.
- Added `actor_knowledge_records` schema/migration and knowledge APIs for route, truth status, provenance refs, privacy, confidence, reliability, version/time windows, and invalidation.
- Added knowledge retrieval into `runRequiredActorDecisionPass` so actor frames can receive source-backed reports, memories, beliefs, and public records without dumping full history.
- Routed reflection `set_belief` writes through the provenance ledger while preserving the existing NPC belief JSON.
- Added `memory-policy.ts` so narration/source-less flavor does not become memory, while concrete source-backed events/reports/rumors can.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/actor-plan-executor.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/knowledge-model.test.ts src/engine/__tests__/memory-policy.test.ts src/engine/__tests__/actor-knowledge-retrieval.test.ts src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-agent.personality.test.ts src/engine/__tests__/reflection-agent.identity-boundaries.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/reflection-budget.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.empty-narration.test.ts`
  - Passed: 13 files / 117 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `npm --prefix backend run test -- src/engine/__tests__/living-world-authority.test.ts src/engine/__tests__/state-snapshot.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/turn-boundary-authority.test.ts`
  - Passed: 4 files / 11 tests.
- `npm --prefix backend run test -- src/engine/__tests__/actor-frame.test.ts`
  - Passed: 1 file / 3 tests.
