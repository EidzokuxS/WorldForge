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

## Rendered lane

Pending implementation commit and fresh lane `r119` (or the next unused
suffix). This section will record the exact setup/action boundary, any natural
repeated-dialogue recovery, checkpoint counts, SQLite integrity/FK checks,
same-page reload result, hashes, and task-owned cleanup.

## Acceptance handoff

Pending rendered evidence. Automated evidence proves the normal prompt path,
safe repeated-dialogue coordinates, both authority recovery routes, one-resume
clearance, and existing terminal/no-duplicate fences. The rendered lane must
prove the built Campaign Play setup, one-action settlement behavior, and the
60-action/reload contract or freeze the first genuine defect without replay.

## Unknowns

The provider's exact r118 proposal bytes and the timed-out attempt-2 response
are not retained; only the safe repeated-dialogue boundary is known. The fresh
lane will not manufacture that model failure.
