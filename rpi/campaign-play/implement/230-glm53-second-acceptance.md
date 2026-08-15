# Task 230: second Campaign Play GLM 5.3 acceptance

Status: Done. This is a factual QA record for the unchanged Campaign Play implementation.

## Identity

- Repository: `R:\Projects\WorldForge`, branch `feat/revamp`
- Entry HEAD/origin before the evidence commit: `a71ee46029416a921f228a927152039ba3fcd8c8`
- Executable under test: `f6c8315927a05fe25dc805a29345c154ea69e8dd`
- Run/lane: `pristine-60-glm53-lowwater-ledger-93a09e46-r194`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Requested roles: `zai-coding-plan / glm-5.3` for Generator, Judge, and Storyteller
- Canonical state/config/Brina SHA-256: `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`
- Evidence root: `output/playtests/campaign-play/pristine-60-glm53-lowwater-ledger-93a09e46-r194.session`

## Contract and preflight

- Actor/surface: Campaign Play player on the built page in the Codex in-app Browser. Trigger: canonical Brina setup and enabled choices. Outcome: Opening ready, 60 rendered actions, then one same-page reload restoring the latest state. Direct API was not used in place of rendered play; external Chrome/CDP, standalone Playwright, Computer Use, and product edits were not used.
- The explicit `zai-coding-plan / glm-5.3` tuple resolved and passed the exact requested-model predicate for Generator, Judge, and Storyteller before materialization. No `glm-5.2` alias, Turbo fallback, provider switch, or source/test/prompt/schema/UI/persistence change was made.
- One materialization and exactly one successful `--live-phase prepare` completed before runtime, HTTP, Browser, or SQLite activity. The canonical lowwater-ledger template and all three hashes above matched.

## Setup and rendered actions

- Setup occurred once: one Brina assignment/upload, Save/Continue, `lower-wards`, `Local`, `Already here`, `Looking for work`, and `Begin`. Opening rendered ready at `alderman-hallway` with projection `6b7670f422e19053982985de4e2d898faddca45970def41f7d44e01def407d10` and enabled choices.
- Actions `1-60` each had one signed visible choice, one DOM click, one unique completed player turn, one unique completed narration/proper-scene binding, and enabled controls before the 120-second bound. `browser-actions.jsonl` contains 60 signed entries; `browser-metrics-summary.json` contains 60 click-to-ready measurements. Latency was `52.188s` minimum, `115.515s` median, `118.211s` maximum; every action was below `120s`.
- A Browser transport result around action 49 was reconciled against the rendered/durable authority before action 50; action 49 was already complete, so it was not repeated and no duplicate click or identity was introduced.
- Terminal action 60: turn `turn-player-action:2f9b5466a4a9963e1a6a031c2a1656474be99606`, narration `narration:f7cd2f21bd8c1c78de628de810ca7822936d9d32`, operation `narration-operation:fe5fbc689b34b9985b316d78c5c6a4d460ac2815`, projection `6cd01a2329e3ab2c71452406de1f393c62b93988f6e3fe7fa1ba1efea22ae71c`, world/runtime `44/1197`. Choice controls and Journal/Wait were enabled; Act remained disabled.

## Checkpoints

Each retained checkpoint used a task-owned read-only URI copy with `query_only=1` and `foreign_keys=1`; `integrity_check=ok` and an empty foreign-key check were observed. Counts below are completed player turns/results/complete narration operations/proper scenes; commands/receipts/world-events; runtime events/turn events; world/runtime; model stages with accepted exact requested/actual rows.

| checkpoint | player turns/results/ops/scenes | commands/receipts/events | runtime/turn events | world/runtime | model stages (accepted exact) |
| --- | --- | --- | --- | --- | --- |
| 10 | 10/10/10/10 | 23/23/23 | 206/204 | 18/206 | 26 (13) |
| 20 | 20/20/20/20 | 31/31/31 | 399/397 | 22/399 | 52 (25) |
| 30 | 30/30/30/30 | 37/37/37 | 575/573 | 25/575 | 75 (32) |
| 40 | 40/40/40/40 | 41/41/41 | 765/763 | 27/765 | 101 (41) |
| 50 | 50/50/50/50 | 57/57/57 | 979/977 | 35/979 | 127 (59) |
| 60 | 60/60/60/60 | 75/75/75 | 1197/1195 | 44/1197 | 152 (78) |

The action-10 copy was read and verified during the run; its JSON summary was not retained after a transient Browser/REPL reconnect. The later checkpoint JSONs and the post-reload read provide retained exact identity/count evidence. At checkpoint 60, turn, idempotency, result, narration-operation, narration, proper-scene, command, receipt, and world-event identities were all unique at their expected counts. Authoritative source DB/WAL/SHM hashes remained unchanged after each read.

## Model identity and reload

- Every accepted retained model stage requested and truthfully used `zai-coding-plan / glm-5.3`: `game_master` 31, `judge` 45, `narrator` 1, and `opening_planner` 1 (78 accepted rows total). The retained interrupted rows are not accepted stages: 72 have no actual model and 2 retain the same truthful exact actual tuple.
- After action 60, the exact same page URL was reloaded once. Before and after reload, the page was ready with the same narration, turn, operation, projection `6cd01a2329e3ab2c71452406de1f393c62b93988f6e3fe7fa1ba1efea22ae71c`, world/runtime `44/1197`, and the same enabled choice/utility controls. No setup or action followed reload.
- The post-reload read-only reconciliation remained 60/60/60/60, 75/75/75, runtime/turn events 1197/1195, unique identities, `integrity_check=ok`, empty foreign-key check, and unchanged authoritative source hashes.

## Cleanup and acceptance handoff

- Task-owned backend/frontend/probe resources were stopped; ports `4830/4831/4832` are free. Settings were restored byte-for-byte: SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d`, 2225 bytes. The temporary run config, action-10 read copy, and helper `test.log` were removed. Generated r194 session/world/checkpoint/reload/log evidence remains uncommitted. Protected `AGENTS.md` and `CLAUDE.md` were not inspected, edited, staged, or cleaned.
- Acceptance handoff: unchanged executable identity passed; explicit requested/actual model identity passed for accepted stages; canonical setup and ready Opening passed; 60 rendered one-click actions with unique durable turns/scenes and sub-120-second ready controls passed; checkpoints 10/20/30/40/50/60 passed the recorded counts, uniqueness, integrity, FK, and source-hash checks; one same-page reload and persistence passed. An optional live HTTP scalar was not retained and is not required by the acceptance contract. The only evidence gap is the non-retained action-10 JSON summary noted above; the action-10 read itself and its recorded values completed during the run.

Next: none. Product implementation and tests are unchanged; this note is the only intended Git change.
