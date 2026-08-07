# Task 149: Actor Replanner recovery reasoning

## Contract

Actor Replanner attempt one keeps generator reasoning bypass. The existing single semantic recovery attempt uses default generator reasoning with the same provider, model, strict schema, frame, goal, safe rejection feedback, attempt identity, and shared 90-second deadline. A second failure remains deferred or interrupted; there is no attempt three.

Opening, Judge, Game Master, Narrator, mechanics, receipts, visible copy, and UI remain unchanged.

## Evidence

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r89` completed nine player actions with proper scenes. On action nine, Actor Replanner attempt one returned in 8,547 ms and failed compilation with `route_not_traversable_from_step_location`. Attempt two received the safe recovery coordinates but still used reasoning bypass; it returned in 15,215 ms and grounding review rejected `outcome_not_established`. The actor job deferred as `replan_invalid` while the player result and narration completed.

Construction coverage freezes bypass for attempt one and default reasoning for the recovery model. Existing Actor Replanner tests retain the same one-retry, shared-deadline, stale-write, settlement, and no-attempt-three contracts.

Semantic review verdict: no prompt or player-visible prose changed; the model-mode change applies only to an existing semantic recovery attempt.
