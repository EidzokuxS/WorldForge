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
