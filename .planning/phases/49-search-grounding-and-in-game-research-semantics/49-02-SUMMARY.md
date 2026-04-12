---
phase: 49-search-grounding-and-in-game-research-semantics
plan: 02
subsystem: api
tags: [character, grounding, power-profile, vitest, worldgen]
requires:
  - phase: 48
    provides: richer character/source-bundle record seams that grounding can extend without forking storage
  - phase: 49
    provides: bounded retrieval-intent and canon reuse rules that import grounding must respect
provides:
  - shared grounded character and power-profile contracts on the existing character lane
  - durable research and import route grounding with citations and explicit uncertainty
  - bounded import synthesis that avoids live search by default while preserving successful responses on synthesis failure
affects: [phase-49, character-modeling, worldgen, import-v2-card, research-character]
tech-stack:
  added: []
  patterns:
    - optional grounding profile lives beside sourceBundle and continuity on CharacterDraft and CharacterRecord
    - route grounding synthesis is best-effort and never blocks character create or import success
key-files:
  created:
    - backend/src/character/grounded-character-profile.ts
  modified:
    - shared/src/index.ts
    - shared/src/types.ts
    - backend/src/character/record-adapters.ts
    - backend/src/routes/schemas.ts
    - backend/src/character/archetype-researcher.ts
    - backend/src/routes/character.ts
    - backend/src/character/__tests__/record-adapters.identity.test.ts
    - backend/src/routes/__tests__/schemas.test.ts
    - backend/src/character/__tests__/archetype-researcher.test.ts
    - backend/src/routes/__tests__/character.test.ts
key-decisions:
  - "Grounding and power semantics extend the Phase 48 CharacterDraft/CharacterRecord lane as an optional field instead of creating a detached research store."
  - "Archetype research keeps returning prose for existing callers while a parallel grounding wrapper synthesizes durable canon and power artifacts for the route seam."
  - "Import grounding stays on the bounded card/sourceBundle lane and never triggers live search by default; failures omit grounding rather than failing the route."
patterns-established:
  - "Shared grounding contract: draft, record, and import payloads all carry the same optional grounding schema."
  - "Best-effort grounding: route handlers attach grounding inside a guarded wrapper so provenance survives even when synthesis throws."
requirements-completed: [RES-01]
duration: 11 min
completed: 2026-04-12
---

# Phase 49 Plan 02: Search Grounding & In-Game Research Semantics Summary

**Durable grounded character and power profiles now ride the shared Phase 48 character lane for research and import, with bounded citations and uncertainty instead of repeated live search**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-12T22:40:28Z
- **Completed:** 2026-04-12T22:51:09Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added shared `CharacterGroundingProfile` and `PowerProfile` contracts plus adapter/schema support so grounded canon and power data persist through the existing character record JSON lane.
- Created a bounded grounding synthesizer and archetype wrapper that turn research or imported card evidence into compact summaries, citations, and explicit uncertainty.
- Updated `/api/worldgen/research-character` and `/api/worldgen/import-v2-card` to return and persist `draft.grounding` and `characterRecord.grounding`, while degrading cleanly when synthesis fails.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define shared grounded character and power-profile contracts on the Phase 48 record lane** - `2cca86c` (test), `9d7d5a2` (feat)
2. **Task 2: Rebuild research and import seams around durable grounded profiles instead of archetype-only prose** - `384561c` (test), `ce66763` (feat)

## Files Created/Modified

- `shared/src/types.ts` - Adds shared grounding and power-profile contracts to `CharacterDraft` and `CharacterRecord`.
- `shared/src/index.ts` - Re-exports the grounding contracts from `@worldforge/shared`.
- `backend/src/character/record-adapters.ts` - Normalizes and preserves grounding alongside source bundles and continuity.
- `backend/src/routes/schemas.ts` - Extends draft, record, and `importV2CardSchema` payloads with the shared grounding shape.
- `backend/src/character/grounded-character-profile.ts` - Synthesizes compact grounded canon and power summaries with citations and uncertainty.
- `backend/src/character/archetype-researcher.ts` - Keeps archetype prose intact while adding a grounding synthesis wrapper for researched characters.
- `backend/src/routes/character.ts` - Attaches grounded profiles on research/import responses and keeps route success when synthesis fails.
- `backend/src/character/__tests__/record-adapters.identity.test.ts` - Covers grounding round-trip persistence and legacy-record omission behavior.
- `backend/src/routes/__tests__/schemas.test.ts` - Covers grounding schema/barrel exports and the import payload seam.
- `backend/src/character/__tests__/archetype-researcher.test.ts` - Covers grounded profile synthesis and sparse-input uncertainty behavior.
- `backend/src/routes/__tests__/character.test.ts` - Covers research/import grounding payloads, bounded import behavior, and graceful degradation.

## Decisions Made

- Grounding remains additive and optional on the shared lane so old records stay valid and downstream runtime readers do not need a second ontology.
- The durable artifact is the structured profile, not the raw research text; citations and uncertainty are retained explicitly in the profile itself.
- Import grounding uses only existing card text and stored provenance cues by default, which keeps `import-v2-card` inside the bounded non-live-search path required by the plan.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 49-03 can consume `characterRecord.grounding` directly for live gameplay clarification without inventing another storage seam.
- Research and import routes now provide one stable, source-aware grounding contract for downstream prompt or UI consumers.

## Known Stubs

None.

---
*Phase: 49-search-grounding-and-in-game-research-semantics*
*Completed: 2026-04-12*

## Self-Check: PASSED

- Found `.planning/phases/49-search-grounding-and-in-game-research-semantics/49-02-SUMMARY.md`
- Found commit `2cca86c`
- Found commit `9d7d5a2`
- Found commit `384561c`
- Found commit `ce66763`
