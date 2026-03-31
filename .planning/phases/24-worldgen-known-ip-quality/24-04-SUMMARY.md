---
phase: 24-worldgen-known-ip-quality
plan: 04
subsystem: worldgen
tags: [scaffold-generator, orchestrator, tier-mapping, scaffold-saver, zod-schema]

requires:
  - phase: 24-worldgen-known-ip-quality (plans 01-03)
    provides: scaffold-steps/ modules (premise, locations, factions, npcs), prompt-utils, ScaffoldNpc.tier type
provides:
  - Thin orchestrator scaffold-generator.ts importing from scaffold-steps/
  - Scaffold-saver tier mapping (key->key, supporting->persistent)
  - Route schema accepting tier field on ScaffoldNpc
  - Re-exports preserving backward compatibility for regenerate-section route
affects: [worldgen-pipeline, world-review, campaign-creation]

tech-stack:
  added: []
  patterns: [thin-orchestrator-re-export, tier-mapping-at-db-boundary]

key-files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-generator.ts
    - backend/src/worldgen/scaffold-saver.ts
    - backend/src/worldgen/seed-suggester.ts
    - backend/src/routes/schemas.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
    - backend/src/worldgen/__tests__/seed-suggester.test.ts

key-decisions:
  - "scaffold-generator.ts reduced from 367 to 98 lines via re-export pattern"
  - "Scaffold tier 'supporting' maps to DB tier 'persistent' (not 'temporary' which is Storyteller-only)"
  - "scaffoldNpcSchema tier field uses .default('key') for backward compatibility with old frontends"

patterns-established:
  - "Re-export pattern: thin orchestrator re-exports step functions for route backward compatibility"
  - "Tier boundary mapping: scaffold domain types differ from DB types, conversion at saver layer"

requirements-completed: [P24-08, P24-09]

duration: 5min
completed: 2026-03-25
---

# Phase 24 Plan 04: Wire Orchestrator + Tier Mapping Summary

**Thin orchestrator scaffold-generator importing from scaffold-steps/, scaffold-saver tier mapping (key->key, supporting->persistent), route schema with tier field**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T14:12:10Z
- **Completed:** 2026-03-25T14:17:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Rewrote scaffold-generator.ts from 367 to 98 lines as thin orchestrator
- Re-exports step functions for backward compatibility with regenerate-section route
- Scaffold-saver maps NPC tier correctly to DB values
- Route schema accepts tier field with backward-compatible default
- All 970 backend tests pass, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite scaffold-generator.ts as thin orchestrator** - `f3bae5b` (feat)
2. **Task 2: Scaffold-saver tier mapping + schema update + test fixes** - `e867f11` (feat)

## Files Created/Modified
- `backend/src/worldgen/scaffold-generator.ts` - Thin orchestrator with re-exports, 98 lines
- `backend/src/worldgen/scaffold-saver.ts` - Tier mapping: npc.tier === "key" ? "key" : "persistent"
- `backend/src/worldgen/seed-suggester.ts` - Updated return type to { seeds, ipContext } and request type with name/research fields
- `backend/src/routes/schemas.ts` - Added tier: z.enum(["key", "supporting"]).default("key") to scaffoldNpcSchema
- `backend/src/worldgen/__tests__/scaffold-saver.test.ts` - Added tier to NPC fixtures + supporting->persistent test
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - Updated expected return shape to { seeds, ipContext }

## Decisions Made
- Used re-export pattern (export from) instead of wrapping step functions, keeping the module truly thin
- Tier default is "key" in Zod schema to maintain backward compatibility with frontends that don't send tier
- Scaffold "supporting" maps to DB "persistent" (not "temporary" which is reserved for Storyteller-spawned NPCs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed seed-suggester return type mismatch**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Route worldgen.ts was updated in Wave 2 to destructure `{ seeds, ipContext }` from suggestWorldSeeds, but seed-suggester.ts still returned flat SuggestedSeeds
- **Fix:** Updated suggestWorldSeeds return type to `{ seeds: SuggestedSeeds; ipContext: IpResearchContext | null }` and added `name`/`research` fields to SuggestSeedsRequest
- **Files modified:** backend/src/worldgen/seed-suggester.ts
- **Verification:** TypeScript compiles clean, tests pass
- **Committed in:** f3bae5b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing type mismatch from Wave 2 merge required fixing for compilation. No scope creep.

## Issues Encountered
- Worktree did not have scaffold-steps/ files (created in Wave 2). Resolved via fast-forward merge from feature/world-creation-polish branch.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full pipeline compiles and all 970 tests pass
- scaffold-generator is a thin orchestrator ready for future step additions
- Tier mapping ensures correct NPC DB storage for key vs supporting characters

---
*Phase: 24-worldgen-known-ip-quality*
*Completed: 2026-03-25*
