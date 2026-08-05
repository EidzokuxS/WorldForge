# Opening Planner reasoning bypass

## Contract

- Base: `feat/revamp` at `a4924d39a6a4cfbdcadaf6a3a4086bc958acb1a4`; no commit or push.
- Actor: the player starting and playing Brina Hael's Campaign Play; semantic layer: existing Campaign Play runtime; surface: `/campaign/:id/play`.
- Trigger: Begin for Opening, then the existing rendered player choices.
- Observable outcome: Opening Planner uses the existing provider, model, prompt, schema, and strict-object strategy with explicit reasoning bypass; Opening Narrator remains default reasoning; the rest of Campaign Play keeps its current modes and behavior.
- Forbidden: provider/model changes, prompt/schema/compiler relaxation, retry/fallback, Opening Narrator reasoning changes, other role changes, UI/copy/mechanics changes, and any mutation of Task 124's dirty artifacts.

## Evidence-backed decision

- Paired exact-input evaluation: `output/playtests/campaign-play/opening-reasoning-evaluation/r62-20260805`.
- All default and bypass samples were schema/compiler-valid (3/3 each). Default median/max was 33.4/34.4 seconds; bypass was 3.9/5.1 seconds.
- Main reviewed all six `playerPremise` summaries and judged bypass not worse: two bypass samples were more concrete than their default counterparts, while the weakest default was the flattest sample. Deterministic world bootstrap and eight lazy schedules were identical.
- Product decision: change only Opening Planner model construction to explicit `reasoningMode: "bypass"`; retain default Opening Narrator reasoning and do not add a timeout retry.

## Patch

- `backend/src/campaign-play/campaign-play-application.ts`: the default Opening Planner generator receives `{ role: "generator", reasoningMode: "bypass" }`. Opening Narrator construction is unchanged. No other runtime role construction changed.
- `backend/src/campaign-play/campaign-play-application.test.ts`: focused construction assertions cover the exact provider/model identity and mode for Opening Planner, Opening Narrator, full-authority Judge and GM, certified GM, player-action Narrator, and Actor Replanner.
- `backend/src/campaign-play/actor-replan-prompts.ts`, `backend/src/campaign-play/actor-replan-prompts.test.ts`, and `rpi/campaign-play/implement/124-actor-replanner-step-placement.md` were preserved exactly.

## Scope and risk

- The expected shared-factory fan-out HIGH warning was acknowledged before editing. Source-confirmed GitNexus impact for the nested `createDefaultOpeningRuntime` seam is exact and LOW: direct callers are `createCampaignPlayApplication`, `runtimeForTurn`, and `admitOpening`; affected processes are Opening admission and turn resume. The edit is limited to the one approved role-local `createModel` call and does not broaden the seam.
- GitNexus index was refreshed index-only with a task-local larger buffer pool after the default 256 MiB attempt exhausted; no source or instruction files were overwritten by the refresh.

## Checks

- Focused `npm --prefix backend test -- --run src/campaign-play/campaign-play-application.test.ts`: passed, 12/12.
- `git diff --check`: passed (Git emitted only existing LF/CRLF normalization warnings).
- Backend typecheck/build and the fresh r63 rendered lane are recorded below after execution.
- GitNexus `detect-changes` is recorded below before handoff.

## Copy and prompt review

- No player-visible copy, prompt, schema, compiler, or strategy text changed in Task 125. Humanizer/deslop review is therefore not applicable to this delta; the Task 124 humanizer/deslop pass remains the governing verdict for its preserved prompt clarification.

## Rendered acceptance and r63

