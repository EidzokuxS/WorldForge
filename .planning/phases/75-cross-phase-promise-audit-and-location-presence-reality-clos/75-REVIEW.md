---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
reviewed: 2026-04-30T14:33:10Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - "backend/src/engine/__tests__/prompt-assembler.test.ts"
  - "backend/src/engine/__tests__/scene-frame.test.ts"
  - "backend/src/engine/prompt-assembler.ts"
  - "backend/src/routes/__tests__/campaigns.inventory-authority.test.ts"
  - "backend/src/routes/__tests__/campaigns.test.ts"
  - "backend/src/routes/__tests__/character.test.ts"
  - "backend/src/routes/__tests__/schemas.test.ts"
  - "backend/src/routes/__tests__/worldgen.test.ts"
  - "backend/src/routes/character.ts"
  - "backend/src/routes/schemas.ts"
  - "backend/src/routes/worldgen.ts"
  - "backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts"
  - "backend/src/worldgen/__tests__/npcs-step.test.ts"
  - "backend/src/worldgen/__tests__/scaffold-resilience.test.ts"
  - "backend/src/worldgen/__tests__/scaffold-saver.test.ts"
  - "backend/src/worldgen/__tests__/starting-location.test.ts"
  - "backend/src/worldgen/scaffold-generator.ts"
  - "backend/src/worldgen/scaffold-saver.ts"
  - "backend/src/worldgen/scaffold-steps/locations-step.ts"
  - "backend/src/worldgen/scaffold-steps/npcs-step.ts"
  - "backend/src/worldgen/scaffold-steps/regen-helpers.ts"
  - "backend/src/worldgen/starting-location.ts"
  - "backend/src/worldgen/types.ts"
  - "frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx"
  - "frontend/app/game/__tests__/page.test.tsx"
  - "frontend/components/world-review/__tests__/locations-section.test.tsx"
  - "frontend/components/world-review/__tests__/npcs-section.test.tsx"
  - "frontend/components/world-review/locations-section.tsx"
  - "frontend/components/world-review/npcs-section.tsx"
  - "frontend/lib/__tests__/api.test.ts"
  - "frontend/lib/__tests__/world-data-helpers.test.ts"
  - "frontend/lib/api-types.ts"
  - "frontend/lib/world-data-helpers.ts"
  - "tasks/lessons.md"
findings:
  critical: 0
  high: 1
  medium: 1
  low: 0
  total: 2
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-04-30T14:33:10Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 75 closes most of the deterministic dense-location chain, and the new tests cover the happy path from scaffold through persistence, player start, `/world.currentScene`, prompt assembly, and frontend roster display.

Two actionable gaps remain. Both are in the same boundary Phase 75 was meant to harden: the system now has explicit macro/sublocation fields, but some generation and review surfaces still treat location names as one flat namespace. That can either persist a sublocation as an NPC's broad `currentLocationId` or let the review UI author hierarchy payloads that the backend must reject.

Context note: GitNexus MCP still reported the index one commit stale after `npx gitnexus analyze` said "Already up to date"; this review relied on direct source reads and line-level diffs for Phase 75.

## High Issues

### HI-01: NPC broad placement still accepts sublocation names from a flat namespace

**File:** `backend/src/worldgen/scaffold-generator.ts:311`
**Also:** `backend/src/worldgen/scaffold-steps/npcs-step.ts:343`, `backend/src/worldgen/scaffold-steps/npcs-step.ts:373`, `backend/src/worldgen/scaffold-steps/npcs-step.ts:468`, `backend/src/worldgen/scaffold-saver.ts:148`, `frontend/components/world-review/npcs-section.tsx:623`

**Issue:** After generating explicit `kind` and `parentLocationName`, the NPC step flattens locations to `locations.map((l) => l.name)` and asks the model to use one name list for both broad `locationName` and scoped `sceneLocationName`. `validateLocation` accepts any known name as a valid broad location and still falls back to the first location on an unknown broad value. The saver then treats any `locationName` as `currentLocationId` when `sceneLocationName` is omitted. The World Review NPC Location select also offers every name, including persistent sublocations.

This leaves an untested path where an NPC can be saved with `currentLocationId` equal to a persistent sublocation instead of the parent macro. Runtime presence requires actor broad id to match the player's broad id, so such an NPC can disappear from `/world.currentScene`, SceneFrame, and prompt context. Unknown broad names can still collapse to the first location during generation.

**Fix:** Carry kind-aware location metadata into NPC generation and review instead of `string[]` only. Validate `locationName` against macro locations only, validate `sceneLocationName` against the full namespace, and fail or deterministically resolve a sublocation broad value before persistence. Add tests for:

```typescript
// locationName points at a persistent_sublocation and sceneLocationName is null:
// should fail, or resolve broad=parent macro and scene=sublocation by explicit kind/parent fields.
```

Also update `NpcsSection` to receive location objects and render macro names in the Location select, all location names in the Scene select.

## Medium Issues

### ME-01: Location parent editor can author invalid sublocation parents

**File:** `frontend/components/world-review/locations-section.tsx:154`
**Also:** `frontend/components/world-review/locations-section.tsx:193`, `frontend/components/world-review/locations-section.tsx:211`, `backend/src/worldgen/scaffold-saver.ts:99`

**Issue:** The World Review parent selector builds options from every other location name and includes `None`. Selecting any parent also forces `kind: "persistent_sublocation"`. The backend only accepts a non-null parent that resolves to a macro row, so the UI can create `persistent_sublocation` rows with no parent or with another sublocation as parent. Those edits fail at save time instead of being prevented or surfaced locally.

**Fix:** Make the parent selector kind-aware. Only macro locations should be valid parents, and `None` should not be a valid saved state for `persistent_sublocation`. Add a component test for parent options with one macro and one existing sublocation, and either disable save or show validation before calling save-edits when a persistent sublocation has no macro parent.

---

_Reviewed: 2026-04-30T14:33:10Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
