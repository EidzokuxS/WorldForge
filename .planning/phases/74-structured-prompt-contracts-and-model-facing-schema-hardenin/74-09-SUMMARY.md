---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 09
subsystem: engine
tags: [engine, prompt-contracts, structured-output, npc-offscreen, context-compression, vitest]

requires:
  - phase: 74-03
    provides: Engine prompt-contract helper pattern and versioned marker placement tests
provides:
  - Versioned engine prompt contracts for NPC offscreen updates and context-compression selections
  - Runtime prompt preambles for offscreen NPC simulation and compression importance detection
  - Regression tests for exact shapes, caps, examples, no-invention rules, and final narration scope separation
affects: [phase-74, engine-prompts, npc-offscreen, context-compression, model-facing-schema]

tech-stack:
  added: []
  patterns:
    - Engine support prompt contracts centralized in `backend/src/engine/prompt-contracts.ts`
    - Structured-output contract preambles inserted before model-facing data
    - Optional support outputs fail closed without requiring user-facing turn rollback

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-09-SUMMARY.md
  modified:
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts
    - backend/src/engine/__tests__/context-compression.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts

key-decisions:
  - "Kept NPC offscreen and context-compression contracts in the shared engine prompt-contract helper file."
  - "Placed contract text before player/NPC/message data so the schema and semantic boundaries frame the model request first."
  - "Capped compression importance selections at the schema boundary; invalid optional selections fail closed to no middle-message preservation."

patterns-established:
  - "Engine support prompt contracts use versioned markers with shape, caps, nullable rules, valid/minimal examples, invalid examples, and backend authority language."
  - "Prompt tests assert marker placement before model-facing data and guard final-visible narration from support-contract leakage."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 11min
completed: 2026-04-28
---

# Phase 74 Plan 09: NPC Offscreen and Context Compression Contracts Summary

**Engine background simulation and context compression now expose versioned structured-output contracts while keeping optional support failures out of user-facing rollback paths.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-28T19:43:10Z
- **Completed:** 2026-04-28T19:53:53Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `npc-offscreen.v1` and `context-compression.v1` prompt-contract helpers with exact shapes, caps, nullability rules, valid/minimal/invalid examples, and no-invention/backend-authority language.
- Inserted the NPC offscreen contract into the real offscreen simulation prompt before player and NPC data.
- Inserted the context-compression contract into the importance-detection prompt before numbered message data, with schema capping for optional selections.
- Added semantic tests proving contract placement and final-visible narration remains outside the context-compression structured-output scope.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add engine support helper failing tests** - `6cec429` (`test`)
2. **Task 1 GREEN: Add engine support prompt contract helpers** - `9077089` (`feat`)
3. **Task 2 RED: Require NPC offscreen prompt contract** - `1b20bcb` (`test`)
4. **Task 2 GREEN: Add NPC offscreen prompt contract** - `b76f1f6` (`feat`)
5. **Task 3 RED: Require context compression prompt contract** - `c7489e2` (`test`)
6. **Task 3 GREEN: Add context compression prompt contract** - `c0f373a` (`feat`)

_Note: All three plan tasks used the required TDD red/green split._

## Files Created/Modified

- `backend/src/engine/prompt-contracts.ts` - Added `buildNpcOffscreenPromptContract` and `buildContextCompressionPromptContract`.
- `backend/src/engine/npc-offscreen.ts` - Added the offscreen contract helper to the batch simulation system prompt before player/NPC data.
- `backend/src/engine/prompt-assembler.ts` - Added the context-compression contract helper to importance detection and capped `importantIndices` to 12 integers.
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - Added helper and live prompt assertions for offscreen update contracts.
- `backend/src/engine/__tests__/context-compression.test.ts` - Added helper and live prompt assertions for indexed compression contracts.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Added final-visible narration guard against compression-contract leakage.

## Decisions Made

- Centralized both new contracts in `prompt-contracts.ts` to follow the Phase 74 engine helper pattern instead of duplicating contract prose at call sites.
- Placed contract preambles before runtime data because the model must see shape/caps/no-invention constraints before the untrusted data payload.
- Kept context compression optional: malformed or over-cap selections are rejected by the schema and the existing catch path preserves no middle messages rather than blocking the user-facing turn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used backend package-relative Vitest paths**
- **Found during:** Task verification
- **Issue:** Plan verification examples used `backend/src/...` paths even though `npm --prefix backend` runs Vitest from the backend package root.
- **Fix:** Ran targeted files with package-relative `src/engine/...` paths.
- **Files modified:** None
- **Verification:** Targeted plan test command passed with package-relative paths.
- **Committed in:** N/A

**Total deviations:** 1 auto-fixed (1 verification path issue)
**Impact on plan:** The deviation changed command invocation only; implementation scope stayed exactly within the plan.

## Issues Encountered

- GitNexus did not find the plan's `runNpcOffscreen` / `compressContext` names because the actual symbols are `simulateOffscreenNpcs`, `simulateOffscreenNpcsInternal`, `compressConversation`, and `detectImportantMessages`. Impact analysis was run on the actual symbols before edits.
- GitNexus staged detection for Task 2 reported HIGH risk because `simulateOffscreenNpcsInternal` sits inside the rollback-critical post-turn process. The staged diff was prompt-only, and focused offscreen tests plus typecheck passed before commit.
- `npx gitnexus analyze` emitted repeated `MaxListenersExceededWarning` warnings after code commits, but completed successfully and refreshed the index.

## Known Stubs

None. Stub scan hits were typed empty collections/null defaults or existing comments, not placeholder behavior introduced by this plan.

## Threat Flags

None. This plan hardened existing model-output trust boundaries for offscreen updates and compression selections; it introduced no new endpoint, auth path, file access pattern, persistence boundary, or database schema change.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/context-compression.test.ts src/engine/__tests__/prompt-assembler.test.ts` - passed, 55 tests.
- `npm --prefix backend run typecheck` - passed.
- `rg -n "buildNpcOffscreenPromptContract|buildContextCompressionPromptContract|npc-offscreen\\.v1|context-compression\\.v1|max\\(12\\)" backend/src/engine/...` - passed.
- `npx gitnexus status` - up to date at `c0f373a`.
- GitNexus impact checks were run before implementation edits for `buildWorldBrainPromptContract`, `simulateOffscreenNpcs`, `simulateOffscreenNpcsInternal`, `detectImportantMessages`, and `compressConversation`; new helper names were checked and not found before creation. GitNexus `detect_changes` was run before each task commit.

## TDD Gate Compliance

- Task 1 RED commit: `6cec429`; GREEN commit: `9077089`.
- Task 2 RED commit: `1b20bcb`; GREEN commit: `b76f1f6`.
- Task 3 RED commit: `c7489e2`; GREEN commit: `c0f373a`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-10 can proceed with remaining structured-prompt hardening knowing the engine support seams named in review are now source-owned, marker-tested, and aligned with the Phase 74 no-invention/fail-closed contract pattern.

## Self-Check: PASSED

- Summary file exists.
- All six plan-modified source/test files exist.
- Task commits found: `6cec429`, `9077089`, `1b20bcb`, `b76f1f6`, `c7489e2`, `c0f373a`.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
