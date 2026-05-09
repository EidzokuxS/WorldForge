---
phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic
plan: 01
subsystem: ui
tags: [frontend, react, vitest, display-beats, local-storage]

requires:
  - phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic
    provides: Scene-first UI contract, review synthesis, and validation rules
provides:
  - Frontend-only DisplayBeat adapter for staged latest-turn presentation
  - Shared play-surface presentation types for later shell/drawer components
  - Per-campaign action draft persistence hook
affects: [phase-77, game-page, play-surface, action-dock, narration-dock]

tech-stack:
  added: []
  patterns:
    - Pure frontend presentation adapters over settled backend data
    - Guarded browser-only localStorage persistence keyed by campaign id

key-files:
  created:
    - frontend/components/game/play-surface/types.ts
    - frontend/lib/display-beats.ts
    - frontend/lib/use-campaign-draft.ts
    - frontend/lib/__tests__/display-beats.test.ts
    - frontend/lib/__tests__/use-campaign-draft.test.ts
  modified:
    - frontend/lib/__tests__/display-beats.test.ts

key-decisions:
  - "DisplayBeat remains frontend-only presentation state and imports no backend transport helpers."
  - "Continue route compatibility uses a single exported CONTINUE_ACTION_PAYLOAD literal."
  - "Draft persistence is campaign-keyed localStorage with in-memory fallback on storage failure."

patterns-established:
  - "Mechanic beats expose fiction-facing labels while chance, roll, and reasoning stay in rawDetails for Inspect."
  - "Progress beats use player-facing labels such as Reading, Thinking, and Settling instead of SSE event names."
  - "Stage signals are beat-attached presentation records that default to clearOn: next."

requirements-completed: [P77-R2, P77-R5, P77-R6]

duration: 9min
completed: 2026-05-02T23:26:48Z
---

# Phase 77 Plan 01: Presentation Contracts Summary

**Frontend-only beat playback and draft persistence contracts for the scene-first `/game` surface**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-02T23:18:00Z
- **Completed:** 2026-05-02T23:26:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `DisplayBeat`/play-surface contracts for narration, dialogue, side remarks, mechanic summaries, state changes, choices, progress, input handoff, drawers, presence bands, and stage signals.
- Added `deriveDisplayBeats`, `getInitialBeatIndex`, and `CONTINUE_ACTION_PAYLOAD = "Continue scene."` without importing backend/API transport helpers.
- Added `useCampaignDraft(campaignId)` with per-campaign localStorage keys, null-campaign in-memory behavior, campaign isolation, clear-only-current semantics, and storage failure fallback.

## Task Commits

1. **RED tests: DisplayBeat and draft persistence contracts** - `726f2cb` (test)
2. **Task 1: Add DisplayBeat adapter contract** - `3c54409` (feat)
3. **Task 2: Add per-campaign draft persistence** - `a73d3fb` (feat)

## Files Created/Modified

- `frontend/components/game/play-surface/types.ts` - Shared local presentation types for later play-surface components.
- `frontend/lib/display-beats.ts` - Pure adapter for latest narration, progress, Oracle summaries, travel feedback, quick choices, side remarks, input handoff, and stage signals.
- `frontend/lib/use-campaign-draft.ts` - Browser-guarded per-campaign draft persistence hook.
- `frontend/lib/__tests__/display-beats.test.ts` - TDD coverage for beat derivation, backend-boundary imports, raw mechanic separation, and Continue payload.
- `frontend/lib/__tests__/use-campaign-draft.test.ts` - TDD coverage for campaign isolation, remount restore, null-campaign behavior, clear semantics, and storage failures.

## Decisions Made

- Kept all new contracts frontend-only; backend state and turn transport are untouched.
- Stored mechanic `chance`, `roll`, and `reasoning` only in `rawDetails`, while player-facing text stays `Clean success`, `Costly success`, or `Miss`.
- Scoped drafts to `worldforge:game:draft:${campaignId}` and intentionally avoided any API/backend persistence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed jsdom source-read path in boundary test**
- **Found during:** Task 1 GREEN verification
- **Issue:** The RED boundary test used `new URL(..., import.meta.url)`, which jsdom/Vite exposed as a non-file URL for `fs.readFile`.
- **Fix:** Read `lib/display-beats.ts` by frontend test working-directory relative path.
- **Files modified:** `frontend/lib/__tests__/display-beats.test.ts`
- **Verification:** `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts`
- **Committed in:** `3c54409`

**2. [Rule 1 - Bug] Tightened mechanic label union typing**
- **Found during:** Task 1/2 verification
- **Issue:** `frontend` typecheck rejected the initial Oracle label map because it widened the labels to `string`.
- **Fix:** Typed the map as `Record<OracleResultData["outcome"], MechanicSummary["label"]>`.
- **Files modified:** `frontend/lib/display-beats.ts`
- **Verification:** `npm --prefix frontend run typecheck`
- **Committed in:** `3c54409`

---

**Total deviations:** 2 auto-fixed Rule 1 issues.
**Impact on plan:** No scope expansion; both fixes were required for the planned tests/typecheck to pass.

## Issues Encountered

- The TDD RED commit grouped both task test files before implementation. The GREEN implementation was still committed by task scope: DisplayBeat/types first, draft hook second.
- `npx gitnexus analyze` emitted Node `MaxListenersExceededWarning` messages but completed successfully and left the index up to date at `a73d3fb`.

## Known Stubs

None. Stub scan found no `TODO`, `FIXME`, `placeholder`, `coming soon`, or `not available` markers in created/modified plan files.

## Threat Flags

None. The plan added frontend presentation state and browser local draft storage only; no new network endpoints, auth paths, file access patterns, or schema trust boundaries were introduced.

## Verification

- RED: `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts` failed on missing `../display-beats`.
- RED: `npm --prefix frontend run test -- run lib/__tests__/use-campaign-draft.test.ts` failed on missing `../use-campaign-draft`.
- GREEN: `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts` passed, 10 tests.
- GREEN: `npm --prefix frontend run test -- run lib/__tests__/use-campaign-draft.test.ts` passed, 6 tests.
- Combined: `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts lib/__tests__/use-campaign-draft.test.ts` passed, 16 tests.
- Typecheck: `npm --prefix frontend run typecheck` passed.
- GitNexus pre-commit staged detection: low risk, no indexed changed symbols for both feature commits.
- GitNexus index: `npx gitnexus analyze` completed; `npx gitnexus status` reported indexed commit `a73d3fb` and current commit `a73d3fb`.

## TDD Gate Compliance

- RED gate commit exists: `726f2cb`
- GREEN gate commits exist after RED: `3c54409`, `a73d3fb`
- Refactor gate: not needed

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 77-02 and later `/game` shell work can import `DisplayBeat`, `DrawerKind`, `PresenceBand`, `StageSignal`, `deriveDisplayBeats`, `CONTINUE_ACTION_PAYLOAD`, and `useCampaignDraft` without adding backend coupling.

## Self-Check: PASSED

- Found created files: all five plan files exist.
- Found commits: `726f2cb`, `3c54409`, `a73d3fb`.
- Confirmed shared bookkeeping files were not edited by this executor.

---
*Phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic*
*Completed: 2026-05-02*
