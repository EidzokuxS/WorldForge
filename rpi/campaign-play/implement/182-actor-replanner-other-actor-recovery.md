# Task 182: Actor Replanner other-actor recovery

## Contract

When the existing Grounding Reviewer rejects an Actor Replanner proposal with the safe coordinate `other_actor_action_not_established`, the existing automatic attempt 2 receives one recovery-only instruction. The instruction rebuilds each flagged step around the planning actor's own action or its directly caused physical trace; another actor may remain only as a contact or observation target. Reviewer authority, proposal schema, runtime routing, provider/model/mode/reasoning selection, shared deadline, retry count, mechanics, persistence, and visible product behavior remain unchanged.

The exact recovery paragraph is:

> When reviewViolations lists other_actor_action_not_established, rebuild each flagged step around one action performed only by the actor identified by ACTOR_FRAME.actorHandle. Another actor may remain only as the target of contact or observation. Remove any method, stakes, or observableTrace that states or requires that other actor to respond, consent, assist, work, move, accept, pay, or complete anything. The rewritten observableTrace must show only the planning actor's own attempt or a physical trace directly caused by that method; do not replace the removed participation with another unestablished outcome. Prefer one grounded step.

## Impact and review

A fresh task-owned GitNexus shadow at entry `8b1364386365b3c09b30b7726e93688545b62d46` found exact LOW upstream impact for `buildCampaignPlayActorReplanRecoveryPrompt`: two direct callers (the prompt test and `createCampaignPlayActorReplanner.replan`), one Campaign-play module, and no indexed processes. The shadow index and registry entry were removed after the query. Source review confirmed the edit is confined to the existing recovery prompt seam.

Semantic review verdicts are fixed: prompt-craft judged this a surgical recovery-only rule keyed to the existing safe coordinate; humanizer judged the direct technical wording appropriate and retained the literal unchanged; deslop found no filler or redundant restatement beyond the required distinction.

## Initial validation

Implementation and focused validation completed before the built lane. No base prompt, Reviewer prompt/schema, SAFE_REJECTION_FEEDBACK, runtime branch, persistence, or player-visible copy is changed.

- `npm test -- --run src/campaign-play/actor-replan-prompts.test.ts src/campaign-play/actor-replanner.test.ts` passed: 2 files, 28 tests.
- `npm test -- --run src/campaign-play/turn-runtime.test.ts` passed: 1 file, 72 tests.
- `npm test -- --run src/campaign-play/campaign-play-application.test.ts` passed: 1 file, 15 tests.
- `npm run typecheck` passed in `backend`.
- `npm run build` passed in `backend`.
- `git diff --check` passed for the owned source/test/note delta; AGENTS.md and CLAUDE.md remained pre-existing unstaged changes.
- Staged GitNexus `detect_changes` and the exact staged-path review are recorded at the implementation commit. The expected flow is limited to the Campaign Play Actor Replanner recovery prompt and its focused tests.

## r131 journey

Pending the one fresh pristine r131 lane from the canonical lowwater-ledger template and card. The lane will stop at its first genuine defect or continue to 60 unique proper-scene bindings plus one same-page reload; live coverage of this specific recovery is recorded only if it occurs naturally.
