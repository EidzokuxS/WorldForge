# Task 18 Lane A r35: browser-control reclassification

## Evidence correction

The original r35 probe remains intact at `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r35.session/probes/hard-stop.json`. It accurately records that the browser-control session became unavailable while Opening was being observed. It does not establish that the Campaign Play tab or campaign state was lost.

Diagnosis task `019fa797-eb9d-7853-958b-c74dff0811fd` isolated the issue to an overlong control wait: r34 reset at `30014 ms` and r35 at `300003 ms`. A disposable controlled tab survived the reset in `browser.tabs.list()` and was reacquired with `browser.tabs.get(id)`. `browser.user.openTabs()` was empty because controlled tabs are not user-claimable tabs.

Read-only r35 SQLite evidence still records completed Opening `turn-opening:6a755b1a0f2c335e787c889f50c3957a3b864088`, `ready`, world/runtime `12/60`, one narration, no active turn, and zero completed player actions. The completion used the declared `zai-coding-plan` / `glm-5-turbo` attempt without retry or recovery.

## Task 18 classification

This changes only the original probe's classification: it is a browser-control verification defect, not a Campaign Play hard stop. Task 18 permits scheduled restart playtests between completed turns, so r35 may continue from its stored Opening after a tab-retention preflight. No earlier input may be replayed, and a future loss of the exact tab from both controlled and user registries remains a real stop.

Main completed the required humanizer and deslop review. The pass preserved the exact run, turn, wait durations, provider/model, world/runtime state, and tab-registry findings; it kept the correction limited to the browser-control classification and did not recast any Campaign Play state.
