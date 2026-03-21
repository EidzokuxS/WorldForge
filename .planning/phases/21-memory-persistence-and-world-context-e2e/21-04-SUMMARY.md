---
phase: 21-memory-persistence-and-world-context-e2e
plan: 04
subsystem: testing
tags: [e2e, browser, playwright, memory, context-awareness, glm, gap-closure]
gap_closure: true

requires:
  - phase: 21-memory-persistence-and-world-context-e2e
    provides: "Browser E2E patterns: Playwright launch, screenshot helpers, DOM selectors for NarrativeLog"
provides:
  - "Gap 3 closed: multi-turn context awareness verified in browser with non-zero narrative"
  - "Reliable turn completion detection via API message count polling (+2 threshold)"
affects: []

tech-stack:
  added: []
  patterns: ["API-based message count polling for turn completion detection (+2 threshold)", "getNewAssistantNarrative extracts only NEW messages since baseline count", "300s inter-turn delay for GLM post-turn processing (NPC + 6 faction ticks)"]

key-files:
  created: ["e2e/21-04-browser-context-gap-closure.ts", "e2e/screenshots/21-04-results.json"]
  modified: []

key-decisions:
  - "Turn completion detection uses API message count +2 threshold (user + assistant) instead of DOM textarea state -- avoids race condition where user message is saved before assistant response"
  - "300s inter-turn delay required because post-turn NPC + 6 faction ticks consume 20+ GLM API calls over 5-7 minutes"
  - "getNewAssistantNarrative(beforeCount) only examines messages after baseline index, preventing false positives from old narratives"

patterns-established:
  - "GLM free tier turn processing takes 60-150s (Oracle retries + Storyteller retries + fallback)"
  - "Post-turn processing (NPC tick + 6 faction ticks) burns 20+ GLM calls, requiring 300s+ cooldown between browser turns"

requirements-completed: [MEMORY-BROWSER-CONTEXT]

duration: 154min
completed: 2026-03-21
---

# Phase 21 Plan 04: Browser Context Gap Closure Summary

**Multi-turn context awareness verified in browser: Turn 1 produced 2460ch Moonstone narrative, Turn 2 produced 2294ch referencing Turn 1 with 5 context keywords (stone, glow, found, earlier, examin) -- closes Gap 3 from 21-VERIFICATION.md**

## Performance

- **Duration:** 154 min (mostly GLM rate limit delays between attempts)
- **Started:** 2026-03-21T07:44:30Z
- **Completed:** 2026-03-21T10:18:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Gap 3 closed: both browser turns produce non-zero narrative text (2460ch and 2294ch)
- Context awareness confirmed: Turn 2 narrative references Turn 1 with keywords [stone, glow, found, earlier, examin]
- Turn completion detection improved: API message count polling with +2 threshold prevents false positives
- Reliable inter-turn delay calibrated: 300s accounts for post-turn NPC/faction tick processing

## Task Commits

Each task was committed atomically:

1. **Task 1: Browser multi-turn context awareness gap closure test** - `94fc648` (test)
2. **Task 2: Analyze results and produce SUMMARY** - (this commit, docs)

## Files Created/Modified
- `e2e/21-04-browser-context-gap-closure.ts` - Playwright browser E2E test for multi-turn context awareness (3 steps, retry logic, API-based narrative extraction)
- `e2e/screenshots/21-04-results.json` - Test results: 3/3 steps passed, quality 5.0/5.0, gap_closure: true
- `e2e/screenshots/21-04-step1-initial.png` - Game page loaded with 192 messages
- `e2e/screenshots/21-04-step2-turn1.png` - Turn 1 narrative visible in browser
- `e2e/screenshots/21-04-step3-turn2.png` - Turn 2 narrative referencing Turn 1 visible in browser

## Decisions Made
- **Turn completion detection via API**: DOM-based textarea state detection is unreliable due to race condition where user message is saved (line 365 of turn-processor.ts) before Storyteller completes (line 547). API message count polling with +2 threshold (user + assistant) ensures both messages are saved before extraction.
- **300s inter-turn delay**: Each turn triggers post-turn processing (1 NPC tick + 6 faction ticks, each with up to 3 retries). This burns 20+ GLM API calls over 5-7 minutes, exhausting the rate limit. 300s delay between turns allows the full post-turn cycle to complete AND rate limits to reset.
- **getNewAssistantNarrative(beforeCount)**: Only examines messages from index `beforeCount` onward, preventing the extraction function from finding old narrative blocks when the new one hasn't been saved yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed false positive narrative extraction from stale DOM**
- **Found during:** Task 1 (first test runs)
- **Issue:** `getLastAssistantText` walked backward through assistant blocks to find non-empty text, which returned OLD narratives from prior turns when the NEW turn's `<p>` element was empty (0-char Storyteller output from rate limiting)
- **Fix:** Switched to API-based narrative extraction with `getNewAssistantNarrative(beforeCount)` that only examines messages added after the turn began
- **Files modified:** e2e/21-04-browser-context-gap-closure.ts
- **Committed in:** 94fc648

**2. [Rule 1 - Bug] Fixed premature turn completion detection**
- **Found during:** Task 1 (multiple test runs showed +1 message but 0ch narrative)
- **Issue:** `waitForTurnComplete` detected message count increase of +1 (user message saved at turn start) and exited before the assistant response was saved (60-150s later). The narrative extraction then found no new assistant content.
- **Fix:** Changed to require +2 message count increase (both user + assistant saved) before considering turn complete, with textarea fallback for 0-char narrative turns
- **Files modified:** e2e/21-04-browser-context-gap-closure.ts
- **Committed in:** 94fc648

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were essential for accurate test results. Without them, the test consistently reported 0ch narrative despite the backend successfully streaming 2000+ chars. No scope creep.

## Issues Encountered
- **GLM rate limit exhaustion**: Each browser turn triggers Oracle (2 providers x 3 retries) + Storyteller (3 retries + fallback) + post-turn NPC tick + 6 faction ticks. This consumes 20+ API calls within minutes, exhausting the GLM free tier rate limit. Required 300s inter-turn delays and multiple test iterations (7 runs total) to find the right timing.
- **Test duration**: Due to GLM rate limits and 300s inter-turn delays, each full test run takes 10-15 minutes. Total plan execution took 154 minutes including debugging and iteration.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gap 3 from 21-VERIFICATION.md is closed: multi-turn context awareness demonstrated in browser
- All Phase 21 gaps now closed (21-03 closed Gap 1/Gap 2, this plan closes Gap 3)
- Ready for Phase 22 and beyond

---
*Phase: 21-memory-persistence-and-world-context-e2e*
*Completed: 2026-03-21*
