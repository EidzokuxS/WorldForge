# Task 180 - pristine r130 setup recheck

## Fixed contract and entry

This task ran one unchanged-source pristine lane to falsify the r129 setup-ingestion boundary. No product or test file was changed, and no provider/model/configuration, prompt, schema, runtime, persistence, mechanics, UI, or copy decision was made.

- Branch: `feat/revamp`
- Entry source and origin: `34c19cbcec40770b7af8daec3401bef042edde51`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r130`
- Frozen comparison: r129 was one canonical import followed by rendered `service_unavailable` / HTTP 503 after the local 90-second ingestion boundary. Its SQLite state remained `character_required` with zero characters, commands, turns, results, receipts, scenes, operations, attempts, and model stages. r117 had the same class of setup timeout and r118 subsequently completed setup, so this lane was the selected single falsifier; no causal provider claim is made.

Required input hashes were verified before setup:

- pristine state: `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`
- config: `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`
- Brina card: `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`

## r130 rendered journey

The canonical card was imported once and saved once. The first setup harness attached its Save listener after dispatch, so it reported a harness invariant failure even though authoritative state proved the Save had completed. That harness result was not treated as a product failure. A read-only reconciliation then confirmed one Brina character, zero turns before Begin, `integrity_check=ok`, and an empty foreign-key check. The continuation selected `lower-wards`, `Local`, `Already here`, and `Looking for work` once each, then pressed Begin once.

Opening completed on `turn-opening:60a0595457b51a7b24f59d40b09efdb396c612b4`; the rendered Play page reached a proper ready scene with enabled suggestions. Setup and Opening evidence is in `probes/setup-continuation-summary.json` and the opening screenshots under the r130 session root.

The journey then admitted 18 player-action turns and produced 18 proper-scene bindings. Action 1 naturally exercised the existing Narrator `covered_observation_count` recovery: attempt 1 was rejected, attempt 2 was accepted, and no third attempt occurred. Action 2 initially had a harness response-observation miss; `actions/action-002-reconciled.json` read the authoritative completed turn without another click. The corrected journey continued one rendered click at a time through action 18. The harness-only pre-reconciliation terminal and stdout are preserved as `r130-harness-ambiguous-terminal-before-reconcile.json` and `r130-harness-journey-stdout-before-reconcile.log`.

At action 18 the first genuine model-stage defect occurred and the lane was hard-stopped before any later action:

- choice: `choice_54d3ce78537233fc4eee4149`, `Talk to Dren Vask: ask about the red-marked households`
- turn: `turn-player-action:f310a7daea048bb4b46fd3efc8fb3a938253abbd`
- Game Master attempt 1: accepted, strict_object, 12,131 ms
- Actor Replanner attempt 1: interrupted, `model_contract_invalid`, schema invalid, tool-calls, 21,228 ms
- Actor Replanner attempt 2: interrupted, `model_contract_invalid`, schema invalid, tool-calls, 31,885 ms
- no third Actor attempt and no later player action

The authoritative turn row is completed and the same action's Narrator still has one accepted attempt and a proper scene, but the bounded Actor Replanner contract failure is the first genuine model-stage defect and remains the terminal boundary for this task. Raw provider bodies, candidate bytes, and the semantic reason for the Actor Replanner invalid proposals were not retained and remain unknown.

Final authoritative counts from `r130-terminal.json` and `actions/action-018-evidence.json`:

- 18 completed player-action turns, 18 proper scenes, and 18 unique action bindings
- 19 total turns including Opening
- 57 commands and 57 receipts
- 18 Narrator operations and 20 Narrator attempts
- 34 model-stage rows and 12 Actor jobs
- `worldVersion=31`, `runtimeRevision=352`, phase `ready`
- SQLite `integrity_check=ok`; `foreign_key_check` empty
- no later action, replay, Resume, Restore, late write, or duplicate settlement

Only the action-10 checkpoint was emitted before the hard stop (`completed=10`, `bound=10`, `worldVersion=23`, `runtimeRevision=212`, integrity ok, foreign-key check empty). Checkpoints 20/30/40/50/60 and same-page reload were not reached and are not claimed. The Task 179 single-quoted observation shape did not occur naturally; live Task 179 coverage is unavailable in this lane.

Because r130 setup and Opening succeeded, r129's setup timeout did not reproduce in this lane. This is a recheck result only; it does not prove a repair or identify a provider cause. The first genuine boundary is the action-18 Actor Replanner `model_contract_invalid` pair, which is outside Task 180's unchanged-source recheck scope.

## Cleanup and validation

Owned runtime roots were backend `42448`, frontend `65604`, and Chrome/CDP `60700`. Recorded descendants were `62232`, `35672`, `63856`, `74444`, `35872`, `53696`, `40756`, `74132`, and `2224`. The page was closed, the task-owned r130 browser profile was removed, and `cleanup-owned-processes-before.json` / `cleanup-owned-processes-after.json` record the ownership and independent absence checks. Ports 4160, 4161, and 4162 had no listeners after cleanup; the CDP endpoint and page were absent.

Protected files remained untouched and unstaged. Their final SHA-256 values matched entry:

- `AGENTS.md`: `0D75EDC72CC195E385ED5B9C98C616E82FDB3C13E210D0FEB94333E19A76D541`
- `CLAUDE.md`: `C6874175503F6890AF8CA2DB34EFF5630B8A513EDE95CEA3F76C43435925FCA6`

Only this note is a tracked Task 180 artifact. `git diff --check` passed, the staged-path review contained only this note, and note-only GitNexus `detect_changes` reported no production-flow change. No Task 179 static suites were rerun because the accepted source and entry identity were unchanged. The note commit was pushed and local `HEAD` was verified equal to `origin/feat/revamp`.

## Acceptance handoff

- Entry and protected state: exact source HEAD/origin and protected hashes above; frozen r128/r129 were not touched.
- Setup criterion: canonical hashes, one import, one Save, exact three opening selections, one Begin, SQLite and rendered Opening proof above.
- Endurance criterion: 18 unique proper-scene bindings were proven; the first genuine Actor Replanner model-contract boundary at action 18 stopped the lane, so 60/60 and reload are intentionally omitted.
- Recovery criterion: the existing Narrator recovery settled action 1 once; no Task 179 single-quoted case occurred.
- Persistence criterion: authoritative action-18 scene, commands, receipts, operations, attempts, and clean integrity/FK state were observed; no reload was authorized after the hard stop.
- Cleanup criterion: all listed owned PIDs, ports, CDP page/endpoint, and profile were independently absent.
- Next decision for Main: select and authorize the narrow repair for the action-18 Actor Replanner `model_contract_invalid` boundary; Task 180 does not diagnose or repair it.
