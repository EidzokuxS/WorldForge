---
phase: 28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references
plan: 01
subsystem: api
tags: [character-model, ontology, prompts, worldgen, design]
requires:
  - phase: 27-lore-card-editing-and-deletion
    provides: stable review/editor seams and current non-game workflow context
provides:
  - file-backed audit of player, NPC, start-state, equipment, and persona drift
  - canonical shared character ontology for players and NPCs
  - implementation handoff for phases 29 and 30
affects: [phase-29, phase-30, prompt-assembler, character-creation, world-review]
tech-stack:
  added: []
  patterns: [shared character ontology, source-of-truth vs derived runtime tags, structured start-condition model]
key-files:
  created:
    - .planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-character-systems-audit.md
    - .planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-character-ontology-spec.md
    - .planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-29-30-handoff.md
  modified: []
key-decisions:
  - "One canonical character record must serve player and NPC flows, with role and tier as attributes rather than separate models."
  - "Flat runtime tags remain derived compatibility views, not the long-term source of truth."
  - "Start conditions must be a persisted structured object so Phase 30 can drive scenario-aware loadouts and opening-state prompts."
patterns-established:
  - "Character docs now separate authored facts, mutable state, loadout, and runtime derivations."
  - "Phase handoffs identify concrete module seams and non-goals instead of vague redesign intent."
requirements-completed: [P28-01, P28-02]
duration: 3min
completed: 2026-04-01
---

# Phase 28 Plan 01: Character ontology foundation summary

**File-backed character audit plus one shared player/NPC ontology and a concrete Phase 29-30 implementation split for start conditions, loadouts, and persona templates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T00:29:39.2641722+03:00
- **Completed:** 2026-04-01T00:32:23.8723100+03:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Audited how player drafts, scaffold NPCs, saved NPCs, runtime prompts, start-state handling, and equipment semantics currently drift across the repo.
- Defined one canonical shared character ontology with explicit source-of-truth groups and derived runtime-tag rules.
- Handed Phases 29 and 30 an implementation map with module seams, migration risks, and clear non-goals.

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit the current character, start-state, equipment, and persona surfaces** - `c42d266` (feat)
2. **Task 2: Define the canonical ontology and hand it off to Phases 29 and 30** - `9749946` (feat)

Plan metadata: pending docs commit

## Files Created/Modified

- `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-character-systems-audit.md` - current-state inventory of player/NPC/start/loadout/persona seams with file-backed contradictions.
- `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-character-ontology-spec.md` - canonical shared character model, field groups, source-of-truth rules, derived runtime-tag policy, and migration risks.
- `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-29-30-handoff.md` - concrete implementation split for ontology migration vs start/loadout/persona layering.

## Decisions Made

- Centered the redesign on a shared `CharacterRecord` / `CharacterDraft` concept rather than incremental tag cleanup.
- Treated `startConditions` as a persisted structured object, not a temporary location-resolution helper.
- Kept runtime tags in scope only as derived compatibility output so Phase 29 can migrate readers without preserving the old authoring model.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `.planning/` is gitignored in this repo, so plan artifacts required forced, file-specific staging for task commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 29 can now implement the shared character ontology against explicit field groups and migration seams.
- Phase 30 can build start conditions, canonical loadouts, and persona templates on top of the same model instead of introducing parallel contracts.

## Self-Check: PASSED

- Found summary file: `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-01-SUMMARY.md`
- Found commits: `c42d266`, `9749946`

---
*Phase: 28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references*
*Completed: 2026-04-01*
