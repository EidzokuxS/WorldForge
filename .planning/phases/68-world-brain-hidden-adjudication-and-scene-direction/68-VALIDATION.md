---
phase: 68
slug: world-brain-hidden-adjudication-and-scene-direction
status: complete
nyquist_compliant: true
wave_1_complete: true
wave_2_complete: true
wave_3_complete: true
wave_4_complete: true
created: 2026-04-20
updated: 2026-04-20
verified_on: 2026-04-20
---

# Phase 68 — Validation Strategy

> Verification gate for the bounded world-brain seam that now adjudicates compact scene direction before hidden or visible narration consumes the turn state.

Scope follows [68-04-PLAN.md](/R:/Projects/WorldForge/.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-04-PLAN.md). This is a backend-only phase. No frontend, DB schema, Oracle probability math, offscreen simulation, reflection runtime, or hidden-pass ownership migration landed here.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (`backend`) |
| **Focused commands** | `npx vitest run src/engine/__tests__/world-brain.test.ts src/engine/__tests__/scene-assembly.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.observability.test.ts` |
| **Primary binary gate** | `npm --prefix backend test` |
| **Typecheck** | `npm --prefix backend run typecheck` |
| **Scope note** | Worktree contains unrelated pre-existing dirty files outside Phase 68. Phase 68 implementation itself stayed inside `backend/src/engine` plus backend engine tests and planning artifacts. |
| **Observability proof** | Route-level mocked engine seam now emits bounded `world-brain.scene-direction` events for both `/action` and `/opening` routes. |

## Per-Task Verification Map

| Task ID | Requirement | Command / Evidence | Status |
|---------|-------------|--------------------|--------|
| 68-01-01 | P68-R1, P68-R7 | `npx vitest run src/engine/__tests__/world-brain.test.ts` | ✅ green |
| 68-02-01 | P68-R2, P68-R4, P68-R6 | `npx vitest run src/engine/__tests__/scene-assembly.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ green |
| 68-03-01 | P68-R3, P68-R5 | `npx vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ green |
| 68-04-01 | P68-R8 | `npx vitest run src/engine/__tests__/turn-processor.observability.test.ts` | ✅ green |
| 68-04-02 | P68-R9 | focused Phase 68 regression bundle | ✅ green |
| 68-04-02 | P68-R9 | `npm --prefix backend run typecheck` | ✅ green |
| 68-04-02 | P68-R9 | `npm --prefix backend test` | ✅ green |
| 68-04-03 | P68-R9 | `68-SUMMARY.md` written | ✅ complete |

## Command Results

### Focused Phase 68 Regressions

- Command:

```text
npx vitest run src/engine/__tests__/world-brain.test.ts src/engine/__tests__/scene-assembly.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.observability.test.ts
```

- Result: exit `0`
- Evidence: `Test Files 5 passed (5)` and `Tests 90 passed (90)`

This focused gate proves:
- the `WorldBrainSceneDirection` contract is bounded and sanitized
- player-turn orchestration runs world-brain after Oracle and before hidden tool-driving
- opening scenes run the same seam before visible narration
- SceneAssembly carries both raw and player-perceivable world-brain packets
- final-visible prompt assembly consumes filtered `[SCENE DIRECTION]` and `[NARRATION GUARDRAILS]`
- observability records the seam exactly once per route path with bounded payload counts only

### Backend Typecheck

- Command: `npm --prefix backend run typecheck`
- Result: exit `0`

### Backend Full Suite

- Command: `npm --prefix backend test`
- Result: exit `0`
- Evidence: `Test Files 125 passed | 3 skipped (128)` and `Tests 1582 passed | 30 todo (1612)`

## Scope Gate

### In-Scope Files

- `backend/src/engine/world-brain.ts`
- `backend/src/engine/scene-assembly.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/turn-processor.ts`
- backend engine tests covering the new seam

### Out-of-Scope Guarantees

Phase 68 intentionally did **not**:
- redesign routes or SSE transport
- change DB schema or persistence contracts
- change Oracle probability math
- move hidden tool-driving ownership out of storyteller
- modify `npc-offscreen.ts`, `reflection-agent.ts`, or `runtime-tags.ts`
- touch frontend code

There are unrelated dirty files elsewhere in the worktree from previous work. Treat staged-only change detection as authoritative before any Phase 68 commit.

## Requirement Sign-Off

- [x] **P68-R1**: bounded `WorldBrainSceneDirection` contract exists in [world-brain.ts](/R:/Projects/WorldForge/backend/src/engine/world-brain.ts) with the exact Phase 68 field set and caps
- [x] **P68-R2**: `processTurn(...)` runs a judge-owned world-brain pass after Oracle and before hidden tool-driving in [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts)
- [x] **P68-R3**: `processOpeningScene(...)` runs the same seam before opening visible narration in [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts)
- [x] **P68-R4**: [scene-assembly.ts](/R:/Projects/WorldForge/backend/src/engine/scene-assembly.ts) carries both authoritative and player-perceivable scene direction
- [x] **P68-R5**: [assembleFinalNarrationPrompt(...)](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts) consumes only filtered visible scene direction and guardrails
- [x] **P68-R6**: hidden tool-driving remains in place and consumes world-brain direction as an additive bridge; no Phase 69 migration landed
- [x] **P68-R7**: phase stayed additive and bounded with no route/SSE redesign, DB schema changes, Oracle math rewrite, or post-generation prose rewriting
- [x] **P68-R8**: compact `world-brain.scene-direction` observability exists and is route-verified with bounded payloads only
- [x] **P68-R9**: focused regressions, backend typecheck, and full backend suite are green

## Validation Verdict

- [x] Contract layer is green
- [x] Player-turn orchestration is green
- [x] Opening-scene orchestration is green
- [x] Final-visible prompt consumption is green
- [x] Observability is green
- [x] Backend typecheck is green
- [x] Backend full suite is green

**Verdict:** Phase 68 is complete. WorldForge now decides compact scene-causality facts through a bounded judge-owned world-brain seam before narration consumes the turn, while intentionally deferring the deeper hidden-pass ownership migration to Phase 69.
