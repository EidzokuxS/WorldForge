# 81-05 SUMMARY: Settled Packet And Narration Handoff

## Status

Complete: 2026-05-04.

## What Changed

- `NarratorPacket` is now decoupled from `ScenePlan`, `ExecutedScenePlanActionResult`, and `gm-beat-plan` projection types.
- Final narration with a `NarratorPacket` no longer receives raw `sceneAssembly.sceneEffects` or `playerPerceivableConsequences`; it receives `SETTLED PACKET EFFECTS` derived from packet-settled facts only.
- Packet formatting omits failed/skipped/unreferenced effect prose even when a caller supplies those sentinels in canonical packet candidates.
- Phase 81 live turn progress emits `tool-step` and `settled-packet` for the new loop, and `/game` maps `gm-read`, `oracle`, `gm-action-checklist`, `tool-step`, `settled-packet`, and `final-narration` to player-facing loader copy.

## Files Changed

- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/__tests__/narrator-packet.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.test.ts`
- `frontend/app/game/page.tsx`
- `frontend/app/game/__tests__/page.test.tsx`

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts` passed: 6 files / 113 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts` passed: 10 files / 263 tests.
- `npm --prefix backend run typecheck` passed.
- `npm --prefix frontend run typecheck` passed.
- From `frontend/`: `npm exec vitest run app/game/__tests__/page.test.tsx lib/__tests__/display-beats.test.ts` passed: 2 files / 59 tests.
- `git diff --check` passed on touched 81-05 files and planning docs, with only existing LF/CRLF warnings.

## Review Notes

The 81-05 explorer review identified the main leak surface as final narration receiving raw `SceneAssembly.sceneEffects` and `playerPerceivableConsequences` alongside the NarratorPacket. The patch makes the packet path packet-owned: planned, failed, skipped, private, or unreferenced prose cannot enter final narration through those side channels.

## Next

81-06 owns the fresh-campaign live playability gate: opening plus at least 10 live turns with the Phase 81 stage matrix, tool statuses, state deltas, and quality notes recorded in `81-VERIFICATION.md`.
