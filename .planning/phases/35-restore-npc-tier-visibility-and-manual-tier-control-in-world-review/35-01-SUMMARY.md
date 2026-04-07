---
phase: 35-restore-npc-tier-visibility-and-manual-tier-control-in-world-review
plan: 01
subsystem: api
tags: [npc-tier, world-review, zod, vitest, character-draft]
requires:
  - phase: 24-worldgen-known-ip-quality
    provides: key/supporting NPC generation plus supporting->persistent saver mapping
  - phase: 29-unified-character-ontology-and-tag-system
    provides: canonical CharacterDraft seams for review and save flows
provides:
  - explicit ScaffoldNpc tier contract on the frontend review seam
  - tier-preserving draft/scaffold adapters for editable NPC review state
  - save-edits schema normalization that keeps supporting NPC drafts coherent
  - regression coverage for frontend adapters, save-edits parsing, campaign world aliases, and saver persistence
affects: [35-02 world-review tier controls, npc review save flow, campaign world payload aliases]
tech-stack:
  added: []
  patterns: [explicit review-tier mapping, canonical draft tier synchronization, parser-seam regression coverage]
key-files:
  created:
    - frontend/lib/__tests__/character-drafts.test.ts
    - frontend/lib/character-drafts.ts
  modified:
    - frontend/lib/api-types.ts
    - frontend/lib/world-data-helpers.ts
    - frontend/lib/__tests__/world-data-helpers.test.ts
    - backend/src/routes/schemas.ts
    - backend/src/routes/__tests__/schemas.test.ts
    - backend/src/routes/__tests__/worldgen.test.ts
    - backend/src/routes/__tests__/campaigns.test.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
key-decisions:
  - "Review-scaffold tier stays a two-state contract: key vs supporting, while DB persistence remains key vs persistent."
  - "saveEditsSchema now applies tier defaults inside the transform so canonical draft tier can win when explicit scaffold tier is absent."
  - "Legacy scaffold NPC payloads materialize canonical drafts with identity.tier supporting, not persistent, to keep the review seam coherent."
patterns-established:
  - "Review seam pattern: derive ScaffoldNpc.tier from CharacterDraft.identity.tier when a canonical draft exists, otherwise map runtime row tier and only then fall back to key."
  - "Parser seam pattern: convert legacy scaffold payloads into canonical drafts, then explicitly rewrite identity.tier to the review-tier vocabulary."
requirements-completed: [P35-01, P35-02, P35-05]
duration: 9min
completed: 2026-04-07
---

# Phase 35 Plan 01: Restore NPC Tier Contract Summary

**NPC review tier now survives draft adapters, editable scaffold normalization, and save-edits parsing without collapsing supporting characters into key or persistent states**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-07T04:51:00Z
- **Completed:** 2026-04-07T04:59:34Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Restored an explicit `tier: "key" | "supporting"` contract on frontend `ScaffoldNpc` objects and preserved it across draft/scaffold conversions.
- Made editable world normalization follow the documented fallback order `draft.identity.tier -> mapped row tier -> key`.
- Locked the backend parser seam so draft-backed and legacy save-edits payloads both preserve supporting NPCs, while the saver boundary still persists supporting NPCs as DB `persistent`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Restore the frontend NPC tier contract across scaffold, draft, and editable-world adapters** - `3bb2756` (feat)
2. **Task 2: Lock the save-edits parser seam and backend compatibility boundary with targeted regressions** - `36f466b` (fix)

**Plan metadata:** pending

