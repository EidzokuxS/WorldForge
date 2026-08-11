# Task 209: Opening Narrator visibility-timeout recovery

## Contract and boundary

Opening Narrator recovery is broadened by one bounded condition only. When an
Opening turn is interrupted at `visibility_projected` by the first external
stage `stage_timeout`, with `wasResume` false and no prior automatic resume,
the existing application drive may resume the same turn once. The generic
resume path supplies the new worker epoch and its existing per-invocation
90,000 ms external deadline. All other Opening stages and error classes remain
explicit-Resume-only. Player-action Task 208 recovery, provider-unavailable
handling, model identity, prompt/schema/provider behavior, mechanics,
visibility, persistence, UI, and manual Resume behavior are unchanged.

The frozen r156/r158/r159 evidence remains immutable; no prior lane is resumed,
replayed, repaired, or mutated by this task.

## Impact and implementation

The current GitNexus index was refreshed at entry
`4b966174d7c6d67f08c9aad3cfd919580244569c`. The nested helper
`campaignPlayMayAutomaticallyResumeExternalStage` is not registered as a
symbol, so exact source-qualified analysis was used. The nearest public
`CampaignPlayApplication` interface mapped LOW risk with 6 impacted nodes,
3 direct importers, and no mapped processes. No exported interface or second
production owner was needed.

`campaign-play-application.ts` now handles `stage_timeout` before the existing
player-action contract branch: player actions retain their existing allowance,
and Opening is allowed only for `visibility_projected`. The existing attempt,
`wasResume`, `alreadyAttempted`, provider-unavailable, model-contract-invalid,
route, and player-action branches remain unchanged. The focused application
regression covers the new visibility coordinate, other Opening stages,
model-contract-invalid, attempt fencing, and the existing player-action cases.

No prompt, visible copy, or substantial product prose changed; humanizer,
deslop, and UI-concept review are not applicable.

## Static evidence

Focused validation passed on the bounded implementation:

- `campaign-play-application.test.ts`: 15/15 passed, including Opening
  `visibility_projected` stage-timeout eligibility, all other Opening stages,
  model-contract and attempt-fencing exclusions, and existing player-action
  branches.
- `opening-runtime.test.ts`: 15/15 passed; `turn-service.test.ts`: 13/13
  passed.
- `turn-runtime.test.ts`: all 77 assertions passed. The default Vitest worker
  runner then exited non-zero on its known post-pass `onTaskUpdate` shutdown
  timeout; the bounded single-thread rerun exited 0 with 77/77 passed.
- Backend typecheck (`tsc --noEmit`) and production build (`tsc -p
  tsconfig.json`) passed. `git diff --check` passed (only existing
  LF/CRLF normalization warnings were reported).
- GitNexus exact-entry impact: the nested helper is not indexed; the nearest
  source-qualified `CampaignPlayApplication` interface is LOW (6 impacted
  nodes, 3 direct importers, 0 mapped processes). The staged detect result is
  `No changes detected` for the staged scope; manual staged-path review
  confirmed only the application source, its focused test, and this note are
  staged, while protected AGENTS.md/CLAUDE.md remain unstaged.

## Live r161 evidence

Pending the single pristine lane
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r161`. It will be prepared
only after the implementation commit is pushed, with the exact materializer
campaign root exported before `--live-phase prepare`; canonical hashes and the
first genuine boundary or 60-action/reload result will be recorded here. No
natural Opening timeout recovery is inferred before that lane runs.

## Acceptance handoff

- Eligibility: static helper assertions and the built application drive prove
  only Opening `visibility_projected` stage-timeout attempt 1 can auto-resume.
- Identity/deadline/fencing: existing generic resume/runtime tests plus the
  r161 authoritative lane evidence will prove the same turn/narration/packet,
  new epoch, fresh deadline, one attempt, and no late write.
- Protected behavior: existing Opening planner/other-stage, provider,
  model-contract, player-action Task 208, and explicit Resume tests remain the
  authority.
- Product: r161 rendered/persistence evidence will map Opening, action
  bindings, checkpoints, integrity/FK, reload, and any naturally observed
  recovery; criteria not reached will be marked unavailable.
