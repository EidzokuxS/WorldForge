# Phase 82-08: Closure Gap Register

Date: 2026-05-05
Status: verified_pending_commit

## Why Phase 82 Is Reopened

Phase 82 was marked verified too early. Later live turns proved the agentic GM tool loop existed, but Phase 82's real requirement is stronger:

> Gameplay works well, correctly, and as intended. GM tools remain available. Fixes must not hide broken mechanics through fallbacks, disabled tools, or arbitrary turn-duration ceilings.

## Gap Register

| ID | Gap | Status | Fix / evidence |
| --- | --- | --- | --- |
| 82-08-G1 | `world-forecast-builder` live outputs failed strict final schema before the turn continued. | fixed_locally | Added a builder-local draft schema/normalizer. Backend now injects ids, ticks, locality defaults, confidence, root metadata, and still rejects executable tool/action payloads before final strict parse. |
| 82-08-G2 | Forecast prompt contradicted storage schema by telling the model to include entry `campaignId`. | fixed_locally | Prompt now tells the model backend owns storage fields and gives compact non-executable forecast examples. |
| 82-08-G3 | First `reveal_location.connectedToName` could fail when the GM used the visible current scene/location name instead of `current_scene`. | fixed_locally | `SceneFrame` now carries current location/scene names, and player-turn tool context accepts those labels only for the current local scene/location. Remote labels remain illegal. |
| 82-08-G4 | After visible narration, an SSE `error` could leave frontend optimistic messages ahead of the backend rollback. | fixed_locally | `/game` action stream now treats SSE error as failure, restores authoritative `chatHistory` + `worldData` after accepted streams, clears buffered quick actions/oracle/travel state, and has a regression test. |
| 82-08-G5 | Rollback-critical finalization still had an internal duration ceiling. | fixed_locally | Removed `TURN_FINALIZATION_TIMEOUT_MS` and all `withTimeout` wrappers around local scene settlement/post-turn finalization. Legitimate long model work is waited on; errors still fail closed. |
| 82-08-G6 | `finalizing_turn` carried backend stage data but frontend collapsed it to generic finalizing. | fixed_locally | `parseTurnSSE` now passes the finalizing payload to `/game`; UI displays a real finalization status such as `Settling world simulation`. |
| 82-08-G7 | Need fresh live proof that forecast/schema noise is gone and dynamic scene/item/NPC tools behave naturally after fixes. | verified_live | Fresh Playwright live gates passed after the closure fixes. The exploration branch created `Salt-Brick Service Passage` as an anchored `ephemeral_scene` with parent/anchor, expiry tick, legal edge, and scene-local log. No tested branch required disabling `reveal_location`, `spawn_npc`, or `spawn_item`. |
| 82-08-G8 | Need branchy play-feel proof, not one golden path. | verified_live | Branchy Playwright run `root-cause-clean-live-current2/full-branchy-rerun` passed 3 branches / 6 turns with `hardFailureCount: 0`, `gateInvariantFailureCount: 0`, and average score 5. Branches covered social pressure, exploration/staging, and false-claim boundary behavior. |
| 82-08-G9 | GM/Oracle root cause: an unconfirmed player claim like "I already have the master key" could be reframed as an Oracle existence/ownership check. | fixed_and_verified | Added `player-action-epistemics` and prompt/validation contract changes so GM Read and Action Checklist treat claimed keys/permits/passes/authority as claims/bluffs/visible attempts. Oracle may judge social or visible uncertainty, but not whether the claimed proof exists, is owned, fits, or grants access. Regression tests cover bad existence Oracle questions and good social Oracle questions. |
| 82-08-G10 | The live branch gate could pass if prose looked safe while world/log state still gained illegal false-claim facts. | fixed_and_verified | `e2e/84-rp-prompt-branchy-playtest.ts` now restores a clean baseline checkpoint, asserts false-claim baseline invariants, checks structured world/log state, and reports `gateInvariantFailureCount`. The final branchy run passed with zero gate invariant failures. |
| 82-08-G11 | GM Read/Checklist validation rejected the stable `Player` alias even when the model-facing prompt/examples naturally used it for the current actor. | fixed_and_verified | Added `Player` and `actor:Player` as legal current-actor aliases in GM Read and Action Checklist allowed-ref sets. The previous exploration rollback no longer reproduces; deterministic alias regressions and live branchy rerun pass. |

