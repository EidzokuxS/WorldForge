# Task 225: authority recovery continuity

Date: 2026-08-14
Status: Needs attention

## Purpose

Make an application-owned automatic authority-stage retry that exhausts on an allowlisted attempt-2 failure commit the existing deterministic `authority_budget` continuity result exactly once, while preserving manual Resume and all other recovery behavior.

## Stable identity

- Repository: `R:\Projects\WorldForge`
- Branch: `feat/revamp`
- Starting commit: `bf02d68a6d82de4c0d3e37fd75eaf2237a5eaed1`
- Implementation commit: `3226b67eabf92df2e8443e5d3cefb1252b88d340`
- Implementation push: local and `origin/feat/revamp` both equal `3226b67eabf92df2e8443e5d3cefb1252b88d340`
- Requested live run: `pristine-60-glm52-lowwater-ledger-93a09e46-r185`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Provider and model: `zai-coding-plan` / `glm-5.2`

## Delta

`CampaignPlayTurnRuntime.commitControlBudgetContinuity(turnId, "authority_budget")` is now called only when the player-action drive has actually consumed its application-owned automatic Resume, the exhausted result is attempt 2 with `explicit_resume_required`, and the error code is `model_contract_invalid`, `stage_timeout`, or `provider_unavailable`. Focused application coverage verifies one automatic retry, one continuity commit, no attempt 3, and unchanged manual/unallowlisted behavior.

## Static evidence

- Application suite: 21/21 passed.
- Focused continuity/fencing runtime tests: 6/6 passed.
- Full turn-runtime suite: 85/85 passed with the single-thread `threads` pool; the `forks` pool had a Vitest worker-update timeout despite 85/85 assertions.
- Backend typecheck: `pnpm exec tsc -p backend/tsconfig.json --noEmit` passed. The package script could not resolve `tsc` in the environment.
- Production build: `pnpm run build` passed.
- `git diff --check` and staged diff check passed.
- GitNexus staged detect: 2 files, 31 symbols, 5 affected Campaign Play processes, medium risk; scope stayed within `drive` and the test runtime helper.

## Live evidence

- One fresh r185 world was materialized from `lowwater-ledger-pristine-93a09e46-20260719` with the canonical state/config hashes and the requested campaign/run identity.
- The first `--live-phase prepare` invocation stopped before product runtime because the local role resolution was `zai-coding-plan` / `glm-5-turbo`, not the required `glm-5.2`.
- The three playable role model values were temporarily aligned to `glm-5.2`; the role settings were then reverted to their prior values.
- A second `--live-phase prepare` succeeded and created the r185 session evidence. Because the strict contract requires exactly one prepare invocation, this lane can no longer provide admissible one-prepare evidence.
- No backend or frontend runtime, browser/CDP session, gameplay HTTP journey, rendered action, Resume, retry, replay, or same-page reload was started. The generated r185 world and session evidence are preserved.

## acceptance_handoff

Needs attention. Static implementation and checks are complete and pushed, but the required 60-action rendered journey is not claimed. The live lane must be authorized to restart with corrected `glm-5.2` role settings and exactly one successful prepare, or the task must be reopened with the one-prepare rule relaxed. No second lane was started.

## Cleanup

- No task-owned backend, frontend, Chrome/CDP, helper, or port processes were started; ports 4700/4701/4702 remain available.
- The temporary external r185 run-config was removed. Its now-empty task scratch directory remains because the shell safety policy rejected recursive or directory deletion; no task data remains there.
- Generated r185 world/session evidence was preserved and remains uncommitted.
- Pre-existing `AGENTS.md` and `CLAUDE.md` were not inspected, edited, staged, or committed.

## Next

Resolve the one-prepare evidence boundary before any live click. If authorized, run one fresh corrected lane and stop at the first genuine rendered boundary defect.

## Unknowns

No gameplay or persistence evidence exists for r185 beyond prepare-time validation; action completion, continuity rendering, world/runtime progression, and reload persistence remain untested in this lane.

## Changed artifacts

- `backend/src/campaign-play/campaign-play-application.ts`
- `backend/src/campaign-play/campaign-play-application.test.ts`
- `rpi/campaign-play/implement/225-authority-recovery-continuity.md`
