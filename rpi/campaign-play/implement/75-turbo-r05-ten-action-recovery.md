# Turbo r05 ten-action recovery checkpoint

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r05` now contains one Opening and exactly ten completed player actions. Action 10 was recovered as the same durable turn after the previous task stopped during Narrator execution. No player action was submitted twice.

This run is diagnostic evidence, not a pristine-60 promotion lane. The player-profile authority repair landed after action 8, action 9 verified that repair, and action 10 required an explicit Resume after the original Narrator worker lease expired. The next formal lane must start from the frozen zero-turn template on one committed runtime revision.

## Player journey

Therrin Vask began at the alderman hallway, asked Dren Vask about a scraping sound, inspected the household board, and left for Dim Ward Market. He asked Kellin Marsh about the board's red marks, then moved to Warden Toll Gate and tried to establish himself as a bridge worker with Thera Vek. When a vague work request and a clarification were insufficient, he stated his stored fifteen-year fiber-tender history and asked Thera to check the shift records. Action 10 followed the visible route choice **Go to Cable Bridge South**.

By action 10, the player's self-chosen goal was to establish Therrin's bridge-worker identity and pursue work or evidence at the south bridge. The expected immediate consequence was arrival at the bridge, supported by Thera's statement about the south anchorage records and the rendered route choice. The committed result matched that expectation without granting employment, recognition, records, or another actor's presence.

## Recovery evidence

- Durable turn: `turn-player-action:23f5e9b653c632b070e8ac6e3701d898ba3d1dd2`.
- Submitted input: suggested choice `Go to Cable Bridge South`, idempotency key `2ec8dd04-cad4-4297-a24e-18c3b0f93f7e`.
- Before recovery, SQLite held the turn at `visibility_projected`, `worldVersion=27`, with pending narration `narration:d51e7a39393b374bbbca96d4e2e4084282b7294a` and an expired worker-epoch 11 lease.
- Backend startup converted the expired Narrator attempt to `worker_lease_lost`, retained the active-turn lock, and exposed one rendered Resume control.
- The isolated rendered Campaign Play page showed the already committed arrival at `cable-bridge-south`. One click on Resume sent only `POST /api/campaigns/:id/play/turns/:turnId/resume`; it did not submit `/play/turns` again.
- Narrator attempt 2 accepted Z.AI Coding Plan `glm-5-turbo` on worker epoch 12 in `20,094 ms`. The turn completed at `worldVersion=27`, `runtimeRevision=383` with no active turn.
- Reload preserved the complete rendered body and projection hash `c0227f8311feb654d67da136a0534746eccaa0c3644b687ded072e33300165a3` exactly.

## Ten-action audit

- Accepted Campaign World remains byte-authoritative at version `1` and content hash `93a09e46b8f5adfc96db1f184c20f0a426ff6428223cb312c427a716bbeeb717`.
- Campaign Play is `ready` at `worldVersion=27`, `runtimeRevision=383`, world time Day 1 `00:14`.
- Runtime-event sequences are contiguous from `1` through `383`.
- The receipt ledger contains `42` receipts. All `26` receipt-marked world mutations have causal event ids.
- All eight agent-controlled people retain at least one active goal, one present placement, one active plan, and one schedule.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.
- The visible result contains no actor at the bridge, no hidden pressure, no new possession, and no claim that Thera followed the player.

## Findings and disposition

The recovery path preserved the single admitted action and reused its immutable public packet. This is the required behavior for an interrupted post-settlement Narrator call.

The final narration repeats the committed observation almost word for word in `What changed` and `The moment`. That repetition is an existing presentation advisory, not a causal contradiction or a reason to add a fallback. Thera's unsupported exact eight-year tenure from action 9 remains a separate presentation observation.

`r05` stops at this checkpoint. It cannot satisfy Task 18's frozen-lane evidence contract because mechanics code changed during the sitting. The next run must materialize the same accepted zero-turn Lowwater Ledger template under a new run id, freeze eligibility before Opening, and keep one committed GLM-5-Turbo runtime for the full lane.

Humanizer review kept the note in direct playtest language and preserved the distinction between observed UI behavior, authoritative SQLite state, and promotion eligibility. Deslop review removed no constraint or uncertainty; the evidence remains specific to this campaign and checkpoint.
