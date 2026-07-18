# Typed scene topology

## Outcome

Keep traversal mechanically inside the world graph: the model may describe and interact with the current scene, but it cannot turn one persistent location into an unbounded hierarchy of invented corridors, rooms, branches, floors, or destinations.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority`
- Player action 38 selected the suggested action `Try to trace the western corridor deeper`.
- Turn: `turn-player-action:06f8ca8939805c146ed0c6d5a1f74ab69b30b388`
- Screenshot: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r13-opening-route-authority.session/screenshots/action-38-prose-only-corridor-topology.png`
- SHA-256: `3F238C5E3BB174CA74B823E95B9430A173ADEB19EFA5A48C41FF48ECDAA45DCE`

The accepted result spent eleven world minutes walking through a newly invented narrowing corridor to a newly invented two-way split, then left the authoritative player placement at `Cinderwatch Undercity`. Narrator offered `Try to descend the leftward branch`, allowing prose-only traversal to continue without a typed route or location transition.

The defect began earlier than narration. Visibility unconditionally published a generic `attempt` whose only target was the current location. Narrator converted that content-free authorization into a specific traversal choice. Judge correctly preserved the frozen suggested kind and targets, but therefore had no authority to retract the model-authored topology. This was an invalid capability, not merely weak prose.

## Architecture delta

- Visibility no longer publishes a generic route-less suggested attempt. Open and restricted route attempts remain available and carry one exact visible route target.
- The public Narrator packet rejects every available `attempt` that does not carry exactly one frozen visible route.
- Judge treats a persistent location as the complete current scene. Freeform traversal beyond it requires one exact visible route; absent that route it returns `clarification_required` instead of normalizing the request into a local attempt.
- Game Master may describe and interact with supported detail inside the current scene but cannot invent an internal path around the typed movement boundary. Crossing into another scene requires `PLAYER_MOVEMENT`.

The Rulebook and world graph remain mechanical authority. The models still author semantic rulings and prose within that authority. This adds no lexical filter, backend-authored narration, fallback prose, repair path, retry, provider switch, or reviewer stage.

## Prompt review

- `prompt-craft`: located the defect at the empty suggested authorization and kept the repair at the narrow Judge and Game Master authority boundaries.
- `humanizer`: kept the reusable rules in concrete world language: the persistent location is one complete scene, and deeper traversal needs a visible route.
- `deslop`: removed redundant phrasing while preserving the exact ownership and clarification behavior.

## Validation

- Contract coverage rejects route-less available attempts and accepts route-bound attempts.
- Visibility coverage proves no generic local attempt is published while all typed route attempts remain available.
- Judge and Game Master coverage verifies the complete-scene and typed-traversal instructions.
- Focused validation passed five files and `123/123` tests. Backend typecheck passed.
- Restarting the stable backend correctly rejected r13's immutable action-38 Narrator packet because it contains the now-forbidden route-less available attempt. No compatibility label, alias, migration, fallback, or disabled integrity protection was added. The r13 lane therefore ends at the defect evidence and the repaired product-use journey starts from a new copy of the unchanged accepted Black Rain template.
- Product-use validation remains pending on that repaired live journey; this implementation commit is not final task acceptance.
