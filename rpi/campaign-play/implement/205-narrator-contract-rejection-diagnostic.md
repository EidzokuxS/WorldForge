# Task 205: Narrator contract-rejection diagnostic

## Contract

The Campaign Play Narrator now emits one private `narrator.contract_rejected` event for each failed Narrator invocation. The event is observability-only: it does not alter prompt/schema generation, acceptance, recovery feedback, retry eligibility, deadlines, persistence, mechanics, or the player surface.

The event carries only existing correlation identifiers (`narrationId`, `campaignId`, and `turnId` when the immutable packet parses), `phase` (`generation`, `evidence`, or `semantic`), the bounded `CampaignPlayNarratorError` code, a bounded safe-generation code when available, the existing recovery diagnostic or `null`, and the existing typed `failedChecks` in original order or `[]`. It never carries packet/proposal/candidate prose, provider data, rejected error text, stack/cause, prompt bytes, tool arguments, or arbitrary object keys.

Phase mapping is fixed: safe-generation failures are `generation`; post-generation model-evidence mismatches are `evidence`; compile/proposal/actor-grounding `CampaignPlayNarratorError` failures are `semantic`. The original error object, recovery feedback, specialized diagnostics, and caller behavior remain unchanged. Successful narration emits no event.

## Frozen boundary and impact

Entry and origin were `d0e53c0ab23af807a57815f9efe926ffa7d8bc69`. Frozen r152 remains immutable: action 1 had two provider-return-shaped Narrator attempts with durable `narration_invalid`, no accepted artifact/proper scene, and mechanics/visibility settled once; raw candidate data is unavailable.

An exact-entry GitNexus shadow at `R:\Temp\worldforge-task205-shadow` was analyzed before editing. The nested `createCampaignPlayNarrator.narrate` closure was LOW (no indexed callers due closure resolution). The enclosing `createCampaignPlayNarrator` owner was HIGH (24 impacted symbols, 5 direct callers, 4 Campaign Play processes, 2 modules: Campaign Play and Engine). Main authorized this enclosing-owner mapping because the implementation is confined to the private Narrator diagnostic wrapper and its tests; no other production owner is changed.

## Implementation

`narrate` is wrapped by a private diagnostic boundary that parses only the immutable packet for safe correlation identifiers, catches the existing `CampaignPlayNarratorError`, classifies its phase from the existing cause/model-evidence/recovery fields, and emits exactly one allowlisted event before rethrowing the same error. Existing packet-validation and actor-scope warnings remain in place and are not forwarded as new recovery instructions.

No prompt or visible copy changed; humanizer/deslop review is not applicable. The approved scope is diagnostic-only.

## Validation

Implementation commit `a1c20e7f19715733a120466b6bd630c6758720c1` is pushed to `origin/feat/revamp` and local/origin are equal. The staged implementation contained only the Narrator source, focused tests, and this note. Exact-entry GitNexus impact reported the nested `createCampaignPlayNarrator.narrate` closure LOW and the enclosing `createCampaignPlayNarrator` HIGH (24 symbols, 5 direct callers, 4 Campaign Play processes, 2 modules); Main's disclosed enclosing-owner exception was recorded above. Staged `detect_changes` reported medium risk, the two Narrate flows, and no unrelated production path. The final implementation diff preserves the existing error/recovery behavior and adds only the private event boundary.

Static checks passed: Narrator focused suite 41/41; turn-runtime assertions 75/75 (the first process exited non-zero only after all assertions because of the known Vitest `onTaskUpdate` worker-shutdown timeout, then the single-thread clean rerun exited 0 with 75/75); Campaign Play application 15/15; backend typecheck; backend production build; `git diff --check`. No prompt or visible copy changed, so humanizer/deslop are not applicable. Protected `AGENTS.md` and `CLAUDE.md` remained the only unstaged paths.

Generated r153 session/world evidence is intentionally uncommitted. Canonical input hashes were verified before setup and remained unchanged: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The materialized r153 campaign database hash is `836A5C17A34584BFE5F35623E78519A84AB7C21F9E5007F4E096E50F20207CE2`; the session manifest hash is `EDB84A55A345B0F3B9E0104409E690D546D0EC5BAD888215E3D976DED3920595`; the retained backend log hash after shutdown is `311A3A2E32B178F21D2308CCBC1E7BD8D71534443438122295DFD8093F12AE3F`.

## Live r153 evidence

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r153` was materialized once for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` from the verified canonical template. One atomic Brina import/file assignment, one Save, the exact lower-wards / Local / Already here / Looking for work selections, and one Begin produced a ready Opening. Actions 1-16 each settled one durable turn and one unique proper scene/binding; action 17 mechanics also settled exactly once, but its Narrator operation failed and produced no proper scene. The lane froze at this first genuine product defect before action 18.

