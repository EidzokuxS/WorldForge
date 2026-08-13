# Task 222: guarded remount authority owner

## Objective

Keep the existing one-time accepted-turn recovery on the Campaign Play page
from getting stuck on `Loading campaign`. A guarded remount must rehydrate the
followed durable turn through the existing serial authority poller, without a
second state reader, admission, Resume request, or player-visible copy change.

## Experience contract

- Actor: the player on the rendered Campaign Play surface.
- Trigger: one enabled action, including the existing automatic same-URL
  recovery.
- Outcome: the exact durable proper scene replaces the previous scene and
  controls become enabled within the turn control window.
- Forbidden: duplicate POST, replay, manual recovery, operator reload before
  final acceptance, provider/model/prompt/schema/reviewer changes, backend or
  persistence changes, and weaker mechanics fences.

## Implementation

The guarded-remount branch now sets the followed turn and releases the initial
loading gate, then returns from the initial-load effect. It does not call
`refreshAuthority`; the existing effect-scoped serial followed-turn poller is
the sole state-read owner. Its existing 5,000 ms read deadline, abort/late
result fence, monotonic projection rules, exact-turn ready release, and
session-storage guard clearing remain unchanged. The unguarded initial load,
SSE progress channel, explicit Resume behavior, and API contracts are
unchanged.

## Static evidence

- Entry local and origin: `09097b97193dbe2711253f77e13980a5451ab5bd`.
- Current-head exact-entry GitNexus shadow impact for `CampaignPlayPage`,
  `applyAuthorityState`, `refreshAuthority`, and `beginFollowing`: LOW and
  confined to the Campaign Play frontend process/module; no HIGH/CRITICAL or
  unrelated owner was reached. The authoritative repository index was stale
  and was not mutated.
- Focused Campaign Play page tests: 41 passed.
- Full frontend suite: 519 passed in 76 files.
- Frontend typecheck, production build with
  `NEXT_PUBLIC_API_BASE=http://127.0.0.1:4670`, touched-file ESLint, and
  `git diff --check`: passed. The existing Next workspace-root warning remains
  unchanged.
- The new guarded-remount regression proves a timed-out first read is aborted,
  a later read is serial (maximum one state read in flight), the exact ready
  scene and enabled action render, the session guard clears, no admission or
  Resume/reload occurs, and a late stale result cannot regress the projection.
- GitNexus `detect_changes --scope staged` completed before commit. The
  authoritative index is stale for these current page symbols and reported
  `No changes detected`; the exact-entry shadow impact above is the applicable
  current-source blast-radius evidence.

## Live evidence

Disposable Chromium failure-injection and the r182 GLM 5 Turbo acceptance lane
remain to be run after the pushed implementation build. No live campaign lane
has been materialized by this task at this point.

## Preflight boundary

The disposable preflight used a fresh scratch root on ports 4670/4671 (4672
remained unused), built the frontend with
`NEXT_PUBLIC_API_BASE=http://127.0.0.1:4670`, and verified the rendered setup,
Brina import, opening choices, Begin, and Opening. Chromium sent exactly one
player-action POST/202 to port 4670 for
`turn-player-action:2c2501122194764f64e27af50c5179b6bcd9fa1d`; no second POST,
Resume request, or operator reload occurred. The product automatic recovery
guard was observed in session storage with value `1`, and the current
navigation entry was a reload.

The backend durably reached `phase=ready`, `activeTurn=null`,
`worldVersion=12`, `runtimeRevision=44`, with the same turn bound to a
completed operation and proper scene. Authority GETs used the correct
`127.0.0.1:4670` URL and returned HTTP 200 repeatedly, but Chromium remained
on `Loading campaign` with controls disabled beyond 120 seconds. Directly
running the checked-in frontend authority parser against the same 200 response
returned `CampaignPlayApiError` (`status=200`, invalid response): the
`narrationOperation` payload contains the existing shared-contract optional
`sourceKind: "model_accepted"` field, while
`parseNarrationOperation` still rejects any key outside its older exact-key
set. The remounted React state therefore stayed null despite the ready
authority response. This is a separate frontend API contract mismatch, not a
second-reader/remount ownership failure; no parser or backend change was made
under Task 222. The r182 lane was not materialized. Task-owned preflight
processes, ports, browser, scratch root, and temporary logs were cleaned.

