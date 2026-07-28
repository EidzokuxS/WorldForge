# Task 18 Lane A r38: empty route-state triggers hard stop

## Observed authority

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r38` completed character parsing and setup, then submitted Opening once. Its only turn is `turn-opening:924b52a171c898ae0349cb70e4883b4c450cbdc8`.

Read-only SQLite inspection reports `integrity_check = ok` and an empty `foreign_key_check`. The campaign remains at world/runtime `6/84` with zero player-action turns. Opening is `interrupted`, has no final world version or completion timestamp, and records `interrupted_stage = admitted`, `error_code = model_contract_invalid`, and `resume_eligible = 1`.

Opening Planner made one `zai-coding-plan` / `glm-5-turbo` attempt. It ran for `798068 ms`, ended with `finish_reason = stop`, and failed schema validation because `hiddenConsequence.exposure.triggers` was an empty array. Text fallback was disabled, and no second provider call was made.

The frozen probe is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r38.session/probes/hard-stop.json`. Runtime evidence is in `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r38/backend.log` and its `state.db`.

## Contract repair

The Zod schema already required one to three unique route-state triggers. The Opening prompt named the `triggers` field but did not state that it must be non-empty or list its accepted literals. It now requires a unique array of one to three exact values chosen only from `"inspect"`, `"attempt"`, and `"traverse"`. The schema, compiler, no-retry policy, and frozen r38 lane are unchanged.

The focused Opening Planner file passes all 40 tests, backend typechecking passes, and GitNexus reports LOW impact: two direct consumers, one Campaign Play process family, and no affected process after the edit. Live acceptance remains deferred to a fresh r39 lane.

## Task 18 classification

r38 is a genuine model-contract hard stop at zero completed player actions. Resume, retry, Begin replay, fallback, repair inside the lane, or another submission would break its pristine contract.

Main completed the required humanizer and deslop review. The pass kept the exact run, campaign, turn, provider/model, failure field, duration, world/runtime state, evidence paths, repair boundary, and deferred live-validation status; it removed no diagnostic fact.
