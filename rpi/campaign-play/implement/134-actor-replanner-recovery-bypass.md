# Task 134: bounded Actor Replanner recovery latency

## Outcome

The one existing Actor Replanner recovery attempt now uses the same provider, model, strict schema, and explicit reasoning bypass as attempt one. Task 130's deterministic safe rejection feedback remains the only retry-specific instruction. The reviewer, compiler, absolute 90-second deadline, attempt identity, persistence fences, and no-attempt-three rule are unchanged.

## Evidence

The frozen r73 action 13 reached the grounding reviewer on attempt one and was rejected for `other_actor_action_not_established` after 22,068 ms. Attempt two received the safe recovery feedback but default reasoning produced 4,852 output tokens and consumed the remaining 67,838 ms before the shared deadline aborted it. The turn stayed `primary_settled`, its actor job stayed interrupted, no narration operation or proper scene was created, and the rendered page exposed Resume. The lane was frozen without Resume or replay.

The change is deliberately role-local: only the recovery model construction adds `reasoningMode: "bypass"`; attempt one was already bypass. No prompt, schema, validator, provider/model selection, mechanics, receipt, narration, UI, or visible copy changes. Humanizer and deslop review are not applicable because no model instruction or player-visible prose changed.

## Acceptance

Construction coverage must prove both Actor Replanner models use bypass while every other role retains its current mode. Focused Actor Replanner and application suites, backend typecheck/build, shared/frontend builds, diff check, and GitNexus change detection must pass. A fresh pristine lane must then demonstrate either a valid first attempt or one safe-feedback recovery within the unchanged 90-second actor deadline before endurance work continues.
