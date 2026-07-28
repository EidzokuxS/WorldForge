# Task 18 Lane A r39: Opening native-JSON parse hard stop

## Observed authority

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r39` completed one rendered character-card parse, setup, and Begin. Its only turn is Opening `turn-opening:82822574ad2305fbf0935ac028ac54e9747fe8d5`.

Read-only SQLite inspection reports `integrity_check = ok` and an empty `foreign_key_check`. The campaign remains `opening_required` at world/runtime `5/93`, with zero player-action turns. Opening is `interrupted`, has no final world version or completion timestamp, and records `interrupted_stage = admitted`, `error_code = model_contract_invalid`, and `resume_eligible = 1`.

Opening Planner made one `zai-coding-plan` / `glm-5-turbo` attempt. It ran for `892125 ms`, ended with `finish_reason = other`, and produced no parseable native-JSON object. The failure happened before schema validation, so it neither confirms nor contradicts the route-trigger prompt repair from commit `45c3ea3f`. Text fallback was disabled, and no second provider call was made.

The rendered UI showed `The opening stopped before it finished.` with Resume left untouched. The frozen probe is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r39.session/probes/hard-stop.json`; the same session contains `backend.log`. The authoritative database is under `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r39`.

## Task 18 classification

r39 is a genuine provider-output hard stop at zero completed player actions. There is no code defect to repair from this response. Resume, retry, Begin replay, fallback, repair inside the lane, or another submission would break its pristine contract. The repaired Opening prompt still requires live validation in a fresh lane.

Main completed the required humanizer and deslop review. The pass kept the exact run, campaign, turn, provider/model, duration, world/runtime state, rendered error, evidence paths, no-retry boundary, and the distinction between parse failure and schema validation.
