# Task 203: Judge stage-timeout recovery auto mode

## Contract

When a player-action Judge attempt 1 persists `error_code="stage_timeout"` without Judge recovery feedback, the existing single automatic attempt 2 requests structured-output mode `auto` instead of `tool`. Attempt 1 remains `auto`; Judge attempt 2 with final-validation recovery feedback remains `auto`; Judge attempt 2 after every other no-feedback interruption remains `tool`. Model selection, prompts, schemas, deadlines, retry eligibility, attempt count, identity/CAS fencing, mechanics, persistence, UI, and player-visible copy remain unchanged.

## Experience contract

- Actor: Campaign Play player.
- Semantic layer/surface: internal Judge automatic recovery reached through the built Campaign Play UI.
- Trigger: a full-authority player action whose first Judge attempt reaches the local stage-timeout boundary without a final-validation feedback artifact.
- Observable outcome: one automatic attempt 2 keeps the same turn/stage/input/frame/world authority, uses the configured normal model, requests `auto`, and either accepts one Judge artifact once or reaches the existing terminal boundary without attempt 3 or downstream write.
- Forbidden surfaces: player-visible copy/UI, prompt text, Judge schema/compiler/final validation, Game Master, Actor Replanner, Narrator, provider/model selection, deadline arithmetic, retry count, persistence schema, mechanics, or routes.

## Impact and implementation

Entry was `d7650e79ec3f138d1c0ef9ad992b82d6947eb6bf` with local and origin equal. Protected `AGENTS.md` and `CLAUDE.md` dirt was preserved byte-for-byte and unstaged. Exact-current GitNexus impact for the edited private `structuredOutputModeForExternalAttempt` selector is LOW: two direct callers, two Campaign Play processes, and one module. The enclosing `createCampaignPlayTurnRuntime` reports HIGH transitive impact (14 impacted symbols, two direct callers, four processes: drive, resumeTurn, admitTurn, and recoverNarration; Campaign Play plus Engine modules). Main explicitly authorized that disclosed enclosing-owner fan-out only for this private selector conditional; no other HIGH/CRITICAL target or production owner was edited.

The implementation retains the existing feedback-bearing Judge attempt-2 `auto` branch, then reads only the previous persisted Judge model-stage `error_code` for a no-feedback attempt 2 and returns `auto` when it is exactly `stage_timeout`; all other no-feedback Judge branches remain `tool`. The Game Master selector, model selector, prompt/schema paths, deadline arithmetic, persistence, and runtime fences are unchanged.

Prompt/copy review is not applicable: no prompt, model instruction, player-visible copy, or substantial product prose changed. Humanizer/deslop are not applicable.

## Static evidence before live validation

- Focused `src/campaign-play/turn-runtime.test.ts`: all 75 assertions passed. The timeout/no-feedback Judge sequence is `auto`, `auto`; final-validation feedback remains `auto`, `auto`; model-contract-invalid and provider-unavailable no-feedback cases remain `auto`, `tool` with unchanged model selection; initial Judge and Game Master neighboring branches remain covered.
- The normal focused run and a one-fork, single-file rerun both reported the known post-pass Vitest worker-shutdown error `Timeout calling "onTaskUpdate"` after all assertions passed. No assertion failed; the clean rerun did not exit 0 because the same harness error persisted.
- `npm run typecheck` and `npm run build` exited 0. The Campaign Play application and Judge suites exited 0 with 60/60 tests passing. `git diff --check` passed.
- Staged GitNexus `detect_changes --scope staged --repo WorldForge --limit 100` reported three files, three symbols, zero affected processes, low staged risk: `structuredOutputModeForExternalAttempt`, its enclosing `createCampaignPlayTurnRuntime`, and the focused test helper. The enclosing factory's disclosed HIGH transitive impact remains the Main-authorized exception; no additional production owner or process was detected. Protected files remained unstaged.
- Implementation commit `405a183a815e428a247a192b206aacdbfb07f790` was pushed with local `HEAD=origin/feat/revamp` before the live lane.

## Live r151 evidence

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r151` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` from the pushed implementation commit. Generated session/world-run evidence remains uncommitted.

### r151 setup and rendered journey

