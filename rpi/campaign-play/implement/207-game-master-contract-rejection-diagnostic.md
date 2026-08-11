# Task 207: Game Master contract-rejection diagnostic

## Contract and boundary

This task adds one private `game_master.contract_rejected` event for a failed external Campaign Play Game Master plan invocation after structured-output planning begins. It is diagnostic-only: accepted/rejected semantics, error identity, recovery feedback, retry count, mechanics, persistence, UI, prompts, provider/model/mode, and deadlines remain unchanged.

The event is phase-aware (`generation`, `evidence`, `compilation`, or `review`) and carries only the existing safe error/recovery coordinates, bounded reviewer checks, and bounded Rulebook denial coordinates. It never contains proposal or compiled-batch content, reviewer prose, prompt/provider data, raw arguments, names, handles outside approved coordinates, stacks, causes, or denial detail.

Frozen r155 remains immutable. Its action-38 boundary did not retain enough metadata to classify the failed Game Master attempts, so this task adds observability without inferring a cause or repairing the lane.

## Impact and risk

An exact-entry GitNexus shadow was built at `38baf80f444da3662770c9b0db4f27fe9a359a10`. `createCampaignPlayGameMaster` has the disclosed HIGH enclosing impact: 18 impacted symbols, 3 direct callers, 3 Campaign Play processes (`drive`, `recoverNarration`, `admitTurn`), and Campaign Play plus Engine module reach. The source-qualified private `plan` target was unresolved in the graph and reported a LOW lower-bound; source inspection was authoritative. Main authorized the enclosing HIGH mapping only for this plan-local diagnostic seam, with no exported interface or additional owner.

## Implementation and review

`game-master.ts` tracks the source-ordered phase around primary generation, model-evidence validation, compilation/Rulebook preflight, and Mechanical Authority Review. The outer failure fence emits exactly one bounded event while preserving the original error and recovery state. Existing warnings and specialized diagnostics remain unchanged. No prompt or player-visible prose changed; humanizer/deslop review is not applicable.

## Static evidence

The focused Game Master suite passes all diagnostic and existing assertions (69/69, exit 0). The directly affected Campaign Play application suite passes (15/15, exit 0). The turn-runtime suite passes all assertions (75/75, exit 0) in the clean rerun; an earlier run encountered the known Vitest worker `onTaskUpdate` shutdown timeout, and the bounded rerun completed cleanly without assertion failures. Backend typecheck and production build pass. Final `git diff --check` and staged GitNexus `detect_changes` are run before each commit and recorded with the exact staged scope.

### Acceptance correction: primary SafeGenerate contract failure

The previously missing static scenario is now covered by one focused regression in `backend/src/campaign-play/game-master.test.ts`. It drives the real primary `safeGenerateObject` path with a `MockLanguageModelV3` that returns schema-invalid native JSON under the existing Z.AI metadata seam, producing the genuine `schema_validation_failed` SafeGenerate contract code. The caller still receives `CampaignPlayGameMasterError` with `code=model_contract_failed` and retained `modelEvidence.errorCode=schema_validation_failed`.

The test asserts exactly one `game_master.contract_rejected` event with `phase=generation`, `errorCode=model_contract_failed`, `modelEvidenceErrorCode=schema_validation_failed`, `safeGenerationCode=schema_validation_failed`, null recovery diagnostic and denial, and empty `failedChecks`/`reviewFailedChecks`. Sentinel raw proposal/player/actor text and schema message text are absent from the event. The existing plain transport-interruption regression remains unchanged. The focused Game Master suite now passes 69/69; no production file, live lane, or r156 evidence changed.

## Live evidence

Implementation commit `e91ef854ca5778f3dd3c3471edc248a35121ec56` was pushed to `feat/revamp`; local HEAD and origin matched before the lane. The fresh lane was materialized exactly once as `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r156` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. The pre-runtime gate passed before any backend, frontend, browser/CDP, watcher, helper, or HTTP activity: template state SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and canonical Brina card SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

