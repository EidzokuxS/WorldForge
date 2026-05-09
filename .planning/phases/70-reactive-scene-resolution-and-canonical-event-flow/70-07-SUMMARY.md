---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 07
subsystem: backend-routes
tags: [chat-route, scene-plan, rollback, retry, present-npc, vitest, tdd]
requires:
  - phase: 70-06
    provides: "Default SceneFrame -> Oracle -> ScenePlan -> validate -> execute -> packet -> guarded prose path in processTurn."
provides:
  - "Chat action and retry routes no longer pass onBeforeVisibleNarration into processTurn."
  - "Route-level regression coverage for action/retry ScenePlan options and action-N failure rollback."
  - "Preserved route-owned turn lock, snapshot restore, retry, undo, and rollback-critical post-turn work."
affects: [70-08, backend-routes, scene-plan-cutover, rollback-regressions]
tech-stack:
  added: []
  patterns:
    - "Route cutover removes visible critical-path NPC mini-rounds while keeping post-turn background work behind onPostTurn."
    - "Route tests model processTurn failures as SSE errors with no done/narrative event and no unsafe assistant persistence."
key-files:
  created:
    - backend/src/routes/__tests__/chat.scene-plan.test.ts
  modified:
    - backend/src/routes/chat.ts
    - backend/src/routes/__tests__/chat.test.ts
key-decisions:
  - "Removed route-level onBeforeVisibleNarration injection instead of deleting tickPresentNpcs from npc-agent.ts."
  - "Kept buildOnPostTurn as the only route-owned post-turn hook for rollback-critical background/offscreen work."
  - "Used indexed GitNexus routes /action and /retry because /api/chat/action and /api/chat/retry are mount-path prefixes outside the route index."
requirements-completed: [P70-R4, P70-R7]
duration: 9 min
completed: 2026-04-25
---

# Phase 70 Plan 07: Chat Route ScenePlan Cutover Summary

**Chat action/retry route cutover removes the pre-visible present-NPC mini-round while preserving snapshot restore and rollback failure behavior.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-25T17:22:35Z
- **Completed:** 2026-04-25T17:31:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Removed `tickPresentNpcs` from `backend/src/routes/chat.ts` imports and removed the unused `runLocalPresentSceneSettlement` / `buildOnBeforeVisibleNarration` route hook.
- Stopped passing `onBeforeVisibleNarration` into `processTurn(...)` for both `/chat/action` and `/chat/retry`.
- Preserved `onPostTurn`, `tryBeginTurn`, `captureSnapshot`, `restoreSnapshot`, `setLastTurnSnapshot`, `clearLastTurnSnapshot`, `endTurn`, SSE streaming, retry, undo, and rollback-critical background work.
- Added route regressions proving action/retry omit the pre-visible hook and that action-N execution failure restores the route snapshot, emits `error`, emits no `done` or `narrative`, and persists no unsafe assistant message.

## Task Commits

1. **Task 1 RED:** `cc8be2c` test(70-07): add failing chat route cutover tests
2. **Task 1 GREEN:** `4d5b3b2` feat(70-07): remove route present-NPC critical hook
3. **Task 2:** `8417d82` test(70-07): prove ScenePlan route rollback parity

## Files Created/Modified

- `backend/src/routes/chat.ts` - removed route-level present-NPC pre-visible settlement hook and left `onPostTurn` wiring intact.
- `backend/src/routes/__tests__/chat.scene-plan.test.ts` - added dedicated action/retry route option and ScenePlan failure rollback regressions.
- `backend/src/routes/__tests__/chat.test.ts` - updated existing route expectations to post-turn-only background work and no pre-visible hook injection.

## GitNexus Impact

- API impact for `backend/src/routes/chat.ts`: LOW risk; 7 indexed routes in file, 0 direct consumers, 7 affected indexed flows.
- API impact for `/action`: LOW risk; 0 direct consumers, 7 affected indexed flows.
- API impact for `/retry`: LOW risk; 0 direct consumers, 7 affected indexed flows.
- `/api/chat/action` and `/api/chat/retry` were not direct GitNexus route keys; the indexed Hono routes are `/action` and `/retry`.
- `buildOnBeforeVisibleNarration`: LOW risk; 1 direct file caller, 0 affected processes.
- `runLocalPresentSceneSettlement`: LOW risk; 1 direct caller, 0 affected processes, Routes module direct impact.
- `tickPresentNpcs`: LOW risk; direct route caller chain only, 0 affected processes. Function retained in `npc-agent.ts` for background/offscreen/future non-critical autonomy use.
- `buildOnPostTurn`: LOW risk; 1 direct file caller, 0 affected processes. Function preserved.
- `gitnexus_detect_changes(scope: staged)` before each commit reported LOW risk with expected staged file scope.
- Final `gitnexus_detect_changes(scope: all)` reported only the pre-existing dirty `CLAUDE.md` GitNexus/context drift, with 0 affected processes.

