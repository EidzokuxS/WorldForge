---
phase: 46-encounter-scope-presence-and-knowledge-boundaries
plan: 03
subsystem: simulation
tags: [encounter-scope, scene-presence, prompt-assembly, npc-routing, awareness]
requires:
  - phase: 46-02
    provides: shared presence snapshot, stored scene scope, movement lifecycle sync
provides:
  - encounter-aware scene assembly with explicit clear/hint/none awareness output
  - hidden and final storyteller prompts filtered by shared encounter scope truth
  - present-NPC and off-screen routing keyed to broad location plus scene scope
affects: [46-04, game-world-reads, storyteller-prompting, npc-simulation]
tech-stack:
  added: []
  patterns: [shared awareness-band contract, encounter-scope routing, observer-scoped knowledge reads]
key-files:
  created: []
  modified:
    - backend/src/engine/scene-presence.ts
    - backend/src/engine/scene-assembly.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/routes/chat.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts
    - backend/src/routes/__tests__/chat.test.ts
key-decisions:
  - "Hidden tool-driving prompts now keep hint-band actors in encounter scope as real participants, while final-visible prompts expose only clear actors plus bounded hint signals."
  - "Present and off-screen NPC routing now treat scene scope as the local/on-screen boundary; same broad-location actors stay off-screen until their scene scope matches."
  - "NPC nearby-entity context now carries explicit awareness and knowledge labels from the shared presence snapshot instead of broad co-location."
patterns-established:
  - "Awareness bands: clear = full actor context, hint = indirect cue only, none = omit from player-facing surfaces."
  - "Encounter consumers should read broadLocationId + sceneScopeId together, not either field alone."
requirements-completed: [SCEN-02]
duration: 12min
completed: 2026-04-12
---

# Phase 46 Plan 03: Encounter Scope, Presence & Knowledge Boundaries Summary

**Shared encounter-scope truth now drives scene assembly, storyteller prompt inputs, present-NPC settlement, and off-screen routing with one explicit awareness contract**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-12T10:40:00Z
- **Completed:** 2026-04-12T10:51:41Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Scene assembly now exposes explicit awareness output so `clear`, `hint`, and `none` are concrete backend data instead of implicit prompt behavior.
- Hidden and final storyteller prompt assembly now read the current encounter scope instead of broad location membership, with hint-band actors staying real in the hidden pass without identity leakage in the visible pass.
- Present-NPC settlement, nearby-entity reasoning, and off-screen simulation now all use broad location plus scene scope, so same-location outsiders no longer behave as if they share one room.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire scene assembly and prompts to presence plus awareness bands** - `25e5b0e` (feat)
2. **Task 2: Rewire present-NPC and off-screen routing to the shared scene scope** - `01625b7` (feat)
3. **Follow-up cleanup: remove stale import after awareness rewiring** - `02143b8` (refactor)

## Files Created/Modified

- `backend/src/engine/scene-presence.ts` - shared awareness-band contract plus observer helpers for encounter scope reads
- `backend/src/engine/scene-assembly.ts` - player-facing scene consequences and awareness summary from the shared presence snapshot
- `backend/src/engine/prompt-assembler.ts` - encounter-aware hidden/final prompt sections and pass-specific NPC state filtering
- `backend/src/engine/npc-agent.ts` - nearby-entity reasoning filtered by encounter scope and explicit knowledge basis
- `backend/src/engine/npc-offscreen.ts` - off-screen routing keyed to immediate scene scope instead of broad-location exclusion alone
- `backend/src/routes/chat.ts` - present/off-screen orchestration now passes both broad location and scene scope
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - hidden vs visible encounter-scope regressions
- `backend/src/engine/__tests__/npc-agent.test.ts` - present-NPC selection and nearby-knowledge regressions
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - same-broad-location off-screen routing regression
- `backend/src/routes/__tests__/chat.test.ts` - chat-route scene-scope routing expectations

## Decisions Made

- Hidden storyteller context keeps hint-band actors available for tool-driving, but visible narration never gets their identity unless runtime consequences justify it.
- The authoritative local/on-screen boundary is now `currentLocationId + currentSceneLocationId`, not broad location membership.
- Nearby NPC reasoning uses shared presence awareness plus `knowledgeBasis` labels to keep direct perception and indirect cues separate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `scene-presence.ts` with shared awareness helpers**
- **Found during:** Task 1
- **Issue:** The listed files were not enough to keep prompts, scene assembly, and routing consumers on one awareness contract without duplicating lookup logic.
- **Fix:** Exported the awareness-band contract plus observer-aware helper functions from `scene-presence.ts` and rewired consumers to use them.
- **Files modified:** `backend/src/engine/scene-presence.ts`, `backend/src/engine/scene-assembly.ts`, `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/npc-agent.ts`, `backend/src/engine/npc-offscreen.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts`
- **Committed in:** `25e5b0e`

**2. [Rule 3 - Blocking] Removed the stale scene-assembly import left behind by the awareness refactor**
- **Found during:** Post-task verification
- **Issue:** The shared-helper refactor left one dead import in `scene-assembly.ts`.
- **Fix:** Removed the unused import and re-ran the backend verification suite.
- **Files modified:** `backend/src/engine/scene-assembly.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts`
- **Committed in:** `02143b8`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations were necessary to keep all consumers on one shared encounter resolver without leaving verification-only cleanup behind.

## Issues Encountered

- `gitnexus detect_changes` remained unavailable during execution because the local graph database at `.gitnexus/kuzu` was missing while stale metadata kept normal `analyze` on the fast path. This was later repaired with `npx gitnexus analyze --force .`; Git-based verification and targeted test suites were used at execution time.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend encounter scope, awareness, and local/off-screen routing are aligned for Phase 46-04 frontend/world-read work.
- `/game` can now be rewired to the immediate-scene contract without backend prompt or routing drift.

## Self-Check

PASSED
