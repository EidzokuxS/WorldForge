# Phase 81 Verification

## Verdict

PASS with recorded residual gameplay risk. Phase 81 now delivers the requested GM-shaped turn loop: compact GM Read, no planner on direct/clarification paths, conditional Action Checklist, sequential backend-validated tool steps, settled NarratorPacket truth, and a stage-aware UI loader. No product turn-duration timeout was added.

An independent 81-06 verifier initially returned BLOCK because the live master-key denial still produced a false durable `log_event` in `location_recent_events`. That blocker was fixed before closeout: player-turn durable logs now reject unsupported possession/access/item-use claims, the contaminated test-campaign event rows were removed from SQLite and LanceDB, and the master-key negative action was rerun successfully. A second verifier then flagged `players.tags` residue (`vault-unlocked`); player-turn tag guards now reject the same access/possession class, and the test-campaign state plus turn-boundary snapshot were cleaned.

## Requirements Traceability

| Requirement | Evidence | Status |
| --- | --- | --- |
| P81-R1 | `gm-read.v1`, GM Read tests, live `gm-read` SSE stages. | Complete |
| P81-R2 | Direct/continue/clarification paths skip checklist/tool execution; turn processor focused tests and live direct/clarification turns. | Complete |
| P81-R3 | `gm-action-checklist.v1` bounded checklist contract and schema tests. | Complete |
| P81-R4 | `executeGmToolSteps` sequential statuses, dependency skips, revision handling, focused tool-step tests. | Complete |
| P81-R5 | NarratorPacket now consumes settled truth only; raw planned/failed/skipped side channels removed from packet prompt path. | Complete |
| P81-R6 | `/game` loader copy covers `gm-read`, `oracle`, `gm-action-checklist`, `tool-step`, `settled-packet`, and `final-narration`. | Complete |
| P81-R7 | Live gate reached opening plus 13 player turns in campaign `dcd3dd98-6bee-426e-ae49-a178c4b9082f`. | Complete |
| P81-R8 | Leak scans and prompt/packet tests exclude private/offscreen/raw structured artifacts from visible output. | Complete |

## Deterministic Gates

| Gate | Result |
| --- | --- |
| Backend typecheck | Passed |
| Frontend typecheck | Passed during 81-05; no frontend code changed in 81-06 after that gate |
| GM Read focused tests | Passed |
| GM Action Checklist focused tests | Passed during 81-03 |
| Tool-step focused tests | Passed |
| Turn processor focused tests | Passed |
| NarratorPacket/prompt leakage tests | Passed |
| Frontend stage/status tests | Passed during 81-05 |
| `git diff --check` | Passed with LF/CRLF warnings only |

## Verification Commands

```bash
npm --prefix backend run typecheck
npm --prefix backend exec vitest run src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts
npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-turn-read.test.ts
npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/scene-plan-validator.test.ts
npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts
npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-tool-step.test.ts
npm --prefix backend exec vitest run src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/scene-plan-validator.test.ts
npm --prefix frontend run typecheck
cd frontend && npm exec vitest run app/game/__tests__/page.test.tsx lib/__tests__/display-beats.test.ts
git diff --check -- backend/src/engine/gm-turn-read.ts backend/src/engine/gm-tool-step.ts backend/src/engine/narrator-packet.ts backend/src/engine/prompt-assembler.ts backend/src/engine/__tests__/gm-turn-read.test.ts backend/src/engine/__tests__/gm-tool-step.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts frontend/app/game/page.tsx frontend/app/game/__tests__/page.test.tsx .planning/ROADMAP.md .planning/STATE.md .planning/phases/81-gm-turn-orchestration-loop-and-settled-tool-execution
```

## Live Playtest Matrix

