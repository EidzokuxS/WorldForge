# Task 221: accepted-turn authority recovery

## Objective

Keep a durably admitted Campaign Play turn playable when the browser cannot
apply the authoritative projection. After 15 seconds of continuous authority
read failure, timeout, or refused ready projection, the page may hard-reload
the same URL once for the exact campaign/turn. The reload is guarded by
session storage and must rehydrate the durable turn without another admission.

## Experience contract

- Actor: the player on the rendered Campaign Play page.
- Trigger: one enabled choice or freeform action, admitted once.
- Outcome: the exact durable scene and enabled controls render; if authority
  reconciliation remains unavailable, one automatic same-URL reload restores
  the exact turn or its truthful terminal Resume state.
- Forbidden: duplicate POST, replay, manual recovery for acceptance, provider
  or model changes, prompt/schema/reviewer changes, and new player-visible copy.

## Implementation

The Campaign Play page keeps its serial state authority poller and monotonic
projection rules. It records a continuous reconciliation failure for the
followed turn, arms `worldforge:campaign-play:authority-recovery-reload:<campaignId>:<turnId>`
before the single hard reload, and rehydrates that identity on the next page
load. The guard is cleared only when the exact turn reaches a rendered ready
projection or truthful interrupted/failed terminal state. SSE remains a
best-effort progress channel and does not arm recovery.

No backend, persistence, provider/model, prompt, schema, reviewer, or
player-visible copy changed.

## Static evidence

Entry commit: `a8337622efe04a2282e5e0261fb2975725f1dae1`.

- Exact current-head GitNexus shadow impact for `CampaignPlay`,
  `applyAuthorityState`, `refreshAuthority`, and `beginFollowing`: LOW, inside
  the Campaign Play frontend process/module, with no unrelated owner.
- Focused Campaign Play page tests: 40 passed.
- Campaign Play API tests: 14 passed.
- Full frontend suite: 518 passed in 76 files.
- Frontend typecheck, production build, touched-file ESLint, and
  `git diff --check`: passed (the existing Next workspace-root warning remains
  unchanged).

## Live evidence

### Disposable Chromium failure-injection preflight

- Built frontend: production Next build with `NEXT_PUBLIC_API_BASE` pointed at
  the task-owned cross-origin stub (`127.0.0.1:4731`); page served at
  `127.0.0.1:4730`.
- The initial Opening rendered with one enabled `Start the recovery` choice.
  Exactly one click produced exactly one `POST /campaign-1/play/turns` and a
  `202` admission for `turn-1`; no second POST and no Resume/recovery request
  occurred.
- The stub returned repeated authority `503` responses and rejected SSE while
  the durable turn remained followed. The page stayed on the accepted turn and
  did not show a terminal service-unavailable action.
- CDP recorded exactly one subsequent Campaign Play document navigation to the
  same URL after the continuous-failure threshold. The stub recorded the
  corresponding post-reload state reads: an initial failed read followed by a
  `200` ready state for the same `turn-1` at about 18.1 seconds after
  admission.
- The final rendered scene was `The recovered signal answers.` with the
  enabled `Continue with the signal` choice. The exact durable turn identity
  was preserved, controls were enabled, and no duplicate admission or manual
  recovery was visible.
- This preflight used a disposable stub and did not touch any frozen campaign
  lane or persistent game database.

### GLM 5 Turbo acceptance lane

Unavailable: the only lane identity specified for this task,
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r179`, is the frozen r179 lane
from the preceding task. No new lane was materialized or launched, so the
60-action journey, checkpoint persistence, and final same-page reload remain
unproven in this task.