One card import/file assignment, one Save/Continue, the exact `lower-wards` / `Local` / `Already here` / `Looking for work` setup, and one Begin were admitted. Opening reached ready with one proper scene at worldVersion 11/runtimeRevision 17. Actions 1 through 23 each settled once with one proper-scene binding. The action-20 read-only checkpoint was: completed actions 20, unique bindings 20, results 21, proper scenes 20, narration operations 20, narration attempts 29, commands 71, receipts 71, worldVersion 31, runtimeRevision 492, `integrity_check=ok`, and empty `foreign_key_check`.

The first genuine defect was action 24, turn `turn-player-action:2adc8b822a11f4f18317a7a49c0b09de12fc9c57`. Its turn completed from worldVersion 34/runtimeRevision 566 to worldVersion 35/runtimeRevision 588 with one command/receipt settlement and no active turn, but the Narrator operation `narration-operation:4b266b388a78f32896a11d6a0cdd546d3d1e7162` failed at the persisted local deadline with `error_code=stage_timeout` on attempt 1 (`narration-attempt:625f18824b134e4b84b5ea6d9caa8f5d7eaa58bc`, duration 89859 ms). No proper-scene binding was created for action 24: total completed actions were 24 while proper scenes and unique bindings remained 23. The rendered page showed the expected packet-derived fallback and enabled choices; no later action, Resume, Restore, retry, replay, provider/model change, or SQLite write was performed. Terminal read-only checks were `integrity_check=ok` and empty `foreign_key_check`.

Task 207 coverage did occur naturally earlier in r156. The backend log contains exactly one `game_master.contract_rejected` event (timestamp `11:00:53.699`) for a failed Game Master invocation; it records `phase=compilation`, `errorCode=model_contract_failed`, `modelEvidenceErrorCode=model_contract_failed`, `safeGenerationCode=null`, `recoveryDiagnostic=game_master_semantic_validation_mismatch`, one existing bounded `repeated_actor_dialogue` failed check in stable order, `reviewFailedChecks=[]`, and `denial=null`. The event contains no proposal, compiled batch, reviewer prose, stack/cause, prompt/provider data, or denial detail. The same turn's recovery attempt subsequently accepted, and no duplicate event was observed. This is live diagnostic evidence only; action 24's Narrator timeout is unrelated and remains the frozen terminal boundary.

The persistent r156 evidence records 24 completed player actions, 23 proper-scene/turn bindings, 83 commands, 83 receipts, and no duplicate or late write at the boundary. Checkpoints 10 and 20 were captured; checkpoints 30/40/50/60 and the 60-action same-page reload are unavailable because the lane hard-stopped at action 24. A transient CDP/Node read-only polling reset occurred during observation; state was reconciled through backend/API/SQLite without repeating a product action.

## Acceptance handoff

Static mapping: phase tracking and bounded payload are in `backend/src/campaign-play/game-master.ts`; generation/evidence/compilation/Rulebook/reviewer/privacy and accepted-silence regressions are in `backend/src/campaign-play/game-master.test.ts`. Built evidence confirms one natural compilation-phase diagnostic event with the approved safe coordinates and unchanged recovery behavior. Setup, Opening, action-1..23 exactly-once bindings, checkpoint-20 persistence, and terminal integrity/FK are available in the r156 session/world evidence. Full 60-action endurance, checkpoints 30/40/50/60, same-page reload, and a natural generation/evidence/review-phase event are unavailable because action 24 froze on the Narrator `stage_timeout` boundary.

## Cleanup

The r156 page and task-owned runtime/browser processes on ports 4420/4421/4422 were closed/stopped after evidence capture; the task-owned browser profile and temporary helpers were removed only after process/listener absence was independently checked. Generated r156 session/world evidence was preserved. Protected `AGENTS.md` and `CLAUDE.md` remained byte-for-byte unchanged and unstaged.
