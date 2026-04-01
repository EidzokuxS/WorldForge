---
phase: 31-prompt-system-harmonization-and-audit
plan: 06
subsystem: prompt-system
tags: [npc, reflection, support-prompts, vitest]
requires:
  - phase: 31-prompt-system-harmonization-and-audit
    provides: shared canonical character vocabulary
provides:
  - npc-agent prompts that read canonical NPC state before compatibility tags
  - reflection prompts that stay evidence-driven while using canonical NPC wording
affects: [npc agent, reflection agent]
tech-stack:
  added: []
  patterns: [canonical-state-first support prompts, evidence-driven support prompt framing]
key-files:
  created: []
  modified:
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/reflection-agent.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/reflection-agent.test.ts
key-decisions:
  - "NPC support prompts should name canonical authority explicitly and present derived tags as shorthand evidence only."
  - "Reflection prompts must stay evidence-driven and progression-aware rather than drifting into vague introspection."
patterns-established:
  - "Support prompts can share contract language without giving up their narrow task boundaries."
requirements-completed: [P31-05, P31-06]
duration: 2 min
completed: 2026-04-01
---

# Phase 31 Plan 06: NPC Support Prompt Audit Summary

**NPC-agent and reflection prompts now read canonical NPC state first, keep derived tags in a compatibility role, and preserve their task-specific action and evidence boundaries.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T17:18:21+03:00
- **Completed:** 2026-04-01T17:20:23+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Reframed NPC-agent prompts around canonical NPC record authority while preserving scene-local action selection.
- Reframed reflection prompts around canonical record authority plus evidence-driven belief/goal updates.
- Added support-prompt regressions that fail if legacy blob-authority wording returns.

## Task Commits

1. **Task 1: Rewrite NPC autonomous prompts to read canonical state first** - `4755b8d`, `4f03887`
2. **Task 2: Rewrite reflection prompts to stay evidence-driven and canonical** - `4755b8d`, `4f03887`

## Files Created/Modified
- `backend/src/engine/npc-agent.ts` - canonical-state-first NPC support prompt
- `backend/src/engine/reflection-agent.ts` - canonical/evidence-driven reflection prompt
- `backend/src/engine/__tests__/npc-agent.test.ts` - NPC-agent support prompt regressions
- `backend/src/engine/__tests__/reflection-agent.test.ts` - reflection support prompt regressions

## Decisions Made

- NPC-agent prompts keep one-action scope even after adopting shared canonical wording.
- Reflection prompts keep wealth/skill progression semantics and recent-event evidence requirements intact.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Existing reflection tool tests needed their fixture expectations updated to the canonical NPC record baseline so the new RED coverage isolated prompt-contract failures instead of stale legacy assertions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The remaining Oracle and world-engine support prompts can now adopt harmonized language without inheriting legacy NPC blob terminology.

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts`
- `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts`

## Self-Check

PASSED - summary file exists and all referenced task commits were found in git history.

---
*Phase: 31-prompt-system-harmonization-and-audit*
*Completed: 2026-04-01*
