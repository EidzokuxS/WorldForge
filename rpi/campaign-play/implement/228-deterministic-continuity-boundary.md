# Task 228: deterministic-continuity boundary

Status: implementation and bounded built-surface proof complete; r191 acceptance stopped at action 1 on a runner boundary and did not achieve the 60-action contract.

## Identity

- Repository: `R:\Projects\WorldForge`, branch `feat/revamp`.
- Entry local/origin: `3a8710ed09cb67ee53ba1a4c74ad36083f42af2e`.
- Frozen reference: `pristine-60-glm52-lowwater-ledger-93a09e46-r190`; it was not opened or mutated.
- Product surface: Campaign Play deterministic authority/control-budget continuity.

## Exact delta

- `commitContinuity` now writes the packet-compatible `flash` effect for player-action deterministic continuity. Generic player-action narration validation remains strict.
- `loadCompletedPublicMoment` uses a local adapter that accepts only an otherwise exact historical deterministic-continuity scene whose completed narration operation proves `source_kind=deterministic_continuity` and whose persisted effect is the old `fade`. The adapter validates an in-memory `flash` view and never rewrites the row. Generic and `model_accepted` `fade` remain rejected.
- `mutation_audit_json.kind=control_budget_continuity` is accepted only on a player-action continuity turn at `visibility_projected` or `completed`, with the existing terminal/result/packet/operation/scene/event/lease/epoch checks. Other stages, non-player turns, and accepted Narrator stages remain corrupt.

## Graph gate

The registered graph was refreshed before editing with `node .gitnexus/run.cjs analyze --index-only --skip-agents-md` (15386 nodes, 43684 edges, 863 flows). Exact file-qualified target resolution for the edited symbols remained unavailable in the refreshed index; the supplied lower-bound impacts governed scope: `commitContinuity` LOW (3 direct callers, 2 processes), `commitVisibleResult` LOW (4, 2), `loadCompletedPublicMoment` LOW (1), and the explicitly authorized guarded `validateAcceptedStageProgress` CRITICAL lower bound (1 direct caller, 28 processes, 60 impacted). No unrelated owner was added.

## Automated evidence

- Focused continuity, historical-compatibility, generic/model rejection, marker-stage, and terminal-proof regressions: 11 passed.
- `campaign-play-turn-repository.test.ts`: 35 passed; `campaign-play-database.test.ts`: 21 passed; `contracts.test.ts`: 36 passed; `campaign-play-application.test.ts`: 21 passed.
- Full `turn-runtime.test.ts`: 92 passed.
- Backend typecheck and production build: passed.
- `git diff --check`: passed.

## Disposable built-surface proof

Using the rebuilt backend on task port `4740` and isolated root `R:\Temp\WorldForge-task228-scratch-14`:

- State GET returned `200`, `phase=ready`, no active turn, `worldVersion=7`, `runtimeRevision=18`, narration present with `sourceKind=deterministic_continuity`, and four enabled published choices.
- One real next-action POST with the published handle `choice_09d42cc200fb3b920a08c8bb`, expected versions `7/18`, and one idempotency key returned `202` with turn `turn-player-action:38d9d3bca208e5786a6f90bc3de69b799517ffca`.
- A URI `mode=ro` SQLite copy was opened with `query_only=1` and `foreign_keys=1`: `integrity_check=ok`, `foreign_key_check=[]`, two unique `player_action` rows (the completed deterministic-continuity turn and the one newly admitted action), and one opening row. Source `state.db`, `state.db-wal`, and `state.db-shm` SHA-256 values were unchanged across the read.

## Acceptance handoff

1. New continuity writes are canonical `flash`.
2. Exact historical deterministic-continuity `fade` is readable without mutation; generic and model-accepted `fade` are still rejected.
3. The audit marker survives `visibility_projected -> completed` and strict-loads only with the existing terminal proof.
4. The disposable built surface projected continuity and admitted the next player action with `202` and one new durable turn.
5. Model/narrator/reviewer/mechanics/attempt/idempotency contracts were not broadened.
6. Focused/full checks, build, graph refresh, staged scope check, commit/push, cleanup, and protected-dirt preservation are recorded in the terminal handoff.

