# Task 223: Actor direct control-budget settlement

## Outcome contract

- Actor: a player using the rendered Campaign Play surface.
- Trigger: one enabled player action whose optional Actor jobs are directly
  deferred because no Actor control budget remains.
- Observable result: the scheduler accepts those durable `control_budget`
  deferrals without an Actor model-stage row, the same turn continues through
  completion and Narrator, and one proper scene with enabled controls is
  rendered without Resume or a second admission.
- Protected behavior: Actor model/reviewer validation, fresh retry deadlines,
  the two-attempt cap, immutable identity and late-write fences, due-set and
  schedule invariants, exactly-once mechanics, and genuine persistence/lease
  failure interruption.
- Forbidden: relabeling the deferral, creating a model row or retry,
  weakening validation, replaying mechanics, duplicate submission,
  provider/model/prompt/schema/UI-copy changes, or an out-of-scope production
  owner edit.

## Diagnosis and implementation

- Entry: `cf80c1d282b15dd5f4c20ff123176c8fcea182e7` on `feat/revamp`; the
  pre-existing unstaged `AGENTS.md` and `CLAUDE.md` were preserved without
  inspection or staging. Frozen r182 and earlier lanes were not changed.
- The cheapest pre-patch regression admitted a due set, directly deferred its
  Actor jobs as `control_budget` without creating an Actor model stage, and
  confirmed that `validateTurnSettlement` rejected the durable state with
  `scheduler_job_invalid`.
- The scheduler now treats a deferred wake job with no latest Actor replan
  attempt and `defer_reason='control_budget'` as the existing runtime-owned
  direct deferral. The change is limited to the deferred-job compatibility
  branch. Exact decision reasons still govern explicit due-set deferrals;
  model-stage outcomes retain their existing compatibility matrix; proposal,
  accepted-artifact, plan, identity, terminal-stage, schedule, cadence, debt,
  world, duplicate, and late-write guards remain unchanged.
- No runtime production path, schema, migration, prompt, provider/model
  configuration, frontend, or player-visible copy changed.

## Static evidence

- Current-source GitNexus shadow impact ran before editing. The indexed
  `createCampaignPlayActorScheduler` owner is HIGH: 42 impacted symbols, 15
  direct callers, 4 Campaign Play application processes (`drive`,
  `recoverNarration`, `admitTurn`, `admitOpening`), and 2 modules (Campaign
  Play and Routes). The exact `validateTurnSettlement` method lookup is LOW
  with 3 direct callers. The reachable blast radius is contained to the
  authorized Campaign Play scheduler/application path; no unrelated owner was
  required.
- Actor Scheduler focused suite: 30/30 passed, including the new regression
  with three direct `control_budget` wake-job deferrals and zero Actor model
  stages or proposals.
- Actor Replanner suite: 20/20 passed, preserving the fresh retry deadline,
  reviewer, two-attempt, late-fence, and insufficient-budget behavior.
- Turn-runtime suite: 85/85 passed using Vitest single-thread execution
  (`--pool=threads --maxWorkers=1 --minWorkers=1 --fileParallelism=false`).
  The new continuation regression proves zero Actor provider calls, direct
  `control_budget` deferral, exactly-once mechanics, completed turn, one proper
  scene, and ready read-model state. The default fork pool also completed all
  85 tests but reported a Vitest worker update timeout; the single-thread run
  exited cleanly.
- Campaign Play application suite: 16/16 passed.
- Backend `npm run typecheck`, `npm run build`, and `git diff --check` pass.
- GitNexus `detect_changes --scope unstaged` and `--scope staged` both report
  no mapped execution-flow changes (the registered index is stale); the
  staged four-file diff was reviewed and `git diff --cached --check` passes.

## Live acceptance

No r183 lane has been materialized. The required lane remains pending the
committed/pushed implementation, one prepare phase, and the real rendered
GLM-5-turbo 60-action journey plus same-page reload.
