---
phase: 27-lore-card-editing-and-deletion
plan: 01
subsystem: api
tags: [hono, zod, lancedb, vitest, lore]
requires:
  - phase: 26-reusable-multi-worldbook-library
    provides: "World review lore surface and existing campaign lore routes extended by this plan."
provides:
  - "PUT /api/campaigns/:id/lore/:cardId with strict term/definition/category validation"
  - "DELETE /api/campaigns/:id/lore/:cardId with explicit 404 semantics"
  - "Stable-id lore edit helper that rewrites LanceDB rows with fresh embeddings"
  - "Targeted lore delete helper and backend regression coverage"
affects: [27-02-world-review-lore-ui, 27-03-regression-smoke, semantic-search]
tech-stack:
  added: []
  patterns: [strict parseBody validation for lore item mutations, rewrite-on-edit with preserved ids, targeted row delete for lore cards]
key-files:
  created: []
  modified:
    - backend/src/routes/schemas.ts
    - backend/src/routes/lore.ts
    - backend/src/routes/__tests__/lore.test.ts
    - backend/src/vectors/lore-cards.ts
    - backend/src/vectors/__tests__/lore-cards.test.ts
key-decisions:
  - "Lore item edits use PUT with a full replacement payload for term, definition, and category."
  - "Lore edits require a resolved embedder and rewrite the full lore table so ids stay stable while vectors stay fresh."
  - "Lore card deletion stays row-level and returns a boolean not-found signal to map cleanly to route-level 404 responses."
patterns-established:
  - "Validate lore mutations at the route boundary with a dedicated Zod schema before touching LanceDB."
  - "Use insertLoreCards with preserved ids for edit rewrites; do not call storeLoreCards for existing lore rows."
requirements-completed: [P27-01, P27-02, P27-03, P27-04, P27-05]
duration: 6 min
completed: 2026-03-31
---

# Phase 27 Plan 01: Backend lore item mutations with stable ids and fresh embeddings

**Per-card lore edit/delete routes now validate editable fields, preserve ids on edit, refresh embeddings before persistence, and return explicit 404 responses for missing cards.**

## Performance

- **Duration:** 6 min 47 sec
- **Started:** 2026-03-31T10:16:47Z
- **Completed:** 2026-03-31T10:23:34Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `loreCardUpdateSchema` for trimmed `term`/`definition` fields and `LORE_CATEGORIES`-bounded `category`.
- Added `PUT /api/campaigns/:id/lore/:cardId` and `DELETE /api/campaigns/:id/lore/:cardId` without changing existing collection routes.
- Added LanceDB helpers for stable-id lore edits with re-embedding and targeted row-level deletion, plus backend regression coverage.

## Task Commits

1. **Task 1: Define lore item mutation contracts and route semantics** - `b3783ea` (`feat`)
2. **Task 2: Build stable-id LanceDB mutation helpers with vector freshness** - `e945d37` (`feat`)

## Files Created/Modified

- `backend/src/routes/schemas.ts` - strict request schema for editable lore card fields.
- `backend/src/routes/lore.ts` - item-level lore PUT/DELETE handlers with campaign loading, validation, and 404 responses.
- `backend/src/routes/__tests__/lore.test.ts` - route regressions for update, delete, invalid payloads, and missing-card handling.
- `backend/src/vectors/lore-cards.ts` - stable-id lore edit helper with forced re-embedding and targeted delete helper.
- `backend/src/vectors/__tests__/lore-cards.test.ts` - vector-layer coverage for id preservation, vector freshness, and embedder gating.

## Decisions Made

- Used `PUT` rather than `PATCH` so the backend always receives the full editable lore card payload and can deterministically rebuild embeddings.
- Enforced embedder availability for edits instead of allowing stale/vectorless rewrites, because Phase 27 requires semantic-search freshness after manual edits.
- Kept delete row-level in LanceDB while reserving full-table rewrites for edit operations only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Route test mock needed `createLogger` after schema import chain expanded**
- **Found during:** Task 1 (Define lore item mutation contracts and route semantics)
- **Issue:** Importing `loreCardUpdateSchema` pulled a module chain that expected `createLogger`, but the existing `../../lib/index.js` mock did not provide it.
- **Fix:** Extended the route test mock with a lightweight `createLogger` stub.
- **Files modified:** `backend/src/routes/__tests__/lore.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/routes/__tests__/lore.test.ts -t "updates one lore card by id|deletes one lore card by id|rejects invalid lore edit payloads|returns 404 for missing lore cards"`
- **Committed in:** `b3783ea`

**2. [Rule 3 - Blocking] Frontend validation leg had to run from `frontend/` workdir**
- **Found during:** Plan-level verification
- **Issue:** The `27-VALIDATION.md` quick-run frontend command failed from repo root because Vitest alias resolution for `@/` imports depends on the frontend working directory.
- **Fix:** Re-ran the same targeted frontend suite from `R:\\Projects\\WorldForge\\frontend`, matching the phase research note.
- **Files modified:** None
- **Verification:** `npx vitest run lib/__tests__/api.test.ts components/world-review/__tests__/lore-section.test.tsx` (workdir `frontend`)
- **Committed in:** Not applicable

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were execution-environment corrections required to complete validation. No product scope changed.

## Issues Encountered

- The phase validation quick-run command for frontend tests was not portable from repo root; rerunning from `frontend/` resolved it cleanly.
- `requirements mark-complete` could not update `REQUIREMENTS.md` because `P27-01` through `P27-05` are not present as requirement ids in the current traceability file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend lore mutation contract is ready for Plan 27-02 UI wiring.
- No known blockers remain for frontend edit/delete controls or later smoke verification.

## Self-Check: PASSED

- Found summary artifact at `.planning/phases/27-lore-card-editing-and-deletion/27-01-SUMMARY.md`.
- Verified task commits `b3783ea` and `e945d37` exist in git history.

---
*Phase: 27-lore-card-editing-and-deletion*
*Completed: 2026-03-31*
