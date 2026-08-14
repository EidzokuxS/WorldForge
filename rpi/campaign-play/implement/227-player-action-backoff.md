# Task 227: player-action admission backoff

Status: Needs attention. The pushed implementation and isolated recovery preflight passed, but the single r189 acceptance lane stopped before action 1 at the live-session runner's first `decide` phase. No rendered player action was clicked, so the 60-action and reload contract is not proven.

## Identity

- Repository: `R:\Projects\WorldForge`, branch `feat/revamp`
- Implementation commit: `c8d20aa48f239da0f117161661532420712713ad`
- Entry commit: `138a2adcead7af5da284d05ff5a010a6abe34ae9`
- Run: `pristine-60-glm52-lowwater-ledger-93a09e46-r189`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Provider/model: `zai-coding-plan` / `glm-5.2` for Generator, Judge, and Storyteller

## Implementation delta

`CampaignPlayPage.submitAction` now keeps one admission request and idempotency key for one click, gives each of three bounded attempts its own 2,500 ms deadline, refreshes authority after the first ambiguous failure, waits 500 ms then 1,500 ms between attempts, and fences late results on ownership loss. Only raw failures and `service_unavailable` replay; explicit domain errors and the final failure use the existing reconciliation surface. `admitCampaignPlayTurn` accepts and forwards an optional `AbortSignal` without changing its route, body, headers, parser, or existing callers. No backend, persistence, schema, prompt, provider policy, or public-copy change was made.

## Static evidence

- Exact-current isolated GitNexus impact before editing: `submitAction` LOW, 2 impacted nodes, 1 direct caller, 1 Campaign Play process/module; `admitCampaignPlayTurn` LOW, 3 impacted nodes, 1 direct caller, 1 Campaign Play process/module.
- Focused page tests: 54/54 passed.
- Focused API tests: 21/21 passed.
- Full frontend suite: 76 files, 539 tests passed.
- Frontend typecheck, production build, touched-file ESLint, backend same-key replay tests (2 passed, 33 skipped), and `git diff --check` passed.
- Staged GitNexus detect mapped 4 files, 8 symbols, 1 process, medium risk; mapped symbols were the Campaign Play page methods and `admitCampaignPlayTurn`.
- Implementation commit was pushed; local `HEAD` equals `origin/feat/revamp`.

## Real Chromium recovery preflight

Disposable scratch campaign `task227-preflight` ran on ports 4740/4741/4742 with the built product and CDP transport failure injection. One rendered choice click produced exactly three same-key attempts; attempts 1 and 2 were failed at the browser transport boundary and attempt 3 returned 202. The safe scalar record is `R:\Temp\WorldForge-task227-preflight\preflight-scalar.json`; it contains only attempt timestamps, route/status/error class, idempotency-key hash, expected versions, body hash, fourth-attempt count, and rendered outcome. All three attempts had identical key/body hashes and expected versions; fourth POST count was zero; one proper scene rendered with enabled controls and no service-unavailable banner. Read-only SQLite evidence was `R:\Temp\WorldForge-task227-preflight\preflight-sqlite-scalar.json`: `query_only=1`, `integrity_check=ok`, empty foreign-key check, one completed player turn, one proper-scene binding, and equal command/receipt/world-event counts. Scratch services, browser, ports, and settings were cleaned; the original settings SHA-256 was restored to `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`.

## r189 live lane

