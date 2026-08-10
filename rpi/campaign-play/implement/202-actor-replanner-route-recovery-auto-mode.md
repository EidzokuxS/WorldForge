# Task 202: Actor Replanner route-recovery auto mode

## Contract

For an Actor Replanner attempt 1 rejection artifact with `phase="compilation"` and `reason="route_not_traversable_from_step_location"`, the existing automatic attempt 2 proposer requests `auto` structured-output mode. The route-specific generation-recovery schema, existing `SAFE_REJECTION_FEEDBACK` recovery prompt, recovery model, immutable job/stage/frame/base-world/deadline identity, Grounding Reviewer tool mode, compiler, persistence, mechanics, two-attempt fence, and player behavior remain unchanged. Attempt 1 remains `auto`; every other attempt-2 branch remains `tool`, and Reviewer calls remain `tool`.

## Experience contract

- Actor: Campaign Play player.
- Semantic layer/surface: internal Actor Replanner recovery reached through the built Campaign Play UI.
- Trigger: a naturally admitted turn whose first actor replan proposal is rejected at compilation with `route_not_traversable_from_step_location`.
- Observable outcome: one automatic attempt 2 keeps the existing authority and deadline, requests `auto`, and either settles one compiled/reviewed plan once or reaches the existing terminal boundary without attempt 3, replay, or late write.
- Forbidden surfaces: player-visible copy/UI, prompts, schemas, Judge, Game Master, Narrator, scheduler, compiler, Reviewer, mechanics, persistence, provider/model selection, deadline, retry count, or database contract changes.

## Impact and implementation

Entry was `91b13935994a90e9d61559c1ddd7d99ffb3cb955` with `origin/feat/revamp` equal and only protected `AGENTS.md`/`CLAUDE.md` dirt. Exact-entry GitNexus impact identified the nearest private `runAttempt` owner as LOW (one direct caller, Campaign Play module) and the enclosing `createCampaignPlayActorReplanner` as HIGH (one direct caller, three Campaign Play processes, Campaign Play plus Engine transitive modules). The HIGH enclosing-factory mapping is the authorized existing fan-out; the patch changes only the private second-attempt mode conditional.

The implementation adds `useRouteRecoveryAutoMode` for the exact non-null compilation/route rejection and passes `auto` only for that proposer call. No prompt, schema, model selector, deadline, Reviewer, compiler, or persistence code changed.

Prompt/copy review is not applicable: no prompt, player-visible copy, or substantial product prose changed. Humanizer/deslop are not applicable.

## Static evidence before live validation

- Focused `src/campaign-play/actor-replanner.test.ts`: 16/16 assertions passed. The route-compilation recovery sequence is `auto`, `auto`, `tool` (attempt 1 proposer, attempt 2 proposer, unchanged Grounding Reviewer); neighboring no-artifact, target-outside, other compilation, and Reviewer paths retain their existing `auto`, `tool` proposer/reviewer sequences.
- Directly affected `turn-runtime.test.ts` and `campaign-play-application.test.ts`: 73/73 and 15/15 assertions passed. Vitest reported the known post-pass `vitest-worker: Timeout calling onTaskUpdate` unhandled harness error; a clean single-file rerun with one fork worker reproduced the same 73/73 assertion pass and the same harness shutdown error. No assertion failed.
- Backend `npm run typecheck` and `npm run build` passed; `git diff --check` passed.
- Staged GitNexus `detect_changes --scope staged --repo WorldForge` reported 3 files, 2 changed symbols (`createCampaignPlayActorReplanner`, `replan`), zero affected processes, low risk. The enclosing factory's previously recorded HIGH transitive impact remains the authorized existing Campaign Play fan-out; no additional production owner or flow appears in the staged diff.
- The staged paths are exactly this note, `actor-replanner.ts`, and its focused test; protected `AGENTS.md` and `CLAUDE.md` remain unstaged.

## Live r150 evidence

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r150` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` from implementation commit `4f1137d25b88c5bab19220d54f640f8e62f19ca7`. Canonical source hashes were verified before setup: template `state.db` `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, template `config.json` `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The one-time rendered setup completed: canonical Brina import, Save/Continue, lower-wards, Local, Already here, Looking for work, and Begin. Opening reached ready with one proper scene. Eight player actions then settled with exactly eight unique durable proper-scene bindings and matching unique turn ids. The authoritative state at the frozen boundary was `worldVersion=19`, `runtimeRevision=161`, `setupPhase=ready`; commands and receipts matched one-for-one (including setup/opening), SQLite `integrity_check` was `ok`, and `foreign_key_check` was empty. The final rendered page retained the action-8 proper scene, disabled action controls, and enabled Resume after the interrupted turn; no later click was submitted.

The first genuine defect was player action 9, turn `turn-player-action:54c571aa57fcf133370135647cdf607de14bff32`, Judge stage `e13e8da436cf345b9c14bd727bf9be3688a9a54001dea4a7ccd858d4148b7bb7`. Attempt 1 (`360ff76b34792f2e86816235e7d68c11bf1c2df66720f314031bf5b910da842d`) remained `auto`/`native_json` in the request evidence and ended `stage_timeout`/`transport_error` after 45,088 ms. Attempt 2 (`0545fa9946ed6a0342c5a00e4b93f5b58b5cbe512b7c91de785bf6ccdcdcaa59`) was a Judge `tool`/`tool_mode` call with `finishReason=tool-calls`, `schemaOutcome=invalid`, and `model_contract_invalid`; the retained Task 199 diagnostic was the bounded `invalid_union` at `disposition` (`valueState=missing`, `schemaLiteralCount=4`, `schemaLiteralMatch=none`) with no raw candidate or provider body. No Judge result, downstream stage, mechanics, plan, scene, or receipt was written for action 9, and no attempt 3 or later action occurred. This freezes r150 at the first genuine model-stage defect under the hard-stop contract.

Task 202's route-recovery branch did not occur naturally in r150, so no live claim is made for the new proposer mode. The action-9 Judge failure is a separate first defect and is not repaired or replayed here. Generated session/world-run evidence remains uncommitted.

## Acceptance handoff

Static mode coverage maps attempt-1/attempt-2 branch behavior, unchanged neighboring recovery paths, identity/deadline, Reviewer tool mode, and the two-attempt fence to the focused Actor Replanner tests. The canonical rendered setup and Opening are evidenced by the session probes; actions 1-8 map to eight unique proper-scene/turn bindings, one-for-one commands/receipts, and clean SQLite integrity/FK. The direct live Task 202 recovery criterion is unavailable because no route compilation rejection occurred before the frozen action-9 Judge defect. Checkpoints 10/20/30/40/50/60 and same-page reload are unavailable because the lane hard-stopped at action 9; no later action, Resume, retry, replay, or mutation was performed. Protected-file dirt remains unstaged and generated live evidence is uncommitted.
