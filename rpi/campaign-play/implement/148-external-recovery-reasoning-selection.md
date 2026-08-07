# Task 148: external recovery reasoning selection

## Contract

Player-action Judge and Game Master recovery select the attempt-two model from the durable attempt-one failure class. `model_contract_invalid` uses the existing default-reasoning model. Transport, provider, and deadline failures retain the existing reasoning-bypass model. Provider, model, strict schema, frozen turn input, stage identity, fresh epoch, deadline, acceptance fences, and the one-recovery limit remain unchanged.

Certified and full-authority routes use the same selection rule. Opening, Actor Replanner, Narrator, mechanics, receipts, visible copy, and UI remain unchanged.

## Evidence

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r88` completed two player actions. Action three selected `Talk to Kellin Marsh: ask about runner work` once through `certified_contact`. Game Master attempt one reached the 45-second stage deadline. Automatic attempt two then used default reasoning and reached the same 45-second deadline. No Game Master artifact, mechanics command, receipt, actor job, narration, proper scene, replay, or second admission followed.

Focused coverage proves bypass remains selected after Judge, full-authority Game Master, and certified Game Master timeouts, while a certified semantic rejection selects default reasoning and settles once.

Semantic review verdict: technical, literal, and limited to model-selection authority; no player-visible prose changed.
