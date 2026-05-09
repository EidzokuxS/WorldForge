# Phase 82 Verification

Date: 2026-05-05
Verdict: PASS AFTER REOPEN

## Reopen Note

The original PASS below is historical evidence. Later live turns exposed additional Phase 82 closure gaps: world forecast draft/schema drift, first-call local scene label grounding misses, frontend optimistic narration surviving backend rollback, an internal finalization duration ceiling, and a deeper GM/Oracle framing bug where an unsupported player claim could be treated as a world-truth existence check.

The reopened closure register is `82-08-PHASE82-CLOSURE-GAP-REGISTER.md`. Phase 82 is marked PASS again because the 82-08 deterministic checks and fresh branchy live play gates passed without disabling GM tools, adding gameplay fallbacks, or imposing turn-duration ceilings.

## Closure Verification After Reopen

Core closure evidence:

- `player-action-epistemics` now gives GM Read and Action Checklist an explicit epistemic contract for unsupported access/possession proof claims.
- GM Read and Action Checklist reject Oracle/checklist framing that asks whether an unconfirmed claimed key, permit, pass, credential, authority, or route proof exists, is owned, fits, works, or grants access.
- Oracle prompt contract now forbids randomness from creating or confirming missing inventory, credentials, authority, routes, or world facts.
- The tool loop keeps `spawn_npc`, `spawn_item`, `reveal_location`, `move_to`, and related tools available. The fix is targeted GM intent and backend authority, not tool removal.
- `Player` / `actor:Player` are legal aliases for the current actor in GM Read and Action Checklist validation, preventing the live exploration rollback caused by a prompt/example alias mismatch.
- The branchy Playwright gate now restores a clean baseline checkpoint and checks structured world/log invariants, not only assistant prose.

Commands run after the root-cause fixes:

```bash
npm --prefix backend test -- --run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/oracle.test.ts
npm --prefix backend test -- --run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/oracle.test.ts src/engine/__tests__/world-forecast-builder.test.ts src/engine/__tests__/world-forecast.test.ts src/engine/__tests__/tool-execution-context.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/parse-helpers.test.ts
npm --prefix backend run typecheck
npm --prefix frontend test -- --run app/game/__tests__/page.test.tsx lib/__tests__/api.test.ts
npm --prefix frontend run typecheck
npx --prefix backend tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --types node --skipLibCheck e2e/84-rp-prompt-branchy-playtest.ts
```

Results:

- Backend GM/Oracle focused suite: PASS, 4 files / 47 tests.
- Backend expanded closure suite: PASS, 12 files / 223 tests.
- Backend typecheck: PASS.
- Frontend `/game` + API suite: PASS, 2 files / 83 tests.
- Frontend typecheck: PASS.
- Branchy Playwright script typecheck: PASS.
- GitNexus `detect_changes(scope: all)`: CRITICAL scope, expected for central turn-pipeline and `/game` stream changes. Follow-up impact checks found `runGmRead`, `runGmActionChecklist`, `runGmToolLoop`, and `GamePage` LOW upstream risk in the current index; `parseTurnSSE` remains HIGH because it directly feeds the player action/lookup/retry/continue/move stream path. Frontend stream tests and live Playwright gates cover this blast radius.

Fresh live evidence:

- Clean baseline checkpoint: `1777959085282-phase-84-branchy-rp-baseline-2026-05-05t`.
- False-claim focused run: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current/false-claim` — PASS, 2 turns, `hardFailureCount: 0`, `gateInvariantFailureCount: 0`.
- Exploration rerun after alias fix: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current2/exploration-rerun` — PASS, 2 turns, zero hard or gate invariant failures.
- Full branchy rerun: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current2/full-branchy-rerun` — PASS, 3 branches / 6 turns, `hardFailureCount: 0`, `gateInvariantFailureCount: 0`, average score 5.

Gameplay assertions from the final live run:

- Social branch continued the scene without schema rollback.
- Exploration branch legally created an anchored `ephemeral_scene` service passage when the player searched the pier perimeter.
- False-claim branch did not create a master key, sealed office, route, access tag, or move the player through a locked door. The GM treated the key as an unsupported claim and pushed social pressure instead.

Residual infrastructure note:

- The final branchy run recorded transient local dev-server connection reset/refused browser events during long Playwright execution. The run recovered, all turns completed, and hard/game-state gates remained zero. This is recorded as dev-server instability visibility, not a gameplay fallback or Phase 82 blocker.

## Historical Verification Before Reopen

## Automated Checks

Commands run:

```bash
npm --prefix backend test -- --run src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/transient-scene-lifecycle.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/scene-frame.test.ts
npm --prefix backend run typecheck
npm --prefix frontend test -- --run app/game/__tests__/page.test.tsx
npm --prefix frontend run typecheck
```

Results:

- Backend focused suite: PASS, 8 files / 120 tests.
- Backend typecheck: PASS.
- Frontend game page suite: PASS, 49 tests.
- Frontend typecheck: PASS.

## Live Gate

Campaign: `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`

Evidence files:

- `output/playwright/phase-82-live-gate/ui-turn-results.json`
- `output/playwright/phase-82-live-gate/phase-82-ui-turn-13-packet-present-actors-fix.png`
- `output/playwright/phase-82-live-gate/phase-82-ui-turn-14-concrete-log-event-effect.png`
- `output/playwright/phase-82-live-gate/phase-82-ui-turn-15-reveal-location-probe.png`

Live assertions:

- `/game` turn loop reached READY after each tested turn.
- No duration caps were introduced.
- No stuck `world is still settling` state remained after final world refresh.
- `Gondolier` was visible in frontend presence and model-facing SceneFrame.
- Final prompt `[PRESENT ACTORS]` listed `Dol the Docksman` and `Gondolier`, matching NarratorPacket visible actors.
- Successful `log_event` facts now retain concrete summaries in NarratorPacket effects.
- Chat history contains the player-facing route marker answer: three black bands, low lantern, hold at the fork.
- Targeted booth/alcove probe did not create a location when the GM judged no booth existed, proving no-spam behavior.

## Requirement Trace

- P82-R1 anchored ephemeral sublocations: PASS via `reveal_location` executor tests and transient lifecycle tests.
- P82-R2 support NPC placement: PASS via tool executor tests, `/world` route regression, SceneFrame regression, and live Gondolier gate.
- P82-R3 promotion/retirement: PASS via `promote_npc` tests and cleanup tests.
- P82-R4 structured observations/progress: PASS via tool-step and frontend stage-copy tests.
- P82-R5 semantic repeat budgets: PASS via `gm-tool-step` dynamic creation budget tests.
- P82-R6 no monolithic GM schema: PASS; changes stay in small tool/harness/prompt packet boundaries.
- P82-R7 live play proof: PASS with 15-turn Playwright campaign.
- P82-R8 no-spam dynamic creation: PASS through deterministic budgets plus live booth probe `newLocations: []`.

## Known Residual Risk

World forecast structured output failures still appear in live logs. They are non-blocking today because the turn path continues, but they remain a future structured-output/contract quality target.
