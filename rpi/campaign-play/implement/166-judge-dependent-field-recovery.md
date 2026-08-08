# Task 166: Judge dependent-field recovery

## Contract

The Campaign Play Judge base prompt now states three existing dependent-field
invariants in literal field terms:

- deterministic judgments use the same non-no_effect result tier for
  `resultBounds.minimum` and `resultBounds.maximum`;
- uncertain judgments use different non-no_effect minimum and maximum tiers;
- `clarificationQuestion` is a non-empty question only for
  `clarification_required`, and is null otherwise.

When attempt 1 fails the final Judge ruling validation and safe issues exist,
attempt 2 receives one deterministic recovery section containing only ordered
`issueIndex`, Zod `code`, allowlisted schema path, and allowlisted
schema-owned message values. The section asks for a fresh ruling correcting
the listed invariant. It contains no proposal bytes, player prose, hidden
reasoning, names, or unsafe values. There is no feedback for transport,
parse/schema, or non-final failures without safe final issues, no feedback
after attempt 2, and no attempt 3.

Semantic-review verdict: "The prompt is technical, literal, field-named,
non-narrative, and free of filler; it changes instruction clarity only."

## Scope and graph review

The repair uses the existing Judge prompt, final-validation diagnostic, Judge
stage retry seam, and Campaign Play application driver. The transient recovery
carrier is an in-memory `WeakMap` keyed by the existing Judge error; it is not
persisted and does not alter the shared `CampaignPlayJudgeError` class.

GitNexus upstream impact was run before editing the indexed Judge method and
Judge-stage execute seams; both were LOW. The shared
`CampaignPlayJudgeError` class returned CRITICAL because it is used by 175
processes, so it was not edited. The local prompt and driver closures are not
indexed as executable symbols; source review confirmed the one Campaign Play
driver path and its existing one-retry gate. Main authorized this bounded
exception and no other provider, schema, persistence, mechanics, UI, or copy
change.

## Implementation

`judge.ts` keeps the existing final `campaignPlayJudgeRulingSchema.safeParse`
boundary and diagnostic allowlists, while carrying its sanitized issues through
the existing Judge error into the runtime catch. `turn-runtime.ts` forwards
feedback only for attempt 2 and captures it only from a final-validation Judge
failure. `campaign-play-application.ts` carries it across the existing single
automatic external-stage resume with the same turn, worker epoch observation,
deadline, and retry gate. Valid calls and transport/non-final failures do not
create feedback.

## Automated evidence

- Judge prompt/diagnostic/recovery suite: 44/44 passed.
- Focused Judge and runtime recovery/deadline suites: passed.
- Full Campaign Play turn-runtime suite: 70/70 tests passed; Vitest emitted
  one existing worker `onTaskUpdate` timeout after the completed file, so the
  runner exit was non-zero despite no test failure.
- Campaign Play application suite: 13/13 passed.
- Campaign Play turn-repository and database suites: 53/53 passed.
- Campaign Play Narrator and Game Master suites: 77/77 passed.
- Backend typecheck: passed.
- Backend build: passed.
- `git diff --check`: passed (only existing line-ending warnings).
- GitNexus `detect_changes --scope staged --repo WorldForge` reported a
  critical graph fan-out (841 indexed flows) through the shared
  `campaignPlayJudgeVisibleFactSchema`/file-symbol mapping. Source review
  found no non-Campaign-Play import or changed recovery/role path: all staged
  executable edits are confined to the Judge and Campaign Play turn/runtime
  application seams listed above. The shared `CampaignPlayJudgeError` class
  remains unedited.

## Rendered lane

Fresh run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r115` used commit
`2c915c97dc5872eeb1b4cb4ff70ebfac3bee250c`, campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, the exact
`lowwater-ledger-pristine-93a09e46-20260719` template, and the canonical Brina
card (`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`).
Materialized state/config hashes were
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`.
The rendered setup imported once and saved once (the setup helper listened for
POST while the product uses PUT, so it exited after observing the real save;
SQLite confirms one character row and one `character_created` event), then
selected lower-wards / Local / Already here / Looking for work and clicked
Begin once. Opening reached `ready` with a proper scene.

The first journey helper stopped before action 3 on a stale-choice locator
race; it submitted no action. A task-owned continuation added bounded choice
polling and ran one rendered choice at a time with authoritative readback.
Actions 1-11 each returned an enabled control, one unique turn/choice binding,
and one proper scene. The action-10 checkpoint had 10 completed/10 bound,
worldVersion 22, runtimeRevision 216, and 10 unique turn and choice handles.
Action 8 naturally exercised the existing Narrator recovery: attempt 1 was
`narration_invalid`, attempt 2 was `auto`/`native_json`, and exactly one proper
scene and binding settled. Offline parsing of the retained backend log shows
the normal initial player-action Narrator requests as `requestedMode=auto`,
`actualMode=native_json`, with bypass reasoning. No Judge final-validation
rejection occurred naturally (`judge.contract_rejected` count 0); focused
automated recovery tests are the branch proof.

The first genuine product defect was action 12, turn
`turn-player-action:6a2158a8ca9e7d4a8e21833e01c25517ac7333ef`, operation
`narration-operation:b881e32fe1492c82c442c9c3bfdd29f60d5b9786`, and attempt
`narration-attempt:7ed5ac5665efd6c27ddace0599fadd9a0736dd51`. Judge, Game
Master, and Actor recovery stages settled mechanics and three receipts, but
the final Narrator native_json request aborted at the existing absolute
deadline (`stage_timeout`, 38,234 ms), leaving no proper scene and no
Narrator attempt 2. The lane stopped immediately at 12 completed actions and
11 bound proper scenes; no later click, retry, Resume, replay, or reload was
performed. Final SQLite counts were 12 player turns, 12 unique turn IDs, 29
commands, 29 receipts, 12 narration operations, 13 narration attempts, and
11 proper scenes; `integrity_check` was `ok` and `foreign_key_check` was empty.
No late write or duplicate binding was observed.

## Acceptance handoff

Entry state: fresh canonical Brina lane after the Task 166 code commit, exact
setup admission, and one Begin. Criterion mapping:

- the three dependent-field rules and safe ordered recovery section are proven
  by the 44/44 Judge suite and focused runtime recovery test;
- initial player Narrator mode is proven in the retained r115 log as
  `auto -> native_json` with bypass reasoning, and actions 1-11 rendered
  proper scenes with enabled controls and unique bindings;
- the existing Narrator invalid-result recovery is positive at action 8
  (`narration_invalid` attempt 1 -> `auto/native_json` attempt 2, one scene,
  one binding); no natural Judge recovery was manufactured;
- action-12 mechanics/receipt settlement and the failed Narrator operation
  retain one turn identity, no duplicate mechanics, no attempt 3, and no late
  write, while correctly exposing the missing proper scene as the lane stop;
- reload and 60/60 acceptance are not claimed because the endurance contract
  requires stopping at that first genuine provider/transport deadline defect.

All task-owned r115 roots, descendants, helpers, ports 4020/4021/4022, and the
browser profile were stopped or closed and independently verified absent.
