---
phase: 50-gameplay-text-presentation-and-rich-readability
plan: 04
subsystem: ui
tags: [sse, reasoning, gameplay, nextjs, vitest, typescript]
requires:
  - phase: 50-03
    provides: persisted `settings.ui.showRawReasoning` gate for gameplay-only debug disclosure
  - phase: 45
    provides: authoritative opening/action/retry SSE lifecycle consumed by `/game`
provides:
  - separate non-canonical `reasoning` SSE transport from storyteller output to the frontend parser
  - assistant-only `Raw reasoning` disclosure in `/game`, gated by persisted settings
affects: [phase-50-closeout, gameplay-ui, sse-transport, debugging]
tech-stack:
  added: []
  patterns:
    - storyteller reasoning travels on its own `reasoning` SSE event and never mutates canonical narration or stored chat history
    - `/game` keeps reasoning as local assistant-only debug metadata layered on top of runtime messages
key-files:
  created: []
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/routes/chat.ts
    - backend/src/routes/__tests__/chat.test.ts
    - frontend/lib/api.ts
    - frontend/lib/__tests__/api.test.ts
    - frontend/app/game/page.tsx
    - frontend/components/game/narrative-log.tsx
    - frontend/components/game/__tests__/narrative-log.test.tsx
    - frontend/app/game/__tests__/page.test.tsx
key-decisions:
  - "The installed `ai@6.0.106` seam is `reasoningText`, emitted once after visible narration finalization and before `done`."
  - "Raw reasoning stays as local assistant-only debug metadata in `/game` instead of widening shared `ChatMessage` or persisted history."
  - "The disclosure uses native `<details>` under narration-only assistant messages and stays hidden for lookups, progress blocks, user text, and empty payloads."
patterns-established:
  - "Reasoning transport pattern: backend `reasoning` event -> `parseTurnSSE.onReasoning` -> local UI metadata attachment."
  - "Gameplay debug UI pattern: persisted `settings.ui` flags gate optional disclosures without changing canonical content."
requirements-completed: [UX-01]
duration: 12 min
completed: 2026-04-13
---

# Phase 50 Plan 04: Separate reasoning transport and settings-gated `/game` disclosure Summary

**Separate storyteller reasoning transport via SSE with an optional `/game` Raw reasoning disclosure that stays outside canonical narration and persisted chat history**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-13T08:21:31+03:00
- **Completed:** 2026-04-13T08:33:22+03:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Locked the installed storyteller seam to `reasoningText` and transported provider reasoning on a distinct backend/frontend SSE lane.
- Kept reasoning out of canonical narration, `appendChatMessages`, and stored chat history while preserving existing narrative, lookup, and done transport behavior.
- Added a persisted-settings-gated `Raw reasoning` disclosure on `/game` that only appears for assistant narration with non-empty reasoning metadata.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add separate reasoning transport through the turn processor and SSE parser** - `50a230a` (feat)
2. **Task 2: Gate assistant-only `/game` reasoning disclosure behind the persisted settings toggle** - `1f64500` (feat)

## Files Created/Modified
- `backend/src/engine/turn-processor.ts` - Emits a separate `reasoning` turn event from the concrete `generateText(...).reasoningText` seam.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Locks the installed reasoning field/timing seam and proves no event is emitted when reasoning is absent.
- `backend/src/routes/chat.ts` - Streams `event: reasoning` without folding debug text into narration.
- `backend/src/routes/__tests__/chat.test.ts` - Verifies the reasoning SSE lane remains distinct.
- `frontend/lib/api.ts` - Adds optional `onReasoning` handling to the SSE parser.
- `frontend/lib/__tests__/api.test.ts` - Proves parser support for `reasoning` without regressing existing event handling.
- `frontend/app/game/page.tsx` - Attaches reasoning to local assistant-only display metadata and gates disclosure with persisted settings.
- `frontend/components/game/narrative-log.tsx` - Renders the bounded native `Raw reasoning` disclosure only for assistant narration.
- `frontend/components/game/__tests__/narrative-log.test.tsx` - Covers disclosure visibility, assistant-only filtering, and empty/disabled suppression.
- `frontend/app/game/__tests__/page.test.tsx` - Covers `/game` wiring from streamed reasoning to settings-gated disclosure props.

## Decisions Made

- Used the SDK-native `reasoningText` seam instead of inventing a parallel payload shape or token-stream model.
- Preserved the shared `ChatMessage` contract by keeping reasoning on a local display model in `/game` only.
- Reused native `<details>` disclosure semantics so long reasoning remains inspectable with bounded height and scroll, without adding another custom panel system.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gitnexus_detect_changes({ scope: "unstaged" })` was polluted by unrelated worktree changes, so staged-only analysis was used to confirm the real Plan `50-04` scope before the Task `50-04-02` commit.
- The new `/game` reasoning tests were initially flaky when the opening-stream mock emitted synchronously; aligning them with the existing deferred opening-stream harness fixed the instability without changing product behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `50` is ready to be marked complete: gameplay now supports transport-safe, settings-gated raw reasoning disclosure on top of the earlier readability work.
- The remaining active milestone work sits outside this phase: Phase `47-03` still owns the last open storyteller-quality closeout slice.

## Self-Check

PASSED

- FOUND: `.planning/phases/50-gameplay-text-presentation-and-rich-readability/50-04-SUMMARY.md`
- FOUND commit: `50a230a`
- FOUND commit: `1f64500`

---
*Phase: 50-gameplay-text-presentation-and-rich-readability*
*Completed: 2026-04-13*
