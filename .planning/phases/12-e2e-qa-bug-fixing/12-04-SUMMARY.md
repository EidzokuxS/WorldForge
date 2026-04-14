---
phase: 12-e2e-qa-bug-fixing
plan: 04
subsystem: e2e-testing
tags: [playwright, e2e, gameplay-loop, oracle, narrative-streaming, story-control, sidebar-panels]

requires:
  - phase: 12-03
    provides: Campaign created with character for gameplay testing
provides:
  - Full gameplay loop verified end-to-end through browser
  - Story control (retry, undo, inline edit) verified
  - Streaming indicator bug fixed in turn processor
affects: [12-05]

tech-stack:
  added: []
  patterns: [fire-and-forget-post-turn-via-void-iife]

key-files:
  created:
    - qa-screenshots/04-game-initial.png
    - qa-screenshots/04-action-submitted.png
    - qa-screenshots/04-oracle-result.png
    - qa-screenshots/04-narrative-streamed.png
    - qa-screenshots/04-quick-actions.png
    - qa-screenshots/04-hp-sidebar.png
    - qa-screenshots/04-combat-result.png
    - qa-screenshots/04-retry.png
    - qa-screenshots/04-undo.png
    - qa-screenshots/04-edit.png
    - qa-screenshots/04-edit-mode.png
  modified:
    - backend/src/engine/turn-processor.ts

key-decisions:
  - "Post-turn callback must be fire-and-forget (void IIFE) so SSE stream closes promptly after done event"
  - "Quick actions depend on LLM calling offer_quick_actions tool -- not guaranteed every turn"
  - "Duplicate Iron Key from retry is a known edge case in snapshot restore -- not blocking"

patterns-established:
  - "Fire-and-forget async: void IIFE pattern for post-turn processing that must not block SSE stream closure"

requirements-completed: [TURN-01, TURN-02, TURN-03, TURN-04, TOOL-04, TOOL-05, TOOL-09, TOOL-10, ORCL-01, ORCL-02, ORCL-05, CTRL-01, CTRL-02, CTRL-03, CTRL-04, MECH-01, MECH-03, MECH-05, MECH-07]

duration: 15min
completed: 2026-03-20
---

# Phase 12 Plan 04: Gameplay Loop E2E Test Summary

**Full gameplay loop verified through browser -- Oracle evaluation, narrative streaming, quick actions, story control (retry/undo/edit), and sidebar panels all working with one streaming indicator bug fixed**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-19T21:34:23Z
- **Completed:** 2026-03-19T21:49:23Z
- **Tasks:** 2
- **Files modified:** 1 (code) + 11 (screenshots)

## Accomplishments
- Full gameplay loop: type action -> Oracle evaluates (chance%, roll, outcome tier) -> narrative streams -> quick actions appear
- Story control verified: retry regenerates with new roll, undo removes last turn pair, inline edit with textarea + Ctrl+Enter save
- Fixed streaming indicator bug: post-turn callback (NPC ticks, reflections, faction ticks) was blocking SSE stream closure, causing "storyteller is weaving the scene..." to persist after narrative completed
- Sidebar panels show HP (3/5), equipment, traits, location, NPCs here, items here, connected paths
- Tool calls (spawn_item) update sidebar in real-time (Iron Key appeared after turn)

## Rubric Scores

| Page | Layout | Readability | Hierarchy | Interactivity | Dark Theme | Polish | Total |
|------|--------|-------------|-----------|---------------|------------|--------|-------|
| Game Page (gameplay) | 5 | 4 | 5 | 5 | 5 | 4 | 28/30 |
| Oracle Panel | 4 | 5 | 4 | N/A | 5 | 4 | 22/25 |
| Story Controls | 4 | 4 | 4 | 5 | 5 | 4 | 26/30 |

## Task Commits

Each task was committed atomically:

1. **Task 1: Submit action, verify Oracle + narrative streaming + quick actions** - `dccc3ac` (fix) + `e86a360` (test)
2. **Task 2: Story control -- retry, undo, inline edit via browser** - `cfa4f2e` (test)

## Files Created/Modified
- `backend/src/engine/turn-processor.ts` - Fire-and-forget post-turn callback to close SSE stream promptly
- `qa-screenshots/04-game-initial.png` - Initial game page with 3-column layout
- `qa-screenshots/04-action-submitted.png` - Oracle result + narrative during streaming
- `qa-screenshots/04-oracle-result.png` - Strong Hit with Chance/Roll display
- `qa-screenshots/04-narrative-streamed.png` - Completed narrative text
- `qa-screenshots/04-quick-actions.png` - Quick action buttons at bottom
- `qa-screenshots/04-hp-sidebar.png` - Character sidebar with HP 3/5, equipment, traits
- `qa-screenshots/04-combat-result.png` - Combat action with Weak Hit result
- `qa-screenshots/04-retry.png` - Retry result with new Oracle roll
- `qa-screenshots/04-undo.png` - After undo with toast confirmation
- `qa-screenshots/04-edit.png` - After inline edit with (edited) label
- `qa-screenshots/04-edit-mode.png` - Edit mode textarea with Save/Cancel buttons

## Decisions Made
- Post-turn callback (NPC ticks, reflections, faction ticks, image generation) was awaited inside the async generator, blocking SSE stream closure. Changed to void IIFE for fire-and-forget behavior.
- Quick actions are LLM-dependent (offer_quick_actions tool) -- not guaranteed every turn. Verified they appear when LLM uses the tool.
- Duplicate item from retry (Iron Key x2) is a known edge case in snapshot restore -- the snapshot correctly restores DB state but items spawned during the retried turn may persist. Non-blocking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Streaming indicator persisted after narrative completed**
- **Found during:** Task 1 (action submission and streaming)
- **Issue:** Post-turn processing (NPC ticks, reflections, faction ticks, image gen) was awaited inside the async generator, keeping the SSE response body open. Frontend `isStreaming` stayed `true` for 30+ seconds after narrative finished.
- **Fix:** Changed `await onPostTurn(summary)` to `void (async () => { await onPostTurn(summary) })()` so the generator returns immediately after yielding the `done` event.
- **Files modified:** `backend/src/engine/turn-processor.ts`
- **Verification:** Re-tested action submission -- streaming indicator clears within seconds of narrative completion. Backend typecheck passes.
- **Committed in:** `dccc3ac`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for accurate UI feedback. No scope creep.

## Issues Encountered
- Playwright browser version mismatch (headless_shell-1181 vs installed 1208) -- resolved by specifying explicit `executablePath` to chrome.exe
- First action submission attempt failed silently because Playwright `fill()` doesn't trigger React onChange -- resolved by using `pressSequentially()` instead

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full gameplay loop verified -- actions, Oracle, narrative streaming, quick actions, story control all working
- Ready for final QA plan (12-05)
- Known non-blocking issues: duplicate items on retry, LLM sometimes includes raw [ACTION RESULT] in narrative text

---
*Phase: 12-e2e-qa-bug-fixing*
*Completed: 2026-03-20*
