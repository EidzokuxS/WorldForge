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

### r180 GLM 5 Turbo acceptance boundary

- Entry and pushed implementation commit: `38dfa4441b01572037f2485d959127a51515246b`.
  The fresh lane was materialized once as
  `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r180` for campaign
  `6b85a49e-fef5-4359-95e2-051383f6fb66`, using `zai-coding-plan/glm-5-turbo`,
  isolated campaigns root
  `output/playtests/campaign-world-runs-materialized/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r180/campaigns`,
  and task ports 4650/4651/4652. Exactly one live-phase `prepare` was run.
- The materializer manifest verified the canonical template state hash
  `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
  config hash `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`.
  The prepared config remained that hash. The canonical Brina card hash was
  verified before runtime; the post-prepare database hash is migration output,
  not the immutable template hash.
- Rendered setup completed once: Brina import, Save/Continue, `lower-wards`,
  `Local`, `Already here`, `Looking for work`, Begin, and Opening. The first
  signed decision and one rendered click were recorded for
  `Talk to Dren Vask: ask about the market parcel work` with choice handle
  `choice_0680386e5ff1ab0d872ac666`. Backend admission was exactly once.
- The admitted turn was
  `turn-player-action:34b0c2a8fe6be6cc32a83cb322d657235346f87a`. Authoritative
  state later reached `phase=ready`, `worldVersion=13`, `runtimeRevision=39`,
  `activeTurn=null`, with complete model-accepted operation
  `narration-operation:849d5474075a3a0f59868faf825253f2d42e981a`, narration
  `narration:0d1af9d7b3c19aac93f551df67d60a19e7af9f1b`, and four enabled
  suggested actions plus one utility action. No duplicate admission or Resume
  request was observed.
- The product-owned guarded recovery performed one same-URL hard reload after
  the continuous authority-read failure threshold. The rendered page then
  remained `Loading campaign` and did not return the authoritative scene or
  enabled controls within 120 seconds. The task frontend log records the
  post-reload authority request as
  `GET /api/campaigns/6b85a49e-fef5-4359-95e2-051383f6fb66/play/state 404`;
  this task process had served the client with its default `localhost:3001`
  API base instead of the task backend at `127.0.0.1:4650`. The backend was
  healthy and the direct authority read remained ready, so this is the first
  rendered control/environment boundary, not a backend turn failure.
- No action bind was recorded after the boundary; actions 2-60, checkpoint
  evidence, and the final same-page reload were not attempted. A corrected
  frontend process was started only for diagnosis after the boundary; no
  further browser navigation or player action was taken. Generated r180 logs,
  session evidence, and the materialized lane remain preserved.

Purpose: Needs attention. The exact first boundary is the r180 action-1
rendered recovery failing to rehydrate because the launched frontend used the
wrong API base, leaving the page in `Loading campaign` after one product-owned
reload. The required 60-action journey and final reload are therefore
unavailable and must not be claimed.
