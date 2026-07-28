# Task 18 Lane A r33: orphaned Opening hard stop

## Observed authority

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r33` remains in its own run root at campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. Its Opening turn is `turn-opening:a85f9d630cfda47a9832114e96732fcbb21395b8`.

Read-only SQLite inspection of that run's `state.db` reports `integrity_check = ok` and an empty `foreign_key_check`. The Campaign Play state is `opening_required`, world version `5`, and runtime revision `75`. The Opening row is still `admitted`, has no final world version, result, public packet, interruption stage, or error code, and carries worker epoch `1` with owner `campaign-play-61904-e5bf7251-066e-424f-9009-f099332685f6`. Its lease expiry is `1784565818085`, already in the past when this note was recorded.

The only durable external-stage record is attempt `1` for `opening_planner`: `started`, `pending`, requested provider `zai-coding-plan`, requested model `glm-5-turbo`, and requested strategy `strict_object`. It has no actual provider/model, artifact hash, or error. There are 73 turn events (one `turn.accepted`, 72 `turn.progressed`) and 73 runtime events: one `turn_admitted`, one `worker_claimed`, and 71 `worker_lease_renewed`. The final runtime event is sequence `75`, advancing runtime revision `74` to `75` while world version remains `5`; the final turn event is sequence `73`, a `turn.progressed` event at the same world/runtime state.

The campaign has only the four character-bootstrap commands, receipts, and world events created before Opening. Opening itself has zero actor jobs, narrations, and turn results, and no post-bootstrap world mutation. The orphaned attempt makes this lane non-pristine and rules out treating it as a clean continuation.

## Existing recovery behavior, not an action taken here

`backend/src/campaign-play/turn-service.ts` routes an expired external claim through `recoverExpiredExternal`, which calls the interruption path from the exact stored lease boundary before dispatching another provider call. The repository's interruption path changes the turn to `interrupted`, marks the started model stage interrupted, clears the lease, and sets `resume_eligible = 1`. Its explicit external-resume path then inserts the next started model-stage attempt. The same-key admission path resolves the stored turn, while a different input meets the one-active-turn guard.

No backend was started for r33 and no recovery, Resume, replay, SQL write, restore, provider change, model change, fallback, prompt change, or action submission was performed. These code-defined paths explain why normalizing the row would mutate the diagnostic evidence; they are not authorization to use them.

## Task 18 classification

Task 18 allows normal UI play and read-only evidence capture only, and ends a lane at any hard-stop condition. The expired external attempt and absent runtime process make r33 an orphaned Opening hard stop for pristine acceptance. It is preserved unchanged and a separate materialization from the immutable `lowwater-ledger-pristine-93a09e46-20260719` template is required for the next Lane A attempt.

Main completed the required humanizer and deslop review. The pass kept the exact run, campaign, turn, provider, model, lease, event, and state facts; it clarified that the orphaned attempt disqualifies the lane rather than changing the meaning of the stored Opening state.