## Cleanup

The exact task-owned backend process and port were stopped. The scratch root, read-only DB copy, and temporary seeding helper were removed after capturing the bounded scalar evidence. No settings were changed. `AGENTS.md` and `CLAUDE.md` remained unstaged and untouched.

## r191 acceptance evidence

- Run `pristine-60-glm52-lowwater-ledger-93a09e46-r191`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, executable commit `a70952adc13843967b5d341cf8271486e96233ab`, provider/model `zai-coding-plan/glm-5.2`, ports `4760/4761/4762`. Materialization occurred once and the single `--live-phase prepare` succeeded. Canonical state/config/Brina hashes matched `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- The first setup helper waited only 30 seconds for the imported identity and exited `1` with `TimeoutError` at the card-parse wait. Read-only state remained `character_required`; browser performance contained the card-parse POST but no save PUT. A task-owned resume helper then completed the already-rendered import without another file-input assignment, performed one Continue, lower-wards/Local/Already here/Looking for work, and one Begin. Ready Opening rendered with `worldVersion=12`, `runtimeRevision=17`, projection `63a65984aa15f6d03248dfd3bfb3125dd6c2c68ac40963979e6b0250ce55767b`, scene `narration:083f4ef1fb7e3e598c4ba504b3cfeedf9353004c`, and four enabled choices.
- Action 1 signed one pending decision for `choice_c46fa397f07f4656c6da79ef` at `1786690748746` (`2026-08-14T06:59:08.746Z` / `2026-08-14T09:59:08.746+03:00`). The deterministic runner then exited `1` with `TimeoutError` before producing action output. Reconciliation found the page still ready at the exact pre-action projection/world/runtime (`63a65984aa15f6d03248dfd3bfb3125dd6c2c68ac40963979e6b0250ce55767b` / `12` / `17`), no rendered service-error surface, no `/play/turns` browser resource, an empty `browser-actions.jsonl`, and the unbound pending decision. Click ownership is therefore not provable; no retry or second click was made.
- The read-only `state.db`/WAL/SHM copy used `mode=ro`, `query_only=1`, and `foreign_keys=1`; `integrity_check` was `ok` and `foreign_key_check` was empty. Persistence contained one completed opening turn and zero player-action turns, commands, receipts, events, results, narration operations, narrations, proper scenes, model stages, or narration attempts for action 1; the sole idempotency key belonged to the opening. Source and copy hashes matched after task-owned services stopped: DB `A98BEA4116B123167E0A76F241BEDADD43E6864667C7EF8D2B5906DEEF9472C7`, WAL `8939F032945978E5503148FB6859DD616087275F0082DB88E6065E813FC27E7B`, SHM `5B1B3A025838F12863FBA4C275CC550C738EBFED7B01C3F0C0BA27E35972201B`.
- No action checkpoint or final reload was run after the first genuine boundary. Task-owned backend/frontend/Chromium processes and ports were stopped; settings were restored byte-for-byte to SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d`. Generated r191 session evidence and bounded logs remain under the output/temp task roots; no product source or test file changed.

## r193 candidate gate evidence

