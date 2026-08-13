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
- Implementation commit/push and built-product r174 acceptance are pending.

## Live evidence

Pending. The initial implementation commit must be pushed before materializing exactly one fresh r174 lane for the unchanged build on `zai-coding-plan/glm-5-turbo`. If the live journey stops at a supported boundary, append only the exact boundary evidence here.
