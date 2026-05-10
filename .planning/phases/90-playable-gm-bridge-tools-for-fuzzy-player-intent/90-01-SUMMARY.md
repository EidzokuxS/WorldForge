---
phase: 90-playable-gm-bridge-tools-for-fuzzy-player-intent
plan: 90-01
subsystem: engine
tags: [gm-loop, runtime-tools, bridge-tools, scene-frame, privacy]
requires: []
provides:
  - observation-only bridge lookup tools for fuzzy player intent
  - player-visible/player-known fact inspection without hidden fact leakage
  - lookup dispatch path outside mutating executeToolCall
affects: [gm-tool-loop, gm-tool-step, prompt-contracts, scene-frame, actor-decision-packet]
tech-stack:
  added: []
  patterns:
    - observation-only ToolResult with explicit kind/observationOnly markers
    - bridge lookup snapshots built from model-facing scene packets and player-known facts
key-files:
  created:
    - backend/src/engine/bridge-candidate-tools.ts
    - backend/src/engine/__tests__/bridge-candidate-tools.test.ts
    - backend/src/engine/__tests__/tool-schemas.bridge-tools.test.ts
  modified:
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/tool-result.ts
    - backend/src/engine/tool-execution-context.ts
    - backend/src/engine/gm-tool-loop.ts
    - backend/src/engine/gm-tool-step.ts
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/scene-frame.ts
    - backend/src/engine/actor-decision-packet.ts
    - backend/src/engine/gm-beat-plan.ts
    - backend/src/engine/__tests__/gm-tool-loop.test.ts
    - backend/src/engine/__tests__/gm-tool-step.test.ts
key-decisions:
  - "Lookup tools dispatch through bridge-candidate-tools instead of mutating executeToolCall."
  - "Lookup snapshots are built from model-facing legal/visible scene data plus bounded player-known facts."
  - "Actor decision packets remain limited to state-bearing actor tools even though RuntimeToolName now includes lookup tools."
patterns-established:
  - "Observation tools return ToolResult kind=observation and observationOnly=true without authority mutation metadata."
  - "Hidden/private lookup denials use generic reason codes and avoid echoing hidden names or input terms."
requirements-completed: [P90-R1, P90-R6]
duration: 21min
completed: 2026-05-10
---

# Phase 90 Plan 90-01: Observation-Only Bridge Candidate Tools Summary

**Observation-only GM bridge lookups for visible affordances, legal routes, fuzzy candidates, and player-known facts without entering world mutation paths.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-05-10T08:11:51Z
- **Completed:** 2026-05-10T08:32:00Z
- **Tasks:** 3 completed
- **Files modified:** 16

## Accomplishments

- Added eight lookup tools: `list_visible_affordances`, `list_navigation_options`, `find_location_candidates`, `find_object_candidates`, `find_actor_candidates`, `find_poi_candidates`, `inspect_known_fact`, and `check_route`.
- Built lookup execution from `SceneFrame`/model-facing visible candidates, legal movement candidates, and bounded player-known facts.
- Marked observation results with `kind: "observation"` and `observationOnly: true`, and kept them out of mutation ref accounting.
- Routed live GM loop and retained GM tool-step compatibility through bridge lookup dispatch before mutating `executeToolCall`.
- Added privacy tests for hidden/offscreen/private fact denial without leaking hidden names.

## Task Commits

1. **Task 1: Preflight current tool boundary** - `10dc165` (docs)
2. **Tasks 2-3: Bridge lookup schemas, observation result type, and execution wiring** - `32490e0` (feat)

## Files Created/Modified

