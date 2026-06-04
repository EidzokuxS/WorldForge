---
phase: 90-playable-gm-bridge-tools-for-fuzzy-player-intent
plan: 90-02
subsystem: engine
tags: [gm-tools, bridge-tools, runtime-tools, narrator-packet, player-facing-packet]
requires:
  - phase: 90-01
    provides: observation-only bridge lookup tools and candidate evidence
provides:
  - constrained state-bearing bridge tools for movement, minor POIs, scene extras, searches, and player intent records
  - backend validators for local low-impact creation and non-truth-making search/intent semantics
  - narrator/player-facing evidence handling for successful bridge tool results
affects: [90-03, 90-04, gm-tool-loop, tool-executor, narrator-packet]
tech-stack:
  added: []
  patterns:
    - bridge tool wrappers delegate to existing authority helpers after plan-specific validation
    - search and intent tools record unconfirmed claims without creating discovery truth
key-files:
  created:
    - backend/src/engine/bridge-state-tools.ts
    - backend/src/engine/__tests__/bridge-state-tools.test.ts
  modified:
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/tool-execution-context.ts
    - backend/src/engine/gm-tool-budget.ts
    - backend/src/engine/narrator-packet.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
    - backend/src/engine/__tests__/narrator-packet.test.ts
    - backend/src/engine/__tests__/player-facing-packet.test.ts
    - backend/src/engine/actor-decision-packet.ts
    - backend/src/engine/gm-beat-plan.ts
    - backend/src/engine/gm-tool-loop.ts
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/scene-frame.ts
    - backend/src/engine/source-boundary.ts
    - .planning/phases/90-playable-gm-bridge-tools-for-fuzzy-player-intent/evidence/90-02-impact.md
key-decisions:
  - "Bridge state tools are constrained wrappers over existing movement, reveal, and spawn authority instead of parallel authority paths."
  - "start_search and record_player_intent store unconfirmed search/claim records and never mark the target as found or proven."
  - "NPC actor decision tools exclude bridge state tools so GM-only bridge authority does not leak into actor packets."
patterns-established:
  - "Phase 90 bridge state tool validation lives in bridge-state-tools.ts and is exercised by focused validator tests."
  - "RuntimeToolName additions must be reflected in prompt contracts, scene-frame allowlists, GM loop categories, and packet/source-boundary guards."
requirements-completed: [P90-R2, P90-R5, P90-R6]
duration: 17min
completed: 2026-05-10
---

# Phase 90 Plan 90-02: Constrained State-Bearing Bridge Tools Summary

**GM bridge tools now commit only validated local movement, low-impact POIs, temporary extras, and unconfirmed search/intent records through existing backend authority paths.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-10T08:32:25Z
- **Completed:** 2026-05-10T08:49:23Z
- **Tasks:** 3
- **Files modified:** 17 plan files, plus this summary

## Accomplishments

- Added `move_actor`, `create_minor_poi`, `create_scene_extra`, `start_search`, and `record_player_intent` schemas, validators, executor dispatch, and tests.
- Reused existing movement, location reveal, and NPC spawn authority while enforcing Phase 90 constraints before delegation.
- Preserved settled-truth narration: visible success summaries come from successful bridge tool results, while search/intent records remain unconfirmed.

## Task Commits

1. **Task 1: Preflight state tool blast radius** - `4bd65a4` (docs)
2. **Tasks 2-3: Bridge schemas, constraints, executor wiring, and packet summaries** - `7de06e8` (feat)

**Plan metadata:** pending docs commit.

## Files Created/Modified

- `backend/src/engine/bridge-state-tools.ts` - Shared bridge validators and non-truth-making search/intent result builders.
- `backend/src/engine/tool-schemas.ts` - Phase 90 bridge runtime tool schemas.
- `backend/src/engine/tool-executor.ts` - Bridge tool dispatch, delegation, state refs, and settled tool results.
- `backend/src/engine/tool-execution-context.ts` - Grounding checks and execution-context updates for bridge results.
- `backend/src/engine/gm-tool-budget.ts` - Semantic budget keys for repeated local POI/extra creation.
- `backend/src/engine/narrator-packet.ts` - Source-backed bridge result summaries.
- `backend/src/engine/source-boundary.ts` - Claim echo handling for `record_player_intent`.
- `backend/src/engine/actor-decision-packet.ts` - Excludes GM bridge tools from NPC actor tool packets.
- `backend/src/engine/gm-beat-plan.ts`, `backend/src/engine/gm-tool-loop.ts`, `backend/src/engine/prompt-contracts.ts`, `backend/src/engine/scene-frame.ts` - Runtime categories, accepted observations, prompt examples, and allowed-tool coverage for new tool names.
- `backend/src/engine/__tests__/bridge-state-tools.test.ts` - Validator coverage for allowed/rejected bridge operations.
- `backend/src/engine/__tests__/tool-executor.test.ts` - Executor integration coverage for bridge tool results and constraints.
- `backend/src/engine/__tests__/narrator-packet.test.ts` - Narrator evidence coverage for bridge result summaries.
- `backend/src/engine/__tests__/player-facing-packet.test.ts` - Player-facing claim echo coverage for unconfirmed intent records.
- `.planning/phases/90-playable-gm-bridge-tools-for-fuzzy-player-intent/evidence/90-02-impact.md` - Preflight impact record.

