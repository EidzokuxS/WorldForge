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
