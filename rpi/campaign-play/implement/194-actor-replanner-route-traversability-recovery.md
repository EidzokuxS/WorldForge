# Task 194 - Actor Replanner route traversability recovery

## Contract

The frozen r141 action-5 boundary showed a first Actor Replanner proposal rejected at compilation with `route_not_traversable_from_step_location`, followed by an ordinary-schema recovery proposal rejected at the same coordinate before Grounding Reviewer. This bounded change selects the existing Task 185 one-step locality generation schema only for a non-null compilation rejection artifact with that exact reason. The existing no-artifact, target-outside, other compilation, Grounding Reviewer, timeout, fencing, and terminal branches remain unchanged. The recovery prompt adds one route-specific instruction only for this reason:

> For a move step, omit route targets and choose exactly one non-current destination location that has exactly one open route from the actor's current location in ACTOR_REPLAN_FRAME.

No compiler, route authority, Reviewer, provider/model/mode, deadline, retry, identity, mechanics, persistence, UI, or player-copy behavior changes.

## Impact and implementation

Entry branch and origin were `cd0cc12962a4f4e5a74713ec3762a8e3309eff47`. Current-source GitNexus nested-symbol queries did not resolve the private helpers; source-qualified file impacts were used. `actor-replanner.ts` reported 16 impacted files, 5 direct callers, MEDIUM risk, and no indexed processes/modules. `actor-replan-prompts.ts` reported 11 impacted files, 3 direct callers, LOW risk, and no indexed processes/modules. The index was 18 commits stale. No HIGH or CRITICAL exact edited target was identified.

`actor-replanner.ts` now includes `route_not_traversable_from_step_location` in the existing locality-schema selector alongside `target_outside_step_location`. `actor-replan-prompts.ts` conditionally appends the approved sentence for that recovery reason while preserving the existing generic recovery text and all other branches. Tests inspect the provider-facing schema objects and safe recovery frame, and prove the recovery reaches the unchanged Reviewer path.

Prompt review: humanizer and deslop found the approved sentence direct, natural, non-duplicative, and free of player-facing prose; the literal is retained unchanged.

## Static validation before r142

- Actor Replanner prompt/replanner suites: 2 files, 33 tests passed.
- Backend typecheck: passed.
- Backend build: passed.
- Combined turn-runtime/application run: 72/72 turn-runtime assertions and 15/15 application assertions passed; Vitest then exited non-zero on the known worker shutdown error `[vitest-worker]: Timeout calling "onTaskUpdate"` after the selected assertions completed.
- Narrow turn-runtime rerun: 72/72 assertions passed with the same post-run worker shutdown error. This is recorded as a verification-tool defect, not a failed assertion.
- `git diff --check`: passed before the implementation commit.
- Staged GitNexus `detect_changes`: recorded with the implementation commit; expected scope is the Actor Replanner prompt/schema selection path and owned tests/note only.

Protected `AGENTS.md` and `CLAUDE.md` remained untouched and unstaged.