- Materialization was performed exactly once from the canonical lowwater-ledger template. Canonical state/config hashes were verified before runtime: `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; canonical Brina hash was `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- Exactly one successful `--live-phase prepare` ran before backend, frontend, browser, HTTP, or SQLite activity. Services used ports 4730/4731 and Chromium CDP used 4732.
- Rendered setup completed once: one canonical Brina assignment, one Save/Continue, lower-wards, Local, Already here, Looking for work, Begin, and a ready Opening with enabled suggested controls.
- The driver signed no action and clicked no player choice. Its first `decide` phase exited 1 with `runner decide failed with exit 1`; the driver froze without retrying. Boundary evidence is `output\playtests\campaign-play\pristine-60-glm52-lowwater-ledger-93a09e46-r189.session\probes\lane-boundary.json`.
- Safe network evidence records 294 entries (147 authority GET request records and zero player-action POST request records). `browser-actions.jsonl` and action scalar evidence remain empty; no pending decision remains.
- Read-only authority after the boundary: `phase=ready`, `worldVersion=12`, `runtimeRevision=16`, `query_only=1`, `integrity_check=ok`, empty foreign-key check, one opening turn, zero player-action turns, and no later write. No same-page reload was attempted.
- The earliest proven failing layer is the task-owned live-session runner's `decide` phase, before a rendered player click or admission request. This is a verification boundary, not evidence of a frontend admission-recovery defect. The runner's discarded stderr is unavailable in the retained artifacts, so the exact internal cause is unknown.

## Cleanup and handoff

- Task-owned backend, frontend, Chromium/CDP, wrappers, scratch/preflight services, and ports 4730/4731/4732 and 4740/4741/4742 were stopped/released.
- Temporary role alignment was restored byte-for-byte; settings SHA-256 is `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`.
- Generated r189 session/world evidence and bounded logs are preserved. No protected file was inspected or changed by this task; pre-existing `AGENTS.md` and `CLAUDE.md` remain unstaged.
- Changed tracked artifact for this evidence update: this note only. Main must choose whether to diagnose the runner boundary or accept that product QA is unavailable; no further lane or click was authorized.

## Deterministic DOM runner preflight and r190 live lane

Status remains Needs attention. The task-owned opaque r189 decision phase was replaced by a structural DOM runner, but the fresh r190 lane reached a genuine Campaign Play service boundary at action 6. The 60-action and same-page reload contract is not proven.

### Runner preflight

- The disposable runner-preflight campaign was materialized once and prepared once on the task-owned runtime. The runner used structural suggested-choice buttons, recorded a flushed pending decision before one DOM click, and retained separate stdout/stderr. One click produced one player-action POST with status 202, key hash `fa57f1432654e1aa60a148ec7c3c0656fc138c27ca4afc05805d85430f11a65d`, expected versions `11/15`, and body hash `0699a2bb169f4c83cfd0db9829fdfae1c18bc9183e22933bbf01c9cd62264289`; the durable turn was `turn-player-action:74371e30623dcf0b0cf941d76aa0744f6772d8dd`, followed by one proper scene and enabled controls.
- The first preflight run reached completion but its bind subprocess could not resolve `npx` (`WinError 2`). Only the external runner helper was repaired to use `npx.cmd`; the existing bind phase then ran once against the already-completed turn. No second click or player-action request was made. Read-only SQLite evidence was `query_only=1`, `integrity_check=ok`, empty foreign-key check, one completed player turn, and equal command/receipt/world-event counts. Compact evidence is preserved at `R:\Temp\WorldForge-task227-r190\runner-preflight-evidence.json`.

### r190 identity and setup