- `backend/src/engine/bridge-candidate-tools.ts` - Pure lookup/scoring helpers and observation-only dispatch.
- `backend/src/engine/tool-schemas.ts` - Runtime schemas and `createStorytellerTools` registration for lookup tools.
- `backend/src/engine/tool-result.ts` - Observation-only `ToolResult` markers and builder.
- `backend/src/engine/tool-execution-context.ts` - Bounded bridge lookup snapshots for player and actor turns.
- `backend/src/engine/gm-tool-loop.ts` - Lookup prompt guidance and mutation-ref filtering for observations.
- `backend/src/engine/gm-tool-step.ts` - Lookup dispatch before mutating tool execution.
- `backend/src/engine/prompt-contracts.ts` - Compact lookup input contract text.
- `backend/src/engine/scene-frame.ts` - Default allowed-tool allowlist includes lookup tools.
- `backend/src/engine/actor-decision-packet.ts` - Actor decision schemas exclude observation-only lookup tools.
- `backend/src/engine/gm-beat-plan.ts` - Runtime tool category recognizes lookup tools.
- `backend/src/engine/__tests__/bridge-candidate-tools.test.ts` - Lookup privacy, route, and no-mutation coverage.
- `backend/src/engine/__tests__/tool-schemas.bridge-tools.test.ts` - Schema, prompt contract, and no `executeToolCall` coverage.
- `backend/src/engine/__tests__/gm-tool-loop.test.ts` - Live loop lookup exposure without mutation refs.
- `backend/src/engine/__tests__/gm-tool-step.test.ts` - Compatibility dispatch through bridge lookup helpers.

## Decisions Made

- Lookup tools are observation-only runtime tools, not state-bearing tools.
- Lookup outputs are sourced from model-facing visible/legal packets and player-known facts only.
- Hidden/private/offscreen lookup denials return generic reason codes without echoing hidden names.
- Runtime lookup names remain available to GM planning, but actor decision packets are narrowed back to state-bearing actor tools.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added adjacent runtime allowlist/type containment**
- **Found during:** Tasks 2-3
- **Issue:** Adding lookup names to `RuntimeToolName` exposed adjacent consumers that either filtered default `SceneFrame.allowedTools` or treated every runtime tool as a state-bearing actor action/category.
- **Fix:** Added lookup names to `scene-frame.ts`, categorized lookup tools in `gm-beat-plan.ts`, and narrowed `actor-decision-packet.ts` schemas to exclude lookup tools from actor action requests.
- **Files modified:** `backend/src/engine/scene-frame.ts`, `backend/src/engine/gm-beat-plan.ts`, `backend/src/engine/actor-decision-packet.ts`
- **Verification:** Required focused tests, typecheck, `git diff --check`, and GitNexus staged detect_changes passed.
- **Committed in:** `32490e0`

**2. [Rule 3 - Blocking] Kept Tasks 2 and 3 in one implementation commit**
- **Found during:** Tasks 2-3
- **Issue:** Schemas, `createStorytellerTools`, bridge dispatch, and tests were coupled enough that a partially committed Task 2 would not represent a useful buildable surface.
- **Fix:** Verified the integrated implementation and committed it atomically as one Phase 90-01 feature commit.
- **Files modified:** Runtime schema/result/context, bridge lookup execution, GM loop/step wiring, prompt contract, and tests.
- **Verification:** Required focused tests, typecheck, `git diff --check`, and GitNexus staged detect_changes passed.
- **Committed in:** `32490e0`

---

**Total deviations:** 2 auto-handled items.
**Impact on plan:** Both were required for correctness and did not start 90-02.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/bridge-candidate-tools.test.ts src/engine/__tests__/tool-schemas.bridge-tools.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/gm-tool-step.test.ts` - passed, 45 tests.
- `npm --prefix backend run typecheck` - passed.
- `git diff --check` - passed.
- `mcp__gitnexus__.detect_changes(scope="staged", repo="WorldForge")` - passed; high impact was expected because `RuntimeToolName` and player-turn execution context feed GM execution flows.
- `npx gitnexus analyze` - completed after code commit; emitted Node listener warnings but refreshed the index successfully.

## Known Stubs

None.

## Threat Flags

None. The new lookup surface matches the plan threat model and reads only model-facing visible/legal candidates plus player-known facts.

## Issues Encountered

- GitNexus detect_changes reported high impact because the plan intentionally touches shared GM loop, GM step, prompt-contract, and player-turn execution-context paths. Focused tests and typecheck cover the affected behavior.
- `npx gitnexus analyze` emitted Node `MaxListenersExceededWarning` messages but exited successfully and left no tracked changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 90-02 can build mutating bridge tools on top of the observation-only lookup surface. Remaining risk is behavioral tuning: fuzzy scoring is deterministic and tested, but may need calibration after live play traces.

## Self-Check: PASSED

- Verified summary, evidence, bridge lookup implementation, and new tests exist.
- Verified commits `10dc165` and `32490e0` exist in git history.
- Verified no tracked deletions in the implementation commit.
