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
- Requested live run (invalid): `pristine-60-glm52-lowwater-ledger-93a09e46-r186`
- Corrected live run: `pristine-60-glm52-lowwater-ledger-93a09e46-r187`
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

### r187 corrected lane

- r187 started from local and `origin/feat/revamp` commit `b4c05064d8e3a4c6a3295b3d4044b21a94c07f10`. The original `settings.json` was captured at SHA-256 `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`; only Generator, Judge, and Storyteller were temporarily set to `zai-coding-plan` / `glm-5.2` and directly verified. The canonical state/config/Brina hashes were `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` / `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065` / `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- Exactly one r187 materialization and one successful `--live-phase prepare` were performed using the isolated campaign root and external run-config. Ports 4710/4711/4712 were confirmed free and used.
- The rendered setup contract completed exactly once: one Import-card action, one canonical Brina card assignment, rendered Brina identity, one Continue, lower-wards, Local, Already here, Looking for work, one Begin, and a ready Opening proper scene at `alderman-hallway`. No second file-input action occurred.
- Actions 1-4 each completed and bound one unique rendered proper scene. Counts were completed/bound/proper scene `1/1/1`, `2/2/2`, `3/3/3`, and `4/4/4`; command/receipt/world-event counts were `15/15/15`, `17/17/17`, `19/19/19`, and `21/21/21`; integrity was `ok` and foreign-key violations were empty at each observation. Actions 1-3 used `model_accepted` attempt 1 with turns `turn-player-action:abf92c8623bbd3013d36ca16234e0dd8e9c29c62`, `turn-player-action:00be241b43f166185136524570598a1406e9c4b9`, and `turn-player-action:4206bc34234e9cb7146c48743f683c0aa6465670`. Action 4 used `deterministic_continuity` attempt 2, turn `turn-player-action:1d131e8ce42686f0f56ce5b7fd23770358095e47`, and rendered ready controls within 79,889 ms.
- Action 5 was signed once as the visible enabled `Look around` choice with handle `choice_da8beed86fbdd1fc9ef88e72`. The browser wrapper first exceeded 120 seconds without an admitted turn; read-only reconciliation showed phase `ready`, no active turn, and completed action count 4. The single outstanding rendered click then encountered the first genuine rendered boundary: the page visibly reported `The game service is temporarily unavailable.` with `Try again`. Authority remained at worldVersion 16, runtimeRevision 80, 21 commands/receipts/world events, integrity `ok`, and no foreign-key violations. The lane was frozen immediately; no retry, Resume, replay, later click, checkpoint 10+, or reload was performed.
- r187 session/world evidence and bounded backend/frontend logs are preserved. Temporary settings were restored byte-for-byte and verified at SHA-256 `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`.

## acceptance_handoff

Needs attention. Static implementation and checks are complete and pushed, but corrected r187 reached a genuine rendered service-unavailable boundary at action 5 after four successful rendered actions. The required 60-action rendered journey and same-page reload are not claimed; this lane cannot be repaired or resumed under the frozen contract.

## Cleanup

- Task-owned r187 backend, frontend, Chrome/CDP, helper, profile, run-config, and ports were cleaned; ports 4710/4711/4712 are free. The bounded r187 backend/frontend logs remain in `R:\Temp\WorldForge-task225-r187`.
- Generated r185, r186, and r187 world/session evidence was preserved and remains uncommitted.
- Pre-existing `AGENTS.md` and `CLAUDE.md` were not inspected, edited, staged, or committed.

## Next

Authorize a new fresh lane only after the service-unavailable boundary is understood; do not resume, repair, or reuse r186 or r187.

## Unknowns

The r187 lane has no evidence beyond four completed/bound rendered actions; actions 5-60, checkpoints, and same-page reload persistence remain untested. The rendered service-unavailable cause is not established from the allowed read-only evidence.

## Changed artifacts

- `backend/src/campaign-play/campaign-play-application.ts`
- `backend/src/campaign-play/campaign-play-application.test.ts`
- `rpi/campaign-play/implement/225-authority-recovery-continuity.md`
