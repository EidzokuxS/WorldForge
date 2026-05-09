# Phase 84-03 Summary - RP Quality Gates and Branchy Playtests

Status: Implemented
Date: 2026-05-05

## Goal

Prove the prompt architecture in play, not only in prompt snapshots.

## Deterministic Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/world-forecast-builder.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts`
  - Passed: 19 files / 321 tests.
  - Note: this repo layout causes Vitest to discover matching tests in `.claude/worktrees`; those matched suites also passed.
- `npm --prefix backend run typecheck`
  - Passed.

## Live Branchy Gate

Campaign: `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`

Base checkpoint: `1778016934124-phase-84-post-contracts-2026-05-05t21-35`

Final passing artifacts:

- `output/playwright/phase-84-rp-prompts/2026-05-05T21-59-54-057Z-post-ref-repair-branchy/summary.json`
- Screenshots and SSE logs beside the summary.

Result:

- Branches: 3
- Turns: 6
- Hard failures: 0
- Browser errors: 0
- Average play-feel score: 5/5
- Passed: true

Branches:

- `social-direct`: two social pressure turns with Dol. Passed; no tools needed; NPC responded with concrete stakes and actionable canal signal information.
- `exploration-staging`: search/probe branch. Passed; the GM used `reveal_location` for `Route Clerk's Records Nook` when fiction supported a hidden local affordance, then preserved pressure instead of over-spawning cast.
- `false-claim-boundary`: unsupported master-key claim. Passed; the first turn no longer errors, does not spawn a key, does not move inside, does not reveal access, and narrates visible challenge/refusal.

## Live Failure Found and Fixed

The first post-contract live run found a real Phase 84 miss:

- Artifact: `output/playwright/phase-84-rp-prompts/2026-05-05T21-35-34-080Z-post-contracts-branchy/summary.json`
- Failure: false-claim turn 1 emitted `location:restricted-canal-office` as `actionInterpretation.targetRefs[0]` and `rollRequest.targetRef`.
- Backend correctly rejected it because the ref was outside SceneFrame candidates, but the player-facing turn failed.

Fix:

- GM Read prompt now says unlisted claimed objects, doors, offices, routes, rooms, credentials, keys, and locks are not refs.
- GM Read repair now gives the model a bounded frame-ref validation observation for unconfirmed access claims, requiring it to choose from listed candidates or omit the target.
- The access-claim detector now recognizes reversed/emphatic forms such as `master key I definitely have`.
- Hidden/background refs still fail closed; only outside-candidate refs for unconfirmed access claims get the semantic repair pass.

## Player-Feel Notes

- The social branch felt playable: Dol had a concrete motive, named practical risk, and returned control with a real decision.
- The exploration branch showed the intended dynamic affordance behavior: a hidden nook appeared only after a strong search beat, and it connected to visible pressure.
- The false-claim branch behaved like a GM rather than a backend grant: the door stayed shut, the claimed key stayed unconfirmed, Dol challenged the player, and the next action had useful options.
- No duration cap was used or added.