## Decisions Made

- Bridge state tools delegate to existing authority helpers so old tool semantics remain intact and all creation/movement still passes backend validation.
- Minor POIs are allowlisted by ordinary local service type and blocked by high-impact, remote, secret, faction, plot-critical, and rare-item terms.
- Scene extras are temporary current-scene/current-location support roles only.
- Search and intent tools produce records with unconfirmed truth fields and no discovery/proof creation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added adjacent RuntimeToolName coverage**
- **Found during:** Task 3 (executor and packet wiring)
- **Issue:** Adding new runtime tool names made prompt contracts, scene-frame supported names, GM loop categories, beat-plan categories, and actor packet typing incomplete.
- **Fix:** Added the minimum adjacent runtime mappings and excluded GM bridge tools from NPC actor decision packets.
- **Files modified:** `backend/src/engine/actor-decision-packet.ts`, `backend/src/engine/gm-beat-plan.ts`, `backend/src/engine/gm-tool-loop.ts`, `backend/src/engine/prompt-contracts.ts`, `backend/src/engine/scene-frame.ts`
- **Verification:** Required focused test suite and `npm --prefix backend run typecheck` passed.
- **Committed in:** `7de06e8`

**2. [Rule 2 - Missing Critical] Added source-boundary claim echo coverage**
- **Found during:** Task 3 (player-facing packet verification)
- **Issue:** `record_player_intent` introduced a new player-claim echo path that needed explicit unconfirmed-claim handling.
- **Fix:** Added `record_player_intent` to the claim echo allowlist and covered it in `player-facing-packet.test.ts`.
- **Files modified:** `backend/src/engine/source-boundary.ts`, `backend/src/engine/__tests__/player-facing-packet.test.ts`
- **Verification:** Required focused test suite passed.
- **Committed in:** `7de06e8`

**3. [Rule 3 - Task Coupling] Committed Tasks 2 and 3 together**
- **Found during:** Tasks 2-3
- **Issue:** Schemas, validators, executor dispatch, packet summaries, and type-level runtime coverage had to land together to keep the backend compiling.
- **Fix:** Verified and committed the coupled implementation atomically as one feature commit.
- **Files modified:** Implementation and test files listed above.
- **Verification:** Required focused test suite, typecheck, diff check, and GitNexus staged detection passed.
- **Committed in:** `7de06e8`

---

**Total deviations:** 3 auto-fixed.
**Impact on plan:** Scope stayed within 90-02 bridge authority and tiny adjacent runtime-tool integration required for correctness.

## Issues Encountered

- Initial typecheck exposed that new bridge runtime tools were being offered to NPC actor decision packets. Fixed by deriving actor-facing runtime tool names as runtime tools minus bridge lookup/state tools.
- `git diff --check` passed with line-ending warnings only.
- GitNexus staged detection reported HIGH risk before commit, expected for central executor/grounding/prompt/packet symbols and consistent with the preflight gate.
- `npx gitnexus analyze` completed after the implementation commit and left no working-tree changes.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/bridge-state-tools.test.ts` - passed, 6 tests.
- `npm --prefix backend run test -- src/engine/__tests__/bridge-state-tools.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/player-facing-packet.test.ts` - passed, 4 files / 75 tests.
- `npm --prefix backend run typecheck` - passed.
- `git diff --check` - passed, line-ending warnings only.
- `GitNexus detect_changes(scope="staged")` - completed before commit; HIGH expected, 23 changed symbols across 16 files and 6 affected processes.

## Known Stubs

None. Stub-pattern scan found only existing test placeholder names, normal empty-array initializers, and explicit runtime error strings; no new UI/data stubs prevent the plan goal.

## Threat Flags

None. New state-bearing runtime tool surface matches the plan threat model and is covered by validators/tests.

## User Setup Required

None.

## Next Phase Readiness

90-03 can build on committed bridge state tool results and prompt contracts. Remaining risk is the already-accepted high centrality of `executeToolCall`, movement/reveal/spawn delegation, prompt selection, and narrator packet paths; live GM behavior still needs the next-phase prompt/loop validation.

## Self-Check: PASSED

- Found summary file: `.planning/phases/90-playable-gm-bridge-tools-for-fuzzy-player-intent/90-02-SUMMARY.md`
- Found created implementation files: `backend/src/engine/bridge-state-tools.ts`, `backend/src/engine/__tests__/bridge-state-tools.test.ts`
- Found task commits: `4bd65a4`, `7de06e8`

---
*Phase: 90-playable-gm-bridge-tools-for-fuzzy-player-intent*
*Completed: 2026-05-10*
