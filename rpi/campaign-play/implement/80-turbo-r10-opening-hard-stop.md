# Turbo r10 Opening hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r10` materialized the frozen zero-turn Lowwater Ledger template on commit `3d8f3741`. Eligibility evidence was frozen before character creation. The UI generated Venn Asholt, accepted the human player's `lower-wards / Local / Passing through / Following a lead` setup, and submitted Begin once.

r10 is not a Task 18 pristine promotion lane. Opening Planner attempt 1 returned actor-plan steps whose strict `intent` objects contained the unrecognized key `observableTrace`. The runtime rejected the artifact as `interrupted/model_contract_invalid`, rendered Resume, and preserved the same Opening ledger. The lane stopped without Resume and before player action 1.

## Evidence

- Opening turn: `turn-opening:0ab91780ab161c0b2d772c3d89b08f6ea5eac2a1`, `interrupted`, `resumeEligible=true`, `errorCode=model_contract_invalid`.
- Opening Planner attempt 1: GLM-5-Turbo requested and actual, `schema_outcome=invalid`, duration `340,746 ms`.
- Schema evidence: `observableTrace` appeared under multiple `actorPlans[*].steps[*].intent` objects and was rejected as an unrecognized key.
- Browser evidence contains one Opening POST, zero Resume POSTs, and zero player-action POSTs. The rendered terminal state is retained as `screenshots/hard-stop-opening.png`.
- Final partial setup: `opening_required`, `worldVersion=6`, `runtimeRevision=38`; one character, one interrupted Opening, zero player actions.
- Character bootstrap contains five commands and five matching receipts.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.

## Disposition

The strict runtime accepted no malformed planner artifact and exposed normal same-ledger recovery. Task 18's stronger pristine boundary makes this model-contract result a lane hard stop. It does not justify fallback behavior, hidden retry, database repair, or speculative prompt work. The next Lane A attempt must materialize the unchanged zero-turn template under a new run id.

Humanizer review kept the note tied to rendered and SQLite evidence. Deslop review retained the exact failure boundary without inflating it into a product defect.
