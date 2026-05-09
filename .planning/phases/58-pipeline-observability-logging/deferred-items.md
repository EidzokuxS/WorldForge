# Deferred Items — Phase 58

## Pre-existing test failures (not caused by Plan 58-01)

Discovered during Plan 58-01 full-suite regression run. All 9 failures reproduce on the pre-58-01 baseline (verified by `git stash` + rerun). They belong to earlier phases (Phase 57 power scaling, Phase 30 persona templates, Phase 34 worldgen) and are out of scope per the GSD scope boundary rule.

| File | Test | Phase Owner |
|------|------|-------------|
| engine/__tests__/npc-agent.test.ts | "builds NPC planning prompts from behavioral core and live dynamics for key characters" | 30/48 |
| engine/__tests__/npc-offscreen.test.ts | "uses a bounded richer identity slice instead of persona-plus-tags-only..." | 30/48 |
| engine/__tests__/reflection-agent.identity-boundaries.test.ts | "reflection-tools uses flat threshold" | 48 |
| engine/__tests__/turn-processor.inventory-authority.test.ts | "reaches the live storyteller transfer_item tool seam..." | 40 |
| routes/__tests__/persona-templates.test.ts | "applies a template to a player draft and returns richer draft data..." | 30 |
| routes/__tests__/persona-templates.test.ts | "does not erase sourceBundle or continuity when applying a template..." | 57 (sourceBundle removed) |
| routes/__tests__/worldgen.test.ts | "draft-backed NPC edit convergence preserves visible shallow edits..." | 34 |
| worldgen/__tests__/npcs-step.test.ts | "keeps world generation alive when the planning calls return fewer NPCs than requested" | 34 |
| worldgen/__tests__/scaffold-resilience.test.ts | "threads computed premiseDivergence through scaffold orchestration" | 25/34 |

## Pre-existing backend typecheck errors

`npm --prefix backend run typecheck` also fails on the baseline (same errors before my changes). Related to Phase 57 `powerStats.tier` type coercion in `routes/schemas.ts` (lines 635, 804, 807) and `routes/worldgen.ts:108`. Out of scope for 58-01; should be addressed by a Phase 57 follow-up plan.
