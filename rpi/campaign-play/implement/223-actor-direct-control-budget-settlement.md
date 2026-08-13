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

## Live acceptance boundary

- The implementation commit `279610743a7df92b725416834cf5826859874ddc` was
  pushed before the single authorized lane. Local `HEAD` matched
  `origin/feat/revamp`; only the protected pre-existing `AGENTS.md` and
  `CLAUDE.md` remained unstaged.
- Lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r183` was materialized
  exactly once for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` with
  `zai-coding-plan/glm-5-turbo`, using the isolated campaigns root and one
  `--live-phase prepare`. The canonical state/config/Brina inputs matched the
  required hashes before prepare. Backend/frontend ran on task ports 4680/4681
  with the configured API/CORS pair.
- Rendered setup completed once: Brina import, Save/Continue, `lower-wards`,
  `Local`, `Already here`, `Looking for work`, Begin, and a ready Opening with
  enabled choices. No operator reload, Resume, replay, or duplicate click was
  used.
- The first signed rendered action was action 1, choice
  `Talk to Dren Vask: ask about the seizures`, signed at `1786658032787` and
  clicked once at `1786658037625`. Exactly one durable player turn was admitted:
  `turn-player-action:a18ab9c3f8877134fcb9777372c4b1f7c5defbca`.
- The first genuine boundary occurred when that turn did not return to ready
  control within the 120,000 ms contract. Authority reported runtime revision
  `23`, world version `11`, active turn status `interrupted`, error
  `provider_unavailable`, `retryEligible=true`, and no completion. The rendered
  page remained on the Opening scene with disabled controls and exposed the
  existing `Resume` surface.
- Read-only persistence at the boundary was internally clean (`integrity_check`
  `ok`, zero foreign-key violations) and exactly-once for the attempted action:
  one player-action turn, two interrupted model stages (attempts 1 and 2), no
  Actor replan stages/attempts/proposals, no Narrator operation/attempt, no
  proper scene, and no bound `browser-actions.jsonl` record because binding
  requires a completed turn. Backend diagnostics recorded the Z.AI connection
  timeout and the resulting `provider_unavailable` attempts. The pending signed
  decision, rendered state, exact IDs, and full lane logs were preserved; no
  Resume or retry was issued after the boundary.

Result: `Needs attention`. The 60-action journey and final same-page reload
were not attempted after this first genuine stopped turn.
