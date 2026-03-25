---
phase: 24-worldgen-known-ip-quality
plan: 02
subsystem: worldgen
tags: [scaffold, llm, plan-detail, canonical-ip, zod, generateObject]

requires:
  - phase: 24-worldgen-known-ip-quality/01
    provides: prompt-utils.ts shared utilities (buildIpContextBlock, buildStopSlopRules, etc.)
provides:
  - Premise step with verbatim user input preservation and canonical IP titles
  - Locations step with plan+detail mini-calls (plan 5-8 names, detail batches of 4)
  - Factions step with plan+detail mini-calls (plan 3-6 names, single detail batch)
affects: [24-worldgen-known-ip-quality/03, 24-worldgen-known-ip-quality/04, scaffold-generator]

tech-stack:
  added: []
  patterns: [plan-detail-mini-calls, connectedTo-validation, territoryNames-validation, canonical-ip-fidelity]

key-files:
  created:
    - backend/src/worldgen/scaffold-steps/premise-step.ts
    - backend/src/worldgen/scaffold-steps/locations-step.ts
    - backend/src/worldgen/scaffold-steps/factions-step.ts
  modified: []

key-decisions:
  - "IpResearchContext imported from local ip-researcher.ts (not @worldforge/shared) to match existing codebase pattern"
  - "Locations use BATCH_SIZE=4 for detail calls; factions use single batch (3-6 items fit one call)"
  - "isStarting derived from plan call only; detail call does not see isStarting field"
  - "connectedTo and territoryNames filtered against known name lists to prevent hallucinated references"

patterns-established:
  - "Plan+detail mini-call pattern: first call generates names+purposes, subsequent calls fill in details with accumulated context"
  - "Canonical IP fidelity: plan prompts explicitly instruct LLM to use real names, not invented replacements"

requirements-completed: [P24-02, P24-03, P24-04]

duration: 2min
completed: 2026-03-25
---

# Phase 24 Plan 02: Scaffold Step Modules Summary

**Premise, locations, and factions step modules with plan+detail mini-calls for canonical IP fidelity and incremental world building**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T14:01:54Z
- **Completed:** 2026-03-25T14:04:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Premise step rewrites prompts to preserve user character relationships verbatim and use canonical IP epithets
- Locations step uses plan call (5-8 names with purposes) then detail calls in batches of 4 with accumulated context
- Factions step uses plan call (3-6 names) then single detail call with canonical organization names
- All three steps use buildStopSlopRules for output quality and buildIpContextBlock for IP fidelity
- connectedTo and territoryNames are validated against known name lists

## Task Commits

Each task was committed atomically:

1. **Task 1: Premise step + locations step with plan+detail mini-calls** - `0209bf5` (feat)
2. **Task 2: Factions step with plan+detail mini-calls** - `2dd7388` (feat)

## Files Created/Modified
- `backend/src/worldgen/scaffold-steps/premise-step.ts` - Premise refinement with verbatim preservation and canonical IP titles
- `backend/src/worldgen/scaffold-steps/locations-step.ts` - Incremental location generation with plan+detail mini-calls
- `backend/src/worldgen/scaffold-steps/factions-step.ts` - Incremental faction generation with plan+detail and territory validation

## Decisions Made
- IpResearchContext imported from local `../ip-researcher.js` to match existing codebase pattern (not from `@worldforge/shared` as plan suggested, since the type is not exported there)
- Locations plan schema uses min(5).max(8) to ensure adequate world coverage; factions plan uses min(3).max(6) for balanced power dynamics
- isStarting is only set in the plan call and carried through to the final output; detail calls never see it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cherry-picked prompt-utils.ts from Plan 01 agent**
- **Found during:** Task 1 (premise-step creation)
- **Issue:** Plan 01 was executed in a different worktree; scaffold-steps/ directory did not exist in this worktree
- **Fix:** Cherry-picked commit `e2b0e5e` from Plan 01 agent to bring prompt-utils.ts into working tree
- **Files modified:** backend/src/worldgen/scaffold-steps/prompt-utils.ts
- **Verification:** File exists and TypeScript compiles clean
- **Committed in:** `6c44938` (cherry-pick)

**2. [Rule 1 - Bug] Fixed IpResearchContext import path**
- **Found during:** Task 1 (premise-step creation)
- **Issue:** Plan suggested importing IpResearchContext from `@worldforge/shared` but the type is only exported from local `ip-researcher.ts`
- **Fix:** Used `import type { IpResearchContext } from "../ip-researcher.js"` matching prompt-utils.ts pattern
- **Files modified:** All three step files
- **Verification:** TypeScript compiles without errors in scaffold-steps/

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct compilation. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## Next Phase Readiness
- All three step modules (premise, locations, factions) ready for Plan 03 (NPCs step + scaffold-generator rewire)
- Functions maintain backward-compatible signatures for regenerate-section endpoint
- Plan 04 can integrate these into scaffold-generator.ts

## Self-Check: PASSED

- All 3 created files exist on disk
- Both task commits (0209bf5, 2dd7388) found in git history
- TypeScript compiles clean for all scaffold-steps files

---
*Phase: 24-worldgen-known-ip-quality*
*Completed: 2026-03-25*
