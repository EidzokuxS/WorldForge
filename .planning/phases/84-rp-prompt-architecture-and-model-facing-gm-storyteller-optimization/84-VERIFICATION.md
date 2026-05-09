# Phase 84 Verification

Status: PASS
Date: 2026-05-05

## Scope Verified

Phase 84 verifies that the current GM/storyteller prompt architecture is compact, role-specific, and playable:

- GM Read chooses one beat and one path from the current scene.
- Forecast pressure is advisory, observable, and not a script.
- Tool execution stays in the native GM tool loop instead of a second always-on planner.
- Final narration starts with visible change, not recap.
- False possession/access claims are treated as claims, bluffs, visible attempts, refusals, or requests for proof, not backend-granted truth.

## Commands

```powershell
npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/world-forecast-builder.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts
npm --prefix backend run typecheck
```

Result:

- Backend focused suite: PASS, 19 files / 321 tests.
- Backend typecheck: PASS.

## Live Playwright Gate

Artifact:

`output/playwright/phase-84-rp-prompts/2026-05-05T21-59-54-057Z-post-ref-repair-branchy/summary.json`

Result:

- `passed: true`
- `branchCount: 3`
- `turnCount: 6`
- `hardFailureCount: 0`
- `browserErrors: []`
- `averageScore: 5`

Acceptance evidence:

- Social/direct branch: playable NPC pressure and concrete next decision.
- Exploration branch: legitimate local dynamic location creation through `reveal_location`.
- False-claim branch: no key/item spawn, no access grant, no illegal movement/reveal, no empty assistant response, no SSE error.

## Regression Closed

Initial live run after prompt-contract changes failed:

`output/playwright/phase-84-rp-prompts/2026-05-05T21-35-34-080Z-post-contracts-branchy/summary.json`

Failure:

- False-claim turn 1 produced `location:restricted-canal-office` outside SceneFrame candidates.
- The player-facing turn got an SSE `error` and no narrative.

Corrective verification:

- Added deterministic regression in `gm-turn-read.test.ts`.
- Re-ran the branchy live gate after backend restart.
- The exact false-claim action now completes with a refusal/challenge beat and no illegal state tools.

## Residual Risk

- This phase improves the player-turn GM/storyteller path. It does not fully rewrite worldgen, character generation, or every legacy prompt surface.
- The live gate is branchy but still one campaign checkpoint, not a full cross-setting campaign batch. It is enough to close this prompt-contract implementation pass because it directly covers the current live failure mode plus social/exploration/tool-use play feel.
