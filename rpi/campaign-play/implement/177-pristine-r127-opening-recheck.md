# Task 177: pristine r127 Opening recheck and endurance continuation

## Contract

This task ran exactly one fresh canonical Campaign Play lane on the accepted
Task 176 source. It made no product or test change. The lane was required to
distinguish the frozen r126 Opening timeout from a repeatable Opening boundary,
then continue one rendered action at a time until 60 actions or the first
genuine defect. A proper Opening, one settled scene and one unique binding per
admitted action, read-only SQLite integrity, and complete task-owned cleanup
remain the acceptance contract. A natural required reply would have required
the contact option first and absent from later suggestions; that case was not
reached.

## Entry and frozen comparison

The entry checkout was `feat/revamp` at
`0867c66afcb0646c08c1af0590f7b12f7eb74837`, equal to
`origin/feat/revamp`. The only pre-existing working-tree changes were
`AGENTS.md` and `CLAUDE.md`; they were not edited or staged. Their entry hashes
were respectively
`0D75EDC72CC195E385ED5B9C98C616E82FDB3C13E210D0FEB94333E19A76D541` and
`C6874175503F6890AF8CA2DB34EFF5630B8A513EDE95CEA3F76C43435925FCA6`.

Frozen r126 was preserved. It used the same canonical setup and ended before
player action 1 when Opening Narrator requested `auto`, resolved to
`native_json`, and locally aborted at the 90,000 ms deadline after 90,052 ms.
Its Opening turn was interrupted with `stage_timeout`; no candidate, proper
scene, player action, provider status/body, or provider cause was retained.

## r127 setup

The fresh lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r127` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, using task-owned ports 4130/4131/4132,
one browser profile, and one marked page. The template state hash was
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, the
config hash was
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and the
canonical Brina card hash was
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was performed once: one card import (one file selection and one parse
POST, status 200), one Continue, one Save PUT (status 200), the exact
lower-wards / Local / Already here / Looking for work selections, and one
Begin POST (status 202). The rendered setup record is in
`r127.session/setup.stdout.log`; the initial read-only database had no player
turns, operations, attempts, or receipts and reported `integrity_check=ok`
and an empty foreign-key check.

Opening did not reproduce r126. The backend `llm.attempt` record at
`r127.session/backend.stdout.log:116-154` shows a successful Opening request
for `zai-coding-plan` / `glm-5-turbo`, requested `auto`, actual `native_json`,
finish `stop`, output 172 tokens, and latency 6,741 ms. The rendered page
reached a proper ready scene with enabled suggestions, so action 1 was
admitted exactly once.

## Rendered journey and first genuine defect

Action 1 selected the first rendered suggestion, “Talk to Dren Vask: ask about
the notice work”. Its evidence is
`r127.session/actions/action-001-evidence.json` and the terminal summary.
It settled one proper scene and one binding. Narrator attempt 1 ended in the
existing `narration_invalid` recovery path and attempt 2 was accepted on the
same operation with native JSON; three receipts and one Actor job were
recorded, with no duplicate settlement.

Action 2 selected “Talk to Dren Vask: accept the notice work” exactly once and
settled one proper scene and one binding with one accepted Narrator attempt.
The lane therefore had two completed actions and two unique bindings before
the terminal boundary.

The first genuine defect was action 3, selected as
“Talk to Dren Vask: accept the notice and leave”. The immutable turn was
`turn-player-action:019414c638aa8b1f96db410517e201a35f456274`. Its authoritative
model-stage records in `r127.session/actions/action-003-evidence.json` show:

- Judge attempt 1 accepted, strict_object, `zai-coding-plan` /
  `glm-5-turbo`, duration 17,874 ms, schema valid.
- Game Master attempt 1 returned a candidate but was rejected by the existing
  `model_contract_invalid` semantic boundary, strict_object, duration 16,253
  ms. The retained warning is the existing semantic-compilation warning; raw
  rejected proposal bytes are not treated as durable evidence.
- Game Master attempt 2 was the existing automatic recovery, requested the
  same configured model and auto/native_json route, then locally ended with
  `stage_timeout` after 45,049 ms. No provider response, usage, finish reason,
  or accepted candidate was retained.

The turn ended `stage=interrupted`, `interrupted_stage=judged`,
`error_code=stage_timeout`, worker epoch 3, and `resume_eligible=1`. There was
no Narrator operation or attempt, Actor job, receipt, result, proper scene, or
binding for action 3. The rendered page showed “The turn stopped before it
finished.” and a Resume control; it was not pressed. `r127-terminal.json`
records `result=first_genuine_defect`, `completed=3`, `bound=2`, and no later
click. The lane had no checkpoint or reload because the first genuine defect
requires an immediate freeze. Task 176's required-reply packet was not reached.

The final read-only database evidence is
`r127.session/probes/final-db.txt`: two completed player turns, the interrupted
action-3 turn, two completed Narrator operations for actions 1 and 2, no
action-3 Narrator operation, `integrity_check=ok`, and an empty
`foreign_key_check`. The preserved evidence contains no raw provider body or
candidate for the action-3 recovery timeout, so no provider cause is inferred.

The r127 Opening success falsifies only reproduction of r126's Opening timeout
in this independent lane. It does not establish a provider or environmental
cause for r126, and the later action-3 Game Master timeout is a separate first
defect after a successful Opening.

## Cleanup and evidence roots

The task-owned roots were backend PID 43408, frontend PID 35896 with listener
child 47716, Chrome/CDP PID 24756, backend conhost 46500, frontend conhost
65488, and the exited journey wrapper 6196. The pre-cleanup ownership registry
is `r127.session/probes/ownership-precleanup.json`. The marked page target was
`FB99635DF19A5D430CDD52319F724445` at the Campaign Play URL. It was closed
before process cleanup. All recorded roots and descendants were stopped only
after command-line/path ownership validation. The browser profile under
`r127.session/browser-profile` was then removed.

Independent post-cleanup checks captured in
`r127.session/probes/cleanup-final.json` found no recorded process, no listener
on 4130/4131/4132, no CDP endpoint or page target, and no browser profile. The
generated r127 session/run roots and all journey, setup, database, log, and
ownership evidence remain preserved and uncommitted.

## Validation and acceptance handoff

Task 176 tests and builds were not rerun because the accepted source was
unchanged and this task owns no product or test delta. The note-only change
was checked with `git diff --check` and staged GitNexus `detect_changes`; the
exact staged path is this note only. The final commit and push are recorded in
the parent handoff.

The accepted entry state, canonical hashes, one-time setup, successful Opening,
two positive action settlements, first-defect freeze, authoritative model
stages, read-only SQLite integrity/FK proof, and independent cleanup map the
experience contract. The 60-action checkpoints and same-page reload are
omitted because the action-3 Game Master stage timeout is the first genuine
defect. Required-reply ordering is omitted because no required-reply packet
was naturally reached.

## Unknowns

The frozen r126 Opening provider status/body and candidate bytes remain
unknown, as do the action-3 Game Master attempt-2 provider response and any
candidate bytes. No causal claim is made from those missing bytes.
