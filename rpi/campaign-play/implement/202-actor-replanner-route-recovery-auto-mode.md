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

Pending. Run exactly `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r150` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` from the pushed implementation. Do not claim live Task 202 coverage unless the route-recovery branch occurs naturally.

## Acceptance handoff

Static mode coverage will map attempt-1/attempt-2 branch behavior, unchanged neighboring recovery paths, identity/deadline and two-attempt fencing to focused tests. The built lane will map canonical setup, Opening, durable unique bindings, checkpoints, persistence integrity/FK, natural recovery coverage if present, and same-page reload or the first genuine frozen defect. Generated session evidence remains uncommitted.
