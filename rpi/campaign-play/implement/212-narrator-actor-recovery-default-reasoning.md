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

The fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r164` is
materialized exactly once after the pushed implementation. It uses campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, the materializer-returned isolated
`GSD_CAMPAIGNS_ROOT`, an external run-config, and task-owned ports
4500/4501/4502. The sole `--live-phase prepare` runs before runtime, HTTP,
browser, or database inspection. Canonical state/config/Brina hashes are
verified before runtime. Setup is one import, one Save/Continue, the fixed
lower-wards / Local / Already here / Looking for work selections, and one
Begin; Opening must reach ready with a proper scene. Each rendered action is
read-authority reconciled and submitted once, with one proper-scene binding
per settled action, checkpoint evidence at 10/20/30/40/50/60, and a single
same-page reload after 60 when reached. Natural actor-mismatch recovery, if
present, is recorded only from retained bounded diagnostics and persistence;
it is never manufactured. Generated lane evidence remains uncommitted.

## Acceptance handoff

- Actor-mismatch recovery construction: focused runtime assertion and the
  exact private `driveNarration` predicate above.
- Coverage-only, generation-schema, opaque, provider, stage-timeout, model,
  mode, identity, deadline, fence, one-recovery, and no-replay behavior:
  unchanged branch assertions plus the existing application/Narrator/runtime
  suites.
- Static typecheck/build/diff and staged impact evidence: recorded above.
- Built setup, Opening, action checkpoints, persistence, natural recovery,
  60 unique bindings, and same-page reload: pending until r164 terminal
  evidence; unavailable criteria will be stated explicitly rather than
  inferred if the lane freezes earlier.
