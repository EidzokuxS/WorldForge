# Task 169: Game Master repeated-dialogue recovery

## Contract

When a Campaign Play Game Master proposal repeats a performing actor's recent
completed dialogue or interaction summary, the existing semantic guard still
rejects attempt 1 as `model_contract_failed`. The one existing automatic
attempt 2 receives only safe, structured mismatch coordinates in a recovery
prompt block and generates from the unchanged frame, ruling, resolution,
turn, and certified/full-authority authority. A valid retry may settle the
turn once; a second invalid proposal or timeout remains terminal with no
attempt 3, mechanics replay, late acceptance, duplicate command, receipt,
result, scene, or binding.

The safe feedback is exactly `game_master_semantic_validation_mismatch` with
ordered `failedChecks`. Each check is only
`check=repeated_actor_dialogue`, `effectIndex`,
`fieldPath=effects[<effectIndex>].summary`, `performingActorHandle`, and the
first matching `recentOwnActionIndex`. No repeated summary, actor name, source
moment, proposal prose, provider response, or raw feedback is persisted.

Protected surfaces are unchanged: the exported
`CampaignPlayGameMasterError` class and constructor, repeated-dialogue
equality semantics and warning payload, base prompt, provider/model,
strategy/mode/reasoning, temperature/token limits, 45-second deadline,
automatic-resume gate and count, schemas, persistence, mechanics, Judge and
Narrator recovery, UI, and player-visible copy.

## Impact and semantic review

Entry source was `94023415781b57df1c35bde9ca8d30f670df15b8` on `feat/revamp`,
with origin equal. The GitNexus index was three note-only commits behind and
was not reanalyzed in the live checkout. Current-source impact was run before
each resolvable edit with `node .gitnexus/run.cjs impact <target> -d upstream
-r WorldForge --include-tests`:

- `campaignPlayGameMaster`: LOW (indexed const target; no direct callers in
  the stale graph).
- `CampaignPlayGameMasterRequest`: MEDIUM, 16 impacted and 6 direct callers;
  all are Campaign Play Game Master construction/tests, runtime, route
  integration, and seeded replay.
- `File:backend/src/campaign-play/game-master.ts`: MEDIUM, 16 impacted and 6
  direct callers, Campaign Play only.
- `File:backend/src/campaign-play/turn-runtime.ts`: MEDIUM, 15 impacted and 5
  direct callers, Campaign Play only.
- `File:backend/src/campaign-play/campaign-play-application.ts`: MEDIUM, 15
  impacted and 7 direct callers, Campaign Play only.

The nested compile/prompt/drive symbols were not resolvable in the stale
index, so the authoritative containing-file routes and source inspection were
used. The known CRITICAL impact for exported
`CampaignPlayGameMasterError` was not an edit target; its class and signature
remain byte-for-byte unchanged. No non-Campaign-Play production caller or
broader contract was found.

Main reviewed the exact recovery block through humanizer and deslop. Verdict:
the block is technical, literal, field-named, non-narrative, and contains no
filler; use it exactly. No base prompt prose changed.

## Implementation

`game-master.ts` adds the exported recovery-feedback/check types, an internal
WeakMap keyed by the unchanged error class, and a getter. The repeated-dialogue
guard now collects deterministic ordered safe coordinates and attaches them
through the WeakMap while throwing the same `model_contract_failed` error. A
semantic-compile wrapper preserves feedback. `CampaignPlayGameMasterRequest`
accepts the optional in-memory feedback, and `plan()` appends exactly one
`GAME_MASTER_RECOVERY` / `RECOVERY_DIAGNOSTIC` / `END_RECOVERY_DIAGNOSTIC`
block only when it is present.

`turn-runtime.ts` captures only getter feedback at both certified admitted and
full-authority judged Game Master boundaries, forwards it to attempt 2 only,
and leaves existing interruption, deadline, authority, and persistence paths
unchanged. `campaign-play-application.ts` carries one optional in-memory
channel through the existing automatic resume loop and clears it after that
resume without putting feedback in interruption evidence or SQLite.

## Automated evidence before the rendered lane

- `npm test -- --run src/campaign-play/game-master.test.ts`: 52/52 passed.
  Covers ordered safe coordinates, unchanged rejection, wrapper preservation,
  normal prompt omission, exact recovery block, and sentinel/prose exclusion.
- `npm test -- --run src/campaign-play/turn-runtime.test.ts`: 72/72 passed.
  Covers certified and full-authority forwarding, unchanged identity and
  authority, one settlement, no Judge replay for certified contact, no
  mechanics replay, and existing terminal/late-write fences.
- `npm test -- --run src/campaign-play/campaign-play-application.test.ts`:
  14/14 passed. Covers one automatic resume carrying and then clearing the
  Game Master feedback channel.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed (line-ending warnings only for the dirty
  instruction files and touched TypeScript files).
- Root `npm run typecheck` remains unavailable because the pre-existing
  frontend ESLint error in `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105`
  (`react-hooks/set-state-in-effect`) fails before backend typecheck; the
  directly required backend checks pass.

