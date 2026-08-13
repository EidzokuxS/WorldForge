# Task 224: GLM-5.2 60-action acceptance

## Entry

- Repository: `R:\Projects\WorldForge`, branch `feat/revamp`.
- Entry commit: `a43405f639f4e5113c189ddf62a93a02d29a0293` (local and `origin/feat/revamp`).
- Product source was not changed for this live-QA task.
- Provider: `zai-coding-plan`; generator, judge, and storyteller: `glm-5.2`.

## Disposable provider preflight

- A disposable scratch campaign was materialized outside the lane evidence.
- The pushed frontend was built with `NEXT_PUBLIC_API_BASE=http://127.0.0.1:4690`; matching backend/frontend services used ports `4690/4691` and CORS `http://127.0.0.1:4691`.
- Chromium rendered the canonical Brina Hael card import. The imported form and `Continue to opening` control were enabled, with no visible error; no Save/Continue, Begin, or player action was submitted.
- Scratch services, root, temporary configuration, logs, and helper were cleaned before the canonical lane.

## Canonical lane

- Run: `pristine-60-glm52-lowwater-ledger-93a09e46-r184`.
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`.
- Lane materialization and the single live `prepare` phase completed from the isolated campaigns root.
- Canonical pre-runtime hashes: state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

## Journey evidence

- Rendered setup completed once: Brina import, Save/Continue, `lower-wards`, `Local`, `Already here`, `Looking for work`, Begin, and ready Opening.
- Actions 1-48 and 50-51 each had one signed rendered choice, one browser click, one admitted turn, one durable completion, one unique proper-scene bind, and an explicit enabled-control check. Action 49 reached authoritative ready, was bound exactly once, and the next rendered action admitted normally; its first exact-name locator was inconclusive because the rendered button accessible name carried a keyboard prefix. No manual Resume, retry, replay, duplicate click, or provider/model switch was used.
- Checkpoint 10 read-only SQLite evidence: 10/10 player turns completed, 10 scenes, 39 commands/receipts/events, integrity `ok`, foreign-key violations `0`, duplicate turn/scene IDs `0`, world/runtime `22/172`.
- Checkpoint 20: 20/20 completed, 20 scenes, 60 commands/receipts/events, integrity `ok`, foreign-key violations `0`, world/runtime `32/334`.
- Checkpoint 30: 30/30 completed, 30 scenes, 83 commands/receipts/events, 30 narration operations, 31 narration attempts, integrity `ok`, foreign-key violations `0`, world/runtime `43/505`.
- Checkpoint 40: 40/40 completed, 40 scenes, 112 commands/receipts/events, 40 narration operations, 41 narration attempts, integrity `ok`, foreign-key violations `0`, world/runtime `53/684`.
- Checkpoint 50: 50/50 completed, 50 scenes, 135 commands/receipts/events, 50 narration operations, 51 narration attempts, 20 actor jobs, 10 actor plans, integrity `ok`, foreign-key violations `0`, duplicate turn/scene IDs `0`, world/runtime `63/846`.
- Captured signed-to-ready latencies through action 50 were all below 120,000 ms; the maximum captured value was 67,327 ms (action 19). Action 51 reached ready and was bound before the boundary.

## First boundary

- Action 52 was signed once at `1786663533372` for choice handle `choice_75c787d69b6b3afe2c175255` and clicked once. The sole admitted turn was `turn-player-action:28a87746b13b0f1c5651b7d5982b213c877b1309`.
- The authoritative turn ended `stage=interrupted`, `interrupted_stage=admitted`, `error_code=stage_timeout`, `resume_eligible=1`; no completion, scene, or second admission occurred for action 52. The rendered page showed one `Resume` control and no `Try again`; no recovery action was taken.
- At the frozen boundary, read-only SQLite backup checks were integrity `ok`, foreign-key violations `0`, 52 player turns (51 completed, 1 interrupted), 51 proper scenes, 137 commands/receipts/events, 51 narration operations, 52 narration attempts, duplicate turn/scene IDs `0`, world/runtime `64/869`.
- This is the first genuine user-visible stopped turn. The 60-action plus final-reload acceptance is therefore not met; the lane is frozen without Resume, retry, replay, reload, later click, repair, or a second lane.
