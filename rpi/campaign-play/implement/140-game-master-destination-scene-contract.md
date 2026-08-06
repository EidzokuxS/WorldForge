# Task 140 — Game Master destination-scene contract

## Outcome

Game Master now receives an explicit instruction that `PLAYER_MOVEMENT` already places the player in the known destination scene. It must not add `enter_local_scene` merely for that arrival. A nested local scene is allowed only when it is distinct and the Judge's elapsed bounds leave time beyond the route travel cost.

## Evidence and decision

The frozen r80 action 12 Judge accepted an `attempt` with a code-authoritative movement route, a route travel cost of three minutes, and elapsed bounds fixed at three minutes. Game Master returned the required player `move_actor`, then incorrectly added `enter_local_scene` for the known destination. The existing compiler rejected the proposal before mechanics because local-scene travel requires at least one additional minute.

The compiler, Judge ruling, route authority, provider/model, deadlines, retry behavior, mechanics, persistence, UI, and visible copy remain unchanged. The repair removes the prompt ambiguity between a route arrival and a further nested local scene.

## Semantic review

The added instruction is technical, direct, and limited to the existing movement contract. It adds no narrative voice, player-visible copy, filler, or new product behavior.

## Verification

- Prompt coverage asserts that known-destination arrival does not use `enter_local_scene` and that fixed elapsed bounds equal to travel cost forbid it for `observe` and `attempt`.
- A compiler regression reproduces an `attempt` with route movement and no remaining local-scene time and proves the invalid extra scene remains rejected.
- The focused Game Master suite and backend typecheck must pass before the change is committed.

## Acceptance contract

On a fresh full-authority action with code-authoritative route movement, Game Master emits the required player movement. It may describe arrival with an actorless scene event, but it adds `enter_local_scene` only for a distinct nested scene with remaining Judge-authorized time. The action must settle once, produce one proper scene, and restore usable controls inside the 120-second experience contract.