## Non-Negotiables

- Do not remove `spawn_npc`, `spawn_item`, `reveal_location`, or other GM tools to hide misuse.
- Do not add turn-duration caps. If a stage takes time, the player-facing UI must show what stage is resolving.
- Do not turn the GM into one giant schema request. Keep the loop tool-backed and sequential: model requests a concrete tool, backend validates/mutates, observation returns to the GM.
- Do not claim Phase 82 closed until deterministic tests and fresh live play evidence both pass.

## Current Local Verification

- `npm --prefix backend test -- --run src/engine/__tests__/world-forecast-builder.test.ts src/engine/__tests__/tool-execution-context.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/gm-tool-loop.test.ts` — PASS, 5 files / 71 tests.
- `npm --prefix backend test -- --run src/engine/__tests__/turn-processor.test.ts` — PASS, 63 tests.
- `npm --prefix backend test -- --run src/engine/__tests__/world-forecast-builder.test.ts src/engine/__tests__/world-forecast.test.ts src/engine/__tests__/tool-execution-context.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/turn-processor.test.ts` — PASS, 7 files / 140 tests.
- `npm --prefix backend run typecheck` — PASS.
- `npm --prefix frontend test -- --run app/game/__tests__/page.test.tsx lib/__tests__/api.test.ts` — PASS, 83 tests.
- `npm --prefix frontend run typecheck` — PASS.
- `npm --prefix backend test -- --run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/oracle.test.ts` — PASS, 4 files / 47 tests.
- `npm --prefix backend test -- --run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/oracle.test.ts src/engine/__tests__/world-forecast-builder.test.ts src/engine/__tests__/world-forecast.test.ts src/engine/__tests__/tool-execution-context.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/parse-helpers.test.ts` — PASS, 12 files / 223 tests.
- `npx --prefix backend tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --types node --skipLibCheck e2e/84-rp-prompt-branchy-playtest.ts` — PASS.

## Current Live Verification

- Clean baseline checkpoint: `1777959085282-phase-84-branchy-rp-baseline-2026-05-05t`.
- False-claim focused run: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current/false-claim` — PASS, 2 turns, `hardFailureCount: 0`, `gateInvariantFailureCount: 0`.
- Exploration rerun after `Player` alias fix: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current2/exploration-rerun` — PASS, 2 turns, no hard or gate invariant failures.
- Full branchy rerun: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current2/full-branchy-rerun` — PASS, 3 branches / 6 turns, `hardFailureCount: 0`, `gateInvariantFailureCount: 0`, average score 5.
- False-claim branch result: no `Signal-House Master Key`, no `Sealed Signal-House Office`, no access-granting `reveal_location`/`move_to`/`spawn_item`; narration kept the door shut and challenged the claimed key as an unsupported claim.
- Exploration branch result: legal anchored ephemeral sublocation creation worked naturally when the player searched the pier perimeter.

## Residual Infrastructure Note

The final branchy Playwright summary recorded transient dev-server connection reset/refused browser events during long local testing, but the action flow recovered, all turns completed, and hard/game-state gates stayed at zero. This is not treated as a gameplay fallback or Phase 82 blocker, but it should remain visible if the local dev server reload instability recurs.

## Remaining Closure Work

- Commit the verified closure tree.

## GitNexus Change Detection

`detect_changes(scope: all)` reports `critical` scope because the closure touches the central turn pipeline and `/game` SSE surface: 44 changed symbols, 37 changed files, 50 affected processes.

Follow-up impact checks:

- `runGmRead`: LOW upstream risk in the current index.
- `runGmActionChecklist`: LOW upstream risk in the current index.
- `runGmToolLoop`: LOW upstream risk in the current index.
- `GamePage`: LOW upstream risk in the current index.
- `parseTurnSSE`: HIGH upstream risk because it directly feeds `submitAction`, `submitLookup`, `handleRetry`, and indirectly `handleContinueAction` / `handleMove`.

Mitigation evidence: backend expanded closure suite, frontend `/game` + API stream tests, frontend typecheck, and branchy live Playwright gate all passed after the changes.
