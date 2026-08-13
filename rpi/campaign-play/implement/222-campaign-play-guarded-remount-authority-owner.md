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
