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

The focused Game Master suite passes all diagnostic and existing assertions (68/68, exit 0). The directly affected Campaign Play application suite passes (15/15, exit 0). The turn-runtime suite passes all assertions (75/75, exit 0) in the clean rerun; an earlier run encountered the known Vitest worker `onTaskUpdate` shutdown timeout, and the bounded rerun completed cleanly without assertion failures. Backend typecheck and production build pass. Final `git diff --check` and staged GitNexus `detect_changes` are run before each commit and recorded with the exact staged scope.

## Live evidence

r156 has not started. The canonical prepare/hash gate, one-time setup, rendered journey, checkpoints, persistence checks, and cleanup will be appended after the implementation commit. Natural `game_master.contract_rejected` coverage is unavailable until a fresh r156 failure occurs; no synthetic failure will be claimed.

## Acceptance handoff

Static mapping: phase tracking and bounded payload are in `backend/src/campaign-play/game-master.ts`; generation/evidence/compilation/Rulebook/reviewer/privacy and accepted-silence regressions are in `backend/src/campaign-play/game-master.test.ts`. Built-product and persistence criteria remain pending the fresh r156 lane and will be recorded here without inference.