Checkpoint 10 (after player action 10): 11 turns/results including Opening, 36 commands/receipts, 10 narration operations, 13 Narrator attempts, 25 model stages, 5 actor jobs, `worldVersion=21`, `runtimeRevision=214`, `integrity_check=ok`, and empty `foreign_key_check`. Terminal read-only reconciliation after action 17 (and a five-second no-late-write read) was stable: 18 turns/results, 53 commands/receipts, 16 proper scenes, 17 narration operations, 22 Narrator attempts, 39 model stages, 9 actor jobs, `worldVersion=28`, `runtimeRevision=339`, `integrity_check=ok`, and empty `foreign_key_check`. No action 18 was submitted and no late scene/write appeared.

The first genuine defect boundary is turn `turn-player-action:f9f30fcf6888e8936e79423b2c3db420b9bbf6b8`, Narrator operation `narration-operation:bcad388eaca83baaa6973601c029fd9faa17a077`, narration `narration:9feaf4f8a77cdf7914ad69f2bf9f38441baa5471`, with Game Master stage `9dafc8c6a64aaabcf9ed8044252d0f82d970dc3f7f91b8f0eaa410838a5edf45` and Actor Replanner stage `actor-replan-stage:cd4d61dc050e9f61288087f22a6c8c0d` both accepted on attempt 1. Narrator attempts `narration-attempt:4ce2623d8c4aa073f2d2fcdcf255391cf61eecc4` and `narration-attempt:8bca029f150f3fcd5921b6ef266ab92002b3ef67` both ended `narration_invalid` with `schema_outcome=invalid`; no artifact or proper-scene row exists for the turn. Mechanics/turn/result persistence is complete (`stage=completed`, `error_code=null`, `resume_eligible=0`, `final_world_version=28`, terminal reason `action_resolved`), while the narration operation is `failed`, `current_attempt=2`, `error_code=narration_invalid`. Provider/candidate cause remains unknown and was not reconstructed.

Task 205's live event was observed naturally. On action 4, one `narrator.contract_rejected` event accompanied the existing packet-validation warning with `phase=semantic`, `errorCode=narration_invalid`, `safeGenerationCode=null`, `recoveryDiagnostic=narrator_packet_validation_mismatch`, and the ordered safe checks `covered_observation_count(actual=1, expected=2)` then `missing_expected_observation_indexes(indexes=[1])`; no raw observation/proposal/provider data was present in the event. At action 17, the two failed Narrator invocations each emitted exactly one event: attempt 1 emitted `phase=generation`, `errorCode=model_contract_failed`, `safeGenerationCode=schema_validation_failed`, `recoveryDiagnostic=narrator_generation_schema_mismatch`, `failedChecks=[{check:generation_schema_invalid}]`; attempt 2 emitted `phase=semantic`, `errorCode=narration_invalid`, `safeGenerationCode=null`, `recoveryDiagnostic=narrator_packet_validation_mismatch`, and only the same bounded observation-count/index checks. The event count and payloads were read from the retained backend log; existing warning/settlement diagnostics remained separate and unchanged.

Cleanup completed after evidence capture: the task page was closed; owned backend/frontend wrappers and listener processes on 4390/4391 were stopped and ports 4390/4391/4392 verified unbound; no task tab remained; no task-owned browser profile/helper remained. The r153 session/world evidence roots were preserved. The temporary exact-entry GitNexus shadow was removed after note validation.

## Acceptance handoff

- Private event contract: `narrator.ts` helper and Narrator focused tests cover generation, evidence, semantic, success silence, exactly-once emission beside specialized warnings, privacy exclusions, and preserved error/recovery identity.
- Phase mapping and privacy: static tests and the action-4/action-17 retained events prove the allowlisted phase/code/diagnostic/failedChecks shape without raw packet, candidate, provider, stack, or prose data.
- Behavior preservation: turn-runtime 75/75 clean rerun and Campaign Play application 15/15 plus typecheck/build cover unchanged recovery, retry, acceptance, and caller behavior.
- Setup/rendered journey: r153 canonical hashes, one-time setup, ready Opening, and one proper scene/binding for actions 1-16 are evidenced above.
- First-defect boundary: action 17 mechanics and persistence settled once, but both Narrator attempts failed before proper-scene acceptance; no later action or reload was allowed.
- Unavailable: 60 unique bindings, checkpoints 20/30/40/50/60, same-page reload, and a full natural successful post-diagnostic recovery are unavailable because the lane froze at action 17. The diagnostic itself was naturally observed, including both generation and semantic phases.