- Candidate A disposable run `task228-candidate-a3-glm52-20260814` used provider/model `zai-coding-plan/glm-5.2` on task ports `4800/4801/4802`. Materialization and the single `--live-phase prepare` succeeded with the canonical state/config/Brina hashes above. The corrected external runner accepted the one canonical Brina assignment through its in-memory file-input fallback, then performed one Continue, lower-wards, Local, Already here, Looking for work, and one Begin. No player-action decision or click was issued.
- The first rendered Opening did not become ready. The page showed the existing stopped-opening surface (“Opening stopped before it finished” with Resume). Read-only state at the boundary was `phase=opening_active`, `worldVersion=5`, `runtimeRevision=12`, and active turn `turn-opening:0d15424f283ff3e29925c368cf61af4221a7a41d`. The authoritative turn was `stage=interrupted`, `interrupted_stage=admitted`, `error_code=model_contract_invalid`, `resume_eligible=true`, submitted at `2026-08-14T17:17:17.440+03:00` and interrupted at `2026-08-14T17:18:31.577+03:00`. Bounded backend diagnostics recorded requested model `glm-5.2` and response model `glm-5.3`; no raw provider body or candidate was retained.
- A URI read-only copy of the candidate state DB was opened with `query_only=1` and `foreign_keys=1`: `integrity_check=ok`, `foreign_key_check=[]`. Persistence contained one interrupted opening turn, four setup commands/receipts/events, ten opening turn events, and zero player-action turns, player-action commands/receipts/events, turn results, narration operations, narrations, or proper scenes. Source/copy hashes after service stop matched for DB `a98bea4116b123167e0a76f241bedadd43e6864667c7ef8d2b5906deef9472c7`, WAL `2dfa943b3e8461cec740cbb71cc353106fe515f790acfe80b50cdc0de650ba4a`, and SHM `837edd42c7d032c7cb46f568b18ac07d3f10a1773de8711ab6cd4bf847d10026`.
- This is not the fixed gate's exact `provider_unavailable` class. Per the two-model rule, Candidate B was not tested and no r193 final lane was materialized. Candidate A's rendered product-contract boundary is frozen without Resume, retry, reload, or a second click. Settings were restored byte-for-byte to SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d`; task-owned services and ports were stopped. Generated candidate evidence remains under `R:\Temp\WorldForge-task228-r193`.

## Candidate B Turbo gate / r193 outcome

- Candidate B disposable run `task228-candidate-b-turbo-20260814` used provider/model `zai-coding-plan/glm-5-turbo` on task ports `4810/4811` with the Codex in-app Browser tab `3`. The canonical state/config/Brina hashes matched `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Exactly one materialization and one successful live-phase prepare were performed.
- Rendered setup completed once: one canonical Brina assignment, Continue, `lower-wards`, `Local`, `Already here`, `Looking for work`, and Begin. The page remained at `Preparing your arrival`; no player-action decision or click was issued. It then rendered the existing stopped-opening/Resume surface.
- Read-only authority at the boundary contained one opening turn `turn-opening:a8d9727d42dc05b888458822873d41b5dbc26197`, `stage=interrupted`, `interrupted_stage=admitted`, `error_code=stage_timeout`, `resume_eligible=true`. Its one `opening_planner` model stage had `attempt=1`, `status=interrupted`, requested provider/model `zai-coding-plan/glm-5-turbo`, `schema_outcome=transport_error`, duration `90029ms`, and `error_code=stage_timeout`. Bounded backend diagnostics recorded an upstream HTTP 200 response followed by the safe-generator abort; no provider body or candidate was retained.
- A URI read-only DB copy used `query_only=1` and `foreign_keys=1`: `integrity_check=ok`, `foreign_key_check=[]`. Counts were one opening turn, four setup commands/receipts/events, eleven turn events, one model stage, zero player-action turns/results, zero proper scenes, and zero narration operations. No duplicate or late player write exists.
- The required disposable gate therefore failed on the rendered `stage_timeout` boundary. The final lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r193` was not materialized; no action 1-60 journey, checkpoints, or final reload were run. Settings remained/restored byte-for-byte at SHA-256 `577c39d0a04b5b086d6a4f34f2fd3fa6878a91f6a4fcc82978c17b0c791e0b3d`; task-owned services, ports, helper, run-config, and read-only DB copy were cleaned. Safe gate evidence and generated world/session/logs remain under `R:\Temp\WorldForge-task228-r193-turbo`.