- Required run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r63`; campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`; template `lowwater-ledger-pristine-93a09e46-20260719`; card `output/playtests/character-cards/brina-porter-v2.json`.
- Materialization/preflight were clean: the template and fresh campaign state matched their recorded hashes, the branch/local/remote identity matched the contract, and the pristine DB had `integrity_check=ok`, no foreign-key rows, no characters, and no turns. The isolated runtime used API/UI/CDP ports `3430/3431/3432`, a fresh Chrome profile, and the r63 marker. Playwright `locator.setInputFiles` ran once (`setInputFilesCalls: 1`); Brina was saved once; the opening was configured as lower-wards / Local / Already here / Looking for work; Begin was clicked once.
- Opening acceptance passed. Opening Planner and Narrator stages were both accepted with valid schema, provider `zai-coding-plan`, model `glm-5-turbo`, and `strict_object` strategy. Planner duration/tokens were `4302 ms`, `5331 -> 173`; Narrator duration/tokens were `42184 ms`, `5579 -> 3308`. Source/test identity evidence records Planner `bypass` and Narrator `default`; the rendered `THE MOMENT` / `YOUR MOVE` scene with enabled choices was observed at `47422 ms` after submission, with mechanics complete at `46803 ms` (under the 120000 ms contract). The first observer classified this as a miss because it required uppercase `A.` while the rendered controls use lowercase `a.` and incorrectly required a `campaign_play_proper_scenes` row; read-only reconciliation corrected the classification without retry, mutation, or a second Begin.
- The first naturally due Actor Replanner on action 1 was accepted: `schema_outcome=valid`, durable artifact has top-level `steps` (one step) and no `intent.steps`, the compiled/grounding acceptance path was reached, and its actor job settled with a non-deferred plan/proposal. Evidence: `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r63.session/probes/opening-actor-evidence.json`.
- Actions 1-10 were recorded as unique completed/bound ledger rows before the persisted-stage review. The earliest genuine hard stop is action 6, turn `turn-player-action:3c22dd619aaaa3bfe2421b766997b8802014320d`: an `actor_replanner` stage persisted `status=interrupted`, `schema_outcome=invalid`, `error_code=model_contract_invalid`, and its job persisted `stage=deferred`, `defer_reason=replan_invalid`. The enclosing player turn completed and its scene/binding were accepted, but the invalid stage was not resolved by automatic product recovery. This is the explicit hard-stop condition; no further intentional action was submitted after it was observed. Actions 7-10 had already been executed by the worker loop before this persisted-stage review and are retained as post-boundary evidence only, not acceptance evidence.
- Checkpoint 10 was captured before the defect was reviewed: Brina's goal remained earning stable bed/meals and maintaining her illumination token; the scene added the shaft staffing/turn-away lead; route mix was contact 6 / move 3 / observe 1; exact consecutive-choice repeats were zero and maximum same-NPC streak was two. No 30 or 60 checkpoint or reload acceptance was attempted after the hard stop.
- At terminal evidence the DB reported `integrity_check=ok` and `foreign_key_check=[]`; all 10 recorded ledger rows had unique action numbers, turn IDs, and choice handles, and all bound receipt references were present. The task-owned cleanup stopped browser/backend/frontend roots `40896/50560/39072`; remaining owned processes and listeners on `3430/3431/3432` were empty. All r63 session DB/logs/screenshots/probes/decisions and the frozen r62/evaluation artifacts were preserved.

## Final check record

- Focused application construction test: 12/12; preserved Actor Replanner prompt/replanner tests: 16/16.
- Backend typecheck, backend build, shared build, and frontend build: passed. `git diff --check`: passed (only existing LF/CRLF normalization warnings).
- GitNexus upstream impacts were source-confirmed LOW for `createCampaignPlayApplication` and `createDefaultOpeningRuntime`; the latter showed direct callers `createCampaignPlayApplication`, `runtimeForTurn`, and `admitOpening`, with Opening admission/resume processes. `detect-changes --scope unstaged` reported low risk and the expected production/test/Task124 context symbols only; no unrelated product symbol was edited.
- Changed product artifacts are limited to `backend/src/campaign-play/campaign-play-application.ts`, `backend/src/campaign-play/campaign-play-application.test.ts`, and this Task 125 note. Task 124's three dirty artifacts and `AGENTS.md`/`CLAUDE.md` were preserved. r63 custom evidence scripts and outputs are task-owned under the r63 session root.
