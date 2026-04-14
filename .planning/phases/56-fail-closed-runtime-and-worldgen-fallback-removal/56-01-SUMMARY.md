# Phase 56 Summary

## Goal

Remove semantic fallback behavior so runtime and worldgen either use the intended evidence-backed path or fail closed with explicit absence/error.

## Completed

- Removed provider/model fallback config and failover wiring from gameplay, worldgen, and settings surfaces.
- Removed synthetic draft-only grounding generation from `parse-character`, `generate-character`, and worldgen NPC paths.
- Tightened grounding synthesis so `grounding/powerProfile` only materialize when real evidence or stored sources exist.
- Added load-time cleanup so previously persisted grounding without evidence sources is dropped instead of continuing to render synthetic canon/power data.
- Kept only honest retry/error helpers and explicit empty states.
- Late hardening on `2026-04-14` closed the intended replacement path instead of reopening semantic fallbacks:
  - known-IP key worldgen NPCs now run per-character canon research before persistence,
  - the repair path now tolerates loose/nested model payloads and retries against the remaining schema failures,
  - live worldgen/research generation calls no longer carry hardcoded `maxOutputTokens` magic numbers.

## Key Code Paths

- [character.ts](/R:/Projects/WorldForge/backend/src/routes/character.ts)
- [grounded-character-profile.ts](/R:/Projects/WorldForge/backend/src/character/grounded-character-profile.ts)
- [archetype-researcher.ts](/R:/Projects/WorldForge/backend/src/character/archetype-researcher.ts)
- [known-ip-worldgen-research.ts](/R:/Projects/WorldForge/backend/src/character/known-ip-worldgen-research.ts)
- [npcs-step.ts](/R:/Projects/WorldForge/backend/src/worldgen/scaffold-steps/npcs-step.ts)
- [ip-researcher.ts](/R:/Projects/WorldForge/backend/src/worldgen/ip-researcher.ts)
- [seed-suggester.ts](/R:/Projects/WorldForge/backend/src/worldgen/seed-suggester.ts)
- [worldbook-importer.ts](/R:/Projects/WorldForge/backend/src/worldgen/worldbook-importer.ts)
- [manager.ts](/R:/Projects/WorldForge/backend/src/settings/manager.ts)
- [chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts)
- [worldgen.ts](/R:/Projects/WorldForge/backend/src/routes/worldgen.ts)

## Outcome

If the system has no real grounding evidence, it now returns no grounding instead of synthetic surrogate content. If provider or research paths fail, they fail closed instead of silently switching to backup semantic behavior.

For key known-IP worldgen NPCs, that no longer means “empty forever”: the runtime now uses explicit per-character canon research to populate inspectable grounding, continuity, and power data, while still refusing to fabricate surrogate content if the evidence lane fails.