- Run `pristine-60-glm52-lowwater-ledger-93a09e46-r190`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, was run on unchanged pushed build `e529dac342b903219f28fd8fff470d036d0166ce` containing implementation `c8d20aa48f239da0f117161661532420712713ad`. Provider/model was `zai-coding-plan` / `glm-5.2` for Generator, Judge, and Storyteller. The original settings SHA-256 was `577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D`; the three role values were temporarily aligned and that hash was restored during cleanup.
- Materialization used the canonical lowwater-ledger template once; exactly one successful `--live-phase prepare` ran before runtime access. Canonical state/config/Brina hashes were `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Runtime ports were 4750/4751/4752.
- Rendered setup completed exactly once: one canonical Brina assignment, Save/Continue, lower-wards, Local, Already here, Looking for work, Begin, and a ready Opening. The rendered state before action 1 was ready with four enabled suggested choices.

### Rendered action boundary

- Actions 1-5 each had one signed DOM choice, one browser-action binding, one completed player turn, and one unique proper-scene binding. Their turn identities were `turn-player-action:c744d35350e31797c582afeea04f5e787e26ce85`, `turn-player-action:9517d24a9e3e5ab2ae62741daae451243a841b1e`, `turn-player-action:e3df4d8c6d7b65b72b7c2e1a03d1ce7b4936744a`, `turn-player-action:fd52816cc2340558cdeee9696a404e17f43cd789`, and `turn-player-action:a73170f3fba70bceb87e808346ff358389c0c621`. Signed-to-ready times were 31,862, 16,964, 19,019, 19,891, and 17,746 ms. The last ready state was worldVersion 16/runtimeRevision 84.
- Action 6 signed choice `choice_7b3376ba8564ccccbc22e1ee` (`Look around`) at Unix `1786682095766` (`2026-08-14T07:34:55.766+03:00`). The recorder retained three POST attempts to `/api/campaigns/6b85a49e-fef5-4359-95e2-051383f6fb66/play/turns`: `1786682095778` (`07:34:55.778+03:00`), `1786682096423` (`07:34:56.423+03:00`), and `1786682098100` (`07:34:58.100+03:00`). All three were status 503 with the identical idempotency-key hash `de4b65c2345430ae200f5de6002f76f7829a4513c053626a543f95f94605e478`, expected versions `16/84`, and canonical body hash `0d8c3de6536ffe2f5cefb87ca1274d57f5c36bc806674a6e02153d42c1361b67`; no fourth POST exists. One bounded authority state GET returned 200 between attempts at `1786682095863` (`07:34:55.863+03:00`), and the post-terminal state GET returned 200 at `1786682098101` (`07:34:58.101+03:00`).
- After the third 503, the same rendered page showed the existing service-unavailable surface and the runner stopped with `rendered_service_unavailable`; action 6 was not bound, no later click or reload occurred, and `network-errors.json` and `browser-console.json` were empty. The backend logs retain safe error classes `model_contract_failed`, `turn_corrupt`, and public `service_unavailable` while loading a continuity turn with an invalid visible boundary. This is the first genuine product/runtime boundary in r190; the runner did not issue an operator retry.

### Persistence and unavailable acceptance

- Read-only authoritative state at the freeze was `ready`, worldVersion 16, runtimeRevision 84, with four enabled choices. SQLite was opened URI read-only with `query_only=1`; `integrity_check=ok` and `foreign_key_check=[]`. `campaign_play_turns` contained 6 rows (one opening and five player actions), `campaign_play_proper_scenes` 5, `campaign_play_narration_operations` 5, and no action-6 admission row. Commands, receipts, and world events were 21/21/21 with 21 distinct identities; runtime events were 84 with 84 distinct identities. No row matched action 6's expected version pair `16/84`.
- Checkpoints 10/20/30/40/50/60, 60 completed/bound actions, and the required final same-page reload are unavailable because the lane froze at the first product boundary. r190 is not Done.

### Cleanup and changed artifacts

- Backend, frontend, Chromium/CDP, and task listeners were stopped; ports 4750/4751/4752 were free. Settings were restored byte-for-byte to the original SHA-256. Generated r190 session/world evidence and bounded logs remain preserved. The external runner helper was removed after the lane. PowerShell rejected the exact task-owned temporary-directory/config/profile deletion command, so the remaining scratch/config/profile files under `R:\Temp\WorldForge-task227-r190` are retained for manual cleanup rather than bypassing the safety boundary.
- Product source and tests are unchanged. The only changed tracked artifact is this note; all other changes are task-owned external evidence or temporary cleanup residue. Main must choose a repair/no-change route for the r190 product boundary; no further lane or click was authorized.
