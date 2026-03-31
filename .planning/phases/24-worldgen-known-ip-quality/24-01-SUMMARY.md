---
phase: 24-worldgen-known-ip-quality
plan: 01
subsystem: worldgen
tags: [prompt-engineering, sequential-dna, ip-fidelity, scaffold-types]

requires:
  - phase: 17-unit-test-coverage
    provides: test infrastructure and coverage baseline
provides:
  - ScaffoldNpc with optional tier field ("key" | "supporting")
  - Shared prompt-utils module (buildIpContextBlock, buildSeedConstraints, formatNameList, buildStopSlopRules, reportProgress)
  - Sequential DNA generation with inter-category dependencies (6 calls)
  - IP context block with canonical name fidelity instructions
affects: [24-02-scaffold-steps, 24-03-npc-step, 24-04-lore-extractor]

tech-stack:
  added: []
  patterns: [sequential-generation-with-accumulated-context, canonical-ip-fidelity-prompt, stop-slop-rules]

key-files:
  created:
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
  modified:
    - backend/src/worldgen/types.ts
    - backend/src/worldgen/seed-suggester.ts
    - backend/src/worldgen/__tests__/seed-suggester.test.ts

key-decisions:
  - "ScaffoldNpc.tier made optional (not required) to avoid breaking existing scaffold-generator until plan 24-03 rewrites NPC step"
  - "IP context block inverted from 'avoid trademarked names' to 'use REAL canonical names' per user decision D-03/D-04/D-05"
  - "DNA generation uses 6 sequential LLM calls with accumulated context, not one monolithic call"

patterns-established:
  - "Sequential generation: each generateObject call sees accumulated results from previous calls via ALREADY ESTABLISHED DNA section"
  - "Stop-slop rules: OUTPUT QUALITY RULES block appended to all generation prompts to prevent purple prose and AI filler"
  - "Canonical fidelity: FRANCHISE REFERENCE + CANONICAL FIDELITY RULES blocks for known IP worlds"

requirements-completed: [P24-01, P24-07]

duration: 7min
completed: 2026-03-25
---

# Phase 24 Plan 01: Foundation Types and Sequential DNA Summary

**Shared prompt-utils with canonical IP fidelity rules, ScaffoldNpc tier field, and sequential 6-call DNA generation with inter-category dependencies**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-25T13:45:16Z
- **Completed:** 2026-03-25T13:52:00Z
- **Tasks:** 2 (Task 2 was TDD with RED+GREEN commits)
- **Files modified:** 4

## Accomplishments
- Created shared prompt-utils.ts with 5 exported functions and SEED_LABELS array for reuse across all scaffold steps
- Rewrote seed-suggester.ts from single monolithic call to 6 sequential calls with accumulated context
- Inverted IP context block from "avoid canonical names" to "use REAL canonical names" (root cause fix for invented names)
- Added stop-slop OUTPUT QUALITY RULES to all generation prompts
- 13 tests pass covering sequential flow, inter-category dependencies, IP/original modes

## Task Commits

Each task was committed atomically:

1. **Task 1: ScaffoldNpc tier type + shared prompt-utils module** - `e2b0e5e` (feat)
2. **Task 2 RED: Failing tests for sequential DNA** - `5ba75c8` (test)
3. **Task 2 GREEN: Sequential DNA implementation** - `1f2b00d` (feat)

## Files Created/Modified
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - Shared prompt builders: buildIpContextBlock (canonical fidelity), buildSeedConstraints, formatNameList, buildStopSlopRules, reportProgress
- `backend/src/worldgen/types.ts` - Added optional tier field to ScaffoldNpc interface
- `backend/src/worldgen/seed-suggester.ts` - Rewrote suggestWorldSeeds with 6 sequential calls, updated suggestSingleSeed with IP context and stop-slop
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - 13 tests covering sequential generation, inter-category deps, IP/original modes

## Decisions Made
- ScaffoldNpc.tier made optional (`tier?: "key" | "supporting"`) rather than required, to avoid breaking scaffold-generator.ts and npcSchema until plan 24-03 rewrites the NPC generation step
- IpResearchContext imported from `../ip-researcher.js` (where it's defined) rather than `@worldforge/shared` (where the plan's interface block suggested it lived)
- TypeScript union schema type issue resolved by splitting into two separate code paths (if/else) instead of conditional schema variable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made ScaffoldNpc.tier optional instead of required**
- **Found during:** Task 1 (type update)
- **Issue:** Adding required `tier` field would break scaffold-generator.ts npcSchema which doesn't produce tier, and frontend ScaffoldNpc type in api-types.ts
- **Fix:** Made tier optional with `?` and JSDoc noting it becomes required in plan 24-03
- **Files modified:** backend/src/worldgen/types.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** e2b0e5e

**2. [Rule 3 - Blocking] Fixed IpResearchContext import path**
- **Found during:** Task 1 (prompt-utils creation)
- **Issue:** Plan's interface block showed IpResearchContext in @worldforge/shared, but it's actually in backend/src/worldgen/ip-researcher.ts
- **Fix:** Import from `../ip-researcher.js` instead of `@worldforge/shared`
- **Files modified:** backend/src/worldgen/scaffold-steps/prompt-utils.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** e2b0e5e

**3. [Rule 1 - Bug] Fixed TypeScript union schema type error**
- **Found during:** Task 2 (seed-suggester implementation)
- **Issue:** Conditional `const schema = isCultural ? z.object({...array...}) : z.object({...string...})` produced incompatible union type for generateObject
- **Fix:** Split into two separate if/else code paths, each calling generateObject with its own schema
- **Files modified:** backend/src/worldgen/seed-suggester.ts
- **Verification:** TypeScript compiles clean, all 13 tests pass
- **Committed in:** 1f2b00d

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for compilation. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors (missing hono module, mcp-client brave search provider) in worktree -- not caused by this plan's changes, ignored
- Pre-existing worldgen route test failure (missing hono dep in worktree) -- not caused by this plan's changes, ignored

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- prompt-utils.ts ready for import by plan 24-02 (scaffold steps rewrite)
- Sequential DNA pattern established for downstream steps to follow
- ScaffoldNpc.tier will be populated by plan 24-03 NPC step rewrite

---
*Phase: 24-worldgen-known-ip-quality*
*Completed: 2026-03-25*