## Files Created/Modified
- `frontend/lib/api-types.ts` - added explicit scaffold NPC tier typing for review payloads.
- `frontend/lib/character-drafts.ts` - mapped draft tiers to review tiers, synchronized `draft.identity.tier`, and made empty NPC draft creation tier-aware.
- `frontend/lib/world-data-helpers.ts` - preserved NPC tier during world-to-editable normalization with an explicit fallback cascade.
- `frontend/lib/__tests__/character-drafts.test.ts` - covered draft/scaffold tier preservation and explicit manual draft tier creation.
- `frontend/lib/__tests__/world-data-helpers.test.ts` - covered canonical-draft, runtime-row, and legacy-missing-tier fallback branches.
- `backend/src/routes/schemas.ts` - normalized legacy scaffold NPC payloads into canonical supporting drafts and deferred schema defaults to the transform seam.
- `backend/src/routes/__tests__/schemas.test.ts` - asserted supporting-tier preservation for draft-backed and legacy save-edits payloads.
- `backend/src/routes/__tests__/worldgen.test.ts` - verified `/api/worldgen/save-edits` forwards supporting NPCs and coherent canonical drafts into `saveScaffoldToDb`.
- `backend/src/routes/__tests__/campaigns.test.ts` - pinned the campaign world alias that surfaces DB `persistent` rows as review-tier `supporting`.
- `backend/src/worldgen/__tests__/scaffold-saver.test.ts` - asserted both supporting->persistent and key->key saver mappings.

## Decisions Made

- Used one review-tier vocabulary on the scaffold seam and kept DB/runtime naming (`persistent`) isolated behind adapters.
- Fixed the schema seam at normalization time instead of changing saver behavior, because persistence mapping was already correct and covered by existing plan intent.
- Kept the plan scope off the review UI and worldgen generation rules; this pass only repaired contracts, transforms, and regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Legacy save-edits NPC payloads materialized canonical drafts with `identity.tier: "persistent"`**
- **Found during:** Task 2 (Lock the save-edits parser seam and backend compatibility boundary with targeted regressions)
- **Issue:** `legacyNpcToDraft()` converted supporting scaffold payloads through a DB-tier mapping and left the canonical draft in backend runtime vocabulary, breaking the review seam.
- **Fix:** Deferred scaffold tier defaults to the schema transform and explicitly rewrote materialized draft identity tiers back to `key|supporting`.
- **Files modified:** `backend/src/routes/schemas.ts`, `backend/src/routes/__tests__/schemas.test.ts`, `backend/src/routes/__tests__/worldgen.test.ts`
- **Verification:** `npm --prefix backend exec vitest run "src/routes/__tests__/schemas.test.ts" "src/routes/__tests__/worldgen.test.ts" "src/routes/__tests__/campaigns.test.ts" "src/worldgen/__tests__/scaffold-saver.test.ts"`
- **Committed in:** `36f466b`

**2. [Rule 3 - Blocking] Targeted backend route tests still expected the old `composeSelectedWorldbooks` call signature**
- **Found during:** Task 2 verification
- **Issue:** Two existing `worldgen.test.ts` assertions failed because the route now passes both `(selection, premise)`.
- **Fix:** Updated those assertions to the current route contract so the required verification bundle reflects the live code path.
- **Files modified:** `backend/src/routes/__tests__/worldgen.test.ts`
- **Verification:** `npm --prefix backend exec vitest run "src/routes/__tests__/schemas.test.ts" "src/routes/__tests__/worldgen.test.ts" "src/routes/__tests__/campaigns.test.ts" "src/worldgen/__tests__/scaffold-saver.test.ts"`
- **Committed in:** `36f466b`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were required to verify the intended seam behavior. No architectural scope change.

## Issues Encountered

- `STATE.md` was already in a conflicted state before execution. Plan work avoided staging unrelated planning files and leaves final state reconciliation to the GSD state-update step.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `35-02` can add review-page tier visibility and manual tier controls on top of a restored load/edit/save contract.
- Supporting NPCs now remain supporting at every seam this UI will depend on: campaign world payloads, editable scaffold state, save-edits parsing, and DB persistence.

---
*Phase: 35-restore-npc-tier-visibility-and-manual-tier-control-in-world-review*
*Completed: 2026-04-07*

## Self-Check: PASSED

- Verified summary exists at `.planning/phases/35-restore-npc-tier-visibility-and-manual-tier-control-in-world-review/35-01-SUMMARY.md`
- Verified task commits `3bb2756` and `36f466b` exist in git history
