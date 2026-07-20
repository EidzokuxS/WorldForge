# Turbo r16 action-7 Narrator hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r16` materialized the unchanged frozen Lowwater Ledger template on commit `f5935e9a`. The rendered character flow generated Toben once and accepted him unedited: an ordinary lower-ward cobbler with practical tools, no office, faction role, special powers, or secret political ties. The human player selected `lower-wards / Local / Already here / Looking for work` and submitted Begin once.

Opening Planner and Narrator both succeeded on their first attempts. The UI then completed six signed player actions, each with one `/play/turns` submission. Action 7 reached Judge and Game Master successfully, applied its two authorized commands, and projected the consequence that the Compact had answered the occupation only with a warden's threat. The Narrator model call finished, but its structured artifact failed validation. SQLite records the turn as `interrupted` at `visibility_projected`, with `error_code=narration_invalid`; the model stage is `interrupted`, `schema_outcome=invalid`, and `actual_model=glm-5-turbo`.

Task 18 permits recovery only for a recorded transport failure or loss of worker authority. This is a model-contract failure, so the visible Resume control is not used and no eighth action is submitted. r16 is not a pristine promotion lane.

## Player journey

Toben followed the weak market light while looking for work. Kellin Marsh explained that dark jars lead to the delinquency board, lost stalls and rent, and eventually the occupation at the shaft. Toben went there rather than treating the warning as background color.

At the shaft, Meshan Ollo described forty displaced families whose legitimate light-token leases were cut when the Compact halved lower-ward quotas. Their occupation blocks the phosphor winch, but after three days the children are hungry. Toben's seventh choice asked whether the Compact had responded before he offered labor or touched the occupiers' leverage. The settled consequence was specific and continuous with the prior scene: no clerk or mediator had come, and a warden had threatened removal.

## Terminal audit

- Durable turns: one completed Opening, six completed player actions, and one interrupted seventh player action. No action was resubmitted.
- Terminal public state: `narration_pending`, `worldVersion=23`, `runtimeRevision=267`, Day 1 `00:08`, location `winch-shaft-entrance`, projection hash `c8f30a0594f6992833a58440187a4943b41937d8b8f8842fb691ef262872ffc6`.
- Action 7 model stages: Judge accepted in `17,063 ms`; Game Master accepted in `22,573 ms`; Narrator interrupted after `27,012 ms` with `finish_reason=stop`, `schema_outcome=invalid`, and `error_code=narration_invalid`. All used Z.AI Coding Plan `glm-5-turbo` and the strict-object strategy.
- The ledger contains `32` commands and `32` matching receipts. There are no orphaned commands or receipts. Action 7 has one applied `advance_world_time` command and one applied `record_world_event` command.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.
- The required action-1 restart reproduced identical public-state, replay, and checkpoint hashes. Its public-state hash is `eae73fe8351be5770a1a68ab5c5d5dd504a7e16d4efcdc6d2db726322c668d0a` before and after restart.
- The Next development server exited once between turns during the action-1 restart check. The same SQLite campaign reopened without an active turn, and the bounded reload proof matched. This environment event did not duplicate input, switch providers, or alter the failure classification.
- The terminal rendered screenshot is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r16.session/screenshots/action-7-hard-stop.png`, SHA-256 `49c63ff390dab2b7e0a6232d2dc719b2816ee05609b1268f3f135fafef254181`.

## Disposition

r16 stays frozen at the interrupted seventh action. The next Lane A attempt must materialize the same zero-turn template under a new run id and preserve the current provider/model configuration unless new product evidence requires a scoped change.

Humanizer review kept the note centered on Toben's observed journey and separated rendered consequences from protected ledger facts. Deslop review removed repeated framing while preserving the exact stage classification, timing, hashes, integrity results, and no-recovery boundary.