## r142 journey

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r142`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, ports 4280/4281/4282. Canonical hashes: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Live evidence is appended below after the single fresh lane. It must state the exact setup/action boundary, retained stage and persistence evidence, natural recovery coverage (if any), checkpoints, integrity/FK, cleanup, and unavailable criteria without inferring provider output.

## Acceptance handoff

- Entry: accepted `cd0cc12962a4f4e5a74713ec3762a8e3309eff47` with only protected instruction-file dirt.
- Schema/prompt isolation: focused tests prove route-only locality schema selection, exact route sentence, safe feedback preservation, and unchanged neighboring branches.
- Recovery behavior: Actor Replanner tests prove shared identity, accepted Reviewer path, and existing one-recovery fencing; live r142 evidence is required for product coverage.
- Persistence/mechanics: existing runtime/application tests preserve exactly-once and no-attempt-3 behavior; live r142 evidence must report authoritative SQLite state.
- Endurance/reload: unavailable until r142 completes 60 actions and the one same-page reload.

## r142 live evidence and hard stop

The implementation was pushed as `dbceb0c0e93249a4f72a4570bef5afb18e56a546` before the lane. The single fresh lane was `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r142` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using backend/frontend/CDP ports 4280/4281/4282. The materialization probe records the required template and config hashes and source materialization commit `f03596b91d857783e54107437ea5fa43e7236275`; the canonical Brina card was imported once. Setup used lower-wards / Local / Already here / Looking for work and Begin once, and Opening reached a ready proper scene. The first setup helper invocation stopped before a product action because its page marker was absent; a same-page marker preflight then completed without reload, navigation, or repeated import, and the single setup proceeded. This was a harness preflight issue, not a product state change.

Actions 1-16 settled with one proper scene and one unique binding each. Action 17 was admitted but froze at the first genuine defect, so the script terminal counters are `completed=17` (admitted) and `bound=16` (settled). The frozen action is turn `turn-player-action:107d892b472268f5b6b61e96a0fd51c3371e5650`; its persisted turn is `stage=interrupted`, `interrupted_stage=admitted`, `error_code=model_contract_invalid`, `expected_world_version=29`, `expected_runtime_revision=306`, `base_world_version=29`, `final_world_version=null`, `frame_hash=0aa88e4ed520d2bbd781419e5c9ad6dec95bc0f12af026194f46d10c0b36f803`, `worker_epoch=2`, `next_event_sequence=8`, and `public_packet_hash=null`. Judge stage `5d9732a1d3d5da930f994faee4b37e3a5d7b23d012f8e2d9526fdce2cfb117ba` had attempt 1 model-stage id `657e77c59b4d46b5635c167a61b127082982482f278fad1f55ac152e3319a033`, `strict_object`, `zai-coding-plan/glm-5-turbo`, 10,241 ms, finish `stop`, and `schema_outcome=invalid`; the safe retained rejection coordinate was `resultBounds` with `judge.contract_rejected` and `model_contract_failed`. Automatic attempt 2 model-stage id `bf79af7af51841994923b94843fe656c85e77504765e3c3e591c2996a18a3399` used the same provider/model/strategy, 20,048 ms, finish `tool-calls`, `schema_outcome=invalid`, and `model_contract_invalid`. No Judge artifact, Game Master, Actor, Narrator, receipt, result, scene, binding, mechanics settlement, attempt 3, or late write followed action 17.

Task 194's route recovery did not occur naturally in r142. The lane therefore supplies no live acceptance claim for the route-specific schema or prompt; the focused static tests remain the direct evidence for that branch. A different existing recovery did occur naturally: Task 187's bounded `llm.structured_output_invalid_tool_call` event was emitted during Judge attempt 2. Its retained payload was limited to `toolName=structured_output`, `source=result`, `stepIndex=null`, `toolCallIndex=0`, `argumentCarrier=input`, `argumentType=object`, `directToolCallCount=1`, `stepToolCallCount=1`, `matchingToolCallCount=2`, and `invalidMatchingToolCallCount=2`; no raw arguments, ids, provider body, or proposal text were logged. This unrelated event does not exercise Task 194.

Checkpoint action 10 recorded 10 settled/bound actions, worldVersion 22, runtimeRevision 216, ten unique turns and choice bindings, `integrity_check=ok`, and an empty `foreign_key_check`. No 20/30/40/50/60 checkpoints exist because of the action-17 hard stop. At the terminal boundary, the authoritative SQLite connection was read-only with `query_only=1`, `integrity_check=ok`, and an empty foreign-key result. Counts were commands 52, events 52, model stages 37, narration attempts 21, narration operations 16, narrations 17, observations 25, proper scenes 16, receipts 52, turn results 17, turns 18, and runtime events 313. The same latest proper scene and controls remained visible in the frozen page state, but no reload was allowed after the defect.

Evidence hashes were stable before and after the read-only checks: `r142-terminal.json` `B13C26E378B8FDD2478B6046F18D8CE9B2D20BB975C6FA7F7458C4724B8639D9`; `probes/materialization.json` `9F8C936F6A1DE5D886695761429C218419B0F40068E4FEE0AB04E2D47951F05F`; `probes/setup-summary.json` `F59995F550FF4EBA22F1A062C89943955150BDC2C235F08FA4B5B610E5C9494E`; `actions/action-017-evidence.json` `8D171BC12DC662E0AFD90B233E7B6402457AF6D4B5E9DC23ECA9543D75FCB0D3`; `backend.stdout.log` `EF47C2DC460B3257ACB6E02FFFA6DBD7F83B63832EC496CABFCDA35AC24D74F4`; and `state.db` `33430777914996635995780B6F023141BEEB4E8F5720BD899EE5D4ACCE9D90EA`.

After evidence capture, the CDP page was closed, the task-owned backend PID 51796 and frontend PID 19960 (including child PIDs 85720, 18920, 20324, and 49576), browser PID 19888 and its task-owned descendants were stopped, and the task-owned r142 browser profile plus temporary bootstrap/setup/marker/journey helpers were removed. Independent checks found zero recorded PIDs, zero listeners/connections on 4280/4281/4282, an absent CDP endpoint/page, and no browser profile. Generated session/run evidence and protected instruction files were preserved.

## Final acceptance handoff

- Contract and static branch: satisfied by the implementation commit, focused 33-test prompt/replanner run, typecheck, build, diff check, and staged detect review. Normal generation, no-artifact, target-outside, other compilation, Reviewer, timeout, fencing, and terminal semantics remain covered by the existing tests and the route regression.
- Route-specific live behavior: unavailable; no `route_not_traversable_from_step_location` artifact occurred in r142, so no live attempt-2 locality-schema/provider evidence is claimed.
- Built product: setup and Opening passed; 16 player actions settled uniquely. The first genuine defect was the unrelated Judge `model_contract_invalid` on admitted action 17, frozen before any later action.
- Persistence and exactly-once boundary: authoritative turn/model-stage rows, no downstream rows for action 17, read-only SQLite integrity/FK, and no late write were captured. The one natural Task 187 diagnostic was safe and unrelated.
- Endurance/reload: unavailable because the immutable first defect occurred at action 17; no 60-action or same-page reload claim is made.
