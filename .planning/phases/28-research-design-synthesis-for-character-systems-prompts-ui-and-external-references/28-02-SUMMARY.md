---
phase: 28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references
plan: 02
subsystem: api
tags: [prompt-contracts, worldgen, runtime, character-generation, design]
requires:
  - phase: 28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references
    provides: shared character ontology and start-condition direction from plan 01
provides:
  - repo-backed inventory of prompt families across runtime, worldgen, character, and judge workflows
  - actionable prompt rewrite rules tied to the new character ontology
  - ordered Phase 31 audit and regression handoff
affects: [phase-31, prompt-assembler, worldgen, character-generation, oracle]
tech-stack:
  added: []
  patterns: [family-scoped prompt contracts, canon-first prompt ordering, structured-source-first character prompting]
key-files:
  created:
    - .planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-prompt-family-inventory.md
    - .planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-prompt-contract-rules.md
    - .planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-31-handoff.md
  modified: []
key-decisions:
  - "Phase 31 must audit prompt families by task boundary, not treat 'the prompt system' as one monolith."
  - "Prompt rewrites must consume structured character and start-condition fields before any derived runtime tags."
  - "Runtime, character, and worldgen prompt families should centralize shared contract fragments instead of repeating contradictory copies."
patterns-established:
  - "Prompt inventories identify owner files, input context, output contract, contradictions, and stale instructions per family."
  - "Prompt rulebooks are grounded in ontology and regression seams, not generic prompt-writing advice."
requirements-completed: [P28-03, P28-06]
duration: 4min
completed: 2026-04-01
---

# Phase 28 Plan 02: Prompt harmonization foundation summary

**Prompt-family inventory plus ontology-aware rewrite rules and a sequenced Phase 31 audit map for runtime, worldgen, character, and judge prompt contracts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T00:32:23.8723100+03:00
- **Completed:** 2026-04-01T00:36:11.3139954+03:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Inventoried the live prompt families that matter to the next milestone, including runtime narration, worldgen, character drafting, and Judge/support flows.
- Converted Phase 28 research into enforceable rewrite rules centered on task boundaries, canon-first ordering, exact user-fact preservation, and structured character/start inputs.
- Handed Phase 31 an ordered audit sequence with file groups and regression seams instead of leaving it to rediscover prompt ownership.

## Task Commits

Each task was committed atomically:

1. **Task 1: Inventory prompt families and identify contract drift** - `0ba71ae` (feat)
2. **Task 2: Convert research into prompt rewrite rules and a Phase 31 execution handoff** - `4ef419f` (feat)

Plan metadata: pending docs commit

## Files Created/Modified

- `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-prompt-family-inventory.md` - file-backed inventory of runtime, worldgen, character, Judge, contradiction, and stale-contract surfaces.
- `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-prompt-contract-rules.md` - enforceable rewrite principles tied to the new character ontology and start-condition model.
- `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-31-handoff.md` - ordered audit file groups, rewrite sequencing, and protected regression seams for Phase 31.

## Decisions Made

- Split prompt-system analysis by family and task boundary so runtime narration, character drafting, worldgen, and Judge workflows can be rewritten independently without losing coherence.
- Treated the new character ontology as the anchor for prompt rewrites, not as a separate downstream concern.
- Kept known-IP canon/divergence helper reuse as a protected seam rather than reopening that architecture during prompt harmonization.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 31 can now start from explicit prompt owners, contradictions, and rewrite rules instead of broad prompt-improvement intuition.
- The audit order protects Oracle/runtime behavior while still forcing character and start-condition contracts to align with the new ontology.

## Self-Check: PASSED

- Found summary file: `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-02-SUMMARY.md`
- Found commits: `0ba71ae`, `4ef419f`

---
*Phase: 28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references*
*Completed: 2026-04-01*
