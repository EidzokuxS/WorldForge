# Task 212: Narrator actor-observation recovery default reasoning

## Contract and boundary

When a player-action Narrator attempt persists `narration_invalid` and its
safe `narrator_packet_validation_mismatch` feedback contains
`visible_actor_observation_mismatch`, the existing single automatic recovery
constructs the Storyteller with the existing default-reasoning runtime. The
same provider/model identity, strict-object request, `auto` mode, recovery
feedback, operation/result/narration/packet/receipt identities, deadline,
lease/epoch/CAS fences, one-recovery cap, and no-mechanics-replay behavior
remain unchanged. Coverage-only packet feedback and generation-schema
feedback retain the bypass construction; opaque semantic/provider recovery
and every stage-timeout branch retain their current behavior. No prompt,
schema, validator, provider, model selection, deadline, persistence,
mechanics, UI, or player-visible copy changes are in scope.

Frozen r163 is immutable. Its action-22 Narrator attempt 1 produced valid
native JSON, then failed the visible-actor packet contract and returned safe
actor-scope feedback. Attempt 2 reused the bypass construction and failed
`schema_validation_failed` before compile. No attempt 3, accepted proper
scene, duplicate mechanics, or late write exists. Task 210 remains the
source-reference authority repair; this task changes only recovery
construction.

## Impact and implementation

The exact-current GitNexus index was refreshed with the index-only analyzer.
The nested `driveNarration` closure is not represented as a current symbol.
Before refresh, source-qualified impact for `driveNarration` was LOW with one
direct caller, two Campaign Play processes, and two modules. After refresh,
the nearest source-qualified exported `CampaignPlayApplication` owner was
LOW with three direct importers, six impacted nodes, and no mapped processes
or modules. Main's enclosing-application mapping is used only for this
branch-local condition; no additional production owner or exported interface
was edited.

The implementation adds one private predicate in `driveNarration`: only a
`narrator_packet_validation_mismatch` recovery whose ordered safe checks
include `visible_actor_observation_mismatch` selects the existing
default-reasoning recovery-runtime construction. Coverage-only safe feedback,
generation-schema feedback, opaque `narration_invalid`, provider-unavailable,
stage-timeout, and all other branches remain on their existing paths. The
focused runtime test supplies a packet-shaped visible actor outside the
permitted performer set, checks the Storyteller reasoning mode, and covers a
terminal failed second attempt without a third attempt or proper scene.

No prompt, model instruction, substantial prose, or player-facing copy
changed; humanizer/deslop review is not applicable.

## Static evidence

- Focused turn-runtime parameterized recovery coverage passed 1/1 for the
  actor-mismatch, coverage-safe, and neighboring default/bypass branches; the
  terminal actor-mismatch case also passed with two attempts, no proper
  scene, unchanged mechanics, and no third attempt.
- The full turn-runtime file passed all 80 assertions. Vitest then returned
  the known post-pass `[vitest-worker]: Timeout calling "onTaskUpdate"`
  unhandled worker-shutdown error; no assertion failed. The clean focused
  rerun passed with exit 0.
- Campaign Play application passed 15/15. Narrator passed 44/44.
- Backend typecheck and production build passed. `git diff --check` passed.
- Staged GitNexus `detect_changes` is run before each commit and is reconciled
  against the exact owned production/test/note paths. No prompt or schema
  owner is expected to be mapped.

## Live r164 evidence

The fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r164` was
materialized exactly once from pushed commit `a9b41d4aa6461e863c8328f0d197505d05332208`.
The materializer returned the isolated campaigns root
`R:\Projects\WorldForge\output\playtests\campaign-world-runs\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r164\campaigns`;
that exact value was used for prepare and the task-owned runtime. The input
run-config was outside both evidence roots. The sole `--live-phase prepare`
completed before runtime, HTTP, browser, or database inspection. The
pre-runtime manifest records state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
config SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`;
the imported Brina card SHA-256 was
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup completed once: one Brina import/file assignment, one Save/Continue,
lower-wards / Local / Already here / Looking for work, and one Begin. Opening
reached ready with a proper scene. The first three rendered player actions
were each read-reconciled, clicked once, and settled with one proper scene:

