# Task 217 Actor Replanner contract-recovery fresh deadline

## Outcome contract

- Actor: a player using the rendered Campaign Play surface.
- Trigger: an enabled player choice in the canonical Brina Hael journey.
- Observable result: an Actor Replanner attempt-1 `model_contract_invalid` rejection automatically starts attempt 2 with a fresh operation deadline and the same immutable turn/job/actor/frame/world/provider/model/strategy identity. The player returns to one proper scene and enabled choices without Resume, replay, or operator action.
- Protected behavior: the Grounding Reviewer, model/reasoning/structured-output branches, 90,000 ms per-attempt external deadline, two-attempt cap, stale/late fences, mechanics exactly-once settlement, and existing stage-timeout recovery.
- Forbidden: prompt, provider/model, schema, UI, public-copy, Narrator, Game Master, Judge, frozen r173, or historical-row rewrites.

## Implementation

- `actor-replanner.ts` creates a fresh attempt-2 operation for both eligible first-attempt `model_contract_invalid` and `stage_timeout` recovery. When the injected clock samples the same millisecond, retry start advances by one millisecond so SQLite can distinguish the new operation; the deadline remains exactly `retryStartedAt + externalOperationDeadlineMs`.
- Attempt-2 acceptance requires a deadline after both its creation and attempt 1's deadline. Attempt 1 retains its original deadline; attempt 2 remains terminal and cannot create attempt 3.
- `campaign-play-turn-repository.ts` accepts immutable historical Task 213 shared-deadline `model_contract_invalid` chains while requiring fresh deadlines for new chains.
- Migration `0053_campaign_play_actor_replan_contract_recovery_deadline.sql` replaces only the Actor Replanner attempt guards and keeps the stage-timeout branch and update immutability guard unchanged.
- Focused tests cover fresh arithmetic/identity, abort-signal replacement, terminal attempt 2, existing timeout recovery, non-eligible errors, invalid combinations, retry-marker drift, attempt 3, integrity/foreign keys, and upgrade compatibility.

## Static evidence

- Entry: `d01ee1b3d3f08b18a272c686495b9854fee6b854` on `feat/revamp`; pre-existing unstaged `AGENTS.md` and `CLAUDE.md` are preserved byte-for-byte.
- Exact current-HEAD shadow impact was disclosed before editing: `createCampaignPlayActorReplanner` HIGH (9 impacted, 1 direct importer, 3 processes); `validateModelStages` CRITICAL (55 impacted, 1 direct importer, 26 processes). The authoritative index was three commits stale and was not mutated.
- Actor Replanner + database: 39/39 passed.
- Repository: 35/35 passed.
- Application: 15/15 passed.
- Turn-runtime: 82/82 tests passed, but Vitest reported one unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"`; this is recorded as a verification-runner defect, not a product assertion.
- Backend typecheck passed (`npm run typecheck`).
- Production build passed (`npm run build`, shared, frontend, and backend).
- The stale authoritative-index `detect_changes --scope staged` result was CRITICAL with 875 broadly mapped processes; this matches the already-disclosed stale-index HIGH/CRITICAL warning, not the exact-entry shadow graph.
- Exact-entry temporary shadow `detect_changes --scope all` reported MEDIUM risk with 1 affected execution flow (`RunAttempt → CampaignPlayActorReplannerError`); changed production symbols are limited to Actor Replanner operation/recovery and failure-finalization paths. The stale authoritative index was not mutated.
- `git diff --cached --check` passed.
- Implementation commit/push completed in `4cbae90b1ed8a55d1f487cc0dfcfe52b70a29cc2`; built-product r174 acceptance stopped at the first rendered 120-second control boundary documented below.

## Live evidence

### r174 boundary: Needs attention

- Implementation commit `4cbae90b1ed8a55d1f487cc0dfcfe52b70a29cc2` was pushed to `feat/revamp`; local and `origin/feat/revamp` matched before materialization. Exactly one fresh lane, `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r174`, was prepared for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` on `zai-coding-plan/glm-5-turbo`, using ports 4590/4591/4592. The single `--live-phase prepare` completed before runtime, HTTP, browser, or SQLite activity. Canonical pre-runtime hashes matched: state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- The rendered import, Save/Continue, `lower-wards` / `Local` / `Already here` / `Looking for work`, Begin, and Opening completed. Actions 1-9 each had one signed decision, one rendered click, one admitted turn, one durable completion, and one unique proper-scene bind; no Resume, replay, provider/model change, or duplicate click was used. Authoritative signedAt-to-completed latencies for actions 1-9 were `49430, 15001, 14788, 66666, 30941, 18177, 21656, 31801, 43025` ms (maximum `66666` ms). Action 1 naturally exercised `model_contract_invalid`: attempt 1 `actor-replan-attempt:bd0c121cdc46fc07b433f25b4a0630ae` was rejected, and attempt 2 `actor-replan-attempt:87d85d58cabc925d822e349955a6476a` used fresh deadline `1786581269328` from creation/retry marker `1786581179328`, was accepted, and produced no attempt 3; the reviewer remained in the path and the recovery was invisible in the rendered surface. Action 4 also recovered a first-attempt `stage_timeout` within the two-attempt cap.
- Action 10 was the first boundary. Decision `Talk to Vedris Kast: ask how long the walk takes` was signed at `1786581926229` with turn `turn-player-action:bdd327db222dbea33d645819172ba4b1339bc421`, choice handle `choice_a0f251d0877a6e99386c9c16`, and visible hash `f4d9de9ac3a6d3d6eb0cd75b6122d91ecedc96c25160d372ce4ad5a8e17540a3`. One rendered click was issued. At and beyond the 120-second control deadline (`1786582046229`) the same page showed `The world is moving` and all choices/text input disabled; the authoritative API still reported the same turn in `world_acting`, so no second click or retry was attempted.
- The exact-ID read-only SQLite copy recorded the boundary chain: actor job `actor-job:0000:ee2bd5035e83103fb7d64c27`, stage `actor-replan-stage:e71b950e15cad895d9be1a809e48e8f1`, attempt 1 model row `model-stage-row:3e78c1cfa631882e8e0668284a99f9f2` ended `stage_timeout` at `1786582084322` after its `1786582084303` deadline; authorized attempt 2 `actor-replan-attempt:f75ddcdb856812cc650e57ffd516b5ff` started at retry marker `1786582084322`, had fresh deadline `1786582174322`, and its model row `model-stage-row:97f31f5a41508c8e9d76d3422889f093` was accepted at `1786582109519` after `25196` ms. No attempt 3 or duplicate settlement existed. The turn row later reached `completed` at `1786582110321` (`184092` ms from the signed decision), but the rendered control had not returned to ready and the copied database still showed narration pending/running; therefore the observable 120-second contract was not met.
- The read-only copy reported `integrity_check=ok` and an empty `foreign_key_check`. Full task-owned stdout/stderr and browser evidence remain under `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r174.session`; no reload or finalize phase was run after the boundary. Task-owned backend/frontend processes were stopped, and ports 4590-4592 were free. The generated lane/world evidence is intentionally uncommitted.
