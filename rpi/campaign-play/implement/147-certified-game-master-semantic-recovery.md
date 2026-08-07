# Task 147: bounded certified Game Master semantic recovery

## Contract

A certified player action may automatically resume the Game Master exactly once when attempt one ends `model_contract_invalid` before mechanics settlement. Attempt one keeps the fast generator reasoning bypass. The fresh-epoch attempt two uses default generator reasoning with the same provider, model, strict schema, certified ruling and resolution, frozen turn input, and existing per-attempt deadline. A second failure remains interrupted; there is no automatic attempt three.

Full-authority recovery, Judge, Opening, Actor Replanner, Narrator, mechanics, receipts, visible copy, and UI remain unchanged. The certified ruling is revalidated from the same admitted turn rather than replaced, and no mechanics mutation exists before a Game Master artifact is accepted.

## Evidence

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r87` completed and bound two player actions. Action three selected `Talk to Thera Vek: ask about the toll gate` once through `certified_contact`. Its Game Master attempt one returned structured output in 7,538 ms, then semantic compilation rejected the proposal as `model_contract_invalid`. No Game Master artifact, mechanics command, receipt, actor job, narration, proper scene, replay, or second admission followed.

The recovery gate is limited to `player_action + certified route + interruptedStage admitted + attempt one + model_contract_invalid`. Focused coverage proves the fresh model selection, certified-route reuse, one settlement, judged-stage exclusion, and the existing no-repeat guard.

Semantic review verdict: technical, literal, and limited to existing recovery concepts; no player-visible prose changed.
