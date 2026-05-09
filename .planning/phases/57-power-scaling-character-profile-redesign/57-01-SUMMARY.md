---
phase: 57-power-scaling-character-profile-redesign
plan: 01
subsystem: shared, api
tags: [vs-battles, power-scaling, zod, tier-normalization, types]

requires: []
provides:
  - PowerStats, HaxAbility, CharacterVulnerability types in @worldforge/shared
  - Tier comparison utilities (compareTiers, tierDistance, canHaxBypass, formatTierRank)
  - Tier normalization helpers for LLM output (normalizeApDurTier, normalizeSpeedTier, normalizeIntelligenceTier)
  - Route Zod schemas with normalization coercion (powerStatsSchema, haxAbilitySchema, characterVulnerabilitySchema)
affects: [57-02, 57-03, 57-04, character-generation, worldgen, engine]

tech-stack:
  added: []
  patterns: [VS Battles tier+rank power scaling, z.preprocess normalization coercion for LLM output]

key-files:
  created:
    - shared/src/power-tiers.ts
    - shared/src/__tests__/power-tiers.test.ts
  modified:
    - shared/src/types.ts
    - shared/src/index.ts
    - backend/src/routes/schemas.ts
    - backend/src/routes/__tests__/schemas.test.ts
    - backend/vitest.config.ts

key-decisions:
  - "Tier normalization via alias maps handles common LLM output variants (city level -> City, MHS+ -> Massively Hypersonic)"
  - "z.preprocess coercion in route schemas normalizes before enum validation for resilient LLM parsing"
  - "Added vitest alias for @worldforge/shared to resolve worktree source in backend tests"

patterns-established:
  - "Tier+rank pattern: TierRank<T> with tier enum string and rank 1-10 for granular power comparison"
  - "normalizeTierName generic function with tierList + aliases for extensible tier normalization"

requirements-completed: [SC-1, SC-2]

duration: 8min
completed: 2026-04-16
---

# Phase 57 Plan 01: Power Scaling Types Summary

**VS Battles-based power scaling type system with 3 tier arrays, comparison/normalization utilities, and Zod route schemas with LLM output coercion**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-16T04:00:23Z
- **Completed:** 2026-04-16T04:08:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Defined AP/Durability (18 tiers), Speed (11 tiers), Intelligence (6 tiers) const arrays with TypeScript literal types
- Created PowerStats, HaxAbility, CharacterVulnerability interfaces and added powerStats field to CharacterDraft/CharacterRecord/CharacterDraftPatch
- Built tier comparison (compareTiers, tierDistance), hax bypass check (canHaxBypass), and formatting (formatTierRank) utilities
- Implemented normalization helpers with alias maps for 40+ common LLM output variants across all 3 tier categories
- Added Zod route schemas using z.preprocess for automatic tier normalization before enum validation
- 29 unit tests for power-tiers utilities, 13 schema tests for validation and normalization coercion

## Task Commits

1. **Task 1: Define new power scaling types and tier comparison utilities with normalization** - `25f5c08` (feat)
2. **Task 2: Add new route Zod schemas for PowerStats with normalization coercion** - `4edffa2` (feat)

## Files Created/Modified
- `shared/src/types.ts` - Added PowerStats, HaxAbility, CharacterVulnerability types and tier const arrays; added powerStats to CharacterDraft/Record/DraftPatch
- `shared/src/power-tiers.ts` - Tier comparison, distance, hax bypass, formatting, and normalization utilities
- `shared/src/index.ts` - New type and utility exports
- `shared/src/__tests__/power-tiers.test.ts` - 29 tests for tier utilities and normalization
- `backend/src/routes/schemas.ts` - powerStatsSchema, haxAbilitySchema, characterVulnerabilitySchema with z.preprocess coercion
- `backend/src/routes/__tests__/schemas.test.ts` - 13 new schema validation tests
- `backend/vitest.config.ts` - Added @worldforge/shared alias for worktree source resolution

## Decisions Made
- Tier normalization uses a three-step lookup: exact match, case-insensitive exact, then alias map. Returns undefined for truly unknown values so callers can handle retry or rejection.
- Route schemas use z.preprocess (not z.transform) to normalize before enum validation, keeping the Zod pipeline clean.
- Backend vitest config added @worldforge/shared alias to resolve the local worktree source instead of the main repo's stale dist during tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vitest alias for @worldforge/shared in backend**
- **Found during:** Task 2 (schema tests)
- **Issue:** Backend vitest resolved @worldforge/shared to main repo's dist which lacked new exports (AP_DURABILITY_TIERS etc.)
- **Fix:** Added resolve.alias in backend/vitest.config.ts pointing to ../shared/src
- **Files modified:** backend/vitest.config.ts
- **Verification:** All 192 schema tests pass including 13 new ones
- **Committed in:** 4edffa2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Worktree-specific test resolution fix. No scope creep.

## Issues Encountered
- Backend `npm --prefix backend run typecheck` has many pre-existing errors (missing hono modules, FallbackConfig not found, persona-templates import missing). These are not caused by this plan's changes. The new shared exports show as missing because tsc resolves to the main repo's stale dist. Shared package itself compiles cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All new types and utilities are available for Plans 02-04 to consume
- Old types (CharacterGroundingProfile, PowerProfile, SourceBundle, ContinuityPolicy) were not present in the current codebase -- they may have been removed in earlier phases or never merged to this branch
- Plan 02 can proceed with character generation rewrites using the new PowerStats type and normalization schemas

---
*Phase: 57-power-scaling-character-profile-redesign*
*Completed: 2026-04-16*