- Canonical template state, config, and Brina card hashes were verified as `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Materialization was performed once. The canonical card was imported/file-assigned once, saved once, and the exact setup selections were lower-wards / Local / Already here / Looking for work; Begin was clicked once. Opening reached a ready proper scene at `alderman-hallway` with worldVersion 11 and runtimeRevision 14.
- Actions 1-7 each settled once with one unique proper-scene binding and enabled controls. The selected rendered labels and final world/runtime versions were: 1 `Talk to Dren Vask: ask how many names need delivery` (12/35); 2 `Talk to Dren Vask: accept the seven notices` (13/51); 3 `Talk to Dren Vask: ask who gets the first notice` (14/64); 4 `Talk to Dren Vask: accept the notices and leave` (16/80); 5 `Talk to Dren Vask: ask about the households on the list` (18/101); 6 `Talk to Dren Vask: press for more about the households` (19/130); 7 `Talk to Dren Vask: accept the warning and move on` (20/155). Each had one completed turn and one new proper scene; read-only integrity was `ok` and `foreign_key_check` was empty.

### r151 first genuine defect and freeze

- Action 8 selected the rendered `Talk to Dren Vask: ask which address comes first` once. Its turn is `turn-player-action:21c5de37e7d59816cd786f22df3efe95f206fe8c`; Judge stage `8c0808283bd98769b6829214f52b09b3d918945b6707b6b811d539058f561aa0` accepted once and Game Master stage `f3a4e33e47b86d5a1df702d2759607055b9592ca5ea5d3c0b1fcbfefa516868a` accepted once. The actor job is `actor-job:0000:9d2b689a6869436129c751e4`, actor stage `actor-replan-stage:e770d0b8dd1adb881ad7647a2dad9520`, and attempts are `actor-replan-attempt:a07301640943e181b5bdc842c3e46a77` and `actor-replan-attempt:365a07c88df3e8405b321dbd6118f011`.
- Actor Replanner attempt 1 used strict_object / `glm-5-turbo`, completed transport, then ended `model_contract_invalid` after 9,334 ms. Attempt 2 reused the same stage/job/frame and persisted deadline (`deadline_at=1786394064656`), used strict_object / `glm-5-turbo`, and ended `stage_timeout` after 80,621 ms with no actual strategy/model or finish reason retained. Both attempts were interrupted; no Actor plan was admitted, no Narrator operation or attempt was created for action 8, and the job remained `stage=interrupted`, `due_reason=plan_retry`, with no completed time.
- The turn remained `stage=primary_settled`, `error_code=null`, `resume_eligible=0`, `completed_at=null`, with expected/base world/runtime 20/155 and state world/runtime 21/177. The rendered page showed the previous proper scene and disabled choices with `Resume`; no Resume or later player action was submitted. Action 8 produced one command batch with two commands/receipts (`advance_world_time`, `record_world_event`), no duplicate mechanics or late write. Terminal counts were turns 9, commands 32, receipts 32, proper scenes 7, Narrator operations 7, Narrator attempts 8, actor jobs 6; `integrity_check` was `ok` and `foreign_key_check` was empty.
- This is the first genuine r151 model-stage defect, so the lane was frozen at action 8. Task 203's Judge stage-timeout/no-feedback recovery was not naturally observed: action-8 Judge attempt 1 accepted and no Judge attempt 2 ran. No claim is made for 60/60 checkpoints or same-page reload.
- Final relied-on hashes: materialized r151 `state.db` `72CBBED99DF43B79C8FFDD57A012AE4BAA3625FAF3CD1E656B53941745003C25`, config `D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`, backend log `8ABA0703CF903A27D9F138E90F5DCF53AB79B1901BA3FFDAC93F7DC6B653F66D`, frontend log `D399C2BEC8A0FBD99C5988D16F342C221DBBEFBBB47AB47FCDEA5BD67D282170`. Session/world-run evidence remains preserved and uncommitted.
- Cleanup closed the task-created browser tab, stopped only the validated r151 backend/frontend process trees, and verified ports 4370/4371/4372 and the task processes were absent. No separate CDP listener was started on 4372. The session root and world-run evidence were preserved.

## Acceptance handoff

Static mode coverage maps every Judge and Game Master selector branch, unchanged model selection, shared identity/deadline, one automatic retry, and no-attempt-3 fencing to the focused runtime tests. The built r151 setup/Openings and actions 1-7 provide rendered and persisted exactly-once evidence; action 8 freezes on the Actor Replanner defect before a new scene binding. The Task 203 Judge timeout recovery was not naturally exercised, and checkpoints 10/20/30/40/50/60 plus same-page reload are unavailable by the hard-stop rule. The first genuine defect and its stage/job/attempt, runtime, rendered, command/receipt, integrity/FK, hash, and cleanup evidence are recorded above.
