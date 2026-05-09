---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
reviewed: 2026-04-30T14:49:53Z
depth: focused-rerun
status: issues_found
files_reviewed: 13
files_reviewed_list:
  - backend/src/worldgen/scaffold-steps/npcs-step.ts
  - backend/src/worldgen/scaffold-generator.ts
  - backend/src/worldgen/scaffold-saver.ts
  - backend/src/worldgen/__tests__/npcs-step.test.ts
  - backend/src/worldgen/__tests__/scaffold-saver.test.ts
  - backend/src/worldgen/__tests__/scaffold-resilience.test.ts
  - frontend/components/world-review/npcs-section.tsx
  - frontend/components/world-review/locations-section.tsx
  - frontend/components/world-review/__tests__/npcs-section.test.tsx
  - frontend/components/world-review/__tests__/locations-section.test.tsx
  - frontend/app/(non-game)/campaign/[id]/review/page.tsx
  - backend/src/routes/worldgen.ts
  - frontend/lib/world-data-helpers.ts
findings:
  critical: 0
  high: 1
  medium: 1
  low: 0
  total: 2
---

# Phase 75: Focused Re-Review

**Reviewed:** 2026-04-30T14:49:53Z
**Status:** issues_found

## Summary

The main scaffold generation path and save-edits persistence path now handle macro versus `persistent_sublocation` placement correctly. The review fixes also improved the World Review NPC and location selectors for normal dense-location editing.

Two actionable gaps remain:

- World Review NPC regeneration still sends only flat `locationNames`, so regenerated NPC prompts can still treat sublocations as valid broad locations.
- The location kind selector can still create a `persistent_sublocation` with no macro parent when no parent option exists.

Focused tests pass, but neither remaining gap is covered by the current tests:

- `npm --prefix backend run test -- src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts` — passed, 72 tests.
- `npm --prefix frontend run test -- run components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/locations-section.test.tsx` — passed, 16 tests.

## HI-01 Verdict

**Verdict:** Partially fixed.

Fixed in the primary worldgen pipeline: `generateWorldScaffold` now passes full `ScaffoldLocation[]` into `generateNpcsStep`, and `generateNpcsStep` builds a kind-aware catalog that separates macro `locationName` values from full scene values. Broad-only sublocation placement is normalized to parent macro plus scoped scene when hierarchy metadata is present.

Fixed at persistence: `saveScaffoldToDb` resolves broad-only sublocation NPC placement to parent macro `currentLocationId` plus sublocation `currentSceneLocationId`, and rejects conflicting explicit broad/scene combinations.

Not fixed for World Review NPC regeneration: the page and API route still pass only `locationNames` into `generateNpcsStep`, which makes every name look like `macro` inside `buildLocationCatalog`.

## ME-01 Verdict

**Verdict:** Partially fixed.

Fixed for the parent dropdown: it now offers macro parent options only, and selecting `None` converts the row back to `macro`.

Not fully fixed for the kind dropdown: selecting `Persistent sublocation` can still set `parentLocationName` to `null` when `parentOptions` is empty, creating a state that `saveScaffoldToDb` must reject.

## New Findings

### HI-RR-01: NPC regeneration still strips location hierarchy before calling `generateNpcsStep`

**Severity:** High

**File:** `frontend/app/(non-game)/campaign/[id]/review/page.tsx:111`

**Also:** `backend/src/routes/worldgen.ts:675`, `backend/src/worldgen/scaffold-steps/npcs-step.ts:145-149`

**Issue:** World Review NPC regeneration still sends `{ locationNames }` instead of full location objects. The backend route then calls `generateNpcsStep(..., result.data.locationNames, ...)`, so `buildLocationCatalog` treats each string as `kind: "macro"`. That bypasses the Phase 75 fix for regenerated NPCs: sublocations re-enter the prompt as valid broad `locationName` values, and generated broad/scene combinations can become invalid when later saved against the real location hierarchy.

**Fix:** Extend the NPC regenerate request/schema/type to accept full `ScaffoldLocation[]` for the NPC section, send `scaffold.locations` from the review page, and pass those objects through to `generateNpcsStep`. Keep deriving flat `locationNames` only for faction territory prompts. Add a route/page test with one macro and one `persistent_sublocation` proving regenerated NPC prompts list only macros for broad placement and all locations for scene placement.

### ME-RR-01: Kind selector can still author parentless persistent sublocations

**Severity:** Medium

**File:** `frontend/components/world-review/locations-section.tsx:182`

**Also:** `frontend/components/world-review/locations-section.tsx:195`, `frontend/components/world-review/locations-section.tsx:216`, `backend/src/worldgen/scaffold-saver.ts:99-103`

**Issue:** When a location has no available macro parent, the Kind selector still allows `Persistent sublocation`. Its change handler writes `parentLocationName: parentOptions[0] ?? null`, so this creates `{ kind: "persistent_sublocation", parentLocationName: null }`. The Parent selector is disabled in that same state, leaving Save to fail in the backend instead of preventing the invalid edit.

**Fix:** Disable or hide the `Persistent sublocation` option when `parentOptions.length === 0`, or keep the row as `macro` and surface local validation. Add a component test for a single-location scaffold where selecting `Persistent sublocation` is impossible or does not produce a parentless sublocation.

---

_Reviewed: 2026-04-30T14:49:53Z_
_Reviewer: Codex (gsd-code-reviewer)_
