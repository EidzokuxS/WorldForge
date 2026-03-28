---
phase: 24-worldgen-known-ip-quality
plan: 03
subsystem: worldgen
tags: [npc-generation, tiered-npcs, lore-extraction, ip-fidelity, plan-detail-pattern]

requires:
  - phase: 24-worldgen-known-ip-quality
    plan: 01
    provides: ScaffoldNpc with tier field, shared prompt-utils module
provides:
  - Tiered NPC generation (key 6-10 + supporting 3-5) via plan+detail mini-calls
  - Lore extraction with IP context grounding (ipContext.keyFacts injection)
affects: [24-04-orchestrator]

tech-stack:
  added: []
  patterns: [plan-detail-mini-calls, tiered-npc-generation, ip-grounded-lore-extraction]

key-files:
  created:
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
  modified:
    - backend/src/worldgen/lore-extractor.ts

key-decisions:
  - "NPC plan+detail pattern uses 3-5 LLM calls instead of 1 monolithic call for better quality"
  - "Goals field uses .catch() fallback for robustness against bad LLM structured output"
  - "Lore extractor ipContext parameter is optional 4th arg for backward compatibility"
  - "IpResearchContext imported from @worldforge/shared (canonical location)"

patterns-established:
  - "Plan+detail: separate planning (name/role/location) from detailing (persona/tags/goals) for focused LLM context"
  - "Tiered NPCs: key tier for canonical/plot-relevant, supporting tier for gameplay-functional"
  - "IP grounding: FRANCHISE REFERENCE FACTS injected as source of truth for lore cards"

requirements-completed: [P24-05, P24-06]

duration: 3min
completed: 2026-03-25
---

# Phase 24 Plan 03: NPCs Step and Lore Extractor Summary

**Tiered NPC generation (key+supporting) with plan+detail mini-calls, and lore extractor grounded in IP research keyFacts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T14:02:29Z
- **Completed:** 2026-03-25T14:05:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created npcs-step.ts with key/supporting tier split generating 10-15 NPCs via 3-5 mini-calls
- Key NPCs use canonical character names for known IPs (e.g. "Kakashi Hatake" not "Silver-haired Mentor")
- Rewrote lore-extractor.ts to inject ipContext.keyFacts as FRANCHISE REFERENCE FACTS
- Lore prompt forbids inventing fake franchise elements and requires real concepts

## Task Commits

Each task was committed atomically:

1. **Task 1: NPCs step with key/supporting tier split and plan+detail mini-calls** - `6287217` (feat)
2. **Task 2: Rewrite lore extractor with IP context grounding** - `0bee720` (feat)

## Files Created/Modified
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - Tiered NPC generation: planKeyNpcs (6-10), planSupportingNpcs (3-5), detailNpcBatch (batches of 4-5), location/faction validation
- `backend/src/worldgen/lore-extractor.ts` - Added ipContext param, FRANCHISE REFERENCE FACTS injection, buildStopSlopRules, IP quality rules

## Decisions Made
- NPC goals field uses `.catch()` fallback (`{ shortTerm: ["Survive"], longTerm: ["Find purpose"] }`) for robustness against models that produce unexpected structured output shapes
- IpResearchContext imported from `@worldforge/shared` (where it's defined in shared/src/types.ts), not from ip-researcher.ts
- Lore extractor ipContext is optional 4th parameter to maintain backward compatibility with existing callers (scaffold-generator.ts, worldgen.ts route)
- Location/faction validation in npcs-step uses case-insensitive matching with fallback to first available entity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors (missing hono module) in worktree -- not caused by this plan's changes, ignored

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- npcs-step.ts ready for import by plan 24-04 (orchestrator wiring)
- lore-extractor.ts ready to receive ipContext from orchestrator
- Both files compile clean with TypeScript

---
*Phase: 24-worldgen-known-ip-quality*
*Completed: 2026-03-25*
