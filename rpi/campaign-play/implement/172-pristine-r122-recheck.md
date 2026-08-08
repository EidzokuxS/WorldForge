# Task 172: pristine r122 recheck

## Contract and entry state

This note records one fresh rendered acceptance continuation against the accepted Task 171 source. No product or test files were changed. The protected entry checkout was `feat/revamp` at `0c22c35786e4f3d4f713f6c299dbb8378d1d26e0`, equal to `origin/feat/revamp`, with only the pre-existing unstaged `AGENTS.md` and `CLAUDE.md` changes. Task 171 remains accepted at implementation commit `829d70714ab8fca04531896c7a6296210f31c4ae` and evidence-note commit `0c22c35786e4f3d4f713f6c299dbb8378d1d26e0`.

The frozen r121 diagnosis was preserved: action 9 carried the existing Task 169 repeated-actor-dialogue coordinates into Game Master attempt 2, then the unchanged 45-second Game Master deadline ended in `stage_timeout`. This r122 packet made no change to that prompt, guard, recovery channel, deadline, attempt count, provider, model, mode, or reasoning.

Protected file hashes were unchanged before and after the lane:

- `AGENTS.md`: `0d75edc72cc195e385ed5b9c98c616e82fdb3c13e210d0feb94333e19a76d541`
- `CLAUDE.md`: `c6874175503f6890af8ca2db34eff5630b8a513ede95cea3f76c43435925fca6`

## Fresh setup

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r122`
Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

The materialized template, configuration, and canonical Brina card matched the fixed inputs:

- template state SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`
- config SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`
- card SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`

The first setup attempt stopped before import because the task-owned harness marker had not yet been initialized. This was a harness-only preflight fault, not a product result. The marker was repaired with the task-owned `set-marker.cjs`, then the canonical card was imported once with one file dispatch, parsed with HTTP 200, and rendered as `Brina Hael`. Save/Continue was clicked once, the exact lower-wards / Local / Already here / Looking for work choices were selected, and Begin was clicked once (HTTP 202). The opening reached a ready proper scene.

## Rendered journey

Evidence is retained under:

- session: `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r122.session`
- run: `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r122`
- terminal record: `r122-terminal.json`
- per-action records: `actions/action-001-evidence.json` through `actions/action-007-evidence.json`

Actions 1 through 6 each settled one authoritative player action with one unique proper-scene binding and enabled controls. Action 1 naturally exercised the existing Narrator bounded recovery: initial attempt 1 was `narration_invalid`, attempt 2 was accepted, and the operation settled once. Actions 2 through 6 each completed with one Narrator attempt. All observed initial player-action Narrator requests used `requestedMode=auto` and `actualMode=native_json`; no provider/model/settings change was made.

The first genuine product/model boundary was action 7. The rendered choice was clicked once:

- turn `turn-player-action:ee8f3c2b1fa88dc519b48cb8baf736abdc69da51`
- turn stage `interrupted`, error `stage_timeout`, interrupted stage `admitted`, `resume_eligible=1`
- Game Master attempt 1: `model_contract_invalid`, schema outcome `invalid`, 6,614 ms
- Game Master attempt 2: `stage_timeout`, schema outcome `transport_error`, 45,081 ms
- no Narrator attempt or operation, proper scene, receipt, actor job, turn result, attempt 3, late write, or mechanics replay for action 7

This is the same bounded Game Master repeated-dialogue recovery boundary evidenced by frozen r121. The retained evidence does not include a provider request/response body or a new rejected coordinate, so no provider-cause claim is made. The lane was frozen immediately; no later action, retry, Resume, Restore, replay, or state mutation occurred.

The lane therefore completed 6 of 60 actions with 6 unique bindings. Checkpoints 10/20/30/40/50/60 and the same-page reload were not run because the first genuine defect hard-stopped the journey.

## SQLite and authoritative counts

The read-only, query-only terminal inspection recorded:

- `campaign_play_turns`: one opening completed row, six completed `player_action` rows, one interrupted `player_action` row with `stage_timeout`
- proper scenes: 6
- Narrator operations: 6
- Narrator attempts: 7
- receipts: 27
- commands: 27
- `PRAGMA integrity_check`: `ok`
- `PRAGMA foreign_key_check`: empty

The action-7 authoritative state retained the prior proper scene, `worldVersion=18`, and `runtimeRevision=133`; no action-7 settlement artifacts were present.

## Cleanup and validation

The task-owned backend root was PID `12384` (descendant `44180`), frontend root `70684` (descendants `73424`, `69784`), and browser root `56896` (descendants `56800`, `38456`, `52604`, `58788`, `57488`, `40600`). Owned listeners were ports 4080, 4081, and 4082. The exact page was CDP target `39D4EE34484E8A2433A31F40145DF05C` at the campaign Play URL, and the only browser profile was the r122 session profile. The page was closed, all recorded roots and descendants were stopped, ports 4080-4082 were independently verified free, CDP was unreachable, and the validated r122 profile was removed and verified absent. `cleanup-verification.json` records the final absence checks. Task-owned helper scripts were not running; generated run/session evidence remains uncommitted.

No Task 171 static suites were rerun because the accepted entry identity matched exactly and the packet forbade product/test changes. The only post-lane validation for this note is note-only `git diff --check`, staged GitNexus `detect_changes`, exact staged-path review, commit, push, and local/origin equality. The only intended tracked artifact from this packet is this note.

## Acceptance handoff

- Entry: accepted Task 171 source, exact template/config/card hashes, protected instruction files preserved.
- Setup: one canonical import, one Save, exact setup selections, one Begin, ready opening proper scene.
- Positive journey: actions 1-6 produced six completed turns, six unique proper-scene bindings, and 27 receipts/commands; action 1 proved the existing Narrator bounded recovery can settle once.
- Failure boundary: action 7 stopped at Game Master `model_contract_invalid` attempt 1 followed by unchanged attempt-2 `stage_timeout`; no Narrator/persistence settlement or late write occurred.
- Persistence/integrity: query-only counts, integrity `ok`, and empty foreign-key check are retained; no reload criterion was reached.
- Cleanup: every recorded task-owned PID, listener, CDP endpoint, page, and profile was independently verified absent.

The next Main decision is whether to address the frozen Game Master action-7 `model_contract_invalid` followed by unchanged attempt-2 `stage_timeout` boundary before starting another pristine lane. No repair is selected or implemented by Task 172.

## Unknowns

The retained provider logs do not contain raw request/response bytes or a new semantic coordinate for action 7; the exact rejected Game Master content is therefore unknown. The 60-action and reload criteria remain untested in this lane, and no natural Task 171 quoted-reference recovery occurred.
