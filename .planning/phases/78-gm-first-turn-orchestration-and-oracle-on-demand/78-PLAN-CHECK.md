# 78 Plan Check

**Checked:** 2026-05-03
**Verdict before fixes:** BLOCK
**Checker:** gsd-plan-checker agent Hume

## Findings

1. `78-RESEARCH.md` had an unresolved `Open Questions` section even though the plans depended on those choices.
2. `78-05-PLAN.md` listed route rollback tests against `backend/src/routes/__tests__/chat.scene-plan.test.ts` without owning that file.
3. `78-02-PLAN.md` mentioned memory hints without clarifying whether an executable memory-hint field exists today.

## Fixes Applied

1. Converted `Open Questions` into `Open Questions (Resolved For Phase 78)` and recorded the Phase 78 decisions:
   - use two stages, GM decision then ScenePlanner;
   - direct/no-roll/continue uses a validated no-mutation artifact that feeds the existing finalization/narration tail;
   - keep `SCENE_PLAN_ENABLED=false` as a legacy fallback during Phase 78.
2. Added `backend/src/routes/__tests__/chat.scene-plan.test.ts` to `78-05-PLAN.md` file ownership.
3. Clarified that "memory hints" means existing recent-event/deferred-hook/context surfaces only; Phase 78 must not invent a mandatory memory field.

## Status After Fixes

Ready for a second plan-check pass before external review.

## Second Check

**Verdict before fixes:** BLOCK

The previous logic blockers were closed. The remaining blocker was executable-command hygiene: plans used shell-style GitNexus examples instead of the project-required MCP-style calls from `AGENTS.md`.

**Fix applied:** all Phase 78 impact gates now use explicit MCP-style examples such as `gitnexus_impact({ target: "processTurn", direction: "upstream" })`, and final detect-changes gates use `gitnexus_detect_changes({ scope: "all" })`.

## Review-Incorporation Check

After external review incorporation, a later checker flagged three additional executable-readiness risks:

1. Tool/combat plans still left room to request a new roll outside `roll_oracle`.
2. Clarification rendering was not tied tightly enough to the real `/game` SSE path.
3. Stale generated notes in this plan-check file still described the wrong GitNexus interface.

**Fix applied:** `78-03`, `78-04`, `78-06`, and `78-VALIDATION` now state that `roll_oracle` is the only new backend roll path; tool/combat paths may only consume a prior roll result. Clarification now explicitly uses existing `narrative` SSE / `parseTurnSSE` / `onNarrative`, then `finalizing_turn` / `done`, with no `oracle_result`, `state_update`, `quick_actions`, stale dice, tool execution, or world mutation.