## Rendered lane: r119

Implementation commit `ad624f33f69ed59d60cf71a942059bb73743cbe3` was pushed
before the lane; the lane runtime reported the same commit. The exact fresh
template `lowwater-ledger-pristine-93a09e46-20260719` was materialized once for
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r119` and campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. Materialized state and config hashes
were respectively
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, matching
the requested source hashes. The canonical Brina card was imported exactly
once with one file assignment, hash
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60`, and the
parse request returned 200. Save and Begin were each dispatched once; the
opening selections were lower-wards / Local / Already here / Looking for work,
and the opening request returned 202. After its asynchronous work completed,
the rendered Play page showed a ready alderman-hallway proper opening scene
with enabled suggestions. The one early `begin.cjs` exit was a harness timing
fault while the opening was still in progress; it issued no second click or
write and was not treated as a product defect.

The first rendered player action clicked one fresh enabled suggestion once.
Authoritative state froze the lane at action 1:

- turn `turn-player-action:41c438467586504507b1e68ec462fe4344478a72` reached
  `completed` with `final_world_version=12`, `resume_eligible=0`, and no turn
  error after one mechanics settlement;
- Game Master attempt 1 and Actor Replanner attempt 1 were accepted, so this
  lane did not naturally exercise repeated-actor-dialogue recovery;
- Narrator operation
  `narration-operation:11ef1217492c76e98b96c23583c2f974ff6c3b21` kept one
  immutable packet/result/narration identity and the Task 167 shared deadline
  `automatic_deadline_at=active_deadline_at=1786218411050` (operation creation
  `1786218321050 + 90,000` ms);
- Narrator attempts 1 and 2 both ended `narration_invalid`, with no attempt 3,
  no accepted proper scene, and no durable player-action binding. Attempt 1's
  safe packet diagnostic was `covered_observation_count` plus
  `missing_expected_observation_indexes` `[1]`; attempt 2's stable warning was
  `narrator_visible_actor_observation_mismatch` for beat 0, `beats[0].text`,
  observation index `[0]`, matched actor Vedris Kast, and allowed performer
  Dren Vask. The warning retained only the existing safe coordinates; raw
  proposal/provider bytes were not retained. This is the first genuine
  product/model boundary for r119, not a Game Master defect.
- The journey harness recorded `hard_deadline_or_poll_timeout` because its
  polling predicate did not recognize a completed turn whose Narrator
  operation was terminally failed. The read-only authority snapshot proves
  the real boundary above; this harness classification is recorded separately
  and does not justify another click.

The frozen action left exactly three receipts (one applied world mutation and
two no-op receipts), one settled Actor job, zero proper scenes, and zero
bindings. The terminal read-only probe reports SQLite `integrity_check=ok` and
`foreign_key_check=[]`. Checkpoints 10/20/30/40/50/60 and same-page reload were
not reached because the first genuine defect required an immediate freeze.
Evidence is retained under
`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r119.session/`
and
`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r119/`.

Cleanup stopped the task-owned roots `66108` (backend), `46780` (frontend),
and `60676` (Chrome), their recorded descendants/conhost/esbuild processes,
closed the task-owned CDP page, removed only the validated r119
`browser-profile`, and independently verified no recorded/`r119` process, no
listener on ports 4050/4051/4052, no CDP endpoint, and no profile directory.
AGENTS.md and CLAUDE.md hashes remained
`0D75EDC72CC195E385ED5B9C98C616E82FDB3C13E210D0FEB94333E19A76D541` and
`C6874175503F6890AF8CA2DB34EFF5630B8A513EDE95CEA3F76C43435925FCA6`.

## Acceptance handoff

Static acceptance is positive for normal prompt omission, exact safe
repeated-dialogue coordinates, both certified/full-authority automatic-resume
routes, one-resume clearing, and existing no-attempt-3/no-duplicate/late-write
fences. Rendered setup and opening are positive with exact template/config/card
hashes and one-time import/save/begin counts. The first player action proves
mechanics and Actor settlement once, immutable Narrator identity/deadline,
two truthful `narration_invalid` attempts, no third attempt, no proper scene,
and no binding. Repeated-dialogue recovery was not naturally exercised.
Because the lane froze at the first Narrator semantic defect, 60/60,
checkpoint progression, same-page reload, and final persistence observation
are omitted rather than claimed. The exact Main decision required is whether
to authorize a separate bounded Narrator packet/actor-mismatch recovery repair
before another pristine endurance lane; Task 169 does not select or implement
that repair.

## Unknowns

The provider's exact r118 proposal bytes and timed-out attempt-2 response are
not retained. r119's raw Narrator proposals and provider response bodies are
also not retained; only the safe packet-validation and visible-actor mismatch
coordinates, operation/attempt records, and bounded logs are known. No natural
Game Master repeated-dialogue mismatch occurred in r119, and no 60-action or
reload result exists.
