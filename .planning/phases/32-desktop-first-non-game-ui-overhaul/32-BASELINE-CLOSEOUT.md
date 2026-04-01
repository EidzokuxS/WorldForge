# Phase 32 Baseline Closeout

Generated: 2026-04-01T19:23:30+03:00

## Commands Run

1. `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts`
2. `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts`
3. `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts`
4. `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/state-snapshot.test.ts`
5. `npm --prefix backend exec vitest run src/routes/__tests__/schemas.test.ts src/character/__tests__/persona-templates.test.ts src/character/__tests__/loadout-deriver.test.ts src/character/__tests__/prompt-contract.test.ts src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts`
6. `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts lib/__tests__/world-data-helpers.test.ts app/character-creation/__tests__/page.test.tsx app/campaign/[id]/character/__tests__/page.test.tsx app/world-review/__tests__/page.test.tsx components/character-creation/__tests__/character-card.test.tsx components/world-review/__tests__/npcs-section.test.tsx`

## Results

- Command 1: PASS. `prompt-assembler` and `turn-processor` passed with 36/36 tests green.
- Command 2: PASS. `npc-agent` and `npc-offscreen` passed with 14/14 tests green.
- Command 3: PASS. `tool-executor` passed with 26/26 tests green.
- Command 4: PASS. `reflection-agent`, `reflection-progression`, and `state-snapshot` passed with 35/35 tests green.
- Command 5: PASS. `schemas`, `persona-templates`, `loadout-deriver`, `prompt-contract`, `starting-location`, `character`, `campaigns`, and `prompt-assembler` passed with 243/243 tests green.
- Command 6: PASS. `api`, `world-data-helpers`, `character-creation`, `campaign/[id]/character`, `world-review`, `character-card`, and `npcs-section` passed with 52/52 tests green through the official repo-root `npm --prefix frontend exec vitest run ...` path.

Re-verified seams:

- Canonical runtime readers: prompt assembly, turn processing, NPC agent prompts, and NPC off-screen simulation passed on the current worktree.
- Mutation adapters: tool execution plus snapshot capture/restore passed on the canonical payload shape.
- Campaign/world payloads: the targeted `campaigns` suite is green, including the `GET /:id/world` seam.
- Character draft editor: backend route coverage plus the canonical and legacy frontend character page suites are green.
- NPC review editor: the shared helper suite, legacy review page suite, and NPC editor component suite are green.
- Start/loadout/template backend seams: schema, persona-template, loadout, prompt-contract, starting-location, and route-level start-condition coverage are green.
- Current character/review page seams: the targeted React Testing Library suites now mount and pass through the official repo-root frontend command path.

## Blocking Issues

- None.
- Rule 3 auto-fix applied during re-evaluation: repo-root `npm --prefix frontend exec vitest run ...` was still resolving [`vitest.config.ts`](R:/Projects/WorldForge/vitest.config.ts) without a frontend `jsdom` environment, so frontend page/component suites were falsely failing with `document is not defined`. The root Vitest config plus new [`vitest.setup.ts`](R:/Projects/WorldForge/vitest.setup.ts) now give frontend suites the same DOM/setup behavior as frontend-local runs.

## Status

Status: GO

This closeout supersedes the earlier 2026-04-01 Wave 0 `NO-GO` record.
Phase 32 route-group adoption, layout moves, and non-game shell work may proceed from `32-01` on this worktree baseline.
Phase 33 browser E2E remains out of scope for Phase 32.
