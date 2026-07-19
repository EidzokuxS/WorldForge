# Local scene traversal

## Outcome

Let a player physically traverse grounded rooms, corridors, thresholds, and other local features inside the current persistent location without inventing a world-graph route or changing Rulebook placement.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Action 55: `I enter the northwest passage without a light, keep one hand on the wall, and descend slowly toward the smell of brine until I reach the old drainage arch or a real obstacle stops me.`
- Turn: `turn-player-action:9cac9534110830df8fad1986ca8677eb167a4cc3`

The current scene and two accepted observations established the northwest corridor inside `Vesper Quay Undercity`. Nico had described walking it, action 54 exposed its mouth, masonry, slope, darkness, air current, and brine smell, and the player stated a concrete cautious traversal with an explicit obstacle stop. Judge nevertheless classified the action as a route-less `move`, returned `clarification_required`, consumed zero minutes, and produced no consequence because the only typed inter-location route led to Vesper Quay Tollhouse.

## Architecture delta

A persistent location is the Rulebook placement boundary, not an indivisible room. Source moment or cited observations may establish local spatial features inside it. Traversing one is an `observe` or `attempt` targeting the current location with `movementRouteHandle=null`. Game Master may commit an actorless discovery or scene result that changes the player's presented relation to that feature while leaving Rulebook placement unchanged.

Entering another persistent location or visible route destination still requires the exact typed route and `move_actor`. Player input cannot invent a local feature. This adds no prose parser, implicit world-graph edge, new location, hidden teleport, backend-authored outcome, retry, fallback, provider switch, or compatibility path.

## Prompt review

- `prompt-craft`: expressed one authority split at both decision boundaries: local scene relation versus persistent placement.
- `humanizer`: used concrete spatial nouns and described the player-visible consequence instead of implementation jargon where possible.
- `deslop`: removed duplicate prohibitions while preserving grounding, target, route, placement, and no-invention constraints.

## Validation

- Focused Judge contracts cover the prompt boundary and compilation of an uncertain route-less attempt at the current location.
- Focused Game Master contracts cover actorless local scene resolution without `move_actor`.
- Backend typecheck covers both touched prompt builders and tests.
- Live action 56 replayed the same descent intent in the retained campaign. Judge admitted an uncertain route-less `attempt`, Game Master advanced ten minutes, and one actorless discovery carried Sera to a fitted-block collapse with water and harbor air through its gaps. No `move_actor` ran; public placement remained `Vesper Quay Undercity`.
- One remote actor replan deferred after semantic invalidity and another settled independently. A later Narrator `provider_unavailable` interruption resumed only presentation and preserved the accepted player batch, world version 80, actor outcomes, and elapsed time. The completed public projection hash is `52fdb666d9ede8d34f377eb7189766309ea29bb15e942cf456ce267c2ae10613`.
