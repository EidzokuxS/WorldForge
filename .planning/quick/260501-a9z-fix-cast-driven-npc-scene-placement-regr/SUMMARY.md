---
id: 260501-a9z
type: quick
status: complete
completed: 2026-05-01
---

# Summary: Fix cast-driven NPC scene placement regression in worldgen

## What Changed

- Added `expandNpcPlacementScenes` as a post-NPC, pre-validation scaffold step.
- The step detects dense macro overcrowding, broad-only NPC placement, invalid scene references, parent mismatches, and scene overcapacity.
- When placement is invalid, the model gets a precise placement-expansion contract and must return new/reused scene placement for every NPC.
- `generateWorldScaffold` now runs placement expansion after NPC generation and refreshes the location namespace before NPC/cross-stage validation and lore extraction.
- Added GSD debug and quick-task artifacts for the regression instead of adding another roadmap phase.

## Boundary

Backend still does not infer source/canon/location semantics from raw names. The LLM owns semantic placement and scene choice; backend only validates shape, references, containment, and overcrowding heuristics. Initial scaffold expansion creates persistent sublocations because scaffold persistence currently stores stable generated geography; runtime ephemeral scenes remain owned by `reveal_location`.

## Verification

- `npm exec vitest run src/worldgen/__tests__/placement-expansion-step.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts` from `R:\Projects\WorldForge\backend`
- `npm --prefix backend run typecheck`

## Notes

- A root-level Vitest attempt picked up stale `.claude/worktrees` tests and failed there; the backend-scoped rerun passed and is the valid mainline result.
