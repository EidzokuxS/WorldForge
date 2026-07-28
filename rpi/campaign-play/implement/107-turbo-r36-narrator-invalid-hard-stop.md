# Task 18 Lane A r36: Narrator invalid-output hard stop

## Observed authority

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r36` completed and bound 11 player actions. Action 12 was signed from the current rendered state as `Talk to Dren Vask: ask which ward these households are in` and submitted once. Its durable turn is `turn-player-action:42ae18aff5bf296672d03ad4899f4b68926b6836`.

Read-only SQLite inspection reports `integrity_check = ok` and an empty `foreign_key_check`. The campaign is at world/runtime `26/580`. Eleven player turns are `completed`; action 12 is the only `interrupted` player turn. The turn began from world/runtime `25/533`, has no final world version or turn result, and ended with `interrupted_stage = visibility_projected`, `error_code = narration_invalid`, and `resume_eligible = 1`. Its pending narration has no display text or completion timestamp.

Judge and Game Master each completed one accepted `zai-coding-plan` / `glm-5-turbo` attempt. Narrator made one attempt with the same provider and model, ran for `143792 ms`, and ended `interrupted` with `schema_outcome = invalid` and `finish_reason = other`. The backend log identifies the immediate cause: the native JSON response could not be parsed. Text fallback was disabled, and no second provider call was made.

The signed action-12 record remains in `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r36.session/pending-decision.json`. The frozen structured probe is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r36.session/probes/hard-stop.json`; runtime evidence is in `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r36/backend.log` and its `state.db`.

## Task 18 classification

r36 is a genuine provider-output hard stop at 11 completed player actions. The interrupted action already has a durable turn, so the pending evidence cannot be cancelled. Resume, retry, replay, manual repair, provider/model substitution, and another player submission would all leave the pristine lane contract.

Main completed the required humanizer and deslop review. The pass kept the exact run, campaign, turn, action count, provider/model, stage, duration, world/runtime versions, evidence paths, and no-retry boundary; it removed no diagnostic facts.
