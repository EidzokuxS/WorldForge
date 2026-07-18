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
- `humanizer`: kept the authority rule concrete while separating its internal terminology from the final in-world clarification shown to the player.
- `deslop`: removed redundant phrasing and rejected model, scene, schema, handle, and mechanics jargon in player-facing questions while preserving the exact ownership and clarification behavior.

## Validation

- Contract coverage rejects route-less available attempts and accepts route-bound attempts.
- Visibility coverage proves no generic local attempt is published while all typed route attempts remain available.
- Judge and Game Master coverage verifies the complete-scene and typed-traversal instructions.
- Focused validation passed five files and `123/123` tests. Backend typecheck passed.
- Restarting the stable backend correctly rejected r13's immutable action-38 Narrator packet because it contains the now-forbidden route-less available attempt. No compatibility label, alias, migration, fallback, or disabled integrity protection was added. The r13 lane therefore ends at the defect evidence and the repaired product-use journey starts from a new copy of the unchanged accepted Black Rain template.
- R14 reused the unchanged accepted template with no world generation. Sera Veldan entered as an ordinary outsider looking for repair work. Opening and action 1 used GLM 5.2 attempt 1 with no fallback or model switch.
- Freeform action 1 assumed an unmarked side passage and back room inside Vesper Quay Tollhouse. Judge returned clarification without a Game Master mutation; world time, player placement, and typed topology did not change. The next actions contained only the three real routes and one local observation. Reload preserved public state hash `d6b74d00b64a7f45e076ecaeaeaad298107ec981979f067f8ccb509a05f2dbc0` exactly.
- The first clarification exposed presentation jargon: `There is no modeled side passage or back room inside the tollhouse scene.` Judge now requires its player-facing question to use in-world perceivable language and destination names, without model, scene, packet, handle, schema, code, or mechanics terminology. Screenshot `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology.session/screenshots/action-1-typed-boundary-debug-language.png`; SHA-256 `AB52C519C15AF485957FC857E239EE52BC498FBF223BE4466C063C3932702006`.
- Action 2 repeated the boundary through the rendered freeform control after the prompt repair. The visible response said no staff door or side passage was visible, named the real destinations, and asked whether Sera wanted one of them or an action inside the tollhouse. It contained no model, scene, packet, handle, schema, code, or mechanics language; placement and world time again remained unchanged. The next suggestions contained typed moves, contact, and observation with no generic attempt. Screenshot `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology.session/screenshots/action-2-in-world-topology-clarification.png`; SHA-256 `A6C4439E52C790404A4A3220C0E66433765B2D26DDE1BB09144EE78BDE37F304`.
- Product-use acceptance passed for the repaired happy path and directly affected clarification path. R14 continues as the current manual living-world lane; this bounded result does not establish long-horizon model reliability or general player comprehension.
