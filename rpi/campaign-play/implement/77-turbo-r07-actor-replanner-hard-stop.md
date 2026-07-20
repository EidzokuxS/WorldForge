# Turbo r07 actor-replanner hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r07` began from the frozen zero-turn Lowwater Ledger template on commit `0e2e3e3b`. Eligibility evidence was prepared before character creation. The rendered Campaign Play UI produced one completed Opening and seven signed player actions with GLM-5-Turbo on the declared provider.

r07 is not a Task 18 pristine promotion lane. During action 7, the first background Actor Replanner stage ended as `interrupted/model_contract_invalid`. Campaign Play correctly deferred only that actor job as `replan_invalid`, performed no replacement-plan mutation, and continued settling the player turn. Task 18 nevertheless permits only transport failure or loss of worker authority to interrupt a frozen model call, so the lane stopped before action 8.

## Player journey

Mira Vask entered as an ordinary outsider following a lead about cable-fibers glowing brighter on certain nights. She asked Dren Vask what the ward required, disclosed her lead through freeform input, and followed his uncertain direction into the lower ward. At Dim Ward Market, Kellin Marsh said bridge crews might collect supplies near the shaft entrance. Mira moved there and asked Meshan Ollo directly. Meshan did not pretend to know crew schedules; he pointed toward the spans or alderman's hall and returned to the forty displaced families sleeping around the locked winch.

The UI was inspected after every completed action. The dialogue preserved player-profile authority, exact place and cast changed with travel, and the final narration matched the committed consequence. Screenshots cover action 0, the action-1 reload, and the terminal action-7 hard-stop state.

## Evidence

- Completed durable turns: one Opening and seven player actions; no unfinished turn.
- Action 7 turn: `turn-player-action:cc172b82ce260cae0cf6d75fdcabf5a84b485aa9`, completed in `833,662 ms`.
- Disqualifying stage: Actor Replanner attempt 1, `interrupted/model_contract_invalid`, `schema_outcome=invalid`, duration `406,208 ms`.
- Owning job: `deferred/replan_invalid`, with no accepted proposal or mechanical mutation from the invalid plan.
- A separate actor job completed one accepted Actor Replanner stage in `334,669 ms`; the player turn then completed without Resume or input resubmission.
- Final public state: `ready`, `worldVersion=22`, `runtimeRevision=338`, location `winch-shaft-entrance`, projection hash `a83af8870e2e09e48541101ba1dd7f5a852322fe5c59dd8498847a754fc03ab7`.
- Model ledger: seven accepted Judge stages, seven accepted Game Master stages, eight accepted Narrator stages, one accepted Opening Planner stage, one accepted Actor Replanner stage, and one interrupted Actor Replanner stage.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows.
- Browser action evidence contains exactly seven signed actions. The action-7 terminal screenshot is `screenshots/hard-stop-action-7.png`.

## Disposition

The actor-replanner failure is valid product behavior but a pristine-lane hard stop. It is not evidence for fallback behavior, a hidden retry, or a speculative prompt repair. The next Lane A attempt must materialize the same frozen zero-turn template under a new run id and preserve the same committed provider and model configuration.

Humanizer review kept the report centered on the player's observed journey and the durable stage evidence. Deslop review preserved the distinction between correct runtime recovery semantics and the stricter Task 18 promotion boundary.
