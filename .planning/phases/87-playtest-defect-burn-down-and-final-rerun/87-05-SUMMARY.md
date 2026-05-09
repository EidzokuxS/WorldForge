# Phase 87-05 Summary: Combat Pressure and Session Language

## Scope

Burned down `P86-F005` and `P86-F006` at deterministic prompt/runtime boundaries without disabling combat, narration, tools, or multilingual world content.

## What Changed

- Added `session-language.ts` as a shared session response language helper.
  - Explicit player/campaign language instructions win.
  - Otherwise current player action language wins over unrelated recent chat/operator locale.
  - Campaign premise/name are fallback inference inputs.
  - Default remains English when no strong language signal exists.
- Added a `SESSION RESPONSE LANGUAGE` contract to GM Read and final-visible storyteller prompts.
  - GM Read free-text fields are pinned to the session language.
  - Final narrator system and prompt both receive the same language contract.
  - Proper nouns, source terms, character names, and franchise terminology are preserved as written.
- Added `isCombatPressureAction` without broadening the older `isHostileCombatAction` helper used by NPC/internal combat tooling.
  - Combat pressure now includes explicit attacks, defensive posture, threat probing, risky environmental moves, violence aftermath, and power-gap questions.
  - GM Read receives a combat-pressure notes block when the current action matches those surfaces.
  - GM Read contract now tells the model to adjudicate clear combat pressure paths instead of asking backend-style specificity questions when SceneFrame already provides a visible target/threat/pressure.

## Files Changed

- `backend/src/engine/session-language.ts`
- `backend/src/engine/combat-envelope.ts`
- `backend/src/engine/gm-turn-read.ts`
- `backend/src/engine/prompt-contracts.ts`
- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/__tests__/session-language.test.ts`
- `backend/src/engine/__tests__/combat-envelope.test.ts`
- `backend/src/engine/__tests__/gm-turn-read.test.ts`
- `backend/src/engine/__tests__/storyteller-contract.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.test.ts`

## Verification

- `npm exec vitest run src/engine/__tests__/session-language.test.ts src/engine/__tests__/combat-envelope.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts`
  - Passed: 5 files / 78 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check -- backend/src/engine/session-language.ts backend/src/engine/combat-envelope.ts backend/src/engine/gm-turn-read.ts backend/src/engine/prompt-contracts.ts backend/src/engine/storyteller-contract.ts backend/src/engine/prompt-assembler.ts backend/src/engine/__tests__/session-language.test.ts backend/src/engine/__tests__/combat-envelope.test.ts backend/src/engine/__tests__/gm-turn-read.test.ts backend/src/engine/__tests__/storyteller-contract.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts`
  - Passed, with line-ending warnings only.

## Remaining

`P86-F005` and `P86-F006` remain focused-rerun pending until Phase 87 live rerun evidence proves the behavior under real MIMO Pro 2.5 turns.
