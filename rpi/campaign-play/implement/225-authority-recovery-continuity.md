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
- Requested live run: `pristine-60-glm52-lowwater-ledger-93a09e46-r186`
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

- The prior r185 artifact remains preserved and invalid because its first prepare ran before role alignment.
- Exactly one fresh r186 world was materialized from `lowwater-ledger-pristine-93a09e46-20260719` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. The returned isolated root was `output/playtests/campaign-world-runs/pristine-60-glm52-lowwater-ledger-93a09e46-r186/campaigns`; state/config hashes were `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` / `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and the canonical Brina card hash was `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- Before materialization/prepare, `R:\Projects\WorldForge\settings.json` was captured at SHA-256 `95247C935891CBA27B9141D87C4CB87CAA0538CEA87EBF47F60E2F9E54855C38`; the Generator, Judge, and Storyteller values were directly verified as `zai-coding-plan` / `glm-5.2`.
- The single `--live-phase prepare` invocation succeeded and created the r186 session root. Task-owned ports 4700/4701/4702 were used after a free-port check.
- The rendered character page loaded. One visible `Import card` selection and one Brina card file assignment produced the rendered Brina identity and enabled `Continue to opening`.
- An operator probe then assigned `settings.json` to the same file input. The page visibly rendered `The character card must use the supported 2.0 character-card format.` while retaining the imported Brina card. This is the first rendered setup boundary; the lane was frozen immediately before Save/Continue. No Opening, gameplay action, Resume, retry, replay, HTTP gameplay journey, SQLite mutation, or reload was performed.
- The r186 session/world evidence and bounded service logs are preserved. The temporary settings were restored byte-for-byte to SHA-256 `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`.

## acceptance_handoff

Needs attention. Static implementation and checks are complete and pushed, but r186 reached a genuine rendered setup boundary before Save/Continue after the extra invalid file-input probe. The required 60-action rendered journey and same-page reload are not claimed; this lane cannot be repaired or resumed under the frozen contract.

## Cleanup

- Task-owned backend, frontend, Chrome/CDP, helper, profile, run-config, and ports were cleaned; ports 4700/4701/4702 are free. The bounded backend/frontend logs remain in the task scratch directory.
- Generated r185 and r186 world/session evidence was preserved and remains uncommitted.
- Pre-existing `AGENTS.md` and `CLAUDE.md` were not inspected, edited, staged, or committed.

## Next

Authorize a new fresh lane only if the setup contract can be restarted; do not resume, repair, or reuse r186.

## Unknowns

No gameplay or persistence evidence exists for r186 beyond materialization/prepare and the frozen rendered setup boundary; action completion, continuity rendering, world/runtime progression, and reload persistence remain untested.

## Changed artifacts

- `backend/src/campaign-play/campaign-play-application.ts`
- `backend/src/campaign-play/campaign-play-application.test.ts`
- `rpi/campaign-play/implement/225-authority-recovery-continuity.md`
