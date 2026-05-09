---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 05
subsystem: backend-engine
tags: [reactive-scene-resolution, narrator-packet, prompt-assembly, output-guard, vitest]

requires:
  - phase: 70-04
    provides: "Validated ScenePlan execution and committed action results."
provides:
  - "NarratorPacket projection from canonical committed, player-perceivable facts."
  - "Final narration prompt path that can consume a NarratorPacket as authoritative input."
  - "Post-generation visible narration output guard with one generic retry before fail-closed behavior."
affects: [70-06, final-visible-narration, processTurn, narrator-safety]

tech-stack:
  added: []
  patterns:
    - "TDD red/green commits for packet projection, prompt assembly, and output guard."
    - "Backend-only forbidden-name/fact metadata excluded from prompt text but retained for guard scanning."

key-files:
  created:
    - backend/src/engine/visible-narration-output-guard.ts
    - backend/src/engine/__tests__/visible-narration-output-guard.test.ts
  modified:
    - backend/src/engine/narrator-packet.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/scene-turn-packet.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts

key-decisions:
  - "NarratorPacket formatting exposes visible facts only; forbidden actor names and fact markers stay backend-only."
  - "Final prompt assembly explicitly pre-scans packet prose before formatting when a packet is supplied."
  - "Visible narration output is treated as untrusted until complete buffered text passes exact forbidden term validation."

patterns-established:
  - "CanonicalTurnPacket -> NarratorPacket projection filters visibility before prompt assembly."
  - "Packet guard metadata uses exact strings for deterministic backend scans, not prompt instructions."
  - "Post-generation guard retries once with generic non-leaking addendum and then throws a typed error."

requirements-completed: [P70-R6, P70-R7]

duration: 29 min
completed: 2026-04-25
---

# Phase 70 Plan 05: NarratorPacket Final Prompt Contract Summary

**NarratorPacket-backed final prompt assembly with backend-only leakage metadata and buffered post-generation guard scanning**

## Performance

- **Duration:** 29 min
- **Started:** 2026-04-25T16:16:42Z
- **Completed:** 2026-04-25T16:46:04Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Built `CanonicalTurnPacket` and `NarratorPacket` projection so final narration can consume committed player-perceivable events, responses, effects, guardrails, and control-return facts.
- Wired `assembleFinalNarrationPrompt` to accept an optional `NarratorPacket`, pre-scan it for forbidden terms, and append formatted packet sections without exposing backend-only guard metadata.
- Added `visible-narration-output-guard.ts` with exact forbidden actor/fact marker validation, one generic retry, typed fail-closed error, and non-streaming buffered-output tests.

## Task Commits

Each task was committed atomically. TDD tasks used separate RED and GREEN commits:

1. **Task 1: Build NarratorPacket from canonical committed facts**
   - `d81529d` test: add failing NarratorPacket projection tests
   - `98601ec` feat: project committed facts into NarratorPacket
2. **Task 2: Wire final prompt assembly to NarratorPacket**
   - `63cfa08` test: add failing final prompt packet tests
   - `6dd5750` feat: wire final prompt to NarratorPacket
3. **Task 3: Implement post-generation Storyteller output guard**
   - `075b7b0` test: add failing visible narration guard tests
   - `2a427ed` feat: guard visible narration against packet leaks

## Files Created/Modified

- `backend/src/engine/narrator-packet.ts` - Added canonical packet types, projection, prompt safety scan, and prompt formatter.
- `backend/src/engine/prompt-assembler.ts` - Added optional NarratorPacket input path for final visible narration prompts.
- `backend/src/engine/visible-narration-output-guard.ts` - Added exact output scanner, retry runner, and typed guard error.
- `backend/src/engine/__tests__/scene-turn-packet.test.ts` - Added packet projection, hidden/hint identity, and ToolResult reference coverage.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Added final prompt packet inclusion/exclusion and pre-prompt safety coverage.
- `backend/src/engine/__tests__/visible-narration-output-guard.test.ts` - Added output guard validation, retry, fail-closed, and non-streaming/buffer coverage.

## Decisions Made

- Packet projection does not trust `ScenePlan.narratorFacts` as prose; it uses backend reference IDs and committed ToolResult metadata.
- Hint-band actor names are included only in backend-only `forbiddenActorNames`; prompt text receives hint signals without actor identity.
- The output guard intentionally uses exact substring checks in Phase 70A, matching the plan and avoiding fuzzy or semantic inference.

## GitNexus Impact

- `buildNarratorPacket`: LOW risk, 0 direct callers, 0 affected processes.
- `formatNarratorPacketForPrompt`: LOW risk, 0 direct callers, 0 affected processes.
- `assertNarratorPacketPromptSafe`: not found before Task 1 because it was introduced by this plan.
- `assembleFinalNarrationPrompt`: LOW risk, 0 direct callers, 0 affected processes.
- Task 3 added a new module and did not modify existing production symbols; staged GitNexus change detection reported LOW risk and 0 affected processes.
- Final compare from `dda393b` reported LOW risk and 0 affected processes. The compare output included the pre-existing unstaged `CLAUDE.md` drift, which was not staged or committed.

## Verification

- `npm --prefix backend run typecheck` - pass.
- `cd backend && npx vitest run src/engine/__tests__/scene-turn-packet.test.ts` - pass, 4 tests.
- `cd backend && npx vitest run src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts` - pass, 37 tests.
- `cd backend && npx vitest run src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/scene-turn-packet.test.ts` - pass, 8 tests.
- Plan-level command `cd backend && npx vitest run src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts` - pass, 41 tests.
- Acceptance `rg` checks for packet APIs, prompt wiring, guard exports, and guard test phrases all returned expected matches.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The first Task 3 GREEN typecheck caught a test fixture using obsolete prose-shaped `narratorFacts`. The fixture was corrected to the reference-only schema before the implementation commit.
- `requirements mark-complete P70-R6 P70-R7` was run, but both IDs were not present in `.planning/REQUIREMENTS.md`; no requirements file changes were produced.

## Known Stubs

None. Stub scan found only normal local empty-array/null initializers and an existing optional field comment in `prompt-assembler.ts`; no placeholder UI/data stubs were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 70-06 to wire `runVisibleNarrationWithPacketGuard` into `processTurn` before assistant message persistence and before any future final visible `narrative` SSE/TurnEvent emission.

## Self-Check: PASSED

- Created/modified files exist.
- Task commits found: `d81529d`, `98601ec`, `63cfa08`, `6dd5750`, `075b7b0`, `2a427ed`.
- `CLAUDE.md` remained unstaged and uncommitted as requested.

---

*Phase: 70-reactive-scene-resolution-and-canonical-event-flow*
*Completed: 2026-04-25*
