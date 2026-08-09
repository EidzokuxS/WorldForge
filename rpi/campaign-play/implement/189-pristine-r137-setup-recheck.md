# Task 189: pristine r137 setup and endurance recheck

## Contract and entry

Task 189 rechecks the unchanged accepted Task 188 product in exactly one fresh
Campaign Play lane. No product or test file was changed. The actor and surface
were the Campaign Play player using the Character setup and rendered Play page;
the trigger was one canonical card import followed by one rendered action at a
time. The required observable was one proper scene and one unique binding per
settled action, with a hard stop at the first genuine defect. The r137 lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r137` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, on unchanged source
`01fb599bbe6335b9b6273aae05f56b9b22d4137c` (local and origin equal at entry).

The frozen r136 setup boundary remains an environment/UI-state verification
blocker, not a product semantic defect. Task 188 fieldPath recovery and the
60-action objective were still unverified at entry. r136 and all earlier lanes
remain immutable.

## Canonical materialization and setup

The lane was materialized once from
`lowwater-ledger-pristine-93a09e46-20260719`. The relied-on hashes were:

- template state: `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`
- lane config: `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`
- canonical Brina card: `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`

The materialized state and config read back to the required hashes. Import and
file assignment were performed once on the same rendered page; the Brina draft
rendered and Save completed once. The exact setup selections were
lower-wards / Local / Already here / Looking for work, followed by Begin once.
Opening reached a ready rendered proper scene before action 1.

## Rendered journey and terminal boundary

Actions 1 through 8 each settled one player turn and one unique proper-scene
binding. Action 7 naturally exercised the existing Narrator recovery path:
attempt 1 reported safe `covered_observation_count` and
`missing_expected_observation_indexes` coordinates, and attempt 2 accepted the
same operation. Action 8 naturally exercised the existing Game Master recovery
path (attempt 1 stage timeout, attempt 2 accepted); its Actor stage and Narrator
also accepted. Task 188's new Grounding Reviewer `fieldPath` recovery did not
occur naturally, so no live fieldPath coverage claim is made.

Action 9 was the first genuine product boundary. The rendered choice was
`Talk to Dren Vask: ask about Pira Senn's schedule` with choice handle
`choice_a09330c7aa26b53101955fa3`. The authoritative turn was
`turn-player-action:2eebb6da3de9d4edef1f1143cec61aa2398e9fcb`, with expected and
base world version 19, final world version 20, expected runtime revision 172,
worker epoch 8, completed stage, and no turn error. Judge, Game Master, Actor,
mechanics, and receipts settled once. The Narrator operation
`narration-operation:de65d9b2e996fb08fcf5524fe40423a6b163d7ea` then failed
`narration_invalid` after its two bounded attempts:

- attempt 1: `narration-attempt:17ec8198217e4c7c25f2b32e9000e5a83c0b8e3d`,
  `zai-coding-plan` / `glm-5-turbo`, strict_object, stop, schema invalid,
  9,432 ms, 10,261 input and 287 output tokens;
- attempt 2: `narration-attempt:ca32be57ffc834fb6cae483946ec8b6a81863c2a`,
  same provider/model/strategy, stop, schema invalid, 7,692 ms, 10,559
  input and 307 output tokens.

Both attempts retained the existing safe
`narrator_visible_actor_observation_mismatch` coordinates in
`backend.stdout.log` lines 1843-1865 and 1914-1936: beat 0,
`beats[0].text`, observationIndexes `[0]`, matched Vedris Kast / `Vedris`, and
allowed/source performer Dren Vask. No attempt 3, proper scene, or binding was
created, and no later action was submitted. The Task 188 `fieldPath` coordinate
was not naturally involved; raw candidates and provider response bodies are not
retained.

The terminal state also exposed a persistence/rendering inconsistency that is
part of the frozen evidence: the failed operation had non-empty concise display
and suggested-action projections (lengths 475 and 346), while its
`campaign_play_narrations` row remained `pending` and
`campaign_play_proper_scenes` had no row for the operation. The same page showed
the failed candidate-like “What happened” projection and a Restore control,
with rendered choices still enabled. This is observed state only; no cause is
inferred and no raw proposal text is reproduced.

## Authoritative persistence and integrity

At the action-9 boundary the read-only SQLite counts were: 10 turns, 10
results, 20 model stages, 36 receipts, 8 proper scenes, 9 Narrator operations,
11 Narrator attempts, 7 actor jobs, and 7 actor plans. The campaign state was
`world_version=20`, `runtime_revision=196`, setup phase `ready`. SQLite
`integrity_check` returned `ok` and `foreign_key_check` returned an empty set.
No reload was performed after the hard stop, so the 60/60 checkpoints and
same-page reload criteria are unavailable.

The final state database hash is
`2134D27CDBDD21C741ECE6FFF0DB9A0083F668F7647EEE750C61B19D455BE21D` and the
captured backend log hash is
`8B996BB15F80A9AE01E61243A9EA52BD7E47C96188A4CEF00F0D851E933C2D80`.
Generated evidence remains under the r137 session and run roots and is not
committed.

## Cleanup and repository result

The task-owned r137 page was finalized and `browser.tabs.list()` returned an
empty list. The task-owned backend/frontend roots and child Node processes were
stopped after command-line/PID verification; ports 4230, 4231, and 4232 have no
listeners and all recorded PIDs are absent. The browser runtime does not expose
a filesystem-addressable profile path; no unrelated browser profile was
removed. Launch helpers and generated session/run evidence were preserved.

Only this note is tracked by Task 189. `AGENTS.md` and `CLAUDE.md` remain
untouched and unstaged. `git diff --check` and note-only staged
GitNexus `detect_changes` were run before the note commit. The note was pushed
to `origin/feat/revamp`, and local HEAD equals origin.

## Acceptance handoff

- Entry: unchanged source `01fb599bbe6335b9b6273aae05f56b9b22d4137c`, canonical
  r137 materialization and hashes above.
- Setup: one import, one Save, exact setup selections, one Begin, and ready
  Opening are rendered evidence.
- Positive journey: actions 1-8 have eight unique proper-scene bindings;
  action-7 Narrator and action-8 Game Master recoveries are live evidence.
- First-defect boundary: action 9's exact turn, operation, attempts, safe
  mismatch coordinates, failed Narrator state, no scene/binding, and no later
  click are authoritative evidence.
- Persistence: read-only counts, world/runtime versions, integrity, and FK
  results above prove no duplicate mechanics at the boundary; the pending
  narration plus failed operation projection is preserved as an observed
  inconsistency for Main.
- Unavailable: Task 188 fieldPath live recovery, action checkpoints 10-60,
  60 unique bindings, and same-page reload. Raw provider/candidate bytes and the
  cause of the failed projection remain unknown.

Next decision for Main: no repair was selected in Task 189; decide whether to
investigate the action-9 failed-Narrator terminal projection before resuming the
endurance objective.
