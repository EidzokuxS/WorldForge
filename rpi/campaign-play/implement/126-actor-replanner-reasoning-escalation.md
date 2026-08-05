# Actor Replanner bounded reasoning escalation

## Contract

- Base: `feat/revamp` at `cb64e58f7bff7d311d1b0b6925355170332a298c`; no stage, commit, or push.
- Actor: the player using the existing Campaign Play page; due private NPC plans are replanned behind the same surface. Semantic layer: private actor planning. Surface: `/campaign/:id/play`.
- Trigger: a due actor needs replanning after a player action. Observable outcome: the normal bypass replan settles once; one proven model-contract failure may recover once with the same provider/model and default reasoning, without replaying player mechanics or visible interruption.
- Forbidden: schema/output relaxation, prompt/provider/model/default changes, general retry behavior, UI/copy/layout changes, mechanics/receipt changes, actor-planning semantic changes, or a hidden third call.

## Seam B delta

- Added expand-only migration `0050_campaign_play_actor_replan_attempts` and the Drizzle schema/journal entry for a normalized attempt identity table. Historical model stages remain unlinked; there is no guessed backfill.
- Each new Actor Replanner call records an immutable attempt identity linked to exactly one model-stage row. Attempt 1 keeps its `model_contract_invalid` interruption and receives one retry-consumption marker; attempt 2 uses model epoch 2 while the claimed actor job and turn lease remain at epoch 1. The table constraints and triggers make attempt 3 structurally impossible and reject cross-job, cross-frame, cross-provider, stale, or malformed chains.
- The live replan invocation builds the actor frame once, reuses the same prompt/schema/provider/model identity and forwarded outer abort signal, and atomically starts attempt 2 only after the exact attempt-1 contract-invalid evidence. Acceptance CASes the linked attempt, model stage, claimed job, turn lease, source frame, provider/model, and frozen base before the existing single proposal/plan settlement. Late or interrupted recovery cannot commit.
- Legacy and explicit fresh-epoch resume paths retain their prior one-attempt behavior; non-actor model-stage kinds retain their old epoch validation.

## Review

- Main semantic review: approved narrow edits to the linked-only `validateModelStages`, repository load/recovery, actor settlement trigger, and runtime construction seams. GitNexus impacts were rerun for each edited executable symbol; the authorized high/critical warnings were not broadened.
- No prompt or visible-copy review was needed: prompts, schema, compiler, grounding reviewer, UI, copy, mechanics, and receipts are unchanged. No prose rewrite is needed.

## Deadline boundary

- Source inspection confirms that `primary_settled` actor replanning remains on the existing deterministic turn-service path. The runtime's configured `externalOperationDeadlineMs` (default 90,000 ms) is passed through the narrow replan request; the actor call owns one persisted absolute `deadline_at` for the live operation without reclassifying the stage as `runExternal`.
- Attempt 1 starts one local timer at provider start and persists `deadline_at = provider-start + externalOperationDeadlineMs`. Attempt 2 copies the exact deadline. A combined upstream/deadline `AbortSignal` is passed to both provider calls, and each pre-compile, review, retry, and acceptance fence checks the same absolute deadline. Timeout becomes the existing `stage_timeout` interrupted path and never consumes a semantic retry.
- Migration 0050 remains expand-only: legacy model stages are unlinked and retain their old behavior. Linked attempt triggers, repository validation, and acceptance CAS reject deadline resets, cross-frame/provider chains, acceptance at/after the deadline, and any third attempt.

## Automated evidence

- `npm --prefix backend exec vitest run src/campaign-play/actor-replanner.test.ts`: 1 file, 12 tests passed. This covers valid bypass, schema-invalid recovery, grounding-review recovery, two-invalid defer/no third call, provider-unavailable no escalation, outer-abort late-result fencing, first-attempt deadline timeout without escalation, and second-attempt deadline timeout with an abort-ignoring late provider.
- Separate focused runs of `campaign-play-database.test.ts`, `campaign-play-turn-repository.test.ts`, `campaign-play-application.test.ts`, and `turn-runtime.test.ts`: 4 files, 128 tests passed. They cover fresh/legacy expand-only migration, linked 1→2 identity and deadline triggers, repository validation/reload, role construction, turn recovery, and unrelated stage behavior. A combined five-file Vitest invocation also reported all 140 tests passed before the runner's existing `Timeout calling "onTaskUpdate"` worker error; the separate runs are the authoritative green evidence.
- `npm --prefix backend run typecheck`, backend build, shared build, and frontend build passed. `npm run typecheck` remains red only on the pre-existing unrelated Forge `react-hooks/set-state-in-effect` lint at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105` (with its existing warning at line 139). `git diff --check` passed with the checkout's existing line-ending warnings.
- GitNexus upstream impact was rerun for each edited executable symbol, including the authorized HIGH/CRITICAL runtime/repository seams; final `detect_changes` is recorded at handoff.

## Rendered r64

- Fresh lane materialization passed from `lowwater-ledger-pristine-93a09e46-20260719` with the fixed campaign and canonical Brina card. The task-owned session is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r64.session`; preflight confirmed the fixed branch/base, zero characters/turns before import, and `integrity_check=ok`/`foreign_key_check=[]`.
- Opening was admitted exactly once with `lower-wards / Local / Already here / Looking for work`; completed narration and rendered `THE MOMENT`/`YOUR MOVE` arrived in 116,018 ms. Action 1 then showed the natural valid bypass proof: one `actor_replanner` accepted stage (`zai-coding-plan/glm-5-turbo/strict_object`), one linked attempt (`attempt_number=1`, `model_worker_epoch=1`, persisted deadline), one accepted proposal/plan/job settlement, no retry, and clean integrity/FK checks. Actions 2–4 also bound one-to-one with accepted mechanics/proper scenes and actor evidence.
- The lane stopped immediately at action 5, the first genuine product defect: the player-action observer reached its 120,000 ms mechanics/accepted-scene deadline while the authoritative turn remained non-terminal (`judge=accepted`, `game_master=started`). The persisted terminal state became `stage_timeout` at 154,539 ms after admission; no action-5 ledger binding, next click, actor command, or duplicate write occurred. Evidence is `probes/action-5-latency-terminal.json`, `probes/first-defect.json`, and `screenshots/action-5-latency-terminal.png`. The lane therefore returns Blocker rather than claiming 60/60 or reload acceptance.
- No natural model-contract-invalid Actor Replanner occurred before the boundary; recovery remains automated-only, while the natural valid bypass is product-proven. Task-owned backend/frontend/browser processes and ports were stopped and verified released by `probes/cleanup.json`.