- `turn-player-action:37356f9fffd389e9029fa0a36de17ae96cfda5ef`,
  operation `narration-operation:05857b1aed48b9df0d0f781685cfbb4e0e88ddc0`,
  narration `narration:64cbd87839266a9e9afbfcdba1176cf25362e0fa`.
- `turn-player-action:b4b3f61550873fe5349954be67026c866b0e3368`,
  operation `narration-operation:18f8db5a670124acd6fdc1d8a2effea3b556f1e1`,
  narration `narration:5ae20ffced689df4a28265fce4bfc8046d4be8bc`.
- `turn-player-action:78004a361514638b76811a7404946648e5777d5d`,
  operation `narration-operation:616452165d568103d0d6f92bd5612ae37205e525`,
  narration `narration:4a885a7ff71da9f32db27b4cdf53cad3a266c882`.

After the third action, a direct rendered click was submitted exactly once
for action 4. The resulting durable boundary is
`turn-player-action:db708e07abc9f902d23e7f7129dd8d6df4024695`,
`stage=interrupted`, `error_code=stage_timeout`,
`interrupted_stage=admitted`, `resume_eligible=1`, `worker_epoch=2`, and no
`completed_at`. The rendered page shows the existing Resume control and all
normal choices disabled. No Narrator operation or attempt was created for
this turn, so Task 212's visible-actor recovery did not occur naturally.
This is the first terminal product boundary after built-in handling; no
Resume or later action was submitted.

At the terminal read-only checkpoint, the campaign state was
`worldVersion=14`, `runtimeRevision=81`; there were four player-action turns
(three completed and the interrupted fourth), four turn results (Opening plus
three actions), three proper scenes, three narration operations, three
narration attempts, 18 commands, and 18 receipts. A second read after two
seconds showed the same boundary and counts, with no late write. SQLite
`integrity_check` was `ok` and `foreign_key_check` was empty. Required
10/20/30/40/50/60 checkpoints and the 60-action same-page reload are
unavailable because the lane froze at action 4.

There was one harness ordering defect after action 1: the runner left a
pending manual decision while action 2 was already durable, so its bind and
cancel probes were rejected. No product database write was made by those
probes. The remaining actions were reconciled directly from rendered state
and read-only persistence. This verification defect is separate from the
action-4 product boundary.

Generated r164 session/world evidence remains uncommitted. Task-owned
backend, frontend, browser/CDP resources, ports 4500/4501/4502, helper files,
external run-config, and browser profile were stopped or removed after the
terminal evidence was captured; independent process and port checks found
none remaining. Pre-existing AGENTS.md and CLAUDE.md dirt remains untouched.

## Acceptance handoff

- Actor-mismatch recovery construction: the focused runtime regression and
  private `driveNarration` predicate prove default-reasoning selection and
  terminal two-attempt fencing; no natural r164 actor-mismatch recovery was
  available.
- Coverage-only, generation-schema, opaque, provider, stage-timeout, model,
  mode, identity, deadline, fence, one-recovery, and no-replay behavior:
  unchanged branch assertions plus the application/Narrator/runtime suites;
  the r164 action-4 stage-timeout boundary occurred before Narrator and did
  not exercise Task 212.
- Static typecheck/build/diff and staged impact evidence: passed as recorded
  above; the implementation commit is pushed.
- Built setup and Opening: passed with the canonical hashes and one-time
  setup above.
- Settled proper-scene bindings: three unique action bindings were observed
  with exactly-once command/receipt counts; action 4 has no scene or
  Narrator operation and is the frozen boundary.
- Required 10/20/30/40/50/60 checkpoints, 60 unique bindings, same-page
  reload, and live actor-mismatch recovery: unavailable due the first
  terminal action-4 stage-timeout at `admitted`; no inference is made.
- Persistence and cleanup: terminal world/runtime/counts, integrity/FK,
  no-late-write read, task-owned resource absence, and protected-file
  preservation are recorded above.

## Live r165 evidence

