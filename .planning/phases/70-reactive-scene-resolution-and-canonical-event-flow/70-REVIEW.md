---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
reviewed: 2026-04-25T18:27:26Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - backend/src/engine/__tests__/fixtures/expected-seams.ts
  - backend/src/engine/__tests__/fixtures/mock-llm.ts
  - backend/src/engine/__tests__/prompt-assembler.test.ts
  - backend/src/engine/__tests__/scene-frame.test.ts
  - backend/src/engine/__tests__/scene-plan-validator.test.ts
  - backend/src/engine/__tests__/scene-planner.test.ts
  - backend/src/engine/__tests__/scene-turn-packet.test.ts
  - backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts
  - backend/src/engine/__tests__/turn-processor.observability.test.ts
  - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
  - backend/src/engine/__tests__/turn-processor.test.ts
  - backend/src/engine/__tests__/visible-narration-output-guard.test.ts
  - backend/src/engine/narrator-packet.ts
  - backend/src/engine/prompt-assembler.ts
  - backend/src/engine/scene-frame.ts
  - backend/src/engine/scene-plan-executor.ts
  - backend/src/engine/scene-plan-schema.ts
  - backend/src/engine/scene-plan-validator.ts
  - backend/src/engine/scene-planner.ts
  - backend/src/engine/turn-processor.ts
  - backend/src/engine/visible-narration-output-guard.ts
  - backend/src/routes/__tests__/chat.scene-plan.test.ts
  - backend/src/routes/__tests__/chat.test.ts
  - backend/src/routes/chat.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-04-25T18:27:26Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Re-reviewed the Phase 70 ScenePlan, narrator packet, visible narration guard, turn processor, chat route, and focused tests after the code-review-fix pass.

Prior findings are resolved:

- CR-01: reasoning SSE is now gated by `NODE_ENV !== "production"` and `EXPOSE_LLM_REASONING === "true"` in `turn-processor.ts`.
- WR-01: final-visible prompt assembly now passes `actionResult: undefined` into the base prompt, so hidden chance/roll/reasoning are not formatted into `[ACTION RESULT]`.
- WR-02: `scene-plan-validator.ts` now validates name-based tool inputs against player, clear actor/NPC, connected movement, and forbidden hidden/out-of-frame actor target sets.
- WR-03: `/chat/opening`, `/chat/action`, and `/chat/retry` now call `endTurn()` before post-lock provider-resolution early returns.

No Critical or Warning issues remain. One info-only test coverage gap remains.

Verification run:

- `npm --prefix backend test -- src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/routes/__tests__/chat.test.ts src/routes/__tests__/chat.scene-plan.test.ts` - 5 files, 90 tests passed.
- `npm --prefix backend run typecheck` - passed.

## Info

### IN-01: Rollback test still mocks away the rollback it claims to prove

**File:** `R:\Projects\WorldForge-phase70-execute\backend\src\routes\__tests__\chat.scene-plan.test.ts:304`
**Issue:** The test titled "execution failure after action N restores snapshot, removes partial mutations, and persists no unsafe assistant message" still uses a mocked `processTurn()` that pushes into a local `partialMutations` array and a mocked `restoreSnapshot()` that clears that same array. It proves route catch wiring, but not real `executeScenePlan()` partial DB mutation rollback, chat history restoration, or snapshot bundle integrity.
**Fix:** Add an integration-style test with a temp campaign DB and the real `executeScenePlan()` path: action 1 mutates state, action 2 fails, the route catches the error, `restoreSnapshot()` runs, and assertions verify DB rows, chat history, `done`, and `narrative` are all restored or absent as expected.

---

_Reviewed: 2026-04-25T18:27:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
