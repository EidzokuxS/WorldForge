# 81-06 SUMMARY: Integration Verification And Fresh-Campaign Live Playability

## Status

Complete: 2026-05-04.

## What Changed

- Closed Phase 81 with a fresh live campaign instead of reused Naruto/JJK/GDKX fixtures.
- Verified opening plus 13 player turns through the Phase 81 loop.
- Fixed six live gameplay/runtime defects found during the gate:
  - GM Read evidence-only ref typo from the model no longer kills the turn; invalid evidence refs are sanitized after generation while actor/focal/target refs still fail closed.
  - Tool-step revision generation failures no longer crash the whole turn; the affected step becomes skipped with an explicit validation/error reason.
  - Final narration is now told that the player action is an attempted request, not authoritative world state, so unsupported claims such as pocketed keys or items are not narrated as true without settled packet evidence.
  - Player-turn durable `log_event` calls can no longer persist unsupported possession/access/item-use claims as committed world truth.
  - Player-turn `add_tag`/`remove_tag` calls can no longer persist unsupported possession/access/item-use/completed-movement claims such as `vault-unlocked`.
  - GM Read validation now accepts typed aliases for known actor/current-location/current-scene refs such as `actor:<id>` and `location:<id>` while still rejecting hidden/background/invented refs.
- Confirmed the player-facing loader now tracks Phase 81 stages without adding duration-based turn timeouts.

## Live Campaign

- Campaign id: `dcd3dd98-6bee-426e-ae49-a178c4b9082f`
- Campaign name: `Mossglass Live Gate 81 20260504-223854`
- Player: `Iria Vale` (`608545a0-cc98-45bc-869d-aa699d01a1b5`)
- Starting location: `The Merchant's Ledger Post` (`2438a39b-fe85-4358-b316-41427d0fb56b`)
- Final checked location: `The Brass Citadel` (`511fe972-f9e4-47c2-9325-53f6b8997de4`)
- Screenshot evidence: `output/playwright/phase-81-live-gate-after-10-turns.png`

## Live Gate Result

The campaign reached opening plus 13 player turns. Coverage included direct narration, clarification/refusal, roll-oracle path, single-tool and multi-step mutation paths, revised/skipped-step handling, stage streaming, DB state deltas, and visible-output leak scans.

One turn before the final narrator-guard fix incorrectly accepted the player's unsupported claim that she had a registry token. A later verifier then found a stronger blocker: the post-fix master-key negative turn denied the key in narration, but a durable `log_event` still wrote a false location recent event about using the Registry Vault master key. A second verifier found the same residue class in `players.tags` as `vault-unlocked`. The fixes added player-turn guards for durable logs and access/possession tags, removed the pre-fix false committed rows and tag residue from this test campaign's SQLite/LanceDB stores and turn-boundary snapshot, and reran master-key negative actions. The final successful rerun denied the key, made no inventory/location change, recorded only a `scene_local` failed-attempt beat, and wrote no new key/token/unlock committed event.

## Files Changed During 81-06

- `backend/src/engine/gm-turn-read.ts`
- `backend/src/engine/gm-tool-step.ts`
- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/tool-execution-context.ts`
- `backend/src/engine/scene-plan-validator.ts`
- `backend/src/engine/__tests__/gm-turn-read.test.ts`
- `backend/src/engine/__tests__/gm-tool-step.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.test.ts`

## Verification

- `npm --prefix backend run typecheck` passed after the final 81-06 fixes.
- `npm --prefix backend exec vitest run src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts` passed: 7 files / 172 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-turn-read.test.ts` passed: 7 files / 127 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/scene-plan-validator.test.ts` passed: 8 files / 150 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts` passed: 5 files / 154 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-tool-step.test.ts` passed: 2 files / 22 tests after the typed-ref and tag-guard fixes.
- `npm --prefix backend exec vitest run src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/scene-plan-validator.test.ts` passed: 2 files / 34 tests after the tag-guard fix.
- Earlier 81-05 verification remains green: backend packet/prompt/visible-guard suite, turn/narrator suite, backend typecheck, frontend typecheck, and frontend stage-copy suite.
- `git diff --check` passed on Phase 81 touched code and planning docs, with only LF/CRLF warnings.

## Honest Residual Risk

- This proves the Phase 81 orchestration loop is playable across one fresh campaign, not that all future gameplay quality issues are gone.
- The live campaign used during the gate contains one pre-fix assistant chat line with an unsupported registry-token claim. The false committed event rows and `vault-unlocked` tag residue were removed from the test campaign stores, but the old chat line remains as evidence in conversation history. A fresh campaign is cleaner for manual UAT.
- Full-regression backend Vitest was not rerun after the final live fix because the focused suites cover the modified Phase 81 seams and full suites had already been exercised during 81-05/81-06 work.
