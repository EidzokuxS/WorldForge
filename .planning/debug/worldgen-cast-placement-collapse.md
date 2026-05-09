---
status: fixing
trigger: "Generated JJK/Naruto Shibuya world still collapses NPCs into one broad macro scene after Phase 75 dense-location closure."
created: 2026-05-01
updated: 2026-05-01
---

# Debug Session: worldgen-cast-placement-collapse

## Current Focus

hypothesis: "The Phase 75 runtime/persistence chain is mostly wired, but scaffold generation still plans locations before it knows the final cast. NPC generation can legally leave multiple NPCs broad-only or under the same macro, and no later step expands the world around cast placement before save."
test: "Add a post-NPC cast-driven placement expansion step that can reuse or create scene locations, then regression-test dense Shibuya-style cast distribution."
expecting: "Generated scaffold has enough concrete scenes for dense macro casts; NPCs get broad macro + concrete scene placement before scaffold saver runs."
next_action: "Implement and test placement expansion as a GSD quick repair."

## Evidence

- timestamp: 2026-05-01T04:23:59Z
  finding: "Phase 75 verified resolver, persistence, People Here, and prompt assembly, but user live test campaign still has dense cast collapse."
  source: "User report: campaign ed3046d2-cd7c-4397-a18b-85cbd6fe67fe"
- timestamp: 2026-05-01T04:23:59Z
  finding: "`backend/src/worldgen/types.ts` only supports scaffold location kind `macro | persistent_sublocation`; runtime `ephemeral_scene` exists in DB/tool execution but generated scaffold persistence is persistent geography only."
  source: "Source scan"
- timestamp: 2026-05-01T04:23:59Z
  finding: "`generateWorldScaffold` runs locations before NPCs and previously had no cast-driven expansion pass between NPC generation and save/validation."
  source: "Source scan"

## Root Cause

Phase 75 closed the deterministic storage/runtime side: if explicit sublocations and scoped NPC placements exist, runtime respects them. It did not close the generative side: after the final cast is known, nothing reopens the location graph to create or reuse the concrete scenes each NPC logically needs. The generator can still produce a small up-front location set and broad-only NPC placements, so the backend faithfully persists an overcrowded world.

## Fix Direction

- Add a post-NPC, pre-validation/pre-save cast-driven placement expansion step.
- Let the LLM decide semantic placement and any needed persistent sublocations using the refined premise, artifact context, factions, locations, and final NPC cast.
- Keep backend authority deterministic: validate references, parent/scene consistency, broad-only overcrowding, and scene capacity; retry/repair if invalid.
- Keep runtime ephemeral locations owned by `reveal_location`; initial scaffold expansion creates persistent sublocations because scaffold saver currently persists generated geography.

## Verification

- Targeted unit tests for placement expansion repair/distribution.
- Existing scaffold resilience, NPC, and scaffold saver regressions.
- Backend typecheck.
- GitNexus staged change detection before commit.
