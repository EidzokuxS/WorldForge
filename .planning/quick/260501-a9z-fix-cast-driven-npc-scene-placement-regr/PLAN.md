---
id: 260501-a9z
type: quick
status: executing
created: 2026-05-01
description: Fix cast-driven NPC scene placement regression in worldgen
---

# Quick Task: Fix cast-driven NPC scene placement regression in worldgen

## Objective

Fix the Phase 75 live regression where generated dense worlds can still place many NPCs into one broad macro location. This must be a GSD quick repair, not a new roadmap phase, because the issue is a live bug in already-claimed dense-location behavior.

## Scope

- Add a post-NPC placement expansion step in `backend/src/worldgen/scaffold-generator.ts`.
- Implement the step in `backend/src/worldgen/scaffold-steps/placement-expansion-step.ts`.
- Add focused regression tests proving dense macro casts are expanded into enough concrete scenes and broad-only placement is repaired.
- Update durable lessons for the routing/process mistake and the worldgen design mistake.

## Non-Goals

- Do not rewrite the full Phase 75 runtime chain.
- Do not make backend infer Naruto/JJK/canon semantics from strings.
- Do not persist initial generated `ephemeral_scene` rows in this quick task; generated scaffold persistence currently represents stable geography, while runtime ephemeral scenes remain created by `reveal_location`.
- Do not add another fixed location-count quota as the main fix.

## Tasks

- [x] Study GSD command/tool surface before choosing route.
- [x] Record lessons from user corrections.
- [x] Add cast-driven placement expansion after NPC generation.
- [x] Add regression coverage for dense macro cast distribution and no-op already-scoped placement.
- [x] Run focused backend tests and backend typecheck.
- [x] Run GitNexus staged change detection and prepare atomic commit.

## Acceptance Criteria

- Dense macro with multiple broad-only NPCs triggers placement expansion.
- Expansion can add source-appropriate persistent sublocations under existing macros.
- NPCs keep `locationName` as broad macro and get concrete `sceneLocationName` unless genuinely broad/roaming.
- Backend rejects invalid scene names, wrong parents, and overcrowded scenes before persistence.
- Existing Phase 75 persistence/runtime tests remain green.
