---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
reviewed: 2026-04-30T14:58:56Z
depth: focused-final
files_reviewed: 13
files_reviewed_list:
  - backend/src/routes/schemas.ts
  - backend/src/routes/worldgen.ts
  - backend/src/routes/__tests__/worldgen.test.ts
  - backend/src/worldgen/scaffold-steps/npcs-step.ts
  - backend/src/worldgen/scaffold-generator.ts
  - backend/src/worldgen/scaffold-saver.ts
  - frontend/lib/api-types.ts
  - frontend/app/(non-game)/campaign/[id]/review/page.tsx
  - frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx
  - frontend/components/world-review/locations-section.tsx
  - frontend/components/world-review/__tests__/locations-section.test.tsx
  - frontend/components/world-review/npcs-section.tsx
  - frontend/components/world-review/__tests__/npcs-section.test.tsx
findings:
  critical: 0
  high: 0
  medium: 0
  low: 0
  total: 0
status: clean
---

# Phase 75: Final Focused Re-Review

**Reviewed:** 2026-04-30T14:58:56Z
**Depth:** focused-final
**Files Reviewed:** 13
**Status:** clean

## Summary

Final focused re-review covered only the Phase 75 review-fix area for HI-RR-01 and ME-RR-01. The active World Review NPC regeneration path now carries full `ScaffoldLocation[]` hierarchy into the backend route and `generateNpcsStep`, and the location kind selector no longer offers a parentless persistent-sublocation state when no macro parent exists.

No actionable findings.

## HI-01 / HI-RR-01 Verdict

**Verdict:** Fixed.

Evidence:

- `frontend/app/(non-game)/campaign/[id]/review/page.tsx:96-112` builds the NPC regenerate request with `locations: scaffold.locations` while preserving `locationNames` for existing flat-name consumers.
- `frontend/lib/api-types.ts:256-260` models the NPC regenerate request with full `locations: ScaffoldLocation[]`.
- `backend/src/routes/schemas.ts:749-783` accepts full scaffold location objects for `section: "npcs"`.
- `backend/src/routes/worldgen.ts:674-677` passes `result.data.locations` into `generateNpcsStep` when present, so the World Review route no longer strips hierarchy to flat names.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts:140-179`, `416-429`, `500-516`, and `570-621` build a kind-aware catalog, separate macro `locationName` values from scene values, and normalize broad sublocation placement to its macro parent plus scoped scene.
- `backend/src/worldgen/scaffold-generator.ts:357-360` also passes full locations in the primary worldgen path.
- `backend/src/routes/__tests__/worldgen.test.ts:2786-2820` verifies route wiring passes full locations to `generateNpcsStep`.
- `frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx:134-206` verifies the page sends macro and `persistent_sublocation` objects during NPC regeneration.

## ME-01 / ME-RR-01 Verdict

**Verdict:** Fixed.

Evidence:

- `frontend/components/world-review/locations-section.tsx:154-160` builds parent options from other macro locations only.
- `frontend/components/world-review/locations-section.tsx:171-199` only renders `Persistent sublocation` in the Kind selector when at least one macro parent is available.
- `frontend/components/world-review/locations-section.tsx:207-218` converts `None` back to `macro` with `parentLocationName: null`.
- `frontend/components/world-review/__tests__/locations-section.test.tsx:112-170` verifies sublocation parents exclude other sublocations, `None` becomes macro, and a single-location scaffold does not offer `Persistent sublocation`.

## Remaining / New Findings

No actionable findings.

## Verification

- `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts` -- passed, 117 tests.
- `npm --prefix frontend run test -- run 'app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx' components/world-review/__tests__/locations-section.test.tsx components/world-review/__tests__/npcs-section.test.tsx` -- passed, 21 tests.

---

_Reviewed: 2026-04-30T14:58:56Z_
_Reviewer: Codex (gsd-code-reviewer)_
