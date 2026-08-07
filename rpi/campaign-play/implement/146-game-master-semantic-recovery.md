# Task 146: bounded Game Master semantic recovery

## Contract

A full-authority player action may automatically resume the Game Master exactly once when attempt one ends `model_contract_invalid` after an accepted Judge artifact. Attempt one keeps the fast generator reasoning bypass. The fresh-epoch attempt two uses default generator reasoning with the same provider, model, strict schema, accepted Judge artifact, frozen turn input, and existing 45-second per-attempt deadline. A second failure remains interrupted; there is no automatic attempt three.

Certified routes, Judge recovery, Opening, Actor Replanner, Narrator, mechanics, receipts, visible copy, and UI remain unchanged. The accepted Judge is reused rather than regenerated, and no mechanics mutation exists before a Game Master artifact is accepted.

## Evidence

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r86` completed and bound eight player actions. Action nine selected `Talk to Thera Vek: state business crossing to the bridge` once. Its full-authority Judge accepted in 10,594 ms. Game Master attempt one returned native JSON in 7,978 ms, then semantic compilation rejected the proposal as `model_contract_failed`. No Game Master artifact, mechanics command, receipt, actor job, narration, proper scene, replay, or second admission followed.

The recovery gate is limited to `player_action + full_authority + interruptedStage judged + attempt one + model_contract_invalid`. Focused coverage proves the fresh model selection, accepted-Judge reuse, one settlement, certified-route exclusion, and the existing no-repeat guard.

Semantic review verdict: technical, literal, and limited to existing recovery concepts; no player-visible prose changed.
