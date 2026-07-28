# Task 18 Lane A r35: action-2 evidence hard stop

## Observed authority

r35 completed one signed player action cleanly. Opening `turn-opening:6a755b1a0f2c335e787c889f50c3957a3b864088` and player action `turn-player-action:6858b54143d5905884013ccce6ba7fd83afe96c9` are terminal. The copied campaign is `ready` at world/runtime `13/88`, with one completed player action, no active turn, `integrity_check = ok`, and no foreign-key violations.

Action 2 was signed but never sent to the rendered UI. Its chosen text, `Talk to Vedris Kast: ask what the red marks mean`, matched the visible suggestion. Its opaque signed handle was `choice_5e28d508b41f007669d7f438`, while the current visible/API suggestion for that text was `choice_dabd0bb9572ca66d4d99145d`. The mismatch was caught before any UI click or campaign request.

The stale decision remains at `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r35.session/pending-decision.json`. The direct comparison is retained at `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r35.session/probes/action-2-pending-handle-mismatch.json`.

## Contract classification

At the time of the stop, `e2e/campaign-play/live-session.ts` accepted only one pending decision and could bind it only to the exact next completed durable turn. It had no supported cancel or correction phase. Changing, deleting, moving, or replacing the stale pending record by hand would have repaired evidence state outside the frozen lane contract.

Therefore r35 ends as a harness/evidence hard stop, not a product-state failure. No action 2 was submitted, no provider call was retried, and no campaign state was repaired.

The runner now has a supported `cancel-decision` phase for future lanes. It archives the complete unsubmitted decision, the operator's reason, and the current public projection before clearing the pending slot, and refuses cancellation after any unbound durable player turn. This path was validated on disposable fixtures and was not applied to r35; its frozen evidence remains unchanged.

Main completed the required humanizer and deslop review. The pass preserved the exact run, campaign, turn, action count, choice text, both opaque handles, state versions, evidence paths, and no-submission boundary. It also keeps the later runner repair separate from the historical r35 classification.
