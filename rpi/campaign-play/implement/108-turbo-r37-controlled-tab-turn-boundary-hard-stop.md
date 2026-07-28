# Task 18 Lane A r37: controlled-tab turn-boundary hard stop

## Observed authority

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r37` completed character parsing, setup, and one Opening submission through controlled tab `5`. Opening `turn-opening:fb355de6cdf29ebdcfb225d1723c5b5d3cd1204e` completed cleanly.

Read-only SQLite inspection reports `integrity_check = ok` and an empty `foreign_key_check`. The campaign is `ready` at world/runtime `13/114`, with no active turn. Opening is the database's only turn, and it has a final world version of `13`, no interruption, and one turn result. There are zero player-action turns, zero bound browser actions, and no pending decision.

The executor ended its control turn while Opening was still active and continued in a new turn after Opening completed. At that boundary, the exact recorded tab `5` was absent from both the controlled and user tab registries. This does not establish a Campaign Play tab or state failure, but the evidence lane could no longer prove that action 1 came from the same rendered session. No replacement tab was opened or claimed.

The frozen structured record is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r37.session/probes/hard-stop.json`. Runtime evidence is in `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r37/backend.log` and its `state.db`.

## Task 18 classification

r37 is a browser-control evidence hard stop at zero completed player actions, not a Campaign Play product failure. Replacing the tab, repeating setup or Begin, or submitting action 1 through a new rendered session would break the lane's exact-tab evidence chain. The run remains frozen without retry, Resume, replay, repair, or another submission.

Main completed the required humanizer and deslop review. The pass kept the exact run, campaign, Opening turn, tab id, world/runtime state, action count, evidence paths, and no-replacement boundary; it kept the browser-control classification separate from product state.
