# Phase 32 Baseline Closeout

Generated: 2026-04-01T19:00:18.6621015+03:00

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
- Command 4: FAIL. `reflection-agent` and `reflection-progression` passed, but `state-snapshot` failed 1/35 tests total.
- Command 5: FAIL. `schemas`, `persona-templates`, `loadout-deriver`, `prompt-contract`, `starting-location`, and `prompt-assembler` passed, but `campaigns` and `character` failed 5/243 tests total.
- Command 6: FAIL. `frontend/lib/api.test.ts` and `frontend/lib/world-data-helpers.test.ts` passed, but the page/component suites failed 27/52 tests total.

Re-verified seams:

- Canonical runtime readers: prompt assembly, turn processing, NPC agent prompts, and NPC off-screen simulation passed on the current worktree.
- Mutation adapters: tool execution still passed, but snapshot capture/restore is not fully closed out because the snapshot test is behind the canonical payload shape.
- Campaign/world payloads: the world route contract is not green because `GET /:id/world` currently fails in the targeted campaigns suite.
- Character draft editor: the backend and frontend helper suites are partially green, but the routed character page prerequisite is blocked by the frontend non-DOM test environment.
- NPC review editor: the shared world-data helper suite is green, but the review page and NPC editor component prerequisites are blocked by the same frontend non-DOM environment.
- Start/loadout/template backend seams: schema, template, loadout, prompt-contract, and starting-location unit coverage mostly passed, but route-level start-condition behavior is still red in `character.test.ts`.
- Current character/review page seams: legacy and canonical page/component tests are not re-verified because the frontend prerequisite command is failing before React Testing Library can mount those surfaces.

## Blocking Issues

- `backend/src/engine/__tests__/state-snapshot.test.ts` now expects the pre-canonical snapshot shape. `captureSnapshot > captures player state and tick from DB and config` fails because the implementation includes `playerCharacterRecord` and `playerDerivedTags` in the snapshot.
- `backend/src/routes/__tests__/campaigns.test.ts` has three `GET /:id/world` failures returning HTTP 500 instead of 200, so the current world-payload seam is not re-verified for active-campaign reads or active-state recovery.
- `backend/src/routes/__tests__/character.test.ts` has two failures in the Phase 30 start-condition seam: `save-character` does not reject the unknown location case as the test expects, and `resolve-starting-location` returns a response body that the test cannot parse.
- The frontend prerequisite suite is running in a non-DOM environment for React Testing Library. `app/character-creation`, `app/campaign/[id]/character`, `app/world-review`, `components/character-creation/character-card`, and `components/world-review/npcs-section` all fail with `document is not defined` or `userEvent.setup()` document preparation errors.

## Status

Status: NO-GO

Phase 32 route-group adoption, layout moves, and non-game shell work must not start until the baseline blockers above are resolved and the prerequisite bundle is rerun to green.
Phase 33 browser E2E remains out of scope for Phase 32.