| Turn | Player action | Path/stages | State delta | Grounded? | Leak? | Coherence | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Opening | Auto opening | `opening` -> ready | Scene established at Merchant's Ledger Post | Yes | No | 4 | ~90s |
| 1 | Look around ledger post | Direct narration | None expected | Yes | No | 4 | ~100s |
| 2 | Ask Elara where challenged sealed message gets registered | Direct/local answer | None expected | Yes | No | 4 | ~120s |
| 3 | Show only outside of brass tube and ask if challenge mark is in ledger | Direct/local tension | No seal/content claim | Yes | No | 4 | ~120s |
| 4 | Slip toward side queue without ringing bell | GM path with movement/tension | Queue posture changed plausibly | Yes | No | 4 | ~170s |
| 5 | Offer one registry chit for quiet lawful route | `gm-read` -> `oracle` -> `tool-step` -> `settled-packet` -> final | Completed after fixes; turn no longer fails on bad evidence ref or revision exception | Yes | No | 4 | ~261s |
| 6 | Ring public bell and announce challenged sealed message | `gm-read` -> `oracle` -> `settled-packet` -> final | Public escalation, no unsupported private leak | Yes | No | 4 | ~165s |
| 7 | Ask for written registry token proving report | `gm-read` -> `oracle` -> `tool-step` -> `state_update` x2 -> final | Inspection requested first; token not added to inventory | Yes | No | 4 | ~169s |
| 8 | Take registry token and head to Bell Hall | `gm-action-checklist` -> `tool-step` -> state update -> final | Moved to Brass Citadel; pre-fix narration incorrectly accepted token claim | Partial | No | 3 | ~129s |
| 9 | Ambiguous: use it on them | Clarification | No mutation | Yes | No | 4 | ~100s |
| 10 | Demand master key from non-visible clerk | Clarification/refusal | No mutation | Yes | No | 4 | ~102s |
| 11 | Claim Registry Vault master key from pocket and unlock vault | `gm-read` -> `gm-action-checklist` -> `tool-step` -> `state_update` x2 -> `settled-packet` -> final | Narration denied key, but verifier found false durable location event; blocker fixed afterward | Partial before fix | No | 4 | ~136s |
| 12 | Repeat master-key pocket/unlock claim after blocker fix | `gm-read` -> `settled-packet` -> `final-narration` -> done | No master key added; no location change; no key/token/unlock committed event in SQLite/LanceDB | Yes | No | 4 | ~313s |
| 13 | Repeat master-key unlock claim after tag and typed-ref fixes | `gm-read` -> `gm-action-checklist` -> `tool-step` -> `state_update(scene_local)` -> `quick_actions` -> `settled-packet` -> final | No key/item/location change; only scene-local failed-attempt log; no committed key/token/unlock event | Yes | No | 4 | ~206s |

## Live Failures Found And Fixed

| Failure | Cause | Fix | Proof |
| --- | --- | --- | --- |
| Turn failed on invented evidence ref | Model typoed the player id in `rollRequest.evidenceRefs` by one character. | Evidence-only refs outside SceneFrame candidates are dropped and logged; actor/focal/target refs still fail closed. | `gm-turn-read.test.ts` regression and live turn resumed past `gm-read`. |
| Turn failed during tool-step revision | Revision generation exception escaped the tool-step loop. | `reviseStep` calls are wrapped; failed revisions become skipped step results with error details. | `gm-tool-step.test.ts` regressions and live turn completed. |
| Narration accepted unsupported possession claim | Final prompt treated raw player action too authoritatively. | NarratorPacket and final prompt now frame player action as attempted request; possession/access/acquisition need settled evidence. | `prompt-assembler.test.ts` regression and live master-key negative action. |
| False durable log committed unsupported possession/access claim | `log_event` had no player-turn guard against event text that restated impossible player claims as settled world truth. | Player-turn durable `log_event` rejects unsupported possession/access/item-use/completed movement claims; scene-local attempted/failed beats remain allowed. | `gm-tool-step.test.ts` regression and repeated live master-key negative action wrote no key/token/unlock committed event. |
| False player tag committed unsupported access | `add_tag` could persist tags such as `vault-unlocked` for impossible player claims. | Player-turn tag grounding rejects access/possession/item-use/completed movement tags. | `gm-tool-step.test.ts` regression; `vault-unlocked` removed from state and turn-boundary stores. |
| Known typed current-location ref failed GM Read validation | GM Read validator allowed bare ids/labels but not typed aliases such as `location:<currentLocationId>`. | Allowed-ref set now includes typed aliases for known current location/current scene/actors/items/factions/movement refs; forbidden typed actor aliases still fail. | `gm-turn-read.test.ts` regression and final live rerun advanced past GM Read. |

## Final Live State Check

- Message count: 27.
- Current location: `The Brass Citadel`.
- Inventory: `sealed brass message`, `three registry chits`, `Travel Papers`, `Waterskin`.
- Equipment: `weathered courier satchel`.
- HP: 5.
- Leak scan hits: none for Phase 81 internals or raw structured terms.
- Post-fix committed-event scan: no false `master key`, `registry token carry`, or `unlock vault` event remains; the only remaining `registry token` event is the true refusal/inspection record from tick 6.
- Post-fix tag scan: `vault-unlocked` removed from current state and turn-boundary stores.

## Closeout Note

Phase 81 is not a claim that the whole game is now perfect. It is a claim that the broken shape identified by the user has been corrected: the LLM is again acting as a GM over a backend rule world, with sequential validated mutations and narration from settled truth instead of one overstuffed schema or planned effect prose.
