---
phase: 46-encounter-scope-presence-and-knowledge-boundaries
plan: 01
subsystem: testing
tags: [vitest, gameplay, encounter-scope, scene-presence, prompt-assembly, ui]
requires:
  - phase: 43-travel-and-location-state-contract-resolution
    provides: normalized large-location and local-scene runtime semantics that Phase 46 narrows into encounter scope
  - phase: 45-authoritative-scene-assembly-and-start-of-play-runtime
    provides: authoritative scene assembly and pre-visible settlement seams that now need encounter-scope boundaries
provides:
  - failing backend regressions for shared scene presence, awareness, and knowledge-basis contracts
  - failing `/game` and `LocationPanel` regressions for scene-scoped "People Here" behavior
  - a red test baseline for SCEN-02 before runtime changes begin
affects: [46-02, 46-03, 46-04, SCEN-02, scene-scope, prompt-assembly, npc-routing]
tech-stack:
  added: []
  patterns: [contract-first red regressions, phase-scoped backend-plus-frontend test locking]
key-files:
  created:
    - backend/src/engine/__tests__/scene-presence.test.ts
  modified:
    - backend/src/engine/__tests__/prompt-assembler.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts
    - backend/src/routes/__tests__/chat.test.ts
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/__tests__/location-panel.test.tsx
key-decisions:
  - "Phase 46 starts from explicit red regressions that describe encounter-scope failures instead of prose complaints or prompt-only assertions."
  - "The new backend contract is expressed as a future shared scene-presence seam separating presence, awareness, and knowledge basis."
  - "SCEN-02 is not marked complete here because Plan 46-01 only locks regressions; later Phase 46 plans must implement the runtime behavior."
patterns-established:
  - "Presence vs awareness vs knowledge basis: tests now treat these as separate layers across backend scene assembly, NPC routing, and UI presence."
  - "Broad location is not immediate scene: backend and frontend regressions both fail when same-location membership leaks into encounter scope."
requirements-completed: []
duration: 6min
completed: 2026-04-12
---

# Phase 46 Plan 01: Encounter Scope Regression Lock Summary

**Failing backend and `/game` regressions now pin encounter-scope presence, awareness, and knowledge-boundary bugs in code before runtime rewiring begins**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-12T10:06:00Z
- **Completed:** 2026-04-12T10:11:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added a new red `scene-presence.test.ts` contract that assumes a future shared resolver for presence, awareness, and knowledge basis.
- Extended backend regressions so prompt assembly, present-NPC settlement, off-screen routing, and `/chat` settlement all fail on the current same-location leakage.
- Extended frontend regressions so `/game` and `LocationPanel` fail when "People Here" includes actors who merely share the same broad location.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing backend regressions for shared scene scope, hidden presence, and justified knowledge** - `e049c04` (`test`)
2. **Task 2: Add failing `/game` regressions for scene-scoped visible presence** - `2f4378e` (`test`)

## Files Created/Modified
- `backend/src/engine/__tests__/scene-presence.test.ts` - new red contract for a shared resolver that distinguishes presence, awareness, and knowledge basis.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - red coverage for encounter-scoped narration inputs and hidden-but-present awareness hints.
- `backend/src/engine/__tests__/npc-agent.test.ts` - red coverage for present-NPC selection and nearby-entity filtering by encounter scope.
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - red coverage for off-screen routing when actors share a broad location but not the immediate scene.
- `backend/src/routes/__tests__/chat.test.ts` - red coverage for pre-visible settlement using local scene scope instead of broad location identity.
- `frontend/app/game/__tests__/page.test.tsx` - red `/game` regression for scene-scoped "People Here" derivation.
- `frontend/components/game/__tests__/location-panel.test.tsx` - red panel regression that rejects broad-location-only actors from visible presence.

## Decisions Made

- Plan `46-01` stays purely in TDD red mode. No runtime behavior was changed.
- The new contract is intentionally shared across backend and frontend so later fixes cannot paper over the bug in only one layer.
- `SCEN-02` remains pending after this plan because red regressions are proof of the problem, not the fix.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- GitNexus resource context was available, but structured query/context helpers initially failed because the local graph database was missing at `.gitnexus/kuzu` while stale `meta.json` still marked the repo up to date. This was later repaired with `npx gitnexus analyze --force .`; source reads and direct targeted test work were sufficient at execution time.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `46-02` and `46-03` can now implement the shared scene-presence seam and runtime rewiring against explicit failing expectations.
- The current baseline is intentionally red: backend failures show missing `scene-presence` wiring plus broad-location leakage, and frontend failures show `/game` still derives visible presence from `currentLocationId`.
- No additional blockers were introduced by this plan.

## Self-Check

PASSED

- FOUND: `.planning/phases/46-encounter-scope-presence-and-knowledge-boundaries/46-01-SUMMARY.md`
- FOUND: `e049c04`
- FOUND: `2f4378e`

---
*Phase: 46-encounter-scope-presence-and-knowledge-boundaries*
*Completed: 2026-04-12*
