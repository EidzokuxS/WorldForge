# Task 18 Lane A r34: character-card parse session-loss hard stop

## Observed authority

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r34` materialized the unchanged `lowwater-ledger-pristine-93a09e46-20260719` template for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. Before UI input, its copied database was `character_required` at accepted/world/runtime `1/1/1`, with zero characters and turns, `integrity_check = ok`, and an empty foreign-key check.

The rendered Character page accepted exactly one upload of `output/playtests/character-cards/brina-porter-v2.json` as a native-resident card. The task-owned backend log records the server-side ingest pipeline completing for `Brina Hael`; its final recorded power-assessment native-object attempt used `glm-5-turbo`, finished with `stop`, and took `18274 ms`.

While that one parse was in flight, the browser UI session disappeared before the returned draft could be reviewed or submitted. Read-only API and SQLite checks after the loss still report `character_required`, world/runtime `1/1`, zero characters, and zero turns. No player setup, Opening, player action, duplicate parse, retry, database write, provider/model change, fallback, prompt change, restore, rewind, or resume was performed.

The structured record is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r34.session/probes/hard-stop.json`; the corresponding runtime evidence is `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r34/backend.log`.

## Task 18 classification

Task 18 ends a lane at its first hard stop and requires one submission per input. The lost UI state prevents the required one-time character setup submission, while a second parse would duplicate the frozen lane's only card input. Therefore r34, not the untouched copied campaign state, is disqualified from pristine acceptance at zero completed player actions.

Main completed the required humanizer and deslop review. The pass preserved the exact run, campaign, template, card, model, latency, submission count, and state facts; it kept the distinction between the disqualified lane and the untouched copied campaign state explicit.
