---
phase: 31-prompt-system-harmonization-and-audit
plan: 03
subsystem: prompt-system
tags: [character, npc, prompts, worldgen, vitest]
requires:
  - phase: 31-prompt-system-harmonization-and-audit
    provides: shared character prompt contract
provides:
  - player drafting prompts aligned to canonical CharacterDraft fields
  - NPC drafting and archetype prompts aligned to the same canonical field model
affects: [character generation, npc generation, archetype research]
tech-stack:
  added: []
  patterns: [canonical CharacterDraft-first prompt outputs, compatibility projection wording]
key-files:
  created: []
  modified:
    - backend/src/character/generator.ts
    - backend/src/character/npc-generator.ts
    - backend/src/character/archetype-researcher.ts
    - backend/src/character/__tests__/generator.test.ts
    - backend/src/character/__tests__/npc-generator.test.ts
    - backend/src/character/__tests__/archetype-researcher.test.ts
key-decisions:
  - "Character prompts emit canonical draft categories first and mention runtime tags only as compatibility output."
  - "Archetype research should feed the same canonical buckets used by player and NPC generation."
patterns-established:
  - "Legacy flat tag phrasing is compatibility guidance, never the authoritative schema."
requirements-completed: [P31-03, P31-06]
duration: 4 min
completed: 2026-04-01
---

# Phase 31 Plan 03: Character Prompt Harmonization Summary

**Player, NPC, and archetype prompts now write against the same canonical CharacterDraft vocabulary instead of legacy flat-tag prompt contracts.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T17:03:36+03:00
- **Completed:** 2026-04-01T17:07:40+03:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Reframed player drafting prompts around canonical draft field groups and authored-fact preservation.
- Reworked NPC generation prompts to describe profile, social context, motivations, capabilities, state, and provenance directly.
- Updated archetype research prompts and tests so upstream character ideation feeds the same canonical structure.

## Task Commits

1. **Task 1: Align player drafting prompts to shared contract** - `e333468`, `736dd7b`
2. **Task 2: Align NPC and archetype prompts to shared contract** - `ea66eb7`, `dacc1dd`

## Files Created/Modified
- `backend/src/character/generator.ts` - player prompt contract now targets canonical draft fields
- `backend/src/character/npc-generator.ts` - NPC prompt contract now uses canonical draft vocabulary
- `backend/src/character/archetype-researcher.ts` - archetype guidance now feeds canonical field buckets
- `backend/src/character/__tests__/generator.test.ts` - player prompt regressions
- `backend/src/character/__tests__/npc-generator.test.ts` - NPC prompt regressions
- `backend/src/character/__tests__/archetype-researcher.test.ts` - archetype prompt regressions

## Decisions Made

- Character prompt harmonization should happen at the draft layer, not by post-processing legacy prompt outputs later.
- Archetype prompts stay lightweight but must still speak the canonical vocabulary explicitly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Character generation, NPC drafting, and archetype ideation now share one prompt contract baseline for the remaining worldgen and support audits.

## Verification

- `npm --prefix backend exec vitest run src/character/__tests__/generator.test.ts`
- `npm --prefix backend exec vitest run src/character/__tests__/npc-generator.test.ts src/character/__tests__/archetype-researcher.test.ts`

## Self-Check

PASSED - summary file exists and all referenced task commits were found in git history.

---
*Phase: 31-prompt-system-harmonization-and-audit*
*Completed: 2026-04-01*
