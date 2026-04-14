---
phase: 07-reflection-progression
plan: 02
subsystem: engine
tags: [progression, wealth-tiers, skill-tiers, reflection-tools, tag-system, oracle-prompt]

requires:
  - phase: 07-reflection-progression
    provides: Reflection Agent tools (set_belief, set_goal, drop_goal, set_relationship)
provides:
  - WEALTH_TIERS, SKILL_TIERS, RELATIONSHIP_TAGS constants
  - upgrade_wealth and upgrade_skill reflection tools
  - Wealth/skill tier context in Oracle prompt
affects: [prompt-assembler, oracle, storyteller]

tech-stack:
  added: []
  patterns: [tier-progression-validation, tag-based-wealth-skills]

key-files:
  created:
    - backend/src/engine/__tests__/reflection-progression.test.ts
  modified:
    - backend/src/engine/reflection-tools.ts
    - backend/src/engine/reflection-agent.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/reflection-agent.test.ts

key-decisions:
  - "One-step-up validation for wealth and skill tiers -- prevents unrealistic jumps"
  - "No-wealth entities can only start at Destitute or Poor; no-skill entities only at Novice"
  - "Wealth tier displayed as separate line in prompt (not just in tags) for explicit Oracle visibility"

patterns-established:
  - "Tier progression pattern: find current tag in ordered array, validate indexOf delta == 1, replace tag"
  - "Entity resolution for upgrades: resolveEntityForUpgrade searches players or npcs by name + campaignId"

requirements-completed: [MECH-08, MECH-09, MECH-10]

duration: 5min
completed: 2026-03-19
---

# Phase 07 Plan 02: Tag-Based Progression Summary

**Wealth and skill tier progression tools with one-step validation, plus wealth/skill context in Oracle prompts for affordability and competence evaluation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T23:13:14Z
- **Completed:** 2026-03-18T23:18:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Wealth tiers (Destitute through Obscenely Rich) with one-step-up validation preventing downgrades and skip-levels
- Skill tiers (Novice/Skilled/Master) per skill name with same validation
- Oracle prompt now includes wealth tier context for player and NPCs plus system rules explaining tier semantics

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wealth and skill tier progression tools** - `3a3cae4` (feat, TDD)
2. **Task 2: Add wealth context to Oracle prompt** - `8399e17` (feat)

## Files Created/Modified
- `backend/src/engine/reflection-tools.ts` - Added WEALTH_TIERS, SKILL_TIERS, RELATIONSHIP_TAGS constants; upgrade_wealth and upgrade_skill tools
- `backend/src/engine/reflection-agent.ts` - Updated system prompt to mention wealth/skill progression mechanics
- `backend/src/engine/prompt-assembler.ts` - Wealth tier extraction in player/NPC state sections; wealth/skill rules in system rules
- `backend/src/engine/__tests__/reflection-progression.test.ts` - 10 tests for tier constants, upgrades, downgrades, skip-levels
- `backend/src/engine/__tests__/reflection-agent.test.ts` - Updated tool count assertion from 4 to 6

## Decisions Made
- One-step-up validation for both wealth and skill tiers prevents unrealistic jumps
- Entities without wealth tags can only start at Destitute or Poor (not skip to Comfortable+)
- Entities without skill tags can only start at Novice
- Wealth tier displayed as separate labeled line in prompt for explicit Oracle visibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing reflection-agent test for new tool count**
- **Found during:** Task 1
- **Issue:** Existing test asserted exactly 4 tools, now 6 with upgrade_wealth/upgrade_skill
- **Fix:** Updated assertion from 4 to 6, added property checks for new tools
- **Files modified:** backend/src/engine/__tests__/reflection-agent.test.ts
- **Committed in:** 3a3cae4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fix necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tag-based progression complete: wealth, skills, and relationships all use descriptive tags
- Oracle and Storyteller both receive wealth/skill tier context for informed narration
- Ready for Phase 08 (world simulation / advanced NPC behavior)

---
*Phase: 07-reflection-progression*
*Completed: 2026-03-19*
