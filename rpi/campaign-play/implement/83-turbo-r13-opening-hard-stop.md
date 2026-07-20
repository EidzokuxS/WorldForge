# Turbo r13 Opening hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r13` materialized the frozen zero-turn Lowwater Ledger template on commit `b5aa4564`. Eligibility was frozen before character creation. The UI generated Thera Vosk in one draft request, accepted the unedited character, selected `lower-wards / Local / Already here / Looking for work`, and submitted Begin once.

r13 is not a Task 18 pristine promotion lane. Opening Planner attempt 1 returned a move step whose `obligationOutcome` attempted to change an obligation. The strict schema rejected the artifact as `interrupted/model_contract_invalid`. The lane stopped without Resume and before player action 1.

## Evidence

- Opening turn: `turn-opening:62a8b1224eca2ccfd7cbad616cc6d3ee38685da5`, `interrupted`, `resumeEligible=true`, `errorCode=model_contract_invalid`.
- Opening Planner attempt 1: GLM-5-Turbo requested and actual, `schema_outcome=invalid`, `finishReason=stop`, duration `367,605 ms`.
- Schema evidence: `actorPlans.6.steps.4.obligationOutcome` violated `Move steps cannot change possessions or obligations.`
- Browser evidence contains one draft-generation POST, one Opening POST, zero Resume POSTs, and zero player-action POSTs. The rendered terminal state is retained as `screenshots/hard-stop-opening.png`.
- Final partial setup: `opening_required`, `worldVersion=6`, `runtimeRevision=41`; one character, one interrupted Opening, zero player actions.
- Character bootstrap contains five commands and five matching receipts.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.

## Disposition

The strict runtime accepted no malformed planner artifact and exposed normal same-ledger recovery. Task 18's pristine boundary makes this model-contract result a lane hard stop. It does not justify fallback behavior, hidden retry, database repair, or a prompt change. The next Lane A attempt materializes the unchanged zero-turn template under a new run id.

Humanizer review kept the note tied to rendered and SQLite evidence. Deslop review retained the exact schema failure without turning a rejected model artifact into a product defect.