The unchanged-source lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r165`
was run from entry commit `de1c9d85beb4432a2b234527b6c84f032c4d90f4` for
campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. Materialization returned and
the runtime used the isolated campaigns root
`R:\Projects\WorldForge\output\playtests\campaign-world-runs\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r165\campaigns`.
The external run-config was `R:\Temp\WorldForge-task212-r165\run-config.json`.
The sole `--live-phase prepare` ran before runtime, HTTP, browser, or database
inspection. The pre-runtime manifest records the required state hash
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
hash `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
the imported Brina card hash
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was performed once: one Brina import/file assignment, one Save/Continue,
lower-wards / Local / Already here / Looking for work, and one Begin. Opening
reached ready with a proper scene. Actions 1 through 20 were each read-
reconciled, submitted once, and bound to one unique proper scene. The action
ledger is preserved at
`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r165.session/browser-actions.jsonl`.

Read-only checkpoint evidence:

- At action 10, turn
  `turn-player-action:cfc19af29fd54e3ec34674e89369a1d92e059dcc` was completed
  with `worldVersion=22`, `runtimeRevision=240`, and one proper-scene binding
  for each of the first 10 actions. The exact read-only database copy reported
  `integrity_check=ok` and an empty `foreign_key_check`.
- At action 20, the read-only copy reported 20 completed/bound player
  actions, `worldVersion=33`, `runtimeRevision=481`, 72 commands, 72 receipts,
  20 Narrator operations, 30 Narrator attempts, 20 proper scenes, 21 turn
  results, 21 turns, 29 Actor jobs, and 20 Actor plans. It reported
  `integrity_check=ok` and an empty `foreign_key_check`.

Action 3 naturally exercised the existing packet-coverage Narrator recovery:
attempt 1 returned bounded packet-validation feedback and attempt 2 completed.
No visible-actor observation mismatch recovery occurred, so direct live Task
212 coverage is unavailable; no inference is made from the other recovery.

Action 21 was selected from the rendered ready state exactly once after
reconciliation: choice handle `choice_ef0aa72736c6c35cf19be37f`, label
`Talk to Dren Vask: ask about the sealed doors`. The authoritative boundary is
turn `turn-player-action:e104887b70a9453280959bdcf8521c484a1b0e89`, with
`stage=primary_settled`, `status=interrupted`, `interrupted_stage=null`,
`error_code=null`, `worker_epoch=4`, and no completion or final world version.
Its Game Master stage completed on attempt 1, then Actor Replanner stage
`actor-replan-stage:e824bce72a9118d0dcf3cf6a8c020850` attempt 1
`model-stage-row:e30db965bb6cd04b300935f0e4719c23` ended with
`schema_outcome=transport_error` and `error_code=stage_timeout` at the local
deadline. There was no attempt 2, no Narrator operation, no result, no proper
scene, and no actor plan. The page rendered the existing Resume control and
disabled normal choices; no Resume or later action was submitted.

The action-21 read-only reconciliation reported `worldVersion=34`,
`runtimeRevision=499`, `integrity_check=ok`, and an empty
`foreign_key_check`. A second state read preserved the same interrupted
boundary and counts, with no late write. Existing action-21 commands and
receipts were from settled world acting; no downstream Narrator/scene write
was present. This is the first terminal built-product boundary, so actions
30/40/50/60, 60 unique bindings, and same-page reload are unavailable.

Generated r165 session/world evidence remains uncommitted. The task-owned
backend PID 56264, frontend PID 86876, page, ports 4510/4511/4512, and the
external temporary directory were closed or removed; independent checks found
no remaining process, port, or temporary directory. The pre-existing
`AGENTS.md` and `CLAUDE.md` changes remain untouched and unstaged.

## r165 acceptance handoff

- Static Task 212 implementation and neighboring recovery criteria remain
  covered by the accepted tests, typecheck, build, and prior commit evidence;
  no source or test changed in r165.
- Canonical materialization, isolated root, prepare ordering, one-time setup,
  ready Opening, and the first 20 rendered action bindings are evidenced above.
- Persistence at actions 10 and 20, and the terminal action-21 boundary,
  include world/runtime revisions, exact-once counts, integrity, and foreign
  key checks. No late write or duplicate action was observed.
- The natural Task 212 visible-actor recovery, checkpoints after 30/40/50/60,
  60 unique bindings, and same-page reload are unavailable because action 21
  froze at Actor Replanner attempt 1 `stage_timeout`. No causal provider claim
  is made.
