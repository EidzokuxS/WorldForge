# Turbo r23 action-9 Actor Replanner hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r23` began from the frozen zero-turn Lowwater Ledger template on commit `8469c636`. The rendered Campaign Play UI completed one Opening and ten signed player actions with Z.AI Coding Plan `glm-5-turbo`. Every player choice was made from the visible page, and no action was submitted twice. The required restarts after actions 1 and 10 reproduced the same public state and retained history.

r23 is not a Task 18 pristine promotion lane. During player action 9, the background Actor Replanner produced a proposal that the grounding review rejected for `other_actor_action_not_established`. The durable model stage is `interrupted/model_contract_invalid`, the actor job is `deferred/replan_invalid`, and no actor proposal or receipt was accepted from it. The player turn remained safe and completed, but Task 18 permits no model-contract or semantic invalidity in a pristine lane. The run therefore stops at the action-10 checkpoint.

## Player journey

Maren entered the alderman hallway as an ordinary rope and harness repairer looking for paid work. Dren directed her to Dim Ward Market, where Pira Senn, Kellin Marsh, and a cordage vendor each failed to offer a job. Maren inspected an intact dock-line coil, used freeform input to ask the vendor directly about repair work, and then asked Kellin what lay at the winch shaft before following the visible route there.

At the shaft, Meshan Ollo described forty families whose quotas and leases had been taken after the Compact cut lower-ward allocations. Their occupation prevents divers from descending and has lasted six days, but food is running low. By action 10, Maren's self-chosen goal was still to find steady repair work that could pay her room lease without making her central to the protest. She expected Meshan either to name a concrete repair need or to give her a clear reason to move on. The visible evidence was her stored trade and tool roll, three failed market leads, Meshan noticing her tools, and the camp's crowded bedrolls and six-day duration.

Action 10 confirmed that the camp had frayed nets, rope ties, and harness stitching, but no copper or credit to pay for the work. The result answered the practical question without granting employment or turning Maren into an essential participant. It left a genuine choice between asking what Meshan meant by a different reason, observing the camp, waiting, or moving onward.

## Action-10 audit

- Durable turns: one completed Opening and exactly ten completed player actions; no unfinished turn and no resume-eligible turn.
- Final state: `ready`, `worldVersion=27`, `runtimeRevision=492`, Day 1 `00:11`, location `winch-shaft-entrance`.
- Accepted Campaign World: version `1`, content hash `93a09e46b8f5adfc96db1f184c20f0a426ff6428223cb312c427a716bbeeb717`.
- Runtime-event sequences, distinct sequences, and result revisions are contiguous from `1` through `492`; `next_runtime_event_sequence=493`.
- SQLite integrity is `ok`; foreign-key violations are zero.
- Model stages: `32` accepted and schema-valid; one interrupted and schema-invalid Actor Replanner stage. Every stage requested and used Z.AI Coding Plan `glm-5-turbo`.
- Hard-stop stage: player action 9, worker epoch `1`, `actual_strategy=strict_object`, `duration_ms=403598`, `finish_reason=tool-calls`, `error_code=model_contract_invalid`.
- The affected actor job has `stage=deferred` and `defer_reason=replan_invalid`; no proposal row exists for that job.
- Restart proof after action 10 matches exactly: public-state hash `0918609c0540230ef185068715d3afa7856d78bf2790b7c317adce85269013b4`, replay hash `6e91e8707de48edd0a325b1c460e6cec69ee5047e734b668c7eae1e52b7a328a`, and checkpoint hash `6e7c295bd2419a37fca20b9d8760c8d63470e8e08143a067167a0220d960d543`.
- Checkpoint projection hash: `17c260e54b94ce2508feed89ca5a936f71abcdb7060a5e5d1e5c4b1b68cab66a`; protected audit hash: `635aad11e200da3121fc92e76217751ad9f09d23bf5008e74dbd04b9cca241c5`.
- The rendered action-10 screenshot is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r23.session/screenshots/action-10.png`, SHA-256 `fc06ca814a15b988b94be7d0f2a6c8e6350e2b822b00edc9d7e39fd303a9503f`.

## Disposition

The runtime failed closed: it accepted no ungrounded actor action, preserved the player's completed turns, and remained restart-identical. The stricter pristine evidence contract still disqualifies r23. No product change follows from this single stochastic grounding failure because the validator behaved as designed and the retained attempts do not identify a smaller blocking defect. Lane A must restart from the same frozen zero-turn template under a new run id with the same provider and model.

Humanizer review kept the journey tied to what the player could see and separated those observations from the protected audit. Deslop review removed repeated framing and retained every count, hash, failure code, and promotion boundary unchanged.