## Decisions Made

- Kept `tickPresentNpcs` exported from `npc-agent.ts`; Plan 70-07 only removes it from normal route imports and the action/retry visible critical path.
- Did not add route buffering or route-level filtering for unsafe `narrative` events; ScenePlan failures are expected to throw before final narration, and the route regression models that failure boundary.
- Did not update `STATE.md` or `ROADMAP.md` in this isolated worktree; the execute workflow skips centralized state updates in worktree mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected route test expectation for omitted option property**
- **Found during:** Task 1 GREEN verification
- **Issue:** The new regression expected `onBeforeVisibleNarration: undefined`, but after the route cutover the option is omitted entirely.
- **Fix:** Changed the tests to assert `not.toHaveProperty("onBeforeVisibleNarration")` while still requiring `onPostTurn`.
- **Files modified:** `backend/src/routes/__tests__/chat.scene-plan.test.ts`, `backend/src/routes/__tests__/chat.test.ts`
- **Verification:** Targeted route Vitest and backend typecheck passed.
- **Committed in:** `4d5b3b2`

**2. [Rule 3 - Blocking] Fixed Vitest hoisted runtime-state spies**
- **Found during:** Task 2 regression verification
- **Issue:** Runtime-state spy mocks in `chat.scene-plan.test.ts` were referenced from a hoisted `vi.mock(...)` factory before initialization.
- **Fix:** Moved runtime-state maps and spies into `vi.hoisted(...)`.
- **Files modified:** `backend/src/routes/__tests__/chat.scene-plan.test.ts`
- **Verification:** Targeted route Vitest passed 31 tests and backend typecheck passed.
- **Committed in:** `8417d82`

---

**Total deviations:** 2 auto-fixed (Rule 3 blocking)
**Impact on plan:** Test-harness corrections only. Production scope stayed limited to removing the route hook.

## Issues Encountered

- Task 2 was a proof-only regression over route safety that already existed after Task 1 cutover and earlier rollback phases. No additional production GREEN commit was needed.
- `CLAUDE.md` was dirty before execution and remained unstaged/uncommitted as requested.

## Known Stubs

None. Stub scan found only local test accumulator arrays and existing nullable turn-state variables; no user-facing placeholder or unwired mock data flow was introduced.

## Threat Flags

None. This plan did not add endpoints, auth paths, file access patterns, schema changes, or new trust boundaries. It removed the planned route-level NPC autonomy surface from the visible critical path.

## Verification

- RED: `cd backend && npx vitest run src/routes/__tests__/chat.scene-plan.test.ts src/routes/__tests__/chat.test.ts` failed before implementation because action/retry still passed `onBeforeVisibleNarration`.
- `npm --prefix backend run typecheck` - passed.
- `cd backend && npx vitest run src/routes/__tests__/chat.scene-plan.test.ts src/routes/__tests__/chat.test.ts` - passed: 2 files, 31 tests.
- `rg "buildOnBeforeVisibleNarration|runLocalPresentSceneSettlement" backend/src/routes/chat.ts` - no matches.
- `rg "tickPresentNpcs" backend/src/routes/chat.ts` - no matches.
- `rg "export async function tickPresentNpcs|tickPresentNpcs" backend/src/engine/npc-agent.ts` - matched retained export.
- `rg "buildOnPostTurn|captureSnapshot|restoreSnapshot|tryBeginTurn|endTurn" backend/src/routes/chat.ts` - matched preserved route safety seams.
- `rg "onBeforeVisibleNarration|onPostTurn|restoreSnapshot|event: error|event: done|event: narrative|appendChatMessages|action N|partial mutations" backend/src/routes/__tests__/chat.scene-plan.test.ts backend/src/routes/__tests__/chat.test.ts` - matched route regression evidence.

## TDD Gate Compliance

- Task 1 RED commit exists: `cc8be2c`.
- Task 1 GREEN commit exists after RED: `4d5b3b2`.
- Task 2 added a regression for already-existing rollback behavior after Task 1; no production GREEN commit was needed. This is test-hardening rather than a new behavior implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `70-08`: route cutover is covered, `tickPresentNpcs` is out of the action/retry critical path, and rollback failure evidence is in place for the Phase 70 regression matrix.

## Self-Check: PASSED

- Verified `70-07-SUMMARY.md`, `backend/src/routes/chat.ts`, `backend/src/routes/__tests__/chat.scene-plan.test.ts`, and `backend/src/routes/__tests__/chat.test.ts` exist.
- Verified task commits exist: `cc8be2c`, `4d5b3b2`, `8417d82`.
- Verified only pre-existing dirty `CLAUDE.md` plus this new summary remained before metadata commit.
