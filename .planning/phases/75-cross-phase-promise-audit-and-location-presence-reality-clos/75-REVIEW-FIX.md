---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
fixed: 2026-04-30T14:45:00Z
source_review: 75-REVIEW.md
status: fixed_pending_final_rereview
findings_fixed:
  - HI-01
  - ME-01
---

# Phase 75 Review Fixes

## Fixed Findings

### HI-01: NPC broad placement still accepts sublocation names from a flat namespace

Fixed by making NPC generation and persistence kind-aware:

- `generateNpcsStep` now accepts full `ScaffoldLocation` objects as well as legacy string lists.
- NPC planning prompts now separate valid `locationName` values (`macro` only) from valid `sceneLocationName` values (all macro and persistent sublocations).
- Planned NPC placement normalization resolves a sublocation used as broad `locationName` into `{ locationName: parent macro, sceneLocationName: sublocation }` when the hierarchy is valid.
- `saveScaffoldToDb` now deterministically persists broad-only sublocation placement as parent macro plus scoped scene id instead of storing a sublocation as `currentLocationId`.
- World Review NPC regeneration now sends full `locations` objects through the frontend request and backend route, so regenerate-section does not collapse hierarchy back into a flat string namespace.
- Tests cover generated broad-only sublocation normalization and persistence.

### ME-01: Location parent editor can author invalid sublocation parents

Fixed by making World Review hierarchy editing kind-aware:

- NPC broad location select now shows macro locations only.
- NPC scene select still shows all locations and auto-aligns broad placement to the selected scene's macro parent.
- Location parent select now offers macro parents only.
- Selecting `None` in the parent select converts the location back to `macro` instead of saving a parentless `persistent_sublocation`.
- The location kind selector no longer offers `Persistent sublocation` when no macro parent option exists.
- Tests cover macro-only parent options and macro-only NPC broad options.

## Verification

- `npm --prefix backend run test -- src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts` — passed, 54 tests.
- `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts` — passed, 135 tests.
- `npm --prefix frontend run test -- run components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/locations-section.test.tsx` — passed, 16 tests.
- `npm --prefix frontend run test -- run 'app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx' components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/locations-section.test.tsx` — passed, 21 tests.
- `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/worldgen.test.ts src/routes/__tests__/character.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/prompt-assembler.test.ts` — passed, 203 tests.
- `npm --prefix frontend run test -- run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/locations-section.test.tsx components/world-review/__tests__/npcs-section.test.tsx 'app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx'` — passed, 113 tests.
- `npm --prefix backend run typecheck` — passed.
- `npm --prefix frontend run lint` — passed.