Status: Needs attention at the first product boundary above; r182 acceptance
criteria are unavailable and remain unclaimed.

## Source-kind decoder correction

The frontend `parseNarrationOperation` decoder now accepts the historical
operation key set and, when present, the one shared-contract optional
`sourceKind` key. Its only accepted values are `model_accepted` and
`deterministic_continuity`; unrelated keys and unsupported values remain
invalid. `hasExactKeys` and all operation/status/attempt/result invariants are
unchanged. No backend, shared schema, prompt, provider, model, persistence,
reload, polling, or player-visible copy changed.

Current-head GitNexus exact-entry lookup did not index the private parser
symbol. The narrowest indexed owner, `loadCampaignPlayState`, reports a
CRITICAL propagation graph (24 impacted symbols, 7 direct callers, 8
processes, 4 modules), including non-game loaders, because the decoder feeds
the shared state loader. The edit remains confined to the local parser seam
and its focused tests; no additional production owner was required.

Focused API and Campaign Play page tests: 61 passed. Full frontend suite: 525
passed in 76 files. Frontend typecheck, production build with
`NEXT_PUBLIC_API_BASE=http://127.0.0.1:4670`, touched-file ESLint, and
`git diff --check`: passed. GitNexus detect is still required immediately
before commit. Real Chromium preflight and r182 remain pending.

## r182 acceptance boundary

The source-kind correction was pushed as `bb566916ce220078e6e176f800d23e658c76f54c` and verified equal on local and `origin/feat/revamp` before lane work. A disposable Chromium preflight against a fresh scratch root on ports 4670/4671 passed the guarded-remount contract: one player-action POST/202, repeated authority reads carrying `sourceKind: "model_accepted"`, exactly one product-owned same-URL reload, the exact durable scene and enabled control rendered, and no second POST, Resume, or operator reload. The scratch root and task-owned preflight processes were removed.

Exactly one r182 lane was materialized and prepared:
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r182`, campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, provider/model
`zai-coding-plan/glm-5-turbo`, ports 4670/4671/4672. The isolated campaigns
root and one `--live-phase prepare` were used before runtime access. The
canonical config and Brina hashes matched
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065` and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`; the
prepared state database was the materializer output for canonical state hash
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`.
Canonical rendered Brina import, Save/Continue, lower-wards / Local /
Already here / Looking for work, Begin, and Opening completed once.

Actions 1 through 21 each had one signed decision, one rendered click, one
admission, one durable completion, one unique rendered proper-scene bind, and
ready controls. Action 2 required authoritative reconciliation after a
harness predicate timeout; no second click was made. The completed-action
latencies ranged from 15,612 ms to 118,000 ms (the latter is the conservative
boundary-safe value recorded for action 2); action 10 was 75,831 ms and
action 21 was 48,714 ms. Checkpoints at actions 10 and 20 had no duplicate
turn or operation identities, `query_only=1`, `integrity_check=ok`, and zero
foreign-key violations. Action 10 had 10 completed player actions and action
20 had 20.

The first genuine product boundary was action 22. It had exactly one signed
decision and one rendered click, admitting
`turn-player-action:7d0dea54d65f8d6c771fe84d7d542a52645223e5` at
`1786654740900`; no duplicate admission, click, Resume, or operator recovery
occurred. At the frozen capture (`1786655113653`, 372,753 ms after durable
submission), authority was still `phase=turn_active`, `activeStatus=processing`,
`activeProgress=world_acting`, `turnStage=primary_settled`, runtime revision
492, world version 35, worker epoch 8, and `resumeEligible=false`. Judge
attempt 1 was a timed-out transport-error interruption, Judge attempt 2 was
accepted/valid, and Game Master was accepted/valid. Three actor jobs were
deferred with `control_budget`. No narration operation existed for action 22;
the operation visible in the state belonged to the prior completed turn. The
rendered page remained on the prior scene with disabled controls and no
Resume/error surface. A read-only SQLite capture reported `integrity_check=ok`
and zero foreign-key violations. The exact scalar boundary is preserved in
`r182-boundary-action-22.json` and the full session logs/evidence remain
uncommitted.

This is `Needs attention`: the first genuine action-control boundary occurred
before action 22 returned to ready control, so the 60-action and final
same-page-reload criteria are unavailable and are not claimed. No repair,
retry, replay, reload, later click, or second lane was performed.
