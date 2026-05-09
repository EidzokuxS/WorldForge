---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
fixed_at: 2026-04-25T18:20:49.7060116Z
review_path: .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 70: Code Review Fix Report

**Fixed at:** 2026-04-25T18:20:49.7060116Z
**Source review:** .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Unguarded reasoning text is streamed to clients

**Files modified:** `backend/src/engine/turn-processor.ts`, `backend/src/engine/__tests__/turn-processor.test.ts`
**Commit:** 8b65f2c
**Applied fix:** Gated reasoning SSE behind `EXPOSE_LLM_REASONING=true` outside production and added tests for default suppression, explicit debug exposure, and opening-scene suppression.

### WR-01: Final-visible prompt still carries hidden oracle roll data

**Files modified:** `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/__tests__/prompt-assembler.test.ts`
**Commit:** e42ee79
**Applied fix:** Removed `actionResult` from final-visible base prompt assembly and added coverage proving chance, roll, and judge reasoning stay out of the final narrator prompt.

### WR-02: ScenePlan validation does not scope name-based tool targets

**Files modified:** `backend/src/engine/scene-plan-validator.ts`, `backend/src/engine/__tests__/scene-plan-validator.test.ts`
**Commit:** 25e71e3, 9588118
**Applied fix:** Added semantic tool-input scoping for hidden actor references, player-only `set_condition`, clear actor character targets, and connected movement targets; added validator coverage and a follow-up test typing correction.

### WR-03: Provider-resolution failures leave turn locks active

**Files modified:** `backend/src/routes/chat.ts`, `backend/src/routes/__tests__/chat.test.ts`
**Commit:** a2fe78f
**Applied fix:** Released campaign turn locks before post-lock provider-resolution error returns in `/chat/opening`, `/chat/action`, and `/chat/retry`; added route tests proving locks are cleared.

---

_Fixed: 2026-04-25T18:20:49.7060116Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
