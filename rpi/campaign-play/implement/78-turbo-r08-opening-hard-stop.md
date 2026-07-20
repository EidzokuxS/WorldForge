# Turbo r08 Opening hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r08` materialized the frozen zero-turn Lowwater Ledger template on commit `2acd52a1`. File hashes, empty character and turn tables, world/runtime version `1/1`, and eligibility evidence were frozen before the rendered character flow began.

The UI generated and created Cira Tessin, an ordinary lower-ward ferry worker. The human player selected `lower-wards / Local / Already here / Caught in local trouble`, verified all four visible values, and submitted Begin once.

r08 is not a Task 18 pristine promotion lane. The first Opening Planner response violated the strict trigger enum and was recorded as `interrupted/model_contract_invalid`. The rendered page exposed the durable Resume control, but Task 18 permits only transport failure or loss of worker authority to interrupt a frozen model call. The lane stopped without Resume and before player action 1.

## Evidence

- Opening turn: `turn-opening:af5372b0e2e2eb8d43afe130c5e52411dcbd37cd`, `interrupted`, `resumeEligible=true`, `errorCode=model_contract_invalid`.
- Opening Planner attempt 1: GLM-5-Turbo requested and actual, native structured response, `schema_outcome=invalid`, duration `608,755 ms`.
- Validation error: `hiddenConsequence.exposure.triggers[0]` was outside the allowed `inspect | attempt | traverse` enum.
- Browser evidence contains one Opening POST and zero player-action POSTs. The rendered interruption is retained as `screenshots/hard-stop-opening.png`.
- Final partial setup state: `opening_required`, `worldVersion=7`, `runtimeRevision=65`; one character, one interrupted Opening turn, zero player actions, zero observations, and zero narrations.
- Character bootstrap contains six commands and six matching receipts.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.

## Disposition

The strict runtime behaved correctly: it accepted no invalid planner artifact, authored no fallback opening, and exposed explicit recovery on the same ledger. The model-contract result still ends the pristine lane. It does not justify fallback behavior, hidden retry, database repair, or speculative prompt work. The next Lane A attempt must materialize the unchanged zero-turn template under a new run id.

Humanizer review kept the note in concrete product and ledger language. Deslop review removed no uncertainty or boundary from the hard-stop classification.
