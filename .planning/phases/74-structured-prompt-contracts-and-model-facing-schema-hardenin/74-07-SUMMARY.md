---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 07
subsystem: worldgen
tags: [worldgen, prompt-contracts, scaffold, structured-output, vitest]

requires:
  - phase: 74-04
    provides: Worldgen source-rule authority prompt contract patterns and shared prompt-contract helpers
provides:
  - Handcrafted scaffold-core prompt contract helper
  - Location, faction, NPC, and regeneration scaffold prompt contracts
  - Regression tests for scaffold contract markers, exact shapes, caps, nullability, valid/minimal examples, invalid examples, and source authority
affects: [phase-74, worldgen-scaffold, prompt-contracts, model-facing-schema]

tech-stack:
  added: []
  patterns:
    - Handcrafted prompt contract composer in scaffold prompt utilities
    - Versioned contract markers inserted before premise/source data in model-facing prompts

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-07-SUMMARY.md
  modified:
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
    - backend/src/worldgen/scaffold-steps/locations-step.ts
    - backend/src/worldgen/scaffold-steps/factions-step.ts
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/worldgen/scaffold-steps/regen-helpers.ts
    - backend/src/worldgen/__tests__/scaffold-resilience.test.ts
    - backend/src/worldgen/__tests__/npcs-step.test.ts

key-decisions:
  - "Used handcrafted scaffold contract snippets instead of schema introspection or a generic Zod-to-contract generator."
  - "Inserted contracts before WORLD PREMISE/source data so the model sees output shape and source-authority rules before contextual material."
  - "Kept invalid examples source-neutral where existing tests forbid excluded legacy-world structures from appearing in artifact-backed prompts."

patterns-established:
  - "Scaffold prompt contracts compose buildScaffoldCorePromptContract() with entity-specific shape, caps, nullability, valid, minimal, and invalid examples."
  - "Prompt contract tests assert semantic adequacy and source authority boundaries, not only marker presence."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 12min
completed: 2026-04-28
---

# Phase 74 Plan 07: Core Worldgen Scaffold Contracts Summary

**Core worldgen scaffold prompts now carry versioned structured-output contracts for location, faction, NPC, and regeneration schemas without moving canon interpretation into backend repair.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-28T19:03:49Z
- **Completed:** 2026-04-28T19:15:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `buildScaffoldCorePromptContract()` and a small handcrafted scaffold contract composer in `prompt-utils.ts`.
- Inserted `scaffold-location.v1`, `scaffold-faction.v1`, `scaffold-npc.v1`, and `scaffold-regeneration.v1` contracts before premise/source data in the relevant prompts.
- Added TDD coverage proving required fields, nested structures, caps, nullability, valid/minimal examples, invalid examples, and source-authority boundaries.
- Preserved existing artifact-backed leakage guards by keeping contract examples source-neutral for excluded world structures.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add scaffold-core failing test** - `9d4b66a` (`test`)
2. **Task 1 GREEN: Add scaffold-core prompt contract helper** - `18c252b` (`feat`)
3. **Task 2 RED: Add scaffold prompt contract failing tests** - `6d4b56c` (`test`)
4. **Task 2 GREEN: Apply scaffold prompt contracts** - `5be5b7f` (`feat`)

_Note: Both plan tasks used the required TDD red/green split._

## Files Created/Modified

- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - Added scaffold-core and handcrafted scaffold contract composition helpers.
- `backend/src/worldgen/scaffold-steps/locations-step.ts` - Added location scaffold contract to plan and detail prompts.
- `backend/src/worldgen/scaffold-steps/factions-step.ts` - Added faction scaffold contract to plan and detail prompts.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - Added NPC scaffold contract to key planning, supporting planning, detail, and sample-line retry prompts.
- `backend/src/worldgen/scaffold-steps/regen-helpers.ts` - Added regeneration contract to location, faction, and NPC regeneration prompts.
- `backend/src/worldgen/__tests__/scaffold-resilience.test.ts` - Added semantic contract assertions for scaffold core, location/faction prompts, and regeneration prompts.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - Added semantic NPC scaffold contract assertions for planning, detail, and repair prompts.

## Decisions Made

- Used handcrafted contract text in scaffold prompt utilities because Phase 74 patterns explicitly avoid broad schema-to-contract generation.
- Kept prompt snippets colocated with their scaffold step files so each versioned marker is visible in the owning prompt source.
- Kept invalid examples neutral when testing artifact-backed prompts, since excluded franchise structures must not leak back into model context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used package-relative Vitest paths**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** The plan's command used `backend/src/...` paths while `npm --prefix backend` runs Vitest from the backend package root.
- **Fix:** Ran the same targeted test files with package-relative `src/worldgen/...` paths.
- **Files modified:** None
- **Verification:** `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts`
- **Committed in:** N/A

**2. [Rule 1 - Bug] Removed excluded-source names from invalid examples**
- **Found during:** Task 2 GREEN verification
- **Issue:** Initial invalid examples used excluded legacy-world names, causing existing artifact source-rule tests to detect leaked Naruto world structures.
- **Fix:** Replaced those examples with neutral excluded-source placeholders while preserving the same invalid-shape/source-authority semantics.
- **Files modified:** `backend/src/worldgen/scaffold-steps/locations-step.ts`, `backend/src/worldgen/scaffold-steps/factions-step.ts`
- **Verification:** Targeted scaffold/NPC tests passed after the correction.
- **Committed in:** `5be5b7f`

**Total deviations:** 2 auto-fixed (1 blocking verification path, 1 implementation bug)
**Impact on plan:** Both fixes preserved plan scope and strengthened the intended source-authority boundary.

## Issues Encountered

- GitNexus `analyze` emitted repeated `MaxListenersExceededWarning` warnings after commits, but completed successfully and refreshed the WorldForge index.
- `gitnexus_detect_changes` for the Task 2 GREEN commit reported medium risk because prompt contracts touched scaffold/NPC generation symbols; this matched expected scope and prior per-symbol impact checks were LOW.

## Known Stubs

None. Stub scan found only an existing test title containing "generic placeholders"; no runtime stub or placeholder data flow was introduced.

## Threat Flags

None. This plan changed model-facing prompt contracts only; it introduced no new endpoint, auth path, file access pattern, or persistence boundary.

## Verification

- `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts` - passed, 38 tests.
- `npm --prefix backend run typecheck` - passed.
- `rg -n "scaffold-location\\.v1|scaffold-faction\\.v1|scaffold-npc\\.v1|scaffold-regeneration\\.v1|VALID MINIMAL|INVALID|Caps|Nullable|Source authority" ...` - passed.
- GitNexus impact checks were run before Task 2 edits for `generateLocationsStep`, `generateFactionsStep`, `generateNpcsStep`, `planKeyNpcs`, `planSupportingNpcs`, `generateNpcDetail`, `retrySampleLines`, `regenerateLocationEntity`, `regenerateFactionEntity`, and `regenerateNpcEntity`; all returned LOW risk.
- GitNexus `detect_changes` was run before each task commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-08 can proceed with auxiliary worldgen seams using the same versioned, handcrafted prompt-contract pattern. Core scaffold and regeneration prompts now have explicit schema-facing contracts and tests.

## Self-Check: PASSED

- Summary file exists.
- All seven plan-modified source/test files exist.
- Task commits found: `9d4b66a`, `18c252b`, `6d4b56c`, `5be5b7f`.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
