# Turbo r12 draft capture stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r12` materialized the frozen zero-turn Lowwater Ledger template on commit `4fc52c61`. Template hashes, eligibility, and empty character/play/turn tables were verified before opening the normal UI.

The human selected `Let the world decide` and submitted Build draft once. GLM-5-Turbo completed both character synthesis and power assessment on the first attempt and returned Sera Vales. The browser controller timed out before it captured the non-persisted draft response, then reset its browser process. The backend correctly made no character, world, runtime, or turn mutation.

r12 stopped before character acceptance. Repeating Build draft would have created a second generation request and hidden the lost response from the lane evidence, so it was not attempted.

## Evidence

- Character synthesis: accepted on the first GLM-5-Turbo attempt in `52,810 ms`.
- Power assessment: accepted on the first GLM-5-Turbo attempt in `12,059 ms`.
- Backend completion identified the generated draft as Sera Vales.
- Final SQLite state: `character_required`, `worldVersion=1`, `runtimeRevision=1`, zero characters, zero turns.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.

## Disposition

This is a verification-controller failure, not a Campaign Play product defect. The next Lane A attempt uses a nonblocking click and separate polling so the browser binding survives the long draft request. r12 supplies no Task 18 promotion evidence.

Humanizer review kept the note limited to the lost response and unchanged durable state. Deslop review removed procedural filler and retained the reason a second draft was not generated.
