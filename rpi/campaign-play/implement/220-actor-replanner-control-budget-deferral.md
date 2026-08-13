# Task 220 Actor Replanner control-budget deferral

## Outcome contract

- Actor: a player using the rendered Campaign Play surface.
- Trigger: an enabled player action whose optional Actor Replanner attempt 1 is rejected as `model_contract_invalid`.
- Observable result: when a complete fresh attempt-2 window cannot fit the remaining actor control budget, the actor job is deferred with `control_budget`, the original invalid model evidence is preserved, and the same turn continues to one proper scene and enabled controls without Resume.
- Protected behavior: Grounding Reviewer and strict model contracts, the 90,000 ms per-attempt deadline, the two-attempt cap, immutable retry identity, stale/late fences, exactly-once mechanics, and genuine persistence/lease failure interruption.
- Forbidden: weakening review or schemas, accepting an invalid plan, attempt 3, mechanics replay, duplicate submission, provider/model/prompt/UI-copy changes, or an out-of-scope production-owner edit.

## Static boundary: Needs attention

- Entry: `6855d5d88cd5d2c1829d42d2c9deac573e9be6a2` on `feat/revamp`; pre-existing unstaged `AGENTS.md` and `CLAUDE.md` were preserved and not inspected or staged. Frozen r178 and earlier lanes were not launched or changed.
- Exact current-head shadow impact for `createCampaignPlayActorReplanner` was run before editing: HIGH, 9 impacted symbols, 1 direct caller, 3 affected Campaign Play application processes, and 1 module. The disclosed Actor/turn-runtime seam was the only production seam edited during the temporary regression attempt.
- The temporary Actor Replanner regression reached the required Actor persistence shape and passed with 20/20 tests: one provider call, one attempt/model stage with `schemaOutcome=invalid` and `errorCode=model_contract_invalid`, no attempt 2, null retry marker, and `deferReason=control_budget`.
- The paired direct turn-runtime continuation regression then failed at `backend/src/campaign-play/actor-scheduler.ts:1158` with `CampaignPlayActorSchedulerError: scheduler_job_invalid`. The deferred job had `deferReason=control_budget` and the preserved latest attempt had `status=interrupted`, `errorCode=model_contract_invalid`.
- The current scheduler validator derives `control_budget` only from `provider_unavailable`, `stage_timeout`, or `stage_budget_exceeded`; with the preserved model-contract error it derives `replan_invalid` and rejects the atomically written job. Resolving that mismatch requires editing `backend/src/campaign-play/actor-scheduler.ts`, which is outside Task 220's owned production scope. No alternative error relabel, fake acceptance, schema weakening, or scheduler edit was made.
- The temporary Actor Replanner, Actor Replanner test, and turn-runtime regression edits were removed after the boundary was confirmed. No implementation commit, build, or r179 lane was produced. The repository is therefore intentionally stopped before live acceptance pending authorization for the required production owner.
